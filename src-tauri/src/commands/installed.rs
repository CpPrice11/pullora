use serde::Serialize;
use tauri::State;

use crate::error::command_error;
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
    pub executable_path: Option<String>,
}

fn find_exe_in_dir(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    fn scan(dir: &std::path::Path, best: &mut Option<std::path::PathBuf>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                scan(&path, best);
            } else if file_type.is_file()
                && path
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
    std::path::PathBuf::from(install_path).join(format!(
        "{}-{}",
        crate::storage::path_scope::safe_component(owner),
        crate::storage::path_scope::safe_component(repo)
    ))
}

fn legacy_version_candidates(
    install_path: &str,
    owner: &str,
    repo: &str,
    tag: &str,
) -> Vec<std::path::PathBuf> {
    vec![installed_app_dir(install_path, owner, repo)
        .join(crate::storage::path_scope::safe_component(tag))]
}

fn version_dir_contains_app(
    dir: &std::path::Path,
    version: &crate::storage::installed::VersionInfo,
) -> bool {
    if !dir.is_dir() {
        return false;
    }

    version_executable_path(dir, &version.executable).is_ok_and(|path| path.exists())
        || find_exe_in_dir(dir).is_some()
}

fn version_install_dir(
    install_path: &str,
    owner: &str,
    repo: &str,
    version: &crate::storage::installed::VersionInfo,
) -> Result<std::path::PathBuf, String> {
    let install_root = crate::storage::path_scope::installation_root(install_path)?;
    let roots = [install_root.clone(), get_config_dir()];
    if let Some(path) = version
        .install_dir
        .as_ref()
        .filter(|path| !path.trim().is_empty())
    {
        return crate::storage::path_scope::ensure_within_any(
            std::path::Path::new(path),
            &roots,
            false,
        );
    }

    let candidates = legacy_version_candidates(install_path, owner, repo, &version.tag);
    if let Some(found) = candidates
        .iter()
        .find(|candidate| version_dir_contains_app(candidate, version))
    {
        return crate::storage::path_scope::ensure_within_any(found, &roots, false);
    }

    if let Some(fallback) = candidates.into_iter().next() {
        return crate::storage::path_scope::ensure_within_any(&fallback, &roots, false);
    }

    Err(command_error("errors.legacyInstallPathMissing"))
}

