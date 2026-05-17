use base64::Engine;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use super::StorageError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectArt {
    pub owner: String,
    pub repo: String,
    pub cover_path: Option<String>,
    pub background_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover_data_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_data_url: Option<String>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ProjectArtStore {
    version: u32,
    projects: Vec<ProjectArt>,
}

impl Default for ProjectArtStore {
    fn default() -> Self {
        Self {
            version: 1,
            projects: vec![],
        }
    }
}

fn load_store(config_dir: &PathBuf) -> Result<ProjectArtStore, StorageError> {
    let path = config_dir.join("project_art.json");
    if !path.exists() {
        return Ok(ProjectArtStore::default());
    }

    let content = std::fs::read_to_string(&path)?;
    let store: ProjectArtStore = serde_json::from_str(&content)?;
    Ok(store)
}

fn save_store(config_dir: &PathBuf, store: &ProjectArtStore) -> Result<(), StorageError> {
    std::fs::create_dir_all(config_dir)?;
    let path = config_dir.join("project_art.json");
    let content = serde_json::to_string_pretty(store)?;
    std::fs::write(&path, content)?;
    Ok(())
}

fn project_key(owner: &str, repo: &str) -> String {
    format!("{}/{}", owner, repo)
}

fn safe_part(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

fn validate_image_extension(path: &Path) -> Result<String, StorageError> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .ok_or_else(|| StorageError::NotFound("Image extension was not found".to_string()))?;

    match extension.as_str() {
        "png" | "jpg" | "jpeg" | "webp" => Ok(extension),
        _ => Err(StorageError::NotFound(
            "Only PNG, JPG, JPEG, and WebP images are supported".to_string(),
        )),
    }
}

fn find_project_mut<'a>(
    store: &'a mut ProjectArtStore,
    owner: &str,
    repo: &str,
) -> &'a mut ProjectArt {
    let key = project_key(owner, repo);
    if let Some(index) = store
        .projects
        .iter()
        .position(|project| project_key(&project.owner, &project.repo) == key)
    {
        return &mut store.projects[index];
    }

    store.projects.push(ProjectArt {
        owner: owner.to_string(),
        repo: repo.to_string(),
        cover_path: None,
        background_path: None,
        cover_data_url: None,
        background_data_url: None,
        updated_at: Utc::now(),
    });

    store
        .projects
        .last_mut()
        .expect("project was just inserted")
}

fn image_mime(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

fn path_to_data_url(path: &str) -> Option<String> {
    let path = PathBuf::from(path);
    let mime = image_mime(&path)?;
    let bytes = std::fs::read(path).ok()?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Some(format!("data:{};base64,{}", mime, encoded))
}

fn hydrate_project_art(mut project: ProjectArt) -> ProjectArt {
    project.cover_data_url = project.cover_path.as_deref().and_then(path_to_data_url);
    project.background_data_url = project
        .background_path
        .as_deref()
        .and_then(path_to_data_url);
    project
}

pub fn list_project_art(config_dir: &PathBuf) -> Result<Vec<ProjectArt>, StorageError> {
    let store = load_store(config_dir)?;
    Ok(store
        .projects
        .into_iter()
        .map(hydrate_project_art)
        .collect())
}

pub fn get_project_art(
    config_dir: &PathBuf,
    owner: &str,
    repo: &str,
) -> Result<Option<ProjectArt>, StorageError> {
    let store = load_store(config_dir)?;
    let key = project_key(owner, repo);
    Ok(store
        .projects
        .into_iter()
        .find(|project| project_key(&project.owner, &project.repo) == key)
        .map(hydrate_project_art))
}

pub fn set_project_art_asset(
    config_dir: &PathBuf,
    owner: &str,
    repo: &str,
    kind: &str,
    source_path: &str,
) -> Result<ProjectArt, StorageError> {
    let source = PathBuf::from(source_path);
    if !source.exists() {
        return Err(StorageError::NotFound(format!(
            "Image was not found: {}",
            source_path
        )));
    }

    let extension = validate_image_extension(&source)?;
    let normalized_kind = match kind {
        "cover" | "background" => kind,
        _ => {
            return Err(StorageError::NotFound(
                "Art kind must be cover or background".to_string(),
            ))
        }
    };

    let project_dir =
        config_dir
            .join("project-art")
            .join(format!("{}__{}", safe_part(owner), safe_part(repo)));
    std::fs::create_dir_all(&project_dir)?;

    let target = project_dir.join(format!("{}.{}", normalized_kind, extension));
    std::fs::copy(&source, &target)?;

    let mut store = load_store(config_dir)?;
    let target_string = target.to_string_lossy().to_string();
    let updated = {
        let project = find_project_mut(&mut store, owner, repo);
        let previous_path = if normalized_kind == "cover" {
            project.cover_path.replace(target_string.clone())
        } else {
            project.background_path.replace(target_string.clone())
        };
        project.updated_at = Utc::now();
        (project.clone(), previous_path)
    };

    if let Some(path) = updated.1 {
        if path != target_string {
            let _ = std::fs::remove_file(path);
        }
    }

    save_store(config_dir, &store)?;
    Ok(hydrate_project_art(updated.0))
}

pub fn clear_project_art_asset(
    config_dir: &PathBuf,
    owner: &str,
    repo: &str,
    kind: &str,
) -> Result<ProjectArt, StorageError> {
    let mut store = load_store(config_dir)?;
    let mut files_to_remove: Vec<String> = vec![];
    let updated = {
        let project = find_project_mut(&mut store, owner, repo);
        match kind {
            "cover" => {
                if let Some(path) = project.cover_path.take() {
                    files_to_remove.push(path);
                }
            }
            "background" => {
                if let Some(path) = project.background_path.take() {
                    files_to_remove.push(path);
                }
            }
            "all" => {
                if let Some(path) = project.cover_path.take() {
                    files_to_remove.push(path);
                }
                if let Some(path) = project.background_path.take() {
                    files_to_remove.push(path);
                }
            }
            _ => {
                return Err(StorageError::NotFound(
                    "Art kind must be cover, background, or all".to_string(),
                ))
            }
        }
        project.updated_at = Utc::now();
        project.clone()
    };

    for path in files_to_remove {
        let _ = std::fs::remove_file(path);
    }

    save_store(config_dir, &store)?;
    Ok(hydrate_project_art(updated))
}
