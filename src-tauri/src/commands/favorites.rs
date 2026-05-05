use tauri::State;

use crate::storage::favorites::{add_favorite, is_favorite, list_favorites, remove_favorite, FavoriteApp};
use crate::storage::get_config_dir;
use crate::AppState;

#[tauri::command]
pub async fn get_favorites(_state: State<'_, AppState>) -> Result<Vec<FavoriteApp>, String> {
    let config_dir = get_config_dir();
    list_favorites(&config_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_to_favorites(
    owner: String,
    repo: String,
    display_name: String,
    description: Option<String>,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    let config_dir = get_config_dir();
    let app = FavoriteApp {
        owner,
        repo,
        display_name,
        description,
        last_checked: None,
    };
    add_favorite(&config_dir, app).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_from_favorites(
    owner: String,
    repo: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    let config_dir = get_config_dir();
    remove_favorite(&config_dir, &owner, &repo).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_is_favorite(
    owner: String,
    repo: String,
    _state: State<'_, AppState>,
) -> Result<bool, String> {
    let config_dir = get_config_dir();
    Ok(is_favorite(&config_dir, &owner, &repo))
}
