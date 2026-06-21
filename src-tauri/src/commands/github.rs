use tauri::State;

use crate::github::models::{OwnerRepositoriesResponse, Release};
use crate::github::GitHubRateLimitStatus;
use crate::AppState;

#[tauri::command]
pub async fn list_owner_repositories(
    owner: String,
    page: Option<u32>,
    releases_only: Option<bool>,
    force_refresh: Option<bool>,
    state: State<'_, AppState>,
) -> Result<OwnerRepositoriesResponse, String> {
    state
        .github_client
        .list_owner_repositories(
            &owner,
            page.unwrap_or(1),
            releases_only.unwrap_or(true),
            force_refresh.unwrap_or(false),
        )
        .await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn search_public_repositories(
    query: Option<String>,
    page: Option<u32>,
    sort: Option<String>,
    language: Option<String>,
    topic: Option<String>,
    releases_only: Option<bool>,
    force_refresh: Option<bool>,
    state: State<'_, AppState>,
) -> Result<OwnerRepositoriesResponse, String> {
    state
        .github_client
        .search_public_repositories(
            query.as_deref().unwrap_or(""),
            page.unwrap_or(1),
            sort.as_deref(),
            language.as_deref(),
            topic.as_deref(),
            releases_only.unwrap_or(false),
            force_refresh.unwrap_or(false),
        )
        .await
}

#[tauri::command]
pub async fn get_releases(
    owner: String,
    repo: String,
    force_refresh: Option<bool>,
    state: State<'_, AppState>,
) -> Result<Vec<Release>, String> {
    state
        .github_client
        .get_releases(&owner, &repo, force_refresh.unwrap_or(false))
        .await
}

#[tauri::command]
pub async fn clear_github_cache(state: State<'_, AppState>) -> Result<(), String> {
    state.github_client.clear_cache();
    Ok(())
}

#[tauri::command]
pub async fn get_github_rate_limit_status(
    state: State<'_, AppState>,
) -> Result<GitHubRateLimitStatus, String> {
    Ok(state.github_client.rate_limit_status())
}
