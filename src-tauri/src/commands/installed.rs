use serde::Serialize;
use tauri::State;

use crate::storage::get_config_dir;
use crate::storage::installed::{
    export_registry, import_registry, list_installed, remove_app, remove_version,
    set_active_version, InstalledApp, InstalledRegistryTransfer,
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

fn push_unique_path(paths: &mut Vec<std::path::PathBuf>, path: std::path::PathBuf) {
    let key = path
        .to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase();
    let exists = paths.iter().any(|item| {
        item.to_string_lossy()
            .replace('/', "\\")
            .to_ascii_lowercase()
            == key
    });

    if !exists {
        paths.push(path);
    }
}

fn known_install_roots(current_install_path: &str) -> Vec<std::path::PathBuf> {
    let mut roots = Vec::new();
    let trimmed = current_install_path.trim();
    if !trimmed.is_empty() {
        push_unique_path(&mut roots, std::path::PathBuf::from(trimmed));
    }

    push_unique_path(
        &mut roots,
        std::path::PathBuf::from(crate::storage::settings::default_installation_path()),
    );

    if let Some(downloads) = dirs::download_dir() {
        push_unique_path(&mut roots, downloads.join("Installers").join("apps"));
    }

    if let Some(documents) = dirs::document_dir() {
        push_unique_path(&mut roots, documents.join("Pullora Apps"));
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            push_unique_path(&mut roots, exe_dir.join("apps"));
        }
    }

    roots
}

fn legacy_version_candidates(
    install_path: &str,
    owner: &str,
    repo: &str,
    tag: &str,
) -> Vec<std::path::PathBuf> {
    known_install_roots(install_path)
        .into_iter()
        .map(|root| root.join(format!("{}-{}", owner, repo)).join(tag))
        .collect()
}

fn version_dir_contains_app(
    dir: &std::path::Path,
    version: &crate::storage::installed::VersionInfo,
) -> bool {
    if !dir.is_dir() {
        return false;
    }

    version_executable_path(dir, &version.executable).exists() || find_exe_in_dir(dir).is_some()
}

fn version_install_dir(
    install_path: &str,
    owner: &str,
    repo: &str,
    version: &crate::storage::installed::VersionInfo,
) -> Result<std::path::PathBuf, String> {
    if let Some(path) = version
        .install_dir
        .as_ref()
        .filter(|path| !path.trim().is_empty())
    {
        return Ok(std::path::PathBuf::from(path));
    }

    let candidates = legacy_version_candidates(install_path, owner, repo, &version.tag);
    if let Some(found) = candidates
        .iter()
        .find(|candidate| version_dir_contains_app(candidate, version))
    {
        return Ok(found.clone());
    }

    if let Some(fallback) = candidates.into_iter().next() {
        return Ok(fallback);
    }

    Err("Для старого запису не збережено папку встановлення. Встанови версію ще раз або вкажи папку в Налаштуваннях.".to_string())
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

    let version_dir = version_install_dir(install_path, owner, repo, version)?;
    Ok((app, version_dir))
}

