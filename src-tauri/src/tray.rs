use std::{collections::BTreeMap, time::Duration};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

use crate::{commands, github::models::website_url, storage, AppState};

const TRAY_ID: &str = "pullora-quick-launch";

fn labels(language: &str) -> BTreeMap<String, String> {
    serde_json::from_str(if language == "en" {
        include_str!("../../src/i18n/native/en.json")
    } else {
        include_str!("../../src/i18n/native/uk.json")
    })
    .expect("bundled tray translations must be valid JSON")
}

// Keep only launchable library records. Paths and launch guards stay in launch_app.
fn entries(apps: Vec<storage::installed::InstalledApp>) -> Vec<(String, String)> {
    let mut entries: Vec<_> = apps
        .into_iter()
        .filter(|app| {
            app.owner.eq_ignore_ascii_case("CpPrice11")
                && !["pullora", "pullora-assets", "warframe-arsenal"]
                    .iter()
                    .any(|repo| app.repo.eq_ignore_ascii_case(repo))
                && app
                    .versions
                    .iter()
                    .any(|version| version.tag == app.active_version)
        })
        .map(|app| {
            let name: String = app.name.chars().filter(|c| !c.is_control()).collect();
            let name = if name.trim().is_empty() {
                app.repo.clone()
            } else {
                name
            };
            (
                format!("launch:{}/{}", app.owner, app.repo),
                name.replace('&', "&&"),
            )
        })
        .collect();
    entries.sort_by_cached_key(|(id, name)| (name.to_lowercase(), id.clone()));
    entries.dedup_by(|a, b| a.0 == b.0);
    entries
}

fn menu(
    app: &AppHandle,
    language: &str,
    entries: &[(String, String)],
) -> tauri::Result<Menu<tauri::Wry>> {
    let text = labels(language);
    let menu = Menu::new(app)?;
    for id in ["show", "hide"] {
        menu.append(&MenuItem::with_id(
            app,
            id,
            &text[&format!("tray.{id}")],
            true,
            None::<&str>,
        )?)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    let apps = Submenu::new(app, &text["tray.apps"], true)?;
    if entries.is_empty() {
        apps.append(&MenuItem::with_id(
            app,
            "empty",
            &text["tray.empty"],
            false,
            None::<&str>,
        )?)?;
    }
    for (id, name) in entries {
        apps.append(&MenuItem::with_id(app, id, name, true, None::<&str>)?)?;
    }
    menu.append(&apps)?;
    menu.append(&MenuItem::with_id(
        app,
        "visit",
        &text["tray.visit"],
        true,
        None::<&str>,
    )?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(
        app,
        "quit",
        &text["tray.quit"],
        true,
        None::<&str>,
    )?)?;
    Ok(menu)
}

fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn handle_action(app: &AppHandle, id: &str) {
    match id {
        "show" => show(app),
        "hide" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.hide();
            }
        }
        "quit" => app.exit(0),
        _ => {
            let app = app.clone();
            let id = id.to_owned();
            tauri::async_runtime::spawn(async move {
                let result = if id == "visit" {
                    commands::updates::open_website_url(
                        website_url("CpPrice11", "warframe-arsenal")
                            .unwrap()
                            .to_string(),
                    )
                    .await
                } else if let Some((owner, repo)) = id
                    .strip_prefix("launch:")
                    .and_then(|key| key.split_once('/'))
                {
                    commands::installed::launch_app(
                        owner.into(),
                        repo.into(),
                        app.state::<AppState>(),
                    )
                    .await
                } else {
                    return;
                };
                if let Err(error) = result {
                    show(&app);
                    let _ = app.emit("tray-action-error", error);
                }
            });
        }
    }
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let language = app
        .state::<AppState>()
        .settings
        .blocking_lock()
        .language
        .clone();
    let initial_entries =
        entries(storage::installed::list_installed(&storage::get_config_dir()).unwrap_or_default());
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Pullora")
        .menu(&menu(app, &language, &initial_entries)?)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| handle_action(app, event.id.as_ref()))
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;

    let app = app.clone();
    // Native refresh also works while the webview is hidden; no network or running-process polling.
    tauri::async_runtime::spawn(async move {
        let mut previous = (language, initial_entries);
        loop {
            tokio::time::sleep(Duration::from_secs(10)).await;
            let language = app
                .state::<AppState>()
                .settings
                .lock()
                .await
                .language
                .clone();
            let apps = tauri::async_runtime::spawn_blocking(|| {
                storage::installed::list_installed(&storage::get_config_dir())
            })
            .await;
            let Ok(Ok(apps)) = apps else { continue };
            let next = (language, entries(apps));
            if next == previous {
                continue;
            }
            if let Some(tray) = app.tray_by_id(TRAY_ID) {
                match menu(&app, &next.0, &next.1).and_then(|menu| tray.set_menu(Some(menu))) {
                    Ok(()) => previous = next,
                    Err(error) => log::warn!("Failed to refresh quick-launch menu: {error}"),
                }
            }
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menu_uses_active_records_and_escapes_native_mnemonics() {
        let apps = serde_json::from_value(serde_json::json!([
            {"name":"Desk & Tools", "owner":"CpPrice11", "repo":"recycle-desk", "activeVersion":"v1", "versions":[{"tag":"v1", "executable":"desk.exe", "installedAt":"2026-10-25T00:00:00Z", "sizeBytes":1}]},
            {"name":"Site", "owner":"CpPrice11", "repo":"warframe-arsenal", "activeVersion":"v1", "versions":[]},
            {"name":"Empty", "owner":"CpPrice11", "repo":"empty", "activeVersion":"v1", "versions":[]},
            {"name":"Pullora", "owner":"CpPrice11", "repo":"pullora", "activeVersion":"v1", "versions":[]}
        ])).unwrap();
        assert_eq!(
            entries(apps),
            vec![(
                "launch:CpPrice11/recycle-desk".into(),
                "Desk && Tools".into()
            )]
        );
        assert_eq!(
            labels("en").keys().collect::<Vec<_>>(),
            labels("uk").keys().collect::<Vec<_>>()
        );
        assert_eq!(labels("invalid"), labels("uk"));
    }
}