fn version_executable_path(
    version_dir: &std::path::Path,
    executable: &str,
) -> Result<std::path::PathBuf, String> {
    let path = std::path::PathBuf::from(executable);
    let path = if path.is_absolute() {
        path
    } else {
        version_dir.join(path)
    };
    crate::storage::path_scope::ensure_within(&path, version_dir, false)
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
        .ok_or_else(|| command_error("errors.appNotInstalled"))?;

    let version = app
        .versions
        .iter()
        .find(|v| v.tag == app.active_version)
        .ok_or_else(|| command_error("errors.activeVersionNotFound"))?;

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
        return Err(command_error("errors.exportPathRequired"));
    }

    let config_dir = get_config_dir();
    export_registry(&config_dir, &target_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_installed_registry(path: String) -> Result<InstalledRegistryTransfer, String> {
    let source_path = std::path::PathBuf::from(path);
    if source_path.as_os_str().is_empty() {
        return Err(command_error("errors.importPathRequired"));
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
        .ok_or_else(|| command_error("errors.appNotInstalled"))?;
    let version = app
        .versions
        .iter()
        .find(|item| item.tag == tag)
        .ok_or_else(|| command_error("errors.versionNotFound"))?;
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
            let root = crate::storage::path_scope::installation_root(&install_path)?;
            let legacy_app_dir =
                crate::storage::path_scope::ensure_within(&legacy_app_dir, &root, false)?;
            std::fs::remove_dir_all(legacy_app_dir).map_err(|e| e.to_string())?;
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
        .ok_or_else(|| command_error("errors.activeVersionNotFound"))?;

    let expected_exe = version_executable_path(&version_dir, &version.executable)?;
    if expected_exe.exists() {
        return Ok(InstalledAppHealth {
            ok: true,
            status: "ready".to_string(),
            executable_path: Some(expected_exe.display().to_string()),
        });
    }

    if let Some(found_exe) = find_exe_in_dir(&version_dir) {
        return Ok(InstalledAppHealth {
            ok: true,
            status: "ready".to_string(),
            executable_path: Some(found_exe.display().to_string()),
        });
    }

    Ok(InstalledAppHealth {
        ok: false,
        status: "missingExecutable".to_string(),
        executable_path: None,
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
                .ok_or_else(|| command_error("errors.activeVersionNotFound"))?;
            let executable = version_executable_path(&version_dir, &version.executable)?;
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

    let roots = [
        crate::storage::path_scope::installation_root(&install_path)?,
        get_config_dir(),
    ];
    let target_dir = crate::storage::path_scope::ensure_within_any(&target_dir, &roots, false)?;
    crate::commands::updates::open_directory(&target_dir)
}

#[tauri::command]
pub async fn cleanup_incomplete_installs(state: State<'_, AppState>) -> Result<usize, String> {
    let settings = state.settings.lock().await;
    let install_path = settings.installation_path.clone();
    drop(settings);

    cleanup_incomplete_installs_at(install_path.as_deref(), &get_config_dir())
}

pub fn cleanup_incomplete_installs_at(
    install_path: Option<&str>,
    config_dir: &std::path::Path,
) -> Result<usize, String> {
    let mut removed = 0;
    if let Some(install_path) = install_path.filter(|path| !path.trim().is_empty()) {
        let root = crate::storage::path_scope::installation_root(install_path)?;
        removed += cleanup_install_root(&root)?;
    }

    for cache_name in ["installer-cache", "package-cache"] {
        let cache_dir = config_dir.join(cache_name);
        if cache_dir.exists() {
            let cache_dir =
                crate::storage::path_scope::ensure_within(&cache_dir, config_dir, false)?;
            removed += cleanup_install_root(&cache_dir)?;
        }
    }

    Ok(removed)
}

fn cleanup_install_root(root: &std::path::Path) -> Result<usize, String> {
    if !root.exists() {
        return Ok(0);
    }

    let mut removed = cleanup_dir_contents(&root.join(".pullora-downloads"), 0)?;
    let download_dir = root.join(".pullora-downloads");
    let _ = std::fs::remove_dir(download_dir);

    let entries = std::fs::read_dir(root).map_err(|e| e.to_string())?;
    for app_entry in entries.flatten() {
        let app_path = app_entry.path();
        if !app_entry.file_type().is_ok_and(|kind| kind.is_dir()) {
            continue;
        }

        let Ok(version_entries) = std::fs::read_dir(&app_path) else {
            continue;
        };
        let version_entries = version_entries.flatten().collect::<Vec<_>>();

        for version_entry in &version_entries {
            let path = version_entry.path();
            let name = version_entry.file_name().to_string_lossy().to_string();
            if !version_entry.file_type().is_ok_and(|kind| kind.is_dir()) {
                continue;
            }
            let Some((version_name, transaction_id)) = transaction_parts(&name, ".backup-") else {
                continue;
            };

            let version_dir = app_path.join(version_name);
            let partial_dir = app_path.join(format!("{}.partial-{}", version_name, transaction_id));
            if partial_dir.exists() || !version_dir.exists() {
                remove_path(&version_dir)?;
                std::fs::rename(&path, &version_dir).map_err(|e| e.to_string())?;
            } else {
                std::fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
            }
            removed += 1;
        }

        for version_entry in version_entries {
            let path = version_entry.path();
            let name = version_entry.file_name().to_string_lossy().to_string();
            if version_entry.file_type().is_ok_and(|kind| kind.is_dir())
                && transaction_parts(&name, ".partial-").is_some()
                && path.exists()
            {
                std::fs::remove_dir_all(path).map_err(|e| e.to_string())?;
                removed += 1;
            }
        }
    }

    Ok(removed)
}

fn transaction_parts<'a>(name: &'a str, marker: &str) -> Option<(&'a str, &'a str)> {
    let (version, transaction_id) = name.rsplit_once(marker)?;
    (!version.is_empty()
        && !transaction_id.is_empty()
        && crate::storage::path_scope::safe_component(version) == version
        && crate::storage::path_scope::safe_component(transaction_id) == transaction_id)
        .then_some((version, transaction_id))
}

fn remove_path(path: &std::path::Path) -> Result<(), String> {
    let Ok(metadata) = std::fs::symlink_metadata(path) else {
        return Ok(());
    };
    if metadata.is_dir() && !metadata.file_type().is_symlink() {
        std::fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(path).map_err(|e| e.to_string())
    }
}

fn cleanup_dir_contents(
    cache_dir: &std::path::Path,
    initial_removed: usize,
) -> Result<usize, String> {
    let mut removed = initial_removed;
    if !cache_dir.exists() {
        return Ok(removed);
    }

    for entry in std::fs::read_dir(cache_dir)
        .map_err(|e| e.to_string())?
        .flatten()
    {
        let path = entry.path();
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_file() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
            removed += 1;
        } else if file_type.is_dir() {
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
        .ok_or_else(|| command_error("errors.activeVersionNotFound"))?;

    let exe_path = version_executable_path(&version_dir, &version.executable)?;

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
            command_error("errors.executableNotFound")
        })?
    };

    let resolved = crate::storage::path_scope::ensure_within(&resolved, &version_dir, false)?;
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
            command_error("errors.launchFailed")
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

#[cfg(test)]
mod tests {
    use super::cleanup_install_root;

    #[test]
    fn cleanup_restores_interrupted_replacement_and_removes_leftovers() {
        let root =
            std::env::temp_dir().join(format!("pullora-install-cleanup-{}", uuid::Uuid::new_v4()));
        let app = root.join("owner-repo");
        let current = app.join("v1");
        let backup = app.join("v1.backup-job");
        let partial = app.join("v1.partial-job");
        let orphan = app.join("v2.partial-orphan");
        let finished_backup = app.join("v3.backup-finished");
        let download_dir = root.join(".pullora-downloads");

        for dir in [
            &current,
            &backup,
            &partial,
            &orphan,
            &finished_backup,
            &download_dir,
            &app.join("v3"),
        ] {
            std::fs::create_dir_all(dir).unwrap();
        }
        std::fs::write(current.join("broken.exe"), b"broken").unwrap();
        std::fs::write(backup.join("working.exe"), b"working").unwrap();
        std::fs::write(download_dir.join("asset.tmp"), b"partial").unwrap();

        assert_eq!(cleanup_install_root(&root).unwrap(), 5);
        assert!(current.join("working.exe").exists());
        assert!(!current.join("broken.exe").exists());
        assert!(!backup.exists());
        assert!(!partial.exists());
        assert!(!orphan.exists());
        assert!(!finished_backup.exists());
        assert!(!download_dir.exists());

        std::fs::remove_dir_all(root).unwrap();
    }
}
