use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::download::manager::{DownloadProgress, DownloadRequest};
use crate::error::command_error;
use crate::AppState;

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn start_download(
    app: AppHandle,
    url: String,
    file_name: String,
    owner: String,
    repo: String,
    tag: String,
    install_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    crate::github::assets::validate_versioned_release_asset_url(
        &url, &owner, &repo, &tag, &file_name,
    )?;

    let install_path = match install_path {
        Some(path) if !path.trim().is_empty() => path.trim().to_string(),
        _ => {
            let settings = state.settings.lock().await;
            settings
                .installation_path
                .as_ref()
                .filter(|path| !path.trim().is_empty())
                .ok_or_else(|| command_error("errors.installPathUnavailable"))?
                .clone()
        }
    };

    let id = Uuid::new_v4().to_string();
    let dest_dir = crate::storage::path_scope::installation_root(&install_path)?;

    state
        .download_manager
        .start_download(
            app,
            DownloadRequest {
                id: id.clone(),
                url,
                file_name,
                dest_dir,
                owner,
                repo,
                tag,
            },
        )
        .await
}

#[tauri::command]
pub async fn get_downloads(state: State<'_, AppState>) -> Result<Vec<DownloadProgress>, String> {
    Ok(state.download_manager.get_progress().await)
}

#[tauri::command]
pub async fn cancel_download(id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.download_manager.cancel(&id).await;
    Ok(())
}
