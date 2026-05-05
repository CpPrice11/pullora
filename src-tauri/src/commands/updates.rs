use tauri::State;

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
