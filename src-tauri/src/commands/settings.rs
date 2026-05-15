use serde::Serialize;
use tauri::State;

use crate::storage::get_config_dir;
use crate::storage::settings::{save_settings, AppSettings};
use crate::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPathValidation {
    pub ok: bool,
    pub status: String,
    pub message: String,
}

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
    if let Some(path) = new_settings.installation_path.as_ref() {
        if !path.trim().is_empty() {
            std::fs::create_dir_all(path).map_err(|e| {
                format!("Не вдалося підготувати папку встановлення: {}", e)
            })?;
        }
    }

    let config_dir = get_config_dir();
    save_settings(&config_dir, &new_settings).map_err(|e| e.to_string())?;

    let mut client = state.github_client.lock().await;
    client.update_token(new_settings.github_token.clone());

    let mut settings = state.settings.lock().await;
    *settings = new_settings;

    Ok(())
}

#[tauri::command]
pub async fn set_installation_path(path: String, state: State<'_, AppState>) -> Result<(), String> {
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

#[tauri::command]
pub async fn validate_installation_path(path: String) -> Result<InstallPathValidation, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Ok(InstallPathValidation {
            ok: false,
            status: "missing".to_string(),
            message: "Installation path is empty.".to_string(),
        });
    }

    let folder = std::path::PathBuf::from(trimmed);
    if !folder.exists() {
        return Ok(InstallPathValidation {
            ok: false,
            status: "missing".to_string(),
            message: "Folder does not exist yet.".to_string(),
        });
    }

    if !folder.is_dir() {
        return Ok(InstallPathValidation {
            ok: false,
            status: "inaccessible".to_string(),
            message: "Path is not a folder.".to_string(),
        });
    }

    let test_file = folder.join(".air-launcher-write-test.tmp");
    match std::fs::write(&test_file, b"ok") {
        Ok(_) => {
            let _ = std::fs::remove_file(&test_file);
            Ok(InstallPathValidation {
                ok: true,
                status: "ok".to_string(),
                message: "Folder is available and writable.".to_string(),
            })
        }
        Err(_) => Ok(InstallPathValidation {
            ok: false,
            status: "noWritePermission".to_string(),
            message: "Folder is not writable.".to_string(),
        }),
    }
}
