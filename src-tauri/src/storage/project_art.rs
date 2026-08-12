use base64::Engine;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use super::StorageError;

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArtCrop {
    pub focus_x: f64,
    pub focus_y: f64,
    pub zoom: f64,
}

impl Default for ArtCrop {
    fn default() -> Self {
        Self {
            focus_x: 0.5,
            focus_y: 0.5,
            zoom: 1.0,
        }
    }
}

impl ArtCrop {
    fn normalized(self) -> Self {
        let fallback = Self::default();
        Self {
            focus_x: if self.focus_x.is_finite() {
                self.focus_x.clamp(0.0, 1.0)
            } else {
                fallback.focus_x
            },
            focus_y: if self.focus_y.is_finite() {
                self.focus_y.clamp(0.0, 1.0)
            } else {
                fallback.focus_y
            },
            zoom: if self.zoom.is_finite() {
                self.zoom.clamp(1.0, 4.0)
            } else {
                fallback.zoom
            },
        }
    }
}

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
    #[serde(default)]
    pub cover_crop: ArtCrop,
    #[serde(default)]
    pub background_crop: ArtCrop,
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

fn load_store(config_dir: &Path) -> Result<ProjectArtStore, StorageError> {
    let path = config_dir.join("project_art.json");
    let backup = config_dir.join("project_art.json.bak");
    if !path.exists() && backup.is_file() {
        std::fs::rename(&backup, &path)?;
    }
    if !path.exists() {
        return Ok(ProjectArtStore::default());
    }

    let content = std::fs::read_to_string(&path)?;
    let mut store: ProjectArtStore = serde_json::from_str(&content)?;
    for project in &mut store.projects {
        project.cover_crop = project.cover_crop.normalized();
        project.background_crop = project.background_crop.normalized();
    }
    Ok(store)
}

