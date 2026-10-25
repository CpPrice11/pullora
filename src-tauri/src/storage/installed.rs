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
    #[serde(default)]
    pub last_launched_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct InstalledStore {
    version: u32,
    apps: Vec<InstalledApp>,
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

fn save_store(config_dir: &Path, store: &InstalledStore) -> Result<(), StorageError> {
    std::fs::create_dir_all(config_dir)?;
    let path = config_dir.join("installed_apps.json");
    let content = serde_json::to_string_pretty(store)?;
    let temporary = config_dir.join(format!(".installed-{}.tmp", uuid::Uuid::new_v4()));
    std::fs::write(&temporary, content)?;
    if let Err(error) = std::fs::rename(&temporary, &path) {
        let _ = std::fs::remove_file(&temporary);
        return Err(error.into());
    }
    Ok(())
}

pub fn list_installed(config_dir: &Path) -> Result<Vec<InstalledApp>, StorageError> {
    let store = load_store(config_dir)?;
    Ok(store.apps)
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
            last_launched_at: None,
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

pub fn record_launch(config_dir: &Path, owner: &str, repo: &str) -> Result<(), StorageError> {
    let mut store = load_store(config_dir)?;
    let app = store
        .apps
        .iter_mut()
        .find(|app| app.owner == owner && app.repo == repo)
        .ok_or_else(|| StorageError::NotFound(format!("App {}/{} not found", owner, repo)))?;
    app.last_launched_at = Some(Utc::now());
    save_store(config_dir, &store)
}

#[cfg(test)]
mod ownership_tests {
    use super::*;
    #[test]
    fn disconnecting_external_entry_keeps_original_files() {
        let root = std::env::temp_dir().join(format!("pullora-external-{}", uuid::Uuid::new_v4()));
        let external = root.join("outside-library");
        let config = root.join("config");
        std::fs::create_dir_all(&external).unwrap();
        let executable = external.join("recycle-desk.exe");
        std::fs::write(&executable, b"MZtest").unwrap();
        add_version(
            &config,
            "CpPrice11",
            "recycle-desk",
            VersionInfo {
                tag: "v1".into(),
                installed_at: Utc::now(),
                executable: executable.to_string_lossy().into(),
                size_bytes: 0,
                asset_name: None,
                install_kind: Some("external".into()),
                install_dir: Some(external.to_string_lossy().into()),
            },
        )
        .unwrap();
        remove_version(&config, "CpPrice11", "recycle-desk", "v1").unwrap();
        assert!(list_installed(&config).unwrap().is_empty());
        assert_eq!(std::fs::read(&executable).unwrap(), b"MZtest");
        std::fs::remove_dir_all(root).unwrap();
    }
}
