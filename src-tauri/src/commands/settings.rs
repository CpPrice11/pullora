use tauri::State;

use crate::storage::settings::{save_settings, AppSettings};
use crate::storage::get_config_dir;
use crate::AppState;

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let settings = state.settings.lock().await;
    Ok(settings.clone())
}

#[tauri::command]
pub async fn update_settings(
    new_settings: AppSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let config_dir = get_config_dir();
    save_settings(&config_dir, &new_settings).map_err(|e| e.to_string())?;

    let mut client = state.github_client.lock().await;
    client.update_token(new_settings.github_token.clone());

    let mut settings = state.settings.lock().await;
    *settings = new_settings;

    Ok(())
}

#[tauri::command]
pub async fn set_installation_path(
    path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;

    let mut settings = state.settings.lock().await;
    settings.installation_path = Some(path);
    let config_dir = get_config_dir();
    save_settings(&config_dir, &settings).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn is_first_launch(state: State<'_, AppState>) -> Result<bool, String> {
    let settings = state.settings.lock().await;
    Ok(settings.installation_path.is_none())
}
