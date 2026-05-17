use tauri::State;

use crate::storage::get_config_dir;
use crate::storage::project_art::{
    clear_project_art_asset, get_project_art, list_project_art, set_project_art_asset, ProjectArt,
};
use crate::AppState;

#[tauri::command]
pub async fn list_project_art_assets(
    _state: State<'_, AppState>,
) -> Result<Vec<ProjectArt>, String> {
    let config_dir = get_config_dir();
    list_project_art(&config_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_project_art_asset(
    owner: String,
    repo: String,
    _state: State<'_, AppState>,
) -> Result<Option<ProjectArt>, String> {
    let config_dir = get_config_dir();
    get_project_art(&config_dir, &owner, &repo).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_project_art_asset_command(
    owner: String,
    repo: String,
    kind: String,
    source_path: String,
    _state: State<'_, AppState>,
) -> Result<ProjectArt, String> {
    let config_dir = get_config_dir();
    set_project_art_asset(&config_dir, &owner, &repo, &kind, &source_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_project_art_asset_command(
    owner: String,
    repo: String,
    kind: String,
    _state: State<'_, AppState>,
) -> Result<ProjectArt, String> {
    let config_dir = get_config_dir();
    clear_project_art_asset(&config_dir, &owner, &repo, &kind).map_err(|e| e.to_string())
}
