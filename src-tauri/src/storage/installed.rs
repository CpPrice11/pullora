use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::Path;

use super::StorageError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VersionInfo {
    pub tag: String,
    pub installed_at: DateTime<Utc>,
    pub executable: String,
    pub size_bytes: u64,
    #[serde(default)]
    pub asset_name: Option<String>,
    #[serde(default)]
    pub install_kind: Option<String>,
    #[serde(default)]
    pub install_dir: Option<String>,
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

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstalledRegistryTransfer {
    pub app_count: usize,
    pub version_count: usize,
}

impl Default for InstalledStore {
    fn default() -> Self {
        Self {
            version: 2,
            apps: vec![],
        }
    }
}

fn load_store(config_dir: &Path) -> Result<InstalledStore, StorageError> {
    let path = config_dir.join("installed_apps.json");
    if !path.exists() {
        return Ok(InstalledStore::default());
    }
    let content = std::fs::read_to_string(&path)?;
    let mut store: InstalledStore = serde_json::from_str(&content)?;
    if migrate_store(&mut store) {
        save_store(config_dir, &store)?;
    }
    Ok(store)
}

fn migrate_store(store: &mut InstalledStore) -> bool {
    let mut changed = false;

    if store.version < 2 {
        store.version = 2;
        changed = true;
    }

    for app in &mut store.apps {
        for version in &mut app.versions {
            if version.asset_name.is_none() {
                version.asset_name = Some(version.executable.clone());
                changed = true;
            }

            if version.install_kind.is_none() {
                let executable = version.executable.to_lowercase();
                let install_kind =
                    if executable.ends_with(".appimage") || executable.ends_with(".exe") {
                        "portable"
                    } else {
                        "archive"
                    };
                version.install_kind = Some(install_kind.to_string());
                changed = true;
            }
        }
    }

    changed
}

fn validate_store(store: &InstalledStore) -> Result<(), StorageError> {
    for app in &store.apps {
        if app.owner.trim().is_empty() || app.repo.trim().is_empty() {
            return Err(StorageError::InvalidData(
                "Installed registry contains an app without owner or repo.".to_string(),
            ));
        }

        if app.active_version.trim().is_empty() && !app.versions.is_empty() {
            return Err(StorageError::InvalidData(format!(
                "Installed registry entry {}/{} has versions but no active version.",
                app.owner, app.repo
            )));
        }

        if !app.versions.is_empty()
            && !app
                .versions
                .iter()
                .any(|version| version.tag == app.active_version)
        {
            return Err(StorageError::InvalidData(format!(
                "Installed registry entry {}/{} points to a missing active version.",
                app.owner, app.repo
            )));
        }

        for version in &app.versions {
            if version.tag.trim().is_empty() || version.executable.trim().is_empty() {
                return Err(StorageError::InvalidData(format!(
                    "Installed registry entry {}/{} contains an incomplete version.",
                    app.owner, app.repo
                )));
            }
        }
    }

    Ok(())
}

fn transfer_summary(store: &InstalledStore) -> InstalledRegistryTransfer {
    InstalledRegistryTransfer {
        app_count: store.apps.len(),
        version_count: store.apps.iter().map(|app| app.versions.len()).sum(),
    }
}

fn save_store(config_dir: &Path, store: &InstalledStore) -> Result<(), StorageError> {
    std::fs::create_dir_all(config_dir)?;
    let path = config_dir.join("installed_apps.json");
    let content = serde_json::to_string_pretty(store)?;
    std::fs::write(&path, content)?;
    Ok(())
}

pub fn list_installed(config_dir: &Path) -> Result<Vec<InstalledApp>, StorageError> {
    let store = load_store(config_dir)?;
    Ok(store.apps)
}

pub fn export_registry(
    config_dir: &Path,
    target_path: &Path,
) -> Result<InstalledRegistryTransfer, StorageError> {
    let store = load_store(config_dir)?;
    validate_store(&store)?;

    if let Some(parent) = target_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let content = serde_json::to_string_pretty(&store)?;
    std::fs::write(target_path, content)?;
    Ok(transfer_summary(&store))
}

pub fn import_registry(
    config_dir: &Path,
    source_path: &Path,
) -> Result<InstalledRegistryTransfer, StorageError> {
    let content = std::fs::read_to_string(source_path)?;
    let mut store: InstalledStore = serde_json::from_str(&content)?;
    if store.version == 0 {
        store.version = InstalledStore::default().version;
    }
    migrate_store(&mut store);
    validate_store(&store)?;
    let summary = transfer_summary(&store);
    save_store(config_dir, &store)?;
    Ok(summary)
}

pub fn add_version(
    config_dir: &Path,
    owner: &str,
    repo: &str,
    version: VersionInfo,
) -> Result<(), StorageError> {
    let mut store = load_store(config_dir)?;
    store.version = 2;
    let key = format!("{}/{}", owner, repo);
    let tag = version.tag.clone();

    if let Some(app) = store
        .apps
        .iter_mut()
        .find(|a| format!("{}/{}", a.owner, a.repo) == key)
    {
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
    config_dir: &Path,
    owner: &str,
    repo: &str,
    tag: &str,
) -> Result<(), StorageError> {
    let mut store = load_store(config_dir)?;
    store.version = 2;
    let key = format!("{}/{}", owner, repo);

    if let Some(app) = store
        .apps
        .iter_mut()
        .find(|a| format!("{}/{}", a.owner, a.repo) == key)
    {
        if app.versions.iter().any(|v| v.tag == tag) {
            app.active_version = tag.to_string();
        } else {
            return Err(StorageError::NotFound(format!("Version {} not found", tag)));
        }
    }

    save_store(config_dir, &store)
}

pub fn remove_version(
    config_dir: &Path,
    owner: &str,
    repo: &str,
    tag: &str,
) -> Result<(), StorageError> {
    let mut store = load_store(config_dir)?;
    store.version = 2;
    let key = format!("{}/{}", owner, repo);

    if let Some(app) = store
        .apps
        .iter_mut()
        .find(|a| format!("{}/{}", a.owner, a.repo) == key)
    {
        app.versions.retain(|v| v.tag != tag);
        if app.active_version == tag {
            app.active_version = app
                .versions
                .last()
                .map(|v| v.tag.clone())
                .unwrap_or_default();
        }
        if app.versions.is_empty() {
            let app_key = key.clone();
            store
                .apps
                .retain(|a| format!("{}/{}", a.owner, a.repo) != app_key);
        }
    }

    save_store(config_dir, &store)
}

pub fn remove_app(config_dir: &Path, owner: &str, repo: &str) -> Result<(), StorageError> {
    let mut store = load_store(config_dir)?;
    store.version = 2;
    let key = format!("{}/{}", owner, repo);

    store
        .apps
        .retain(|app| format!("{}/{}", app.owner, app.repo) != key);

    save_store(config_dir, &store)
}
