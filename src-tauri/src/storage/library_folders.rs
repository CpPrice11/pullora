use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

use super::StorageError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFolder {
    pub id: String,
    pub name: String,
    pub repo_keys: Vec<String>,
    pub pinned: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
struct LibraryFoldersStore {
    version: u32,
    folders: Vec<LibraryFolder>,
}

impl Default for LibraryFoldersStore {
    fn default() -> Self {
        Self {
            version: 1,
            folders: vec![],
        }
    }
}

fn store_path(config_dir: &Path) -> std::path::PathBuf {
    config_dir.join("library-folders.json")
}

fn load_store(config_dir: &Path) -> Result<LibraryFoldersStore, StorageError> {
    let path = store_path(config_dir);
    if !path.exists() {
        return Ok(LibraryFoldersStore::default());
    }
    let content = std::fs::read_to_string(&path)?;
    let store: LibraryFoldersStore = serde_json::from_str(&content)?;
    Ok(store)
}

fn save_store(config_dir: &Path, store: &LibraryFoldersStore) -> Result<(), StorageError> {
    std::fs::create_dir_all(config_dir)?;
    let content = serde_json::to_string_pretty(store)?;
    std::fs::write(store_path(config_dir), content)?;
    Ok(())
}

fn normalize_folders(folders: Vec<LibraryFolder>) -> Vec<LibraryFolder> {
    let mut seen_ids = HashSet::new();

    folders
        .into_iter()
        .filter_map(|mut folder| {
            folder.id = folder.id.trim().to_string();
            folder.name = folder.name.trim().to_string();
            if folder.id.is_empty() || folder.name.is_empty() || !seen_ids.insert(folder.id.clone())
            {
                return None;
            }

            let mut seen_repo_keys = HashSet::new();
            folder.repo_keys = folder
                .repo_keys
                .into_iter()
                .map(|key| key.trim().to_string())
                .filter(|key| !key.is_empty() && seen_repo_keys.insert(key.clone()))
                .collect();

            Some(folder)
        })
        .collect()
}

pub fn list_library_folders(config_dir: &Path) -> Result<Vec<LibraryFolder>, StorageError> {
    Ok(normalize_folders(load_store(config_dir)?.folders))
}

pub fn save_library_folders(
    config_dir: &Path,
    folders: Vec<LibraryFolder>,
) -> Result<Vec<LibraryFolder>, StorageError> {
    let folders = normalize_folders(folders);
    let store = LibraryFoldersStore {
        version: 1,
        folders: folders.clone(),
    };
    save_store(config_dir, &store)?;
    Ok(folders)
}
