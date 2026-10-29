use crate::{github::models::Release, storage, AppState};
use std::{
    collections::BTreeSet,
    path::Path,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};

fn is_update(releases: &[Release], current: &str, latest: &Release) -> bool {
    let stable: Vec<_> = releases
        .iter()
        .filter(|r| !r.draft && !r.prerelease)
        .collect();
    if let Some(index) = stable.iter().position(|r| r.tag_name == current) {
        return index > 0;
    }
    let parse = |tag: &str| -> Option<Vec<u64>> {
        tag.trim_start_matches(['v', 'V'])
            .split('.')
            .map(str::parse)
            .collect::<Result<_, _>>()
            .ok()
    };
    match (parse(&latest.tag_name), parse(current)) {
        (Some(mut new), Some(mut old)) => {
            let len = new.len().max(old.len());
            new.resize(len, 0);
            old.resize(len, 0);
            new > old
        }
        _ => false,
    }
}

fn notification_key(owner: &str, repo: &str, tag: &str) -> String {
    format!("{}/{}@{}", owner.to_lowercase(), repo.to_lowercase(), tag)
}

fn save_seen(path: &Path, seen: &BTreeSet<String>) -> Result<(), String> {
    let temporary = path.with_extension("tmp");
    std::fs::write(
        &temporary,
        serde_json::to_vec(seen).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    std::fs::rename(temporary, path).map_err(|e| e.to_string())
}

fn xml_text(text: &str) -> String {
    text.chars()
        .filter(|c| !c.is_control())
        .take(180)
        .collect::<String>()
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('\"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(windows)]
fn show(title: &str, body: &str) -> Result<(), String> {
    use windows::{
        core::HSTRING,
        Data::Xml::Dom::XmlDocument,
        Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
        UI::Notifications::{ToastNotification, ToastNotificationManager},
    };
    // The worker thread needs a WinRT apartment; never uninitialize one owned by its caller.
    let initialized = unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.is_ok();
    let result = (|| -> windows::core::Result<()> {
        let document = XmlDocument::new()?;
        document.LoadXml(&HSTRING::from(format!("<toast><visual><binding template=\"ToastGeneric\"><text>{}</text><text>{}</text></binding></visual></toast>", xml_text(title), xml_text(body))))?;
        let toast = ToastNotification::CreateToastNotification(&document)?;
        ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(
            "com.cpprice11.pullora",
        ))?
        .Show(&toast)
    })();
    if initialized {
        unsafe { RoUninitialize() };
    }
    result.map_err(|e| e.to_string())
}

#[cfg(not(windows))]
fn show(_title: &str, _body: &str) -> Result<(), String> {
    Err("Notifications are available on Windows".into())
}

pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let path = storage::get_config_dir().join("notified-updates.json");
        let mut seen: BTreeSet<String> = match std::fs::read(&path) {
            Ok(bytes) => match serde_json::from_slice(&bytes) {
                Ok(seen) => seen,
                Err(e) => {
                    log::warn!("Cannot load notification history: {e}");
                    return;
                }
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => BTreeSet::new(),
            Err(e) => {
                log::warn!("Cannot read notification history: {e}");
                return;
            }
        };
        let mut checked: Option<Instant> = None;
        loop {
            let state = app.state::<AppState>();
            let enabled = state.settings.lock().await.update_notifications;
            if !enabled {
                checked = None;
            }
            if enabled && checked.is_none_or(|time| time.elapsed() >= Duration::from_secs(1800)) {
                checked = Some(Instant::now());
                let apps = storage::installed::list_installed(&storage::get_config_dir())
                    .unwrap_or_default();
                for installed in apps.into_iter().filter(|a| {
                    a.owner.eq_ignore_ascii_case("CpPrice11")
                        && !["pullora", "pullora-assets", "warframe-arsenal"]
                            .iter()
                            .any(|r| a.repo.eq_ignore_ascii_case(r))
                }) {
                    if !state.settings.lock().await.update_notifications {
                        break;
                    }
                    let Ok(Ok(releases)) = tokio::time::timeout(
                        Duration::from_secs(30),
                        state
                            .github_client
                            .get_releases(&installed.owner, &installed.repo, true),
                    )
                    .await
                    else {
                        continue;
                    };
                    let Some(latest) = releases.iter().find(|r| !r.draft && !r.prerelease) else {
                        continue;
                    };
                    let _ = app.emit("library-release-checked", serde_json::json!({"owner":installed.owner,"repo":installed.repo,"version":latest.tag_name,"publishedAt":latest.published_at}));
                    let key = notification_key(&installed.owner, &installed.repo, &latest.tag_name);
                    let current = storage::installed::list_installed(&storage::get_config_dir())
                        .unwrap_or_default()
                        .into_iter()
                        .find(|app| {
                            app.owner.eq_ignore_ascii_case(&installed.owner)
                                && app.repo.eq_ignore_ascii_case(&installed.repo)
                        });
                    if !current.is_some_and(|app| is_update(&releases, &app.active_version, latest))
                        || seen.contains(&key)
                    {
                        continue;
                    }
                    // Re-read after the network wait so disabling notifications takes effect immediately.
                    let settings = state.settings.lock().await;
                    if !settings.update_notifications {
                        break;
                    }
                    let text: std::collections::BTreeMap<String, String> =
                        serde_json::from_str(if settings.language == "en" {
                            include_str!("../../src/i18n/native/en.json")
                        } else {
                            include_str!("../../src/i18n/native/uk.json")
                        })
                        .unwrap();
                    let title = text["updates.notificationTitle"].clone();
                    let body = text["updates.notificationBody"]
                        .replace("{name}", &installed.name)
                        .replace("{version}", &latest.tag_name);
                    let delivered =
                        tauri::async_runtime::spawn_blocking(move || show(&title, &body)).await;
                    drop(settings);
                    match delivered {
                        Ok(Ok(())) => {
                            seen.insert(key);
                            if let Err(e) = save_seen(&path, &seen) {
                                log::warn!("Cannot save notification history: {e}");
                            }
                        }
                        _ => log::warn!("Windows could not display an update notification"),
                    }
                }
            }
            tokio::time::sleep(Duration::from_secs(60)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    #[ignore = "Displays a real Windows notification; run explicitly"]
    fn windows_notification_smoke() {
        show(
            "Pullora: перевірка сповіщень",
            "Сповіщення про оновлення готові.",
        )
        .unwrap();
    }

    #[test]
    fn old_settings_enable_notifications_and_disabled_choice_survives() {
        let old = serde_json::json!({"version":2,"installationPath":null,"githubToken":null,"theme":"dark","language":"uk"});
        let mut settings: storage::settings::AppSettings = serde_json::from_value(old).unwrap();
        assert!(settings.update_notifications);
        settings.update_notifications = false;
        let restored: storage::settings::AppSettings =
            serde_json::from_slice(&serde_json::to_vec(&settings).unwrap()).unwrap();
        assert!(!restored.update_notifications);
    }

    #[test]
    fn updates_skip_current_older_and_prerelease() {
        let releases: Vec<Release> = serde_json::from_value(serde_json::json!([
          {"id":2,"tag_name":"v2.0","name":null,"html_url":null,"draft":false,"prerelease":false,"published_at":null,"body":null,"assets":[]},
          {"id":1,"tag_name":"v1.0","name":null,"html_url":null,"draft":false,"prerelease":false,"published_at":null,"body":null,"assets":[]}
        ])).unwrap();
        assert!(is_update(&releases, "v1.0", &releases[0]));
        assert!(!is_update(&releases, "v2.0", &releases[0]));
        assert!(!is_update(&releases, "v3.0", &releases[0]));
        assert!(!is_update(&releases, "unknown", &releases[0]));
        assert!(!is_update(&releases, "2.0.0", &releases[0]));
        assert_eq!(xml_text("A&B <x>\n"), "A&amp;B &lt;x&gt;");
        let root = std::env::temp_dir().join(format!("pullora-notify-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("seen.json");
        let mut seen = BTreeSet::new();
        let key = notification_key("CpPrice11", "App", "v2");
        assert!(seen.insert(key.clone()));
        assert!(!seen.insert(key));
        save_seen(&path, &seen).unwrap();
        save_seen(&path, &seen).unwrap();
        assert_eq!(
            serde_json::from_slice::<BTreeSet<String>>(&std::fs::read(&path).unwrap()).unwrap(),
            seen
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