fn save_store(config_dir: &Path, store: &ProjectArtStore) -> Result<(), StorageError> {
    std::fs::create_dir_all(config_dir)?;
    let path = config_dir.join("project_art.json");
    let temporary = config_dir.join("project_art.json.tmp");
    let backup = config_dir.join("project_art.json.bak");
    let content = serde_json::to_string_pretty(store)?;
    if let Err(error) = std::fs::write(&temporary, content) {
        let _ = std::fs::remove_file(&temporary);
        return Err(error.into());
    }

    let result = (|| -> Result<(), StorageError> {
        if path.exists() {
            if backup.exists() {
                std::fs::remove_file(&backup)?;
            }
            std::fs::rename(&path, &backup)?;
        }

        if let Err(error) = std::fs::rename(&temporary, &path) {
            if backup.is_file() {
                let _ = std::fs::rename(&backup, &path);
            }
            return Err(error.into());
        }

        if backup.is_file() {
            let _ = std::fs::remove_file(&backup);
        }
        Ok(())
    })();

    if result.is_err() {
        let _ = std::fs::remove_file(temporary);
    }
    result
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
        cover_crop: ArtCrop::default(),
        background_crop: ArtCrop::default(),
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

fn path_to_data_url(path: &str, config_dir: &Path) -> Option<String> {
    let path = super::path_scope::ensure_within(Path::new(path), config_dir, false).ok()?;
    let mime = image_mime(&path)?;
    let bytes = std::fs::read(path).ok()?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Some(format!("data:{};base64,{}", mime, encoded))
}

pub fn read_project_art_preview(source_path: &str) -> Result<String, StorageError> {
    let source = Path::new(source_path);
    if !source.is_file() {
        return Err(StorageError::NotFound(format!(
            "Image was not found: {}",
            source_path
        )));
    }

    validate_image_extension(source)?;
    let mime = image_mime(source)
        .ok_or_else(|| StorageError::NotFound("Image type is not supported".to_string()))?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(std::fs::read(source)?);
    Ok(format!("data:{};base64,{}", mime, encoded))
}

fn hydrate_project_art(mut project: ProjectArt, config_dir: &Path) -> ProjectArt {
    project.cover_data_url = project
        .cover_path
        .as_deref()
        .and_then(|path| path_to_data_url(path, config_dir));
    project.background_data_url = project
        .background_path
        .as_deref()
        .and_then(|path| path_to_data_url(path, config_dir));
    project
}

pub fn list_project_art(config_dir: &Path) -> Result<Vec<ProjectArt>, StorageError> {
    let store = load_store(config_dir)?;
    Ok(store
        .projects
        .into_iter()
        .map(|project| hydrate_project_art(project, config_dir))
        .collect())
}

pub fn get_project_art(
    config_dir: &Path,
    owner: &str,
    repo: &str,
) -> Result<Option<ProjectArt>, StorageError> {
    let store = load_store(config_dir)?;
    let key = project_key(owner, repo);
    Ok(store
        .projects
        .into_iter()
        .find(|project| project_key(&project.owner, &project.repo) == key)
        .map(|project| hydrate_project_art(project, config_dir)))
}

pub fn set_project_art_asset(
    config_dir: &Path,
    owner: &str,
    repo: &str,
    kind: &str,
    source_path: &str,
    crop: Option<ArtCrop>,
) -> Result<ProjectArt, StorageError> {
    let source = PathBuf::from(source_path);
    if !source.is_file() {
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

    let mut store = load_store(config_dir)?;
    let project_dir =
        config_dir
            .join("project-art")
            .join(format!("{}__{}", safe_part(owner), safe_part(repo)));
    std::fs::create_dir_all(&project_dir)?;

    let target = project_dir.join(format!(
        "{}-{}.{}",
        normalized_kind,
        uuid::Uuid::new_v4(),
        extension
    ));
    super::path_scope::ensure_within(&target, config_dir, false)
        .map_err(StorageError::InvalidData)?;
    if let Err(error) = std::fs::copy(&source, &target) {
        let _ = std::fs::remove_file(&target);
        return Err(error.into());
    }

    let target_string = target.to_string_lossy().to_string();
    let updated = {
        let project = find_project_mut(&mut store, owner, repo);
        let previous_path = if normalized_kind == "cover" {
            project.cover_crop = crop.unwrap_or_default().normalized();
            project.cover_path.replace(target_string.clone())
        } else {
            project.background_crop = crop.unwrap_or_default().normalized();
            project.background_path.replace(target_string.clone())
        };
        project.updated_at = Utc::now();
        (project.clone(), previous_path)
    };

    if let Err(error) = save_store(config_dir, &store) {
        let _ = std::fs::remove_file(&target);
        return Err(error);
    }

    if let Some(path) = updated.1 {
        if path != target_string {
            if let Ok(path) = super::path_scope::ensure_within(Path::new(&path), config_dir, false)
            {
                let _ = std::fs::remove_file(path);
            }
        }
    }

    Ok(hydrate_project_art(updated.0, config_dir))
}

pub fn set_project_art_crop(
    config_dir: &Path,
    owner: &str,
    repo: &str,
    kind: &str,
    crop: ArtCrop,
) -> Result<ProjectArt, StorageError> {
    let mut store = load_store(config_dir)?;
    let updated = {
        let project = find_project_mut(&mut store, owner, repo);
        match kind {
            "cover" if project.cover_path.is_some() => project.cover_crop = crop.normalized(),
            "background" if project.background_path.is_some() => {
                project.background_crop = crop.normalized()
            }
            "cover" | "background" => {
                return Err(StorageError::NotFound(format!(
                    "{} image was not found",
                    kind
                )))
            }
            _ => {
                return Err(StorageError::NotFound(
                    "Art kind must be cover or background".to_string(),
                ))
            }
        }
        project.updated_at = Utc::now();
        project.clone()
    };

    save_store(config_dir, &store)?;
    Ok(hydrate_project_art(updated, config_dir))
}

pub fn clear_project_art_asset(
    config_dir: &Path,
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
                project.cover_crop = ArtCrop::default();
            }
            "background" => {
                if let Some(path) = project.background_path.take() {
                    files_to_remove.push(path);
                }
                project.background_crop = ArtCrop::default();
            }
            "all" => {
                if let Some(path) = project.cover_path.take() {
                    files_to_remove.push(path);
                }
                if let Some(path) = project.background_path.take() {
                    files_to_remove.push(path);
                }
                project.cover_crop = ArtCrop::default();
                project.background_crop = ArtCrop::default();
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
        if let Ok(path) = super::path_scope::ensure_within(Path::new(&path), config_dir, false) {
            let _ = std::fs::remove_file(path);
        }
    }

    save_store(config_dir, &store)?;
    Ok(hydrate_project_art(updated, config_dir))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "pullora-project-art-{name}-{}",
            uuid::Uuid::new_v4()
        ))
    }

    #[test]
    fn old_records_use_centered_crop() {
        let dir = test_dir("legacy");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("project_art.json"),
            r#"{
                "version": 1,
                "projects": [{
                    "owner": "CpPrice11",
                    "repo": "pullora",
                    "coverPath": null,
                    "backgroundPath": null,
                    "updatedAt": "2026-08-11T00:00:00Z"
                }]
            }"#,
        )
        .unwrap();

        let art = get_project_art(&dir, "CpPrice11", "pullora")
            .unwrap()
            .unwrap();
        assert_eq!(art.background_crop, ArtCrop::default());
        assert_eq!(art.cover_crop, ArtCrop::default());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn crop_values_are_finite_and_clamped() {
        let crop = ArtCrop {
            focus_x: -2.0,
            focus_y: f64::NAN,
            zoom: 99.0,
        }
        .normalized();

        assert_eq!(
            crop,
            ArtCrop {
                focus_x: 0.0,
                focus_y: 0.5,
                zoom: 4.0,
            }
        );
    }

    #[test]
    fn preview_reads_source_without_copying_it() {
        let dir = test_dir("preview");
        std::fs::create_dir_all(&dir).unwrap();
        let source = dir.join("background.png");
        std::fs::write(&source, b"preview").unwrap();

        let preview = read_project_art_preview(source.to_str().unwrap()).unwrap();

        assert_eq!(preview, "data:image/png;base64,cHJldmlldw==");
        assert!(!dir.join("project-art").exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn clearing_background_removes_file_and_keeps_cover_independent() {
        let dir = test_dir("independent");
        std::fs::create_dir_all(&dir).unwrap();
        let cover = dir.join("cover.png");
        let background = dir.join("background.png");
        std::fs::write(&cover, b"cover").unwrap();
        std::fs::write(&background, b"background").unwrap();
        let cover_crop = ArtCrop {
            focus_x: 0.2,
            focus_y: 0.3,
            zoom: 1.5,
        };
        let background_crop = ArtCrop {
            focus_x: 0.8,
            focus_y: 0.7,
            zoom: 2.0,
        };

        set_project_art_asset(
            &dir,
            "CpPrice11",
            "pullora",
            "cover",
            cover.to_str().unwrap(),
            Some(cover_crop),
        )
        .unwrap();
        let art = set_project_art_asset(
            &dir,
            "CpPrice11",
            "pullora",
            "background",
            background.to_str().unwrap(),
            Some(background_crop),
        )
        .unwrap();

        assert_eq!(art.cover_crop, cover_crop);
        assert_eq!(art.background_crop, background_crop);
        let stored_background = PathBuf::from(art.background_path.as_deref().unwrap());
        assert!(stored_background.is_file());
        let art = clear_project_art_asset(&dir, "CpPrice11", "pullora", "background").unwrap();
        assert!(art.background_path.is_none());
        assert!(!stored_background.exists());
        assert!(art.cover_path.is_some());
        assert_eq!(art.cover_crop, cover_crop);
        assert_eq!(art.background_crop, ArtCrop::default());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn four_crop_targets_remain_independent() {
        let dir = test_dir("four-targets");
        std::fs::create_dir_all(&dir).unwrap();
        let source = dir.join("source.png");
        std::fs::write(&source, b"image").unwrap();
        let crops = [
            ArtCrop {
                focus_x: 0.1,
                focus_y: 0.2,
                zoom: 1.2,
            },
            ArtCrop {
                focus_x: 0.3,
                focus_y: 0.4,
                zoom: 1.4,
            },
            ArtCrop {
                focus_x: 0.5,
                focus_y: 0.6,
                zoom: 1.6,
            },
            ArtCrop {
                focus_x: 0.7,
                focus_y: 0.8,
                zoom: 1.8,
            },
        ];

        for (owner, repo, kind, crop) in [
            ("CpPrice11", "pullora", "cover", crops[0]),
            ("CpPrice11", "pullora", "background", crops[1]),
            ("__pullora__", "global-light", "background", crops[2]),
            ("__pullora__", "global-dark", "background", crops[3]),
        ] {
            set_project_art_asset(
                &dir,
                owner,
                repo,
                kind,
                source.to_str().unwrap(),
                Some(crop),
            )
            .unwrap();
        }

        let app = get_project_art(&dir, "CpPrice11", "pullora")
            .unwrap()
            .unwrap();
        let light = get_project_art(&dir, "__pullora__", "global-light")
            .unwrap()
            .unwrap();
        let dark = get_project_art(&dir, "__pullora__", "global-dark")
            .unwrap()
            .unwrap();
        assert_eq!(app.cover_crop, crops[0]);
        assert_eq!(app.background_crop, crops[1]);
        assert_eq!(light.background_crop, crops[2]);
        assert_eq!(dark.background_crop, crops[3]);
        assert_ne!(app.cover_path, app.background_path);
        assert_ne!(light.background_path, dark.background_path);

        let updated_cover = ArtCrop {
            focus_x: 0.9,
            focus_y: 0.1,
            zoom: 2.1,
        };
        set_project_art_crop(&dir, "CpPrice11", "pullora", "cover", updated_cover).unwrap();
        let app = get_project_art(&dir, "CpPrice11", "pullora")
            .unwrap()
            .unwrap();
        assert_eq!(app.cover_crop, updated_cover);
        assert_eq!(app.background_crop, crops[1]);
        assert_eq!(
            get_project_art(&dir, "__pullora__", "global-light")
                .unwrap()
                .unwrap()
                .background_crop,
            crops[2]
        );
        assert_eq!(
            get_project_art(&dir, "__pullora__", "global-dark")
                .unwrap()
                .unwrap()
                .background_crop,
            crops[3]
        );

        let updated_hero = ArtCrop {
            focus_x: 0.2,
            focus_y: 0.9,
            zoom: 2.2,
        };
        set_project_art_crop(&dir, "CpPrice11", "pullora", "background", updated_hero).unwrap();
        let app = get_project_art(&dir, "CpPrice11", "pullora")
            .unwrap()
            .unwrap();
        assert_eq!(app.cover_crop, updated_cover);
        assert_eq!(app.background_crop, updated_hero);

        let updated_light = ArtCrop {
            focus_x: 0.4,
            focus_y: 0.8,
            zoom: 2.3,
        };
        set_project_art_crop(
            &dir,
            "__pullora__",
            "global-light",
            "background",
            updated_light,
        )
        .unwrap();
        assert_eq!(
            get_project_art(&dir, "__pullora__", "global-light")
                .unwrap()
                .unwrap()
                .background_crop,
            updated_light
        );
        assert_eq!(
            get_project_art(&dir, "__pullora__", "global-dark")
                .unwrap()
                .unwrap()
                .background_crop,
            crops[3]
        );
        let app = get_project_art(&dir, "CpPrice11", "pullora")
            .unwrap()
            .unwrap();
        assert_eq!(app.cover_crop, updated_cover);
        assert_eq!(app.background_crop, updated_hero);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn failed_store_save_keeps_previous_asset_and_metadata() {
        let dir = test_dir("atomic-save");
        std::fs::create_dir_all(&dir).unwrap();
        let first_source = dir.join("first.png");
        let second_source = dir.join("second.png");
        std::fs::write(&first_source, b"first").unwrap();
        std::fs::write(&second_source, b"second").unwrap();

        let previous = set_project_art_asset(
            &dir,
            "CpPrice11",
            "pullora",
            "background",
            first_source.to_str().unwrap(),
            Some(ArtCrop {
                focus_x: 0.2,
                focus_y: 0.3,
                zoom: 1.5,
            }),
        )
        .unwrap();
        std::fs::create_dir(dir.join("project_art.json.bak")).unwrap();

        assert!(set_project_art_asset(
            &dir,
            "CpPrice11",
            "pullora",
            "background",
            second_source.to_str().unwrap(),
            Some(ArtCrop {
                focus_x: 0.8,
                focus_y: 0.7,
                zoom: 2.0,
            }),
        )
        .is_err());

        let current = get_project_art(&dir, "CpPrice11", "pullora")
            .unwrap()
            .unwrap();
        assert_eq!(current.background_path, previous.background_path);
        assert_eq!(current.background_crop, previous.background_crop);
        assert_eq!(
            std::fs::read(current.background_path.unwrap()).unwrap(),
            b"first"
        );
        assert!(!dir.join("project_art.json.tmp").exists());
        assert_eq!(
            std::fs::read_dir(dir.join("project-art/CpPrice11__pullora"))
                .unwrap()
                .count(),
            1
        );
        let _ = std::fs::remove_dir_all(dir);
    }
}
