use tauri::State;

use crate::github::models::{Release, SearchResponse};
use crate::AppState;

#[tauri::command]
pub async fn search_repositories(
    query: String,
    page: Option<u32>,
    state: State<'_, AppState>,
) -> Result<SearchResponse, String> {
    let client = state.github_client.lock().await;
    client.search_repositories(&query, page.unwrap_or(1)).await
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
