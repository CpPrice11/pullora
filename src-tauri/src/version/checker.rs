use serde::Serialize;

use crate::github::GitHubClient;
use crate::storage::{get_config_dir, installed::list_installed};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAvailable {
    pub owner: String,
    pub repo: String,
    pub app_name: String,
    pub current_version: String,
    pub latest_version: String,
    pub release_url: String,
}

pub async fn check_all_updates(client: &GitHubClient) -> Result<Vec<UpdateAvailable>, String> {
    let config_dir = get_config_dir();
    let apps = list_installed(&config_dir).map_err(|e| e.to_string())?;

    let mut updates = vec![];

    for app in &apps {
        if app.active_version.is_empty() {
            continue;
        }
        match client.get_releases(&app.owner, &app.repo).await {
            Ok(releases) => {
                // Find the latest non-draft, non-prerelease
                if let Some(latest) = releases.iter().find(|r| !r.draft && !r.prerelease) {
                    if latest.tag_name != app.active_version {
                        updates.push(UpdateAvailable {
                            owner: app.owner.clone(),
                            repo: app.repo.clone(),
                            app_name: app.name.clone(),
                            current_version: app.active_version.clone(),
                            latest_version: latest.tag_name.clone(),
                            release_url: format!(
                                "https://github.com/{}/{}/releases/tag/{}",
                                app.owner, app.repo, latest.tag_name
                            ),
                        });
                    }
                }
            }
            Err(_) => continue, // Skip on API error — don't fail the whole check
        }
    }

    Ok(updates)
}
