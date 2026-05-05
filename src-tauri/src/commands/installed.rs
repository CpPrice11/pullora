use tauri::State;

use crate::storage::installed::{list_installed, set_active_version, remove_version, InstalledApp};
use crate::storage::get_config_dir;
use crate::AppState;

#[tauri::command]
pub async fn get_installed_apps(_state: State<'_, AppState>) -> Result<Vec<InstalledApp>, String> {
    let config_dir = get_config_dir();
    list_installed(&config_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn switch_version(
    owner: String,
    repo: String,
    tag: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    let config_dir = get_config_dir();
    set_active_version(&config_dir, &owner, &repo, &tag).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn uninstall_version(
    owner: String,
    repo: String,
    tag: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let config_dir = get_config_dir();
    let settings = state.settings.lock().await;
    let install_path = settings.installation_path.as_ref()
        .ok_or("Installation path not configured")?;

    let app_dir = std::path::PathBuf::from(install_path)
        .join(format!("{}-{}", owner, repo))
        .join(&tag);

    if app_dir.exists() {
        std::fs::remove_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }

    drop(settings);
    remove_version(&config_dir, &owner, &repo, &tag).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn launch_app(
    owner: String,
    repo: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let config_dir = get_config_dir();
    let apps = list_installed(&config_dir).map_err(|e| e.to_string())?;
    let key = format!("{}/{}", owner, repo);

    let app = apps.iter()
        .find(|a| format!("{}/{}", a.owner, a.repo) == key)
        .ok_or("App not installed")?;

    let version = app.versions.iter()
        .find(|v| v.tag == app.active_version)
        .ok_or("Active version not found")?;

    let settings = state.settings.lock().await;
    let install_path = settings.installation_path.as_ref()
        .ok_or("Installation path not configured")?;

    let exe_path = std::path::PathBuf::from(install_path)
        .join(format!("{}-{}", owner, repo))
        .join(&version.tag)
        .join(&version.executable);

    if !exe_path.exists() {
        return Err(format!("Executable not found: {}", exe_path.display()));
    }

    std::process::Command::new(&exe_path)
        .spawn()
        .map_err(|e| format!("Failed to launch: {}", e))?;

    Ok(())
}