#[tauri::command]
pub async fn get_installed_apps(_state: State<'_, AppState>) -> Result<Vec<InstalledApp>, String> {
    let config_dir = get_config_dir();
    list_installed(&config_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_installed_registry(path: String) -> Result<InstalledRegistryTransfer, String> {
    let target_path = std::path::PathBuf::from(path);
    if target_path.as_os_str().is_empty() {
        return Err("Шлях експорту не вибрано".to_string());
    }

    let config_dir = get_config_dir();
    export_registry(&config_dir, &target_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_installed_registry(path: String) -> Result<InstalledRegistryTransfer, String> {
    let source_path = std::path::PathBuf::from(path);
    if source_path.as_os_str().is_empty() {
        return Err("Файл імпорту не вибрано".to_string());
    }

    let config_dir = get_config_dir();
    import_registry(&config_dir, &source_path).map_err(|e| e.to_string())
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
    let install_path = settings.installation_path.clone().unwrap_or_default();
    drop(settings);

    let apps = list_installed(&config_dir).map_err(|e| e.to_string())?;
    let app = apps
        .iter()
        .find(|item| item.owner == owner && item.repo == repo)
        .ok_or("Застосунок не встановлено")?;
    let version = app
        .versions
        .iter()
        .find(|item| item.tag == tag)
        .ok_or("Версію не знайдено")?;
    let app_dir = version_install_dir(&install_path, &owner, &repo, version)?;

    if app_dir.exists() {
        std::fs::remove_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }

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
    let install_path = settings.installation_path.clone().unwrap_or_default();
    drop(settings);

    let apps = list_installed(&config_dir).map_err(|e| e.to_string())?;
    if let Some(app) = apps
        .iter()
        .find(|item| item.owner == owner && item.repo == repo)
    {
        let mut removed_dirs = std::collections::HashSet::new();
        for version in &app.versions {
            let version_dir = version_install_dir(&install_path, &owner, &repo, version)?;
            if removed_dirs.insert(version_dir.clone()) && version_dir.exists() {
                std::fs::remove_dir_all(&version_dir).map_err(|e| e.to_string())?;
            }
        }

        let legacy_app_dir = installed_app_dir(&install_path, &owner, &repo);
        if !install_path.trim().is_empty() && legacy_app_dir.exists() {
            std::fs::remove_dir_all(&legacy_app_dir).map_err(|e| e.to_string())?;
        }
    }

    remove_app(&config_dir, &owner, &repo).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn validate_installed_app(
    owner: String,
    repo: String,
    state: State<'_, AppState>,
) -> Result<InstalledAppHealth, String> {
    let settings = state.settings.lock().await;
    let install_path = settings.installation_path.clone().unwrap_or_default();
    drop(settings);

    let (app, version_dir) = resolve_active_app(&owner, &repo, &install_path)?;
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
    let install_path = settings.installation_path.clone().unwrap_or_default();
    drop(settings);

    let target_dir = match resolve_active_app(&owner, &repo, &install_path) {
        Ok((app, version_dir)) => {
            let version = app
                .versions
                .iter()
                .find(|v| v.tag == app.active_version)
                .ok_or("Активну версію не знайдено")?;
            let executable = version_executable_path(&version_dir, &version.executable);
            if std::path::PathBuf::from(&version.executable).is_absolute() {
                executable
                    .parent()
                    .map(|parent| parent.to_path_buf())
                    .unwrap_or(version_dir)
            } else {
                version_dir
            }
        }
        Err(error) => {
            if install_path.trim().is_empty() {
                return Err(error);
            }
            installed_app_dir(&install_path, &owner, &repo)
        }
    };

    crate::commands::updates::open_dir(target_dir.display().to_string()).await
}

#[tauri::command]
pub async fn cleanup_incomplete_installs(state: State<'_, AppState>) -> Result<usize, String> {
    let settings = state.settings.lock().await;
    let install_path = settings.installation_path.clone().unwrap_or_default();
    drop(settings);

    let root = std::path::PathBuf::from(install_path);
    if root.as_os_str().is_empty() || !root.exists() {
        return cleanup_install_caches(0);
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

    cleanup_install_caches(removed)
}

fn cleanup_install_caches(initial_removed: usize) -> Result<usize, String> {
    let mut removed = initial_removed;
    for cache_dir in [
        get_config_dir().join("installer-cache"),
        get_config_dir().join("package-cache"),
    ] {
        removed = cleanup_cache_dir(&cache_dir, removed)?;
    }

    Ok(removed)
}

fn cleanup_cache_dir(cache_dir: &std::path::Path, initial_removed: usize) -> Result<usize, String> {
    let mut removed = initial_removed;
    if !cache_dir.exists() {
        return Ok(removed);
    }

    for entry in std::fs::read_dir(cache_dir)
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

    Ok(removed)
}

#[tauri::command]
pub async fn launch_app(
    owner: String,
    repo: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let settings = state.settings.lock().await;
    let install_path = settings.installation_path.clone().unwrap_or_default();
    drop(settings);

    let (app, version_dir) = resolve_active_app(&owner, &repo, &install_path)?;
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
