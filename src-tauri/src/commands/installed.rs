use serde::Serialize;
use tauri::State;

use crate::storage::get_config_dir;
use crate::storage::installed::{
    list_installed, remove_app, remove_version, set_active_version, InstalledApp,
};
use crate::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledAppHealth {
    pub ok: bool,
    pub status: String,
    pub message: String,
    pub executable_path: Option<String>,
}

fn find_exe_in_dir(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    fn scan(dir: &std::path::Path, best: &mut Option<std::path::PathBuf>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                scan(&path, best);
            } else if path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("exe"))
                .unwrap_or(false)
                && is_launchable_exe(&path)
            {
                // Prefer shorter paths (fewer directory levels = closer to root)
                let is_better = best.as_ref().is_none_or(|b: &std::path::PathBuf| {
                    path.components().count() < b.components().count()
                });
                if is_better {
                    *best = Some(path);
                }
            }
        }
    }
    let mut best = None;
    scan(dir, &mut best);
    best
}

fn installed_app_dir(install_path: &str, owner: &str, repo: &str) -> std::path::PathBuf {
    std::path::PathBuf::from(install_path).join(format!("{}-{}", owner, repo))
}

fn active_version_dir(
    install_path: &str,
    owner: &str,
    repo: &str,
    tag: &str,
) -> std::path::PathBuf {
    installed_app_dir(install_path, owner, repo).join(tag)
}

fn version_executable_path(version_dir: &std::path::Path, executable: &str) -> std::path::PathBuf {
    let path = std::path::PathBuf::from(executable);
    if path.is_absolute() {
        path
    } else {
        version_dir.join(path)
    }
}

fn is_launchable_exe(path: &std::path::Path) -> bool {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase();

    ![
        "setup",
        "install",
        "installer",
        "uninstall",
        "unins",
        "updater",
        "update",
        "crashhandler",
    ]
    .iter()
    .any(|blocked| name.contains(blocked))
}

fn resolve_active_app(
    owner: &str,
    repo: &str,
    install_path: &str,
) -> Result<(InstalledApp, std::path::PathBuf), String> {
    let config_dir = get_config_dir();
    let apps = list_installed(&config_dir).map_err(|e| e.to_string())?;
    let key = format!("{}/{}", owner, repo);

    let app = apps
        .into_iter()
        .find(|a| format!("{}/{}", a.owner, a.repo) == key)
        .ok_or("Застосунок не встановлено")?;

    let version = app
        .versions
        .iter()
        .find(|v| v.tag == app.active_version)
        .ok_or("Активну версію не знайдено")?;

    let version_dir = active_version_dir(install_path, owner, repo, &version.tag);
    Ok((app, version_dir))
}

