use std::io::Write;
use tauri::{AppHandle, State};

use crate::version::checker::{check_all_updates, UpdateAvailable};
use crate::AppState;

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
) -> Result<(), String> {
    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let current_pid = std::process::id();
    let config_dir = crate::storage::get_config_dir();
    let update_dir = config_dir.join("launcher-updates").join(&version);
    std::fs::create_dir_all(&update_dir).map_err(|e| e.to_string())?;

    let downloaded_exe = update_dir.join("Air Launcher.exe");
    let script_path = update_dir.join("apply-launcher-update.ps1");
    download_launcher_asset(&asset_url, &downloaded_exe).await?;
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
