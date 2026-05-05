use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::download::manager::DownloadProgress;
use crate::AppState;

#[tauri::command]
pub async fn start_download(
    app: AppHandle,
    url: String,
    file_name: String,
    owner: String,
    repo: String,
    tag: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let settings = state.settings.lock().await;
    let install_path = settings
        .installation_path
        .as_ref()
        .ok_or("Installation path not set. Please configure it in Settings.")?
        .clone();
    drop(settings);

    let id = Uuid::new_v4().to_string();
    let dest_dir = std::path::PathBuf::from(&install_path);

    state
        .download_manager
        .start_download(app, id.clone(), url, file_name, dest_dir, owner, repo, tag)
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