#[tauri::command]
pub async fn get_installed_apps(_state: State<'_, AppState>) -> Result<Vec<InstalledApp>, String> {
    let config_dir = get_config_dir();
    list_installed(&config_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn switch_version(
    owner: String,
    repo: String,
    tag: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    let config_dir = get_config_dir();
    set_active_version(&config_dir, &owner, &repo, &tag).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn uninstall_version(
    owner: String,
    repo: String,
    tag: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let config_dir = get_config_dir();
    let settings = state.settings.lock().await;
    let install_path = settings
        .installation_path
        .as_ref()
        .ok_or("Installation path not configured")?;

    let app_dir = std::path::PathBuf::from(install_path)
        .join(format!("{}-{}", owner, repo))
        .join(&tag);

    if app_dir.exists() {
        std::fs::remove_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }

    drop(settings);
    remove_version(&config_dir, &owner, &repo, &tag).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn uninstall_app(
    owner: String,
    repo: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let config_dir = get_config_dir();
    let settings = state.settings.lock().await;
    let install_path = settings
        .installation_path
        .as_ref()
        .ok_or("Installation path not configured")?;
    let app_dir = installed_app_dir(install_path, &owner, &repo);

    if app_dir.exists() {
        std::fs::remove_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }

    drop(settings);
    remove_app(&config_dir, &owner, &repo).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn validate_installed_app(
    owner: String,
    repo: String,
    state: State<'_, AppState>,
) -> Result<InstalledAppHealth, String> {
    let settings = state.settings.lock().await;
    let install_path = settings
        .installation_path
        .as_ref()
        .ok_or("Папку встановлення не налаштовано")?;

    let (app, version_dir) = resolve_active_app(&owner, &repo, install_path)?;
    let version = app
        .versions
        .iter()
        .find(|v| v.tag == app.active_version)
        .ok_or("Активну версію не знайдено")?;

    let expected_exe = version_executable_path(&version_dir, &version.executable);
    if expected_exe.exists() {
        return Ok(InstalledAppHealth {
            ok: true,
            status: "ready".to_string(),
            executable_path: Some(expected_exe.display().to_string()),
            message: "Готово до запуску".to_string(),
        });
    }

    if let Some(found_exe) = find_exe_in_dir(&version_dir) {
        return Ok(InstalledAppHealth {
            ok: true,
            status: "ready".to_string(),
            executable_path: Some(found_exe.display().to_string()),
            message: "Ready to launch".to_string(),
        });
    }

    Ok(InstalledAppHealth {
        ok: false,
        status: "missingExecutable".to_string(),
        executable_path: None,
        message: format!(
            "Файл запуску для {} {} не знайдено. Віднови або перевстанови версію.",
            repo, version.tag
        ),
    })
}

#[tauri::command]
pub async fn open_installed_app_dir(
    owner: String,
    repo: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let settings = state.settings.lock().await;
    let install_path = settings
        .installation_path
        .as_ref()
        .ok_or("Папку встановлення не налаштовано")?;
    let app_dir = installed_app_dir(install_path, &owner, &repo);
    let external_executable_dir = resolve_active_app(&owner, &repo, install_path)
        .ok()
        .and_then(|(app, version_dir)| {
            let version = app.versions.iter().find(|v| v.tag == app.active_version)?;
            let executable = version_executable_path(&version_dir, &version.executable);
            if std::path::PathBuf::from(&version.executable).is_absolute() {
                executable.parent().map(|parent| parent.to_path_buf())
            } else {
                None
            }
        });
    drop(settings);

    crate::commands::updates::open_dir(
        external_executable_dir
            .unwrap_or(app_dir)
            .display()
            .to_string(),
    )
    .await
}

#[tauri::command]
pub async fn cleanup_incomplete_installs(state: State<'_, AppState>) -> Result<usize, String> {
    let settings = state.settings.lock().await;
    let install_path = settings
        .installation_path
        .as_ref()
        .ok_or("Папку встановлення не налаштовано")?
        .clone();
    drop(settings);

    let root = std::path::PathBuf::from(install_path);
    if !root.exists() {
        return Ok(0);
    }

    let mut removed = 0;
    let download_dir = root.join(".pullora-downloads");
    if download_dir.exists() {
        for entry in std::fs::read_dir(&download_dir)
            .map_err(|e| e.to_string())?
            .flatten()
        {
            let path = entry.path();
            if path.is_file() {
                std::fs::remove_file(&path).map_err(|e| e.to_string())?;
                removed += 1;
            } else if path.is_dir() {
                std::fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
                removed += 1;
            }
        }
    }

    let entries = std::fs::read_dir(root).map_err(|e| e.to_string())?;
    for app_entry in entries.flatten() {
        let app_path = app_entry.path();
        if !app_path.is_dir() {
            continue;
        }

        let Ok(version_entries) = std::fs::read_dir(&app_path) else {
            continue;
        };
        for version_entry in version_entries.flatten() {
            let path = version_entry.path();
            let name = version_entry.file_name().to_string_lossy().to_string();
            if path.is_dir() && (name.contains(".partial-") || name.contains(".backup-")) {
                std::fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
                removed += 1;
            }
        }
    }

    Ok(removed)
}

#[tauri::command]
pub async fn launch_app(
    owner: String,
    repo: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let settings = state.settings.lock().await;
    let install_path = settings
        .installation_path
        .as_ref()
        .ok_or("Папку встановлення не налаштовано")?;

    let (app, version_dir) = resolve_active_app(&owner, &repo, install_path)?;
    let version = app
        .versions
        .iter()
        .find(|v| v.tag == app.active_version)
        .ok_or("Активну версію не знайдено")?;

    let exe_path = version_executable_path(&version_dir, &version.executable);

    let resolved = if exe_path.exists() {
        exe_path
    } else {
        find_exe_in_dir(&version_dir).ok_or_else(|| {
            log_launch_event(
                &owner,
                &repo,
                &version.tag,
                "launch failed: no executable found",
            );
            format!(
                "Файл запуску для {} {} не знайдено. Натисни «Відновити» або встанови версію ще раз.",
                repo, version.tag
            )
        })?
    };

    std::process::Command::new(&resolved)
        .current_dir(resolved.parent().unwrap_or(&version_dir))
        .spawn()
        .map_err(|e| {
            log_launch_event(
                &owner,
                &repo,
                &version.tag,
                &format!("launch failed: {}", e),
            );
            format!(
                "Не вдалося запустити {} {}. Перевір, чи файл існує і не заблокований Windows: {}",
                repo, version.tag, e
            )
        })?;

    log_launch_event(
        &owner,
        &repo,
        &version.tag,
        &format!("launched {}", resolved.display()),
    );
    Ok(())
}

fn log_launch_event(owner: &str, repo: &str, tag: &str, message: &str) {
    let config_dir = get_config_dir();
    let _ = crate::storage::logs::append_log(
        &config_dir,
        &format!("launch {}/{}@{}: {}", owner, repo, tag, message),
    );
}
