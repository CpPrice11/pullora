use std::sync::Arc;
use tokio::sync::Mutex;

mod commands;
mod download;
mod github;
mod storage;
mod version;

use download::DownloadManager;
use github::GitHubClient;
use storage::{get_config_dir, settings::load_settings};

pub struct AppState {
    pub github_client: Arc<Mutex<GitHubClient>>,
    pub settings: Arc<Mutex<storage::settings::AppSettings>>,
    pub download_manager: Arc<DownloadManager>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config_dir = get_config_dir();
    let settings = load_settings(&config_dir).unwrap_or_default();
    let token = settings.github_token.clone();

    let state = AppState {
        github_client: Arc::new(Mutex::new(GitHubClient::new(token))),
        settings: Arc::new(Mutex::new(settings)),
        download_manager: Arc::new(DownloadManager::new()),
    };

    tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
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
            commands::github::list_owner_repositories,
            commands::github::get_releases,
            commands::github::clear_github_cache,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::set_installation_path,
            commands::settings::is_first_launch,
            commands::settings::validate_installation_path,
            commands::favorites::get_favorites,
            commands::favorites::add_to_favorites,
            commands::favorites::remove_from_favorites,
            commands::favorites::check_is_favorite,
            commands::installed::get_installed_apps,
            commands::installed::switch_version,
            commands::installed::validate_installed_app,
            commands::installed::open_installed_app_dir,
            commands::installed::cleanup_incomplete_installs,
            commands::installed::uninstall_version,
            commands::installed::launch_app,
            commands::download::start_download,
            commands::download::get_downloads,
            commands::download::cancel_download,
            commands::updates::check_for_updates,
            commands::updates::open_dir,
            commands::updates::install_launcher_release,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
