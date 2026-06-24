use tauri::State;

use crate::storage::get_config_dir;
use crate::storage::library_folders::{
    list_library_folders, save_library_folders as persist_library_folders, LibraryFolder,
};
use crate::AppState;

#[tauri::command]
pub async fn get_library_folders(
    _state: State<'_, AppState>,
) -> Result<Vec<LibraryFolder>, String> {
    let config_dir = get_config_dir();
    list_library_folders(&config_dir).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn save_library_folders(
    folders: Vec<LibraryFolder>,
    _state: State<'_, AppState>,
) -> Result<Vec<LibraryFolder>, String> {
    let config_dir = get_config_dir();
    persist_library_folders(&config_dir, folders).map_err(|error| error.to_string())
}
