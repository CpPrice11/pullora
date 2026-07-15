use serde::Serialize;
use tauri::State;

use crate::error::command_error;
use crate::storage::get_config_dir;
use crate::storage::secret_store::save_github_token;
use crate::storage::settings::{save_settings, AppSettings};
use crate::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPathValidation {
    pub ok: bool,
    pub status: String,
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let settings = state.settings.lock().await;
    Ok(settings.clone())
}

#[tauri::command]
pub async fn update_settings(
    mut new_settings: AppSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if let Some(path) = new_settings.installation_path.take() {
        new_settings.installation_path = Some(prepare_installation_path_setting(&path)?);
    }

    new_settings.github_token = new_settings
        .github_token
        .take()
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty());

    let previous_token = state.settings.lock().await.github_token.clone();
    let token_changed = new_settings.github_token != previous_token;
    if token_changed {
        save_github_token(new_settings.github_token.as_deref()).map_err(|error| {
            log::error!("Failed to update GitHub token in the system credential store: {error}");
            command_error("errors.secretStoreUnavailable")
        })?;
    }

    let config_dir = get_config_dir();
    if let Err(error) = save_settings(&config_dir, &new_settings) {
        if token_changed {
            let _ = save_github_token(previous_token.as_deref());
        }
        return Err(error.to_string());
    }

    state
        .github_client
        .update_token(new_settings.github_token.clone());

    let mut settings = state.settings.lock().await;
    *settings = new_settings;

    Ok(())
}

#[tauri::command]
pub async fn set_installation_path(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let path = prepare_installation_path_setting(&path)?;

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
        });
    }

    let Ok(folder) = crate::storage::path_scope::installation_root(trimmed) else {
        return Ok(InstallPathValidation {
            ok: false,
            status: "inaccessible".to_string(),
        });
    };
    if !folder.exists() {
        if let Err(error) = std::fs::create_dir_all(&folder) {
            if error.kind() == std::io::ErrorKind::PermissionDenied {
                return Ok(InstallPathValidation {
                    ok: true,
                    status: "requiresElevation".to_string(),
                });
            }

            return Ok(InstallPathValidation {
                ok: false,
                status: "inaccessible".to_string(),
            });
        }
    }

    if !folder.is_dir() {
        return Ok(InstallPathValidation {
            ok: false,
            status: "inaccessible".to_string(),
        });
    }

    let test_file = folder.join(".pullora-write-test.tmp");
    match std::fs::write(&test_file, b"ok") {
        Ok(_) => {
            let _ = std::fs::remove_file(&test_file);
            Ok(InstallPathValidation {
                ok: true,
                status: "ok".to_string(),
            })
        }
        Err(_) => Ok(InstallPathValidation {
            ok: true,
            status: "requiresElevation".to_string(),
        }),
    }
}

fn prepare_installation_path_setting(path: &str) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }

    let folder = crate::storage::path_scope::installation_root(trimmed)?;
    if folder.exists() {
        if folder.is_dir() {
            return Ok(folder.display().to_string());
        }
        return Err(command_error("errors.installPathNotDirectory"));
    }

    if let Err(error) = std::fs::create_dir_all(&folder) {
        if error.kind() == std::io::ErrorKind::PermissionDenied {
            return Ok(folder.display().to_string());
        }

        return Err(command_error("errors.installPathUnavailable"));
    }

    crate::storage::path_scope::installation_root(&folder.display().to_string())
        .map(|path| path.display().to_string())
}
