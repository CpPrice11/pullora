use serde::Serialize;
use std::io::Write;
use tauri::{AppHandle, State};

use crate::version::checker::{check_all_updates, UpdateAvailable};
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
pub async fn check_for_updates(state: State<'_, AppState>) -> Result<Vec<UpdateAvailable>, String> {
    let client = state.github_client.lock().await;
    check_all_updates(&client).await
}

#[tauri::command]
pub async fn open_dir(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_launcher_storage_info() -> Result<LauncherStorageInfo, String> {
    collect_launcher_storage_info()
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
    backups.sort_by_key(|item| item.0.clone());
    backups.reverse();

    for (_, path) in backups.into_iter().skip(1) {
        if path.is_file() {
            std::fs::remove_file(path).map_err(|e| e.to_string())?;
        }
    }

    collect_launcher_storage_info()
}

#[tauri::command]
pub async fn install_launcher_release(
    app: AppHandle,
    version: String,
    asset_url: String,
    asset_name: String,
) -> Result<(), String> {
    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let current_pid = std::process::id();
    let config_dir = crate::storage::get_config_dir();
    let update_dir = config_dir.join("launcher-updates").join(&version);
    std::fs::create_dir_all(&update_dir).map_err(|e| e.to_string())?;

    let downloaded_asset = update_dir.join(sanitize_asset_name(&asset_name));
    let downloaded_exe = update_dir.join("Air Launcher.exe");
    let script_path = update_dir.join("apply-launcher-update.ps1");
    download_launcher_asset(&asset_url, &downloaded_asset).await?;
    prepare_portable_launcher_asset(&downloaded_asset, &downloaded_exe, &update_dir)?;
    write_launcher_update_script(&script_path, &downloaded_exe, &current_exe, current_pid)?;

    std::process::Command::new("powershell")
        .arg("-NoProfile")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(&script_path)
        .spawn()
        .map_err(|e| e.to_string())?;

    app.exit(0);
    Ok(())
}

fn sanitize_asset_name(asset_name: &str) -> String {
    let clean = asset_name
        .chars()
        .map(|ch| match ch {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => ch,
        })
        .collect::<String>();

    if clean.trim().is_empty() {
        "launcher-asset.exe".to_string()
    } else {
        clean
    }
}

fn prepare_portable_launcher_asset(
    downloaded_asset: &std::path::Path,
    destination_exe: &std::path::Path,
    update_dir: &std::path::Path,
) -> Result<(), String> {
    let asset_name = downloaded_asset
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_lowercase();

    if is_installer_asset(&asset_name) {
        return Err("Setup/installer assets are not supported for launcher self-update. Use portable EXE or ZIP.".to_string());
    }

    if asset_name.ends_with(".exe") {
        std::fs::copy(downloaded_asset, destination_exe).map_err(|e| e.to_string())?;
        return Ok(());
    }

    if asset_name.ends_with(".zip") {
        let extract_dir = update_dir.join("portable");
        if extract_dir.exists() {
            std::fs::remove_dir_all(&extract_dir).map_err(|e| e.to_string())?;
        }
        std::fs::create_dir_all(&extract_dir).map_err(|e| e.to_string())?;

        let file = std::fs::File::open(downloaded_asset).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        archive.extract(&extract_dir).map_err(|e| e.to_string())?;

        let portable_exe = find_portable_launcher_exe(&extract_dir)
            .ok_or("Portable ZIP does not contain a launcher EXE")?;
        std::fs::copy(portable_exe, destination_exe).map_err(|e| e.to_string())?;
        return Ok(());
    }

    Err("Unsupported launcher asset. Use portable EXE or ZIP.".to_string())
}

fn is_installer_asset(name: &str) -> bool {
    name.contains("setup") || name.contains("installer") || name.ends_with(".msi")
}

fn find_portable_launcher_exe(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    let mut fallback = None;
    let entries = std::fs::read_dir(dir).ok()?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_portable_launcher_exe(&path) {
                return Some(found);
            }
            continue;
        }

        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_lowercase();

        if !name.ends_with(".exe") || is_installer_asset(&name) {
            continue;
        }

        if name.contains("air") && name.contains("launcher") {
            return Some(path);
        }

        fallback.get_or_insert(path);
    }

    fallback
}

async fn download_launcher_asset(url: &str, destination: &std::path::Path) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("Air-Launcher/0.1.0")
        .build()
        .map_err(|e| e.to_string())?;
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("GitHub download failed: {}", response.status()));
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(destination, bytes).map_err(|e| e.to_string())
}

fn write_launcher_update_script(
    script_path: &std::path::Path,
    source_exe: &std::path::Path,
    target_exe: &std::path::Path,
    current_pid: u32,
) -> Result<(), String> {
    let backup_dir = target_exe
        .parent()
        .ok_or("Cannot resolve launcher directory")?
        .join(".air-launcher-backups");
    std::fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    let backup_exe = backup_dir.join(format!(
        "Air Launcher backup {}.exe",
        chrono::Utc::now().format("%Y%m%d%H%M%S")
    ));

    let script = format!(
        r#"$ErrorActionPreference = 'Stop'
$pidToWait = {pid}
$source = @'
{source}
'@
$target = @'
{target}
'@
$backup = @'
{backup}
'@
try {{
  Wait-Process -Id $pidToWait -Timeout 30 -ErrorAction SilentlyContinue
}} catch {{}}
if (Test-Path -LiteralPath $target) {{
  Copy-Item -LiteralPath $target -Destination $backup -Force
}}
Copy-Item -LiteralPath $source -Destination $target -Force
Start-Process -FilePath $target
"#,
        pid = current_pid,
        source = source_exe.display(),
        target = target_exe.display(),
        backup = backup_exe.display(),
    );

    let mut file = std::fs::File::create(script_path).map_err(|e| e.to_string())?;
    file.write_all(script.as_bytes()).map_err(|e| e.to_string())
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
        .ok_or("Cannot resolve launcher directory")?
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
        .ok_or("Cannot resolve launcher directory")?
        .join(".air-launcher-backups"))
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
