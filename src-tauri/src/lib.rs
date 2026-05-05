use std::sync::Arc;
use tokio::sync::Mutex;

mod commands;
mod github;
mod storage;

use github::GitHubClient;
use storage::{get_config_dir, settings::load_settings};

pub struct AppState {
    pub github_client: Arc<Mutex<GitHubClient>>,
    pub settings: Arc<Mutex<storage::settings::AppSettings>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config_dir = get_config_dir();
    let settings = load_settings(&config_dir).unwrap_or_default();
    let token = settings.github_token.clone();

    let state = AppState {
        github_client: Arc::new(Mutex::new(GitHubClient::new(token))),
        settings: Arc::new(Mutex::new(settings)),
    };

    tauri::Builder::default()
        .manage(state)
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::github::search_repositories,
            commands::github::get_releases,
            commands::github::clear_github_cache,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::set_installation_path,
            commands::settings::is_first_launch,
            commands::favorites::get_favorites,
            commands::favorites::add_to_favorites,
            commands::favorites::remove_from_favorites,
            commands::favorites::check_is_favorite,
            commands::installed::get_installed_apps,
            commands::installed::switch_version,
            commands::installed::uninstall_version,
            commands::installed::launch_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
