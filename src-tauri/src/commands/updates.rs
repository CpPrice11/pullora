use std::io::Write;
use tauri::{AppHandle, State};

use crate::version::checker::{check_all_updates, UpdateAvailable};
use crate::AppState;

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
