use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use super::StorageError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteApp {
    pub owner: String,
    pub repo: String,
    pub display_name: String,
    pub description: Option<String>,
    pub last_checked: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct FavoritesStore {
    version: u32,
    favorites: Vec<FavoriteApp>,
}

impl Default for FavoritesStore {
    fn default() -> Self {
        Self { version: 1, favorites: vec![] }
    }
}

fn load_store(config_dir: &PathBuf) -> Result<FavoritesStore, StorageError> {
    let path = config_dir.join("favorites.json");
    if !path.exists() {
        return Ok(FavoritesStore::default());
    }
    let content = std::fs::read_to_string(&path)?;
    let store: FavoritesStore = serde_json::from_str(&content)?;
    Ok(store)
}

fn save_store(config_dir: &PathBuf, store: &FavoritesStore) -> Result<(), StorageError> {
    std::fs::create_dir_all(config_dir)?;
    let path = config_dir.join("favorites.json");
    let content = serde_json::to_string_pretty(store)?;
    std::fs::write(&path, content)?;
    Ok(())
}

pub fn list_favorites(config_dir: &PathBuf) -> Result<Vec<FavoriteApp>, StorageError> {
    let store = load_store(config_dir)?;
    Ok(store.favorites)
}

pub fn add_favorite(config_dir: &PathBuf, app: FavoriteApp) -> Result<(), StorageError> {
    let mut store = load_store(config_dir)?;
    let key = format!("{}/{}", app.owner, app.repo);
    store.favorites.retain(|f| format!("{}/{}", f.owner, f.repo) != key);
    store.favorites.push(app);
    save_store(config_dir, &store)
}

pub fn remove_favorite(config_dir: &PathBuf, owner: &str, repo: &str) -> Result<(), StorageError> {
    let mut store = load_store(config_dir)?;
    let key = format!("{}/{}", owner, repo);
    store.favorites.retain(|f| format!("{}/{}", f.owner, f.repo) != key);
    save_store(config_dir, &store)
}

pub fn is_favorite(config_dir: &PathBuf, owner: &str, repo: &str) -> bool {
    let key = format!("{}/{}", owner, repo);
    load_store(config_dir)
        .map(|s| s.favorites.iter().any(|f| format!("{}/{}", f.owner, f.repo) == key))
        .unwrap_or(false)
}
