use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use super::StorageError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VersionInfo {
    pub tag: String,
    pub installed_at: DateTime<Utc>,
    pub executable: String,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    pub name: String,
    pub owner: String,
    pub repo: String,
    pub versions: Vec<VersionInfo>,
    pub active_version: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct InstalledStore {
    version: u32,
    apps: Vec<InstalledApp>,
}

impl Default for InstalledStore {
    fn default() -> Self {
        Self { version: 1, apps: vec![] }
    }
}

fn load_store(config_dir: &PathBuf) -> Result<InstalledStore, StorageError> {
    let path = config_dir.join("installed_apps.json");
    if !path.exists() {
        return Ok(InstalledStore::default());
    }
    let content = std::fs::read_to_string(&path)?;
    let store: InstalledStore = serde_json::from_str(&content)?;
    Ok(store)
}

fn save_store(config_dir: &PathBuf, store: &InstalledStore) -> Result<(), StorageError> {
    std::fs::create_dir_all(config_dir)?;
    let path = config_dir.join("installed_apps.json");
    let content = serde_json::to_string_pretty(store)?;
    std::fs::write(&path, content)?;
    Ok(())
}

pub fn list_installed(config_dir: &PathBuf) -> Result<Vec<InstalledApp>, StorageError> {
    let store = load_store(config_dir)?;
    Ok(store.apps)
}

#[allow(dead_code)]
pub fn add_version(
    config_dir: &PathBuf,
    owner: &str,
    repo: &str,
    version: VersionInfo,
) -> Result<(), StorageError> {
    let mut store = load_store(config_dir)?;
    let key = format!("{}/{}", owner, repo);
    let tag = version.tag.clone();

    if let Some(app) = store.apps.iter_mut().find(|a| format!("{}/{}", a.owner, a.repo) == key) {
        app.versions.retain(|v| v.tag != tag);
        app.versions.push(version);
        app.active_version = tag;
    } else {
        store.apps.push(InstalledApp {
            name: repo.to_string(),
            owner: owner.to_string(),
            repo: repo.to_string(),
            active_version: tag.clone(),
            versions: vec![version],
        });
    }

    save_store(config_dir, &store)
}

pub fn set_active_version(
    config_dir: &PathBuf,
    owner: &str,
    repo: &str,
    tag: &str,
) -> Result<(), StorageError> {
    let mut store = load_store(config_dir)?;
    let key = format!("{}/{}", owner, repo);

    if let Some(app) = store.apps.iter_mut().find(|a| format!("{}/{}", a.owner, a.repo) == key) {
        if app.versions.iter().any(|v| v.tag == tag) {
            app.active_version = tag.to_string();
        } else {
            return Err(StorageError::NotFound(format!("Version {} not found", tag)));
        }
    }

    save_store(config_dir, &store)
}

pub fn remove_version(
    config_dir: &PathBuf,
    owner: &str,
    repo: &str,
    tag: &str,
) -> Result<(), StorageError> {
    let mut store = load_store(config_dir)?;
    let key = format!("{}/{}", owner, repo);

    if let Some(app) = store.apps.iter_mut().find(|a| format!("{}/{}", a.owner, a.repo) == key) {
        app.versions.retain(|v| v.tag != tag);
        if app.active_version == tag {
            app.active_version = app.versions.last().map(|v| v.tag.clone()).unwrap_or_default();
        }
        if app.versions.is_empty() {
            let app_key = key.clone();
            store.apps.retain(|a| format!("{}/{}", a.owner, a.repo) != app_key);
        }
    }

    save_store(config_dir, &store)
}
