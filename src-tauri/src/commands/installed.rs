use serde::Serialize;
use tauri::State;

use crate::error::command_error;
use crate::storage::get_config_dir;
use crate::storage::installed::{
    list_installed, record_launch, remove_app, remove_version, set_active_version, InstalledApp,
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
    if version.install_kind.as_deref() == Some("external") {
        let executable =
            crate::storage::discovery::external_executable(owner, repo, &version.executable)?;
        let dir = executable
            .parent()
            .ok_or_else(|| command_error("errors.discoveryInvalid"))?;
        if version
            .install_dir
            .as_deref()
            .and_then(|p| std::fs::canonicalize(p).ok())
            .as_deref()
            != Some(dir)
        {
            return Err(command_error("errors.discoveryInvalid"));
        }
        return Ok(dir.to_path_buf());
    }
    let install_root = crate::storage::path_scope::installation_root(install_path)?;
    let roots = [install_root.clone(), get_config_dir()];
    if let Some(path) = version
        .install_dir
        .as_ref()
        .filter(|path| !path.trim().is_empty())
    {
        let path = std::path::Path::new(path);
        if let Ok(path) = crate::storage::path_scope::ensure_within_any(path, &roots, false) {
            if crate::storage::path_scope::is_program_files_descendant(&path) {
                return recorded_version_install_dir(&path, owner, repo, &version.tag);
            }
            return Ok(path);
        }
        return recorded_version_install_dir(path, owner, repo, &version.tag);
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

fn recorded_version_install_dir(
    path: &std::path::Path,
    owner: &str,
    repo: &str,
    tag: &str,
) -> Result<std::path::PathBuf, String> {
    let app_dir = path
        .parent()
        .ok_or_else(|| command_error("errors.pathOutsideAllowedRoots"))?;
    let root = app_dir
        .parent()
        .ok_or_else(|| command_error("errors.pathOutsideAllowedRoots"))?;
    let root = crate::storage::path_scope::installation_root(&root.to_string_lossy())?;
    let path = crate::storage::path_scope::ensure_within(path, &root, false)?;
    let expected = installed_app_dir(&root.to_string_lossy(), owner, repo)
        .join(crate::storage::path_scope::safe_component(tag));
    let expected = crate::storage::path_scope::ensure_within(&expected, &root, false)?;
    let protected_version = crate::storage::path_scope::is_program_files_descendant(&path)
        && path.parent() == expected.parent()
        && path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|name| {
                name.strip_prefix(&format!(
                    "{}.install-",
                    crate::storage::path_scope::safe_component(tag)
                ))
                .is_some_and(|id| uuid::Uuid::parse_str(id).is_ok())
            });
    if path != expected && !protected_version {
        return Err(command_error("errors.pathOutsideAllowedRoots"));
    }
    Ok(path)
}

pub(crate) fn active_installation_root(
    config_dir: &std::path::Path,
    owner: &str,
    repo: &str,
) -> Option<std::path::PathBuf> {
    let app = list_installed(config_dir)
        .ok()?
        .into_iter()
        .find(|app| app.owner.eq_ignore_ascii_case(owner) && app.repo.eq_ignore_ascii_case(repo))?;
    let version = app
        .versions
        .iter()
        .find(|version| version.tag == app.active_version)?;
    if matches!(
        version.install_kind.as_deref(),
        Some("installer" | "external")
    ) {
        // This directory stores installer metadata, not the installed program.
        return None;
    }
    let path = version.install_dir.as_deref()?.trim();
    if path.is_empty() {
        return None;
    }

    let version_dir = recorded_version_install_dir(
        std::path::Path::new(path),
        &app.owner,
        &app.repo,
        &version.tag,
    )
    .ok()?;
    if !version_dir.is_dir() {
        return None;
    }

    version_dir
        .parent()?
        .parent()
        .map(std::path::Path::to_path_buf)
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

fn launch_executable_path(
    dir: &std::path::Path,
    owner: &str,
    repo: &str,
    version: &crate::storage::installed::VersionInfo,
) -> Result<std::path::PathBuf, String> {
    if matches!(
        version.install_kind.as_deref(),
        Some("external" | "installer")
    ) && std::path::Path::new(&version.executable).is_absolute()
    {
        return crate::storage::discovery::external_executable(owner, repo, &version.executable);
    }
    version_executable_path(dir, &version.executable)
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
pub async fn get_app_runtime_states(
) -> Result<Vec<crate::storage::running_apps::AppRuntimeState>, String> {
    tokio::task::spawn_blocking(|| crate::storage::running_apps::inspect(&get_config_dir()))
        .await
        .map_err(|_| command_error("errors.appRuntimeUnknown"))?
}

#[tauri::command]
pub async fn get_installation_snapshot(
    state: State<'_, AppState>,
) -> Result<crate::storage::local_installations::InstallationSnapshot, String> {
    let _guard = state.download_manager.operation_lock.lock().await;
    tokio::task::spawn_blocking(|| crate::storage::local_installations::snapshot(&get_config_dir()))
        .await
        .map_err(|_| command_error("errors.discoveryFailed"))?
}

#[tauri::command]
pub async fn discover_installed_apps(
) -> Result<Vec<crate::storage::discovery::DetectedInstallation>, String> {
    tokio::task::spawn_blocking(|| {
        let installed =
            list_installed(&get_config_dir()).map_err(|_| command_error("errors.commandFailed"))?;
        Ok(crate::storage::discovery::discover()?
            .into_iter()
            .filter(|candidate| {
                !installed.iter().any(|app| {
                    app.owner.eq_ignore_ascii_case(&candidate.owner)
                        && app.repo.eq_ignore_ascii_case(&candidate.repo)
                })
            })
            .collect())
    })
    .await
    .map_err(|_| command_error("errors.discoveryFailed"))?
}

#[tauri::command]
pub async fn adopt_installed_app(
    owner: String,
    repo: String,
    executable_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let _guard = state.download_manager.operation_lock.lock().await;
    state
        .download_manager
        .ensure_app_idle(&owner, &repo)
        .await?;
    let config = get_config_dir();
    let snapshot = crate::storage::local_installations::snapshot(&config)?;
    if !crate::storage::local_installations::can_connect(&snapshot.health, &owner, &repo) {
        return Err(command_error("errors.discoveryAlreadyAdded"));
    }
    let candidate = snapshot
        .discovered_apps
        .into_iter()
        .find(|candidate| {
            candidate.owner.eq_ignore_ascii_case(&owner)
                && candidate.repo.eq_ignore_ascii_case(&repo)
                && candidate
                    .executable_path
                    .eq_ignore_ascii_case(&executable_path)
        })
        .ok_or_else(|| command_error("errors.discoveryInvalid"))?;
    crate::storage::installed::add_version(
        &config,
        &candidate.owner,
        &candidate.repo,
        crate::storage::installed::VersionInfo {
            tag: candidate.version,
            installed_at: chrono::Utc::now(),
            executable: candidate.executable_path,
            size_bytes: 0,
            asset_name: None,
            install_kind: Some("external".into()),
            install_dir: Some(candidate.install_dir),
        },
    )
    .map_err(|_| command_error("errors.commandFailed"))
}

#[tauri::command]
pub async fn switch_version(
    owner: String,
    repo: String,
    tag: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let _guard = state.download_manager.operation_lock.lock().await;
    state
        .download_manager
        .ensure_app_idle(&owner, &repo)
        .await?;
    crate::storage::running_apps::ensure_stopped(&get_config_dir(), &owner, &repo)?;
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
    let _guard = state.download_manager.operation_lock.lock().await;
    state
        .download_manager
        .ensure_app_idle(&owner, &repo)
        .await?;
    crate::storage::running_apps::ensure_stopped(&get_config_dir(), &owner, &repo)?;
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
    if version.install_kind.as_deref() == Some("external") {
        return remove_version(&config_dir, &owner, &repo, &tag).map_err(|e| e.to_string());
    }
    let app_dir = version_install_dir(&install_path, &owner, &repo, version)?;

    if app_dir.exists() {
        crate::storage::protected_files::remove_dir(&app_dir)?;
    }

    remove_version(&config_dir, &owner, &repo, &tag).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn uninstall_app(
    owner: String,
    repo: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let _guard = state.download_manager.operation_lock.lock().await;
    state
        .download_manager
        .ensure_app_idle(&owner, &repo)
        .await?;
    crate::storage::running_apps::ensure_stopped(&get_config_dir(), &owner, &repo)?;
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
            if version.install_kind.as_deref() == Some("external") {
                continue;
            }
            let version_dir = version_install_dir(&install_path, &owner, &repo, version)?;
            removed_dirs.insert(version_dir);
        }

        let legacy_app_dir = installed_app_dir(&install_path, &owner, &repo);
        if !removed_dirs.is_empty() && !install_path.trim().is_empty() && legacy_app_dir.exists() {
            let root = crate::storage::path_scope::installation_root(&install_path)?;
            let legacy_app_dir =
                crate::storage::path_scope::ensure_within(&legacy_app_dir, &root, false)?;
            removed_dirs.insert(legacy_app_dir);
        }
        let roots = removed_dirs
            .iter()
            .filter(|path| {
                !removed_dirs
                    .iter()
                    .any(|parent| path != &parent && path.starts_with(parent))
            })
            .cloned()
            .collect::<Vec<_>>();
        crate::storage::protected_files::remove_dirs(&roots)?;
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

    let expected_exe = launch_executable_path(&version_dir, &owner, &repo, version)?;
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
            let executable = launch_executable_path(&version_dir, &owner, &repo, version)?;
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
    if state.download_manager.has_running_downloads().await {
        return Err(command_error("errors.cleanupDownloadsActive"));
    }

    let settings = state.settings.lock().await;
    let install_path = settings.installation_path.clone();
    drop(settings);

    let config_dir = get_config_dir();
    let mut removed = cleanup_incomplete_installs_at(install_path.as_deref(), &config_dir)?;
    // Protected recovery is explicit: ordinary launcher startup must never ask
    // for UAC just because a previous copy was interrupted.
    if let Some(path) = install_path.as_deref() {
        let root = crate::storage::path_scope::installation_root(path)?;
        if crate::storage::path_scope::is_program_files_apps(&root) && root.is_dir() {
            let registered = list_installed(&config_dir)
                .map_err(|e| e.to_string())?
                .into_iter()
                .flat_map(|app| app.versions)
                .filter_map(|v| v.install_dir)
                .filter_map(|p| std::fs::canonicalize(p).ok())
                .collect::<std::collections::HashSet<_>>();
            for app in std::fs::read_dir(&root).map_err(|e| e.to_string())? {
                let app = app.map_err(|e| e.to_string())?.path();
                if !crate::storage::path_scope::is_program_files_descendant(&app) || !app.is_dir() {
                    continue;
                }
                for entry in std::fs::read_dir(&app).map_err(|e| e.to_string())? {
                    let entry = entry.map_err(|e| e.to_string())?;
                    let name = entry.file_name().to_string_lossy().to_string();
                    let path = entry.path();
                    if path.is_dir()
                        && name
                            .rsplit_once(".install-")
                            .is_some_and(|(_, id)| uuid::Uuid::parse_str(id).is_ok())
                        && crate::storage::path_scope::is_program_files_descendant(&path)
                        && !registered
                            .contains(&std::fs::canonicalize(&path).map_err(|e| e.to_string())?)
                    {
                        crate::storage::protected_files::remove_dir(&path)?;
                        removed += 1;
                    }
                }
            }
        }
    }
    state.download_manager.clear_failed().await;
    Ok(removed)
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
    if crate::storage::path_scope::is_program_files_apps(root) {
        return Ok(0);
    }
    if !root.exists() {
        return Ok(0);
    }

    let mut removed = cleanup_dir_contents(&root.join(".pullora-downloads"), 0)?;
    let download_dir = root.join(".pullora-downloads");
    let _ = std::fs::remove_dir(download_dir);

    let entries = std::fs::read_dir(root).map_err(|e| e.to_string())?;
    for app_entry in entries.flatten() {
        let app_path = app_entry.path();
        if app_entry
            .file_name()
            .to_string_lossy()
            .strip_prefix(".publish-")
            .is_some_and(|id| uuid::Uuid::parse_str(id).is_ok())
        {
            remove_path(&app_path)?;
            removed += 1;
            continue;
        }
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
    let _guard = state.download_manager.operation_lock.lock().await;
    state
        .download_manager
        .ensure_app_idle(&owner, &repo)
        .await?;
    crate::storage::running_apps::ensure_stopped(&get_config_dir(), &owner, &repo)?;
    let settings = state.settings.lock().await;
    let install_path = settings.installation_path.clone().unwrap_or_default();
    drop(settings);

    let (app, version_dir) = resolve_active_app(&owner, &repo, &install_path)?;
    let version = app
        .versions
        .iter()
        .find(|v| v.tag == app.active_version)
        .ok_or_else(|| command_error("errors.activeVersionNotFound"))?;

    let exe_path = launch_executable_path(&version_dir, &owner, &repo, version)?;

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

    let resolved = if matches!(
        version.install_kind.as_deref(),
        Some("external" | "installer")
    ) {
        crate::storage::discovery::external_executable(&owner, &repo, &resolved.to_string_lossy())?
    } else {
        crate::storage::path_scope::ensure_within(&resolved, &version_dir, false)?
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
            command_error("errors.launchFailed")
        })?;

    log_launch_event(
        &owner,
        &repo,
        &version.tag,
        &format!("launched {}", resolved.display()),
    );
    let _ = record_launch(&get_config_dir(), &owner, &repo);
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
    use super::{active_installation_root, cleanup_install_root, version_install_dir};
    use crate::storage::installed::{add_version, VersionInfo};

    #[test]
    fn recorded_version_dir_survives_an_install_root_change() {
        let base =
            std::env::temp_dir().join(format!("pullora-recorded-path-{}", uuid::Uuid::new_v4()));
        let previous = base.join("previous");
        let current = base.join("current");
        let version_dir = previous.join("owner-repo").join("v1");
        std::fs::create_dir_all(&version_dir).unwrap();
        std::fs::create_dir_all(&current).unwrap();

        let mut version = VersionInfo {
            tag: "v1".to_string(),
            installed_at: chrono::Utc::now(),
            executable: "app.exe".to_string(),
            size_bytes: 1,
            asset_name: None,
            install_kind: Some("portable".to_string()),
            install_dir: Some(version_dir.display().to_string()),
        };

        assert_eq!(
            version_install_dir(&current.display().to_string(), "owner", "repo", &version).unwrap(),
            std::fs::canonicalize(&version_dir).unwrap()
        );

        version.install_dir = Some(previous.join("other-repo").join("v1").display().to_string());
        assert!(
            version_install_dir(&current.display().to_string(), "owner", "repo", &version).is_err()
        );

        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn automatic_update_reuses_the_active_version_root() {
        let base = std::env::temp_dir().join(format!(
            "pullora-update-install-root-{}",
            uuid::Uuid::new_v4()
        ));
        let config_dir = base.join("config");
        let install_root = base.join("apps");
        let version_dir = install_root.join("owner-repo").join("v1");
        std::fs::create_dir_all(&version_dir).unwrap();
        std::fs::write(version_dir.join("app.exe"), b"app").unwrap();
        add_version(
            &config_dir,
            "owner",
            "repo",
            VersionInfo {
                tag: "v1".to_string(),
                installed_at: chrono::Utc::now(),
                executable: "app.exe".to_string(),
                size_bytes: 3,
                asset_name: Some("app-portable.exe".to_string()),
                install_kind: Some("portable".to_string()),
                install_dir: Some(version_dir.display().to_string()),
            },
        )
        .unwrap();

        assert_eq!(
            active_installation_root(&config_dir, "OWNER", "REPO").unwrap(),
            std::fs::canonicalize(&install_root).unwrap()
        );

        std::fs::remove_dir_all(base).unwrap();
    }

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
        let unrelated_version = app.join("v4");
        let download_dir = root.join(".pullora-downloads");

        for dir in [
            &current,
            &backup,
            &partial,
            &orphan,
            &finished_backup,
            &download_dir,
            &app.join("v3"),
            &unrelated_version,
        ] {
            std::fs::create_dir_all(dir).unwrap();
        }
        std::fs::write(current.join("broken.exe"), b"broken").unwrap();
        std::fs::write(backup.join("working.exe"), b"working").unwrap();
        std::fs::write(unrelated_version.join("user.dat"), b"keep").unwrap();
        std::fs::write(download_dir.join("asset.tmp"), b"partial").unwrap();

        assert_eq!(cleanup_install_root(&root).unwrap(), 5);
        assert!(current.join("working.exe").exists());
        assert!(!current.join("broken.exe").exists());
        assert!(!backup.exists());
        assert!(!partial.exists());
        assert!(!orphan.exists());
        assert!(!finished_backup.exists());
        assert!(!download_dir.exists());
        assert_eq!(
            std::fs::read(unrelated_version.join("user.dat")).unwrap(),
            b"keep"
        );

        std::fs::remove_dir_all(root).unwrap();
    }
}
