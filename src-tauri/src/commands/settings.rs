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
        prepare_installation_path_setting(path)?;
    }

    let config_dir = get_config_dir();
    save_settings(&config_dir, &new_settings).map_err(|e| e.to_string())?;

    state
        .github_client
        .update_token(new_settings.github_token.clone());

    let mut settings = state.settings.lock().await;
    *settings = new_settings;

    Ok(())
}

#[tauri::command]
pub async fn set_installation_path(path: String, state: State<'_, AppState>) -> Result<(), String> {
    prepare_installation_path_setting(&path)?;

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
            message: "Папку встановлення не вибрано.".to_string(),
        });
    }

    let folder = std::path::PathBuf::from(trimmed);
    if !folder.exists() {
        if let Err(error) = std::fs::create_dir_all(&folder) {
            if error.kind() == std::io::ErrorKind::PermissionDenied {
                return Ok(InstallPathValidation {
                    ok: true,
                    status: "requiresElevation".to_string(),
                    message: "Папку можна створити тільки з правами адміністратора.".to_string(),
                });
            }

            return Ok(InstallPathValidation {
                ok: false,
                status: "inaccessible".to_string(),
                message: format!("Не вдалося створити папку встановлення: {}", error),
            });
        }
    }

    if !folder.is_dir() {
        return Ok(InstallPathValidation {
            ok: false,
            status: "inaccessible".to_string(),
            message: "Шлях встановлення не є папкою.".to_string(),
        });
    }

    let test_file = folder.join(".pullora-write-test.tmp");
    match std::fs::write(&test_file, b"ok") {
        Ok(_) => {
            let _ = std::fs::remove_file(&test_file);
            Ok(InstallPathValidation {
                ok: true,
                status: "ok".to_string(),
                message: "Папка доступна для запису.".to_string(),
            })
        }
        Err(_) => Ok(InstallPathValidation {
            ok: true,
            status: "requiresElevation".to_string(),
            message: "Папка існує, але для запису потрібні права адміністратора.".to_string(),
        }),
    }
}

fn prepare_installation_path_setting(path: &str) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Ok(());
    }

    let folder = std::path::PathBuf::from(trimmed);
    if folder.exists() {
        if folder.is_dir() {
            return Ok(());
        }
        return Err("Шлях встановлення не є папкою".to_string());
    }

    if let Err(error) = std::fs::create_dir_all(&folder) {
        if error.kind() == std::io::ErrorKind::PermissionDenied {
            return Ok(());
        }

        return Err(format!(
            "Не вдалося підготувати папку встановлення: {}",
            error
        ));
    }

    Ok(())
}
