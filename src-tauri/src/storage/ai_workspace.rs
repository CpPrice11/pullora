use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::Path;
use uuid::Uuid;

use super::StorageError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiWorkspace {
    pub id: String,
    pub name: String,
    pub path: String,
    pub github_url: Option<String>,
    pub owner: Option<String>,
    pub repo: Option<String>,
    pub linked_library_repo: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_opened_at: DateTime<Utc>,
    #[serde(default)]
    pub cloned_by_launcher: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct AiWorkspaceStore {
    version: u32,
    workspaces: Vec<AiWorkspace>,
}

impl Default for AiWorkspaceStore {
    fn default() -> Self {
        Self {
            version: 1,
            workspaces: Vec::new(),
        }
    }
}

fn load_store(config_dir: &Path) -> Result<AiWorkspaceStore, StorageError> {
    let path = config_dir.join("ai_workspaces.json");
    if !path.exists() {
        return Ok(AiWorkspaceStore::default());
    }

    let content = std::fs::read_to_string(path)?;
    Ok(serde_json::from_str(&content)?)
}

fn save_store(config_dir: &Path, store: &AiWorkspaceStore) -> Result<(), StorageError> {
    std::fs::create_dir_all(config_dir)?;
    let content = serde_json::to_string_pretty(store)?;
    std::fs::write(config_dir.join("ai_workspaces.json"), content)?;
    Ok(())
}

pub fn list(config_dir: &Path) -> Result<Vec<AiWorkspace>, StorageError> {
    Ok(load_store(config_dir)?.workspaces)
}

pub fn find(config_dir: &Path, id: &str) -> Result<AiWorkspace, StorageError> {
    load_store(config_dir)?
        .workspaces
        .into_iter()
        .find(|workspace| workspace.id == id)
        .ok_or_else(|| StorageError::NotFound(id.to_string()))
}

pub fn save_workspace(
    config_dir: &Path,
    name: String,
    path: String,
    github_url: Option<String>,
    owner: Option<String>,
    repo: Option<String>,
    linked_library_repo: Option<String>,
    cloned_by_launcher: bool,
) -> Result<AiWorkspace, StorageError> {
    let mut store = load_store(config_dir)?;
    let normalized_path = path.to_lowercase();

    if let Some(existing) = store
        .workspaces
        .iter_mut()
        .find(|workspace| workspace.path.to_lowercase() == normalized_path)
    {
        existing.last_opened_at = Utc::now();
        if linked_library_repo.is_some() {
            existing.linked_library_repo = linked_library_repo;
        }
        let result = existing.clone();
        save_store(config_dir, &store)?;
        return Ok(result);
    }

    let now = Utc::now();
    let workspace = AiWorkspace {
        id: Uuid::new_v4().to_string(),
        name,
        path,
        github_url,
        owner,
        repo,
        linked_library_repo,
        created_at: now,
        last_opened_at: now,
        cloned_by_launcher,
    };
    store.workspaces.push(workspace.clone());
    save_store(config_dir, &store)?;
    Ok(workspace)
}

pub fn touch(config_dir: &Path, id: &str) -> Result<AiWorkspace, StorageError> {
    let mut store = load_store(config_dir)?;
    let workspace = store
        .workspaces
        .iter_mut()
        .find(|workspace| workspace.id == id)
        .ok_or_else(|| StorageError::NotFound(id.to_string()))?;
    workspace.last_opened_at = Utc::now();
    let result = workspace.clone();
    save_store(config_dir, &store)?;
    Ok(result)
}

pub fn unlink(config_dir: &Path, id: &str) -> Result<(), StorageError> {
    let mut store = load_store(config_dir)?;
    let original_len = store.workspaces.len();
    store.workspaces.retain(|workspace| workspace.id != id);
    if original_len == store.workspaces.len() {
        return Err(StorageError::NotFound(id.to_string()));
    }
    save_store(config_dir, &store)
}
