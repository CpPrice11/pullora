use tauri::State;

use crate::github::models::{OwnerRepositoriesResponse, Release};
use crate::AppState;

#[tauri::command]
pub async fn list_owner_repositories(
    owner: String,
    page: Option<u32>,
    releases_only: Option<bool>,
    state: State<'_, AppState>,
) -> Result<OwnerRepositoriesResponse, String> {
    let client = state.github_client.lock().await;
    client
        .list_owner_repositories(&owner, page.unwrap_or(1), releases_only.unwrap_or(true))
        .await
}

#[tauri::command]
pub async fn search_public_repositories(
    query: Option<String>,
    page: Option<u32>,
    sort: Option<String>,
    language: Option<String>,
    topic: Option<String>,
    releases_only: Option<bool>,
    state: State<'_, AppState>,
) -> Result<OwnerRepositoriesResponse, String> {
    let client = state.github_client.lock().await;
    client
        .search_public_repositories(
            query.as_deref().unwrap_or(""),
            page.unwrap_or(1),
            sort.as_deref(),
            language.as_deref(),
            topic.as_deref(),
            releases_only.unwrap_or(false),
        )
        .await
}

#[tauri::command]
pub async fn get_releases(
    owner: String,
    repo: String,
    state: State<'_, AppState>,
) -> Result<Vec<Release>, String> {
    let client = state.github_client.lock().await;
    client.get_releases(&owner, &repo).await
}

#[tauri::command]
pub async fn clear_github_cache(state: State<'_, AppState>) -> Result<(), String> {
    let client = state.github_client.lock().await;
    client.clear_cache();
    Ok(())
}
