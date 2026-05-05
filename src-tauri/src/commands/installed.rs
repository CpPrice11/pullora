use tauri::State;

use crate::storage::get_config_dir;
use crate::storage::installed::{list_installed, remove_version, set_active_version, InstalledApp};
use crate::AppState;

fn find_exe_in_dir(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    fn scan(dir: &std::path::Path, best: &mut Option<std::path::PathBuf>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                scan(&path, best);
            } else if path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("exe"))
                .unwrap_or(false)
            {
                // Prefer shorter paths (fewer directory levels = closer to root)
                let is_better = best.as_ref().map_or(true, |b: &std::path::PathBuf| {
                    path.components().count() < b.components().count()
                });
                if is_better {
                    *best = Some(path);
                }
            }
        }
    }
    let mut best = None;
    scan(dir, &mut best);
    best
}

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
    let install_path = settings
        .installation_path
        .as_ref()
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

    let app = apps
        .iter()
        .find(|a| format!("{}/{}", a.owner, a.repo) == key)
        .ok_or("App not installed")?;

    let version = app
        .versions
        .iter()
        .find(|v| v.tag == app.active_version)
        .ok_or("Active version not found")?;

    let settings = state.settings.lock().await;
    let install_path = settings
        .installation_path
        .as_ref()
        .ok_or("Installation path not configured")?;

    let version_dir = std::path::PathBuf::from(install_path)
        .join(format!("{}-{}", owner, repo))
        .join(&version.tag);

    let exe_path = version_dir.join(&version.executable);

    let resolved = if exe_path.exists() {
        exe_path
    } else {
        find_exe_in_dir(&version_dir).ok_or_else(|| {
            log_launch_event(
                &owner,
                &repo,
                &version.tag,
                "launch failed: no executable found",
            );
            format!(
                "No executable found for {} {}. Reinstall or choose another release asset.",
                repo, version.tag
            )
        })?
    };

    std::process::Command::new(&resolved)
        .current_dir(resolved.parent().unwrap_or(&version_dir))
        .spawn()
        .map_err(|e| {
            log_launch_event(
                &owner,
                &repo,
                &version.tag,
                &format!("launch failed: {}", e),
            );
            format!(
                "Failed to launch {} {}. Check that the executable still exists and is not blocked by Windows: {}",
                repo, version.tag, e
            )
        })?;

    log_launch_event(
        &owner,
        &repo,
        &version.tag,
        &format!("launched {}", resolved.display()),
    );
    Ok(())
}

fn log_launch_event(owner: &str, repo: &str, tag: &str, message: &str) {
    let config_dir = get_config_dir();
    let _ = crate::storage::logs::append_log(
        &config_dir,
        &format!("launch {}/{}@{}: {}", owner, repo, tag, message),
    );
}
