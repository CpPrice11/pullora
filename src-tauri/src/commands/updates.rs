use serde::Serialize;
use tauri::State;

use crate::error::command_error;
use crate::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherStorageInfo {
    pub launcher_dir: String,
    pub update_cache_path: String,
    pub backup_path: String,
    pub cleanup_bytes: u64,
    pub update_cache_count: usize,
    pub backup_count: usize,
}

#[tauri::command]
pub async fn get_launcher_version() -> Result<String, String> {
    Ok(format!("v{}", env!("CARGO_PKG_VERSION")))
}

#[tauri::command]
pub async fn open_dir(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut roots = vec![crate::storage::get_config_dir()];
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            roots.push(dir.to_path_buf());
        }
    }
    if let Some(path) = state.settings.lock().await.installation_path.as_deref() {
        if let Ok(root) = crate::storage::path_scope::installation_root(path) {
            roots.push(root);
        }
    }

    let path =
        crate::storage::path_scope::ensure_within_any(std::path::Path::new(&path), &roots, true)?;
    open_directory(&path)
}

pub(crate) fn open_directory(path: &std::path::Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(path)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn open_external_url(url: String) -> Result<(), String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| command_error("errors.invalidUrl"))?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("github.com")
        || parsed.port_or_known_default() != Some(443)
    {
        return Err(command_error("errors.githubUrlOnly"));
    }

    #[cfg(target_os = "windows")]
    std::process::Command::new("rundll32")
        .arg("url.dll,FileProtocolHandler")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_launcher_storage_info() -> Result<LauncherStorageInfo, String> {
    collect_launcher_storage_info()
}

#[tauri::command]
pub async fn get_event_log() -> Result<Vec<String>, String> {
    crate::storage::logs::read_recent_logs(&crate::storage::get_config_dir(), 200)
        .map_err(|_| command_error("errors.eventLogReadFailed"))
}

#[tauri::command]
pub async fn cleanup_launcher_update_files() -> Result<LauncherStorageInfo, String> {
    let config_dir = crate::storage::get_config_dir();
    let update_cache_dir = config_dir.join("launcher-updates");
    if update_cache_dir.exists() {
        std::fs::remove_dir_all(&update_cache_dir).map_err(|e| e.to_string())?;
    }

    let backup_dir = launcher_backup_dir()?;
    let mut backups = backup_files(&backup_dir)?;
    backups.sort_by_key(|item| item.0);
    backups.reverse();

    for (_, path) in backups.into_iter().skip(1) {
        if path.is_file() {
            std::fs::remove_file(path).map_err(|e| e.to_string())?;
        }
    }

    collect_launcher_storage_info()
}

fn collect_launcher_storage_info() -> Result<LauncherStorageInfo, String> {
    let config_dir = crate::storage::get_config_dir();
    let update_cache_dir = config_dir.join("launcher-updates");
    let backup_dir = launcher_backup_dir()?;
    let cleanup_bytes = dir_size(&update_cache_dir)? + old_backup_size(&backup_dir)?;
    let update_cache_count = child_count(&update_cache_dir)?;
    let backup_count = backup_files(&backup_dir)?.len();
    let launcher_dir = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or_else(|| command_error("errors.launcherDirectoryUnavailable"))?
        .display()
        .to_string();

    Ok(LauncherStorageInfo {
        launcher_dir,
        update_cache_path: update_cache_dir.display().to_string(),
        backup_path: backup_dir.display().to_string(),
        cleanup_bytes,
        update_cache_count,
        backup_count,
    })
}

fn launcher_backup_dir() -> Result<std::path::PathBuf, String> {
    Ok(std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or_else(|| command_error("errors.launcherDirectoryUnavailable"))?
        .join(".pullora-backups"))
}

fn child_count(path: &std::path::Path) -> Result<usize, String> {
    if !path.exists() {
        return Ok(0);
    }

    Ok(std::fs::read_dir(path)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .count())
}

fn dir_size(path: &std::path::Path) -> Result<u64, String> {
    if !path.exists() {
        return Ok(0);
    }

    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
    if metadata.is_file() {
        return Ok(metadata.len());
    }

    let mut total = 0;
    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        total += dir_size(&entry.path())?;
    }

    Ok(total)
}

fn backup_files(
    path: &std::path::Path,
) -> Result<Vec<(std::time::SystemTime, std::path::PathBuf)>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_lowercase();
        if !name.ends_with(".exe") {
            continue;
        }

        let modified = std::fs::metadata(&path)
            .and_then(|metadata| metadata.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        files.push((modified, path));
    }

    Ok(files)
}

fn old_backup_size(path: &std::path::Path) -> Result<u64, String> {
    let mut backups = backup_files(path)?;
    backups.sort_by_key(|item| item.0);
    backups.reverse();

    let mut total = 0;
    for (_, path) in backups.into_iter().skip(1) {
        total += dir_size(&path)?;
    }

    Ok(total)
}
