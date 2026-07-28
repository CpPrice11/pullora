use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use super::secret_store::{load_github_token, save_github_token};
use super::StorageError;

pub const CATALOG_OWNER: &str = "CpPrice11";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub version: u32,
    pub installation_path: Option<String>,
    #[serde(default)]
    pub include_prereleases: bool,
    #[serde(default = "default_asset_strategy")]
    pub asset_strategy: String,
    pub github_owner: Option<String>,
    pub github_token: Option<String>,
    pub theme: String,
    pub language: String,
    #[serde(default)]
    pub appearance: Option<AppAppearanceSettings>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppAppearanceSettings {
    #[serde(default = "default_density")]
    pub density: String,
    #[serde(default = "default_surface_transparency")]
    pub surface_transparency: u32,
    #[serde(default = "default_surface_blur")]
    pub surface_blur: u32,
}

fn default_density() -> String {
    "comfortable".to_string()
}

fn default_surface_transparency() -> u32 {
    42
}

fn default_surface_blur() -> u32 {
    12
}

fn default_asset_strategy() -> String {
    "portableFirst".to_string()
}

pub fn is_portable() -> bool {
    if let Ok(exe_path) = std::env::current_exe() {
        if exe_path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.to_ascii_lowercase().contains("portable"))
        {
            return true;
        }

        if let Some(exe_dir) = exe_path.parent() {
            return exe_dir.join(".portable").exists();
        }
    }
    false
}

fn portable_installation_path(exe_dir: &Path) -> PathBuf {
    exe_dir.join("apps")
}

fn installed_installation_path() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("Pullora")
        .join("Apps")
}

pub fn default_installation_path() -> String {
    if is_portable() {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                return portable_installation_path(exe_dir)
                    .to_string_lossy()
                    .to_string();
            }
        }
    }

    installed_installation_path().to_string_lossy().to_string()
}

fn is_legacy_document_installation_path(path: &str) -> bool {
    let Some(documents) = dirs::document_dir() else {
        return false;
    };
    let legacy = documents.join("Pullora Apps");
    path.trim()
        .replace('/', "\\")
        .eq_ignore_ascii_case(&legacy.to_string_lossy().replace('/', "\\"))
}

fn needs_default_installation_path(settings: &AppSettings) -> bool {
    settings
        .installation_path
        .as_deref()
        .is_none_or(|path| path.trim().is_empty() || is_legacy_document_installation_path(path))
}

fn migrate_installation_path(
    config_dir: &Path,
    settings: AppSettings,
    default_path: &Path,
) -> AppSettings {
    if !needs_default_installation_path(&settings) {
        return settings;
    }

    let path_existed = default_path.exists();
    if std::fs::create_dir_all(default_path).is_err() || !default_path.is_dir() {
        return settings;
    }

    let mut migrated = settings.clone();
    migrated.installation_path = Some(default_path.display().to_string());
    if let Err(error) = save_settings(config_dir, &migrated) {
        log::error!("Failed to migrate the installation path: {error}");
        if !path_existed {
            let _ = std::fs::remove_dir(default_path);
        }
        return settings;
    }

    migrated
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            version: 2,
            installation_path: Some(default_installation_path()),
            include_prereleases: false,
            asset_strategy: default_asset_strategy(),
            github_owner: Some(CATALOG_OWNER.to_string()),
            github_token: None,
            theme: "auto".to_string(),
            language: "uk".to_string(),
            appearance: None,
        }
    }
}

pub fn load_settings(config_dir: &Path) -> Result<AppSettings, StorageError> {
    let path = config_dir.join("config.json");
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let content = std::fs::read_to_string(&path)?;
    let settings: AppSettings = serde_json::from_str(&content)?;
    let default_path = PathBuf::from(default_installation_path());
    let mut settings = migrate_installation_path(config_dir, settings, &default_path);
    if settings.github_owner.as_deref() != Some(CATALOG_OWNER) {
        settings.github_owner = Some(CATALOG_OWNER.to_string());
        save_settings(config_dir, &settings)?;
    }
    Ok(settings)
}

pub fn load_runtime_settings(config_dir: &Path) -> Result<AppSettings, StorageError> {
    let mut settings = load_settings(config_dir)?;
    let legacy_token = settings
        .github_token
        .take()
        .filter(|token| !token.trim().is_empty());
    let had_legacy_token = legacy_token.is_some();

    settings.github_token = if let Some(token) = legacy_token {
        if let Err(error) = save_github_token(Some(&token)) {
            log::error!("Failed to migrate GitHub token to the system credential store: {error}");
        }
        Some(token)
    } else {
        load_github_token().unwrap_or_else(|error| {
            log::error!("Failed to read GitHub token from the system credential store: {error}");
            None
        })
    };

    if had_legacy_token {
        save_settings(config_dir, &settings)?;
    }

    Ok(settings)
}

pub fn save_settings(config_dir: &Path, settings: &AppSettings) -> Result<(), StorageError> {
    std::fs::create_dir_all(config_dir)?;
    let path = config_dir.join("config.json");
    let content = settings_json(settings)?;
    std::fs::write(&path, content)?;
    Ok(())
}

fn settings_json(settings: &AppSettings) -> Result<String, StorageError> {
    let mut value = serde_json::to_value(settings)?;
    if let Some(object) = value.as_object_mut() {
        object.remove("githubToken");
    }
    Ok(serde_json::to_string_pretty(&value)?)
}

#[cfg(test)]
mod tests {
    use super::{
        default_installation_path, installed_installation_path, is_portable, load_settings,
        migrate_installation_path, portable_installation_path, save_settings, settings_json,
        AppSettings, CATALOG_OWNER,
    };

    #[test]
    fn new_settings_use_the_default_installation_path() {
        let default_path = default_installation_path();
        assert_eq!(
            AppSettings::default().installation_path.as_deref(),
            Some(default_path.as_str())
        );

        if !is_portable() {
            assert_eq!(
                std::path::PathBuf::from(default_path),
                installed_installation_path()
            );
        }
    }

    #[test]
    fn catalog_owner_is_fixed() {
        assert_eq!(
            AppSettings::default().github_owner.as_deref(),
            Some(CATALOG_OWNER)
        );
    }

    #[test]
    fn legacy_catalog_owner_is_migrated() {
        let config_dir =
            std::env::temp_dir().join(format!("pullora-owner-migration-{}", std::process::id()));
        let settings = AppSettings {
            github_owner: Some("OtherOwner".to_string()),
            ..AppSettings::default()
        };
        save_settings(&config_dir, &settings).unwrap();

        let loaded = load_settings(&config_dir).unwrap();

        assert_eq!(loaded.github_owner.as_deref(), Some(CATALOG_OWNER));
        std::fs::remove_dir_all(config_dir).unwrap();
    }

    #[test]
    fn portable_installations_store_apps_beside_the_executable() {
        let exe_dir = std::path::Path::new(r"C:\Portable\Pullora");
        assert_eq!(portable_installation_path(exe_dir), exe_dir.join("apps"));
    }

    #[test]
    fn existing_settings_without_a_path_receive_the_default() {
        let root = std::env::temp_dir().join(format!(
            "pullora-install-path-migration-{}",
            std::process::id()
        ));
        let config_dir = root.join("config");
        let default_path = root.join("apps");
        let settings = migrate_installation_path(
            &config_dir,
            AppSettings {
                installation_path: None,
                ..AppSettings::default()
            },
            &default_path,
        );

        assert_eq!(
            settings.installation_path,
            Some(default_path.display().to_string())
        );
        assert!(default_path.is_dir());
        assert!(config_dir.join("config.json").is_file());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn path_migration_preserves_a_user_selected_folder() {
        let root = std::env::temp_dir().join(format!(
            "pullora-preserve-install-path-{}",
            std::process::id()
        ));
        for custom in [r"D:\Games\Pullora", r"C:\Program Files\Git"] {
            let settings = migrate_installation_path(
                &root.join("config"),
                AppSettings {
                    installation_path: Some(custom.to_string()),
                    ..AppSettings::default()
                },
                &root.join("apps"),
            );

            assert_eq!(settings.installation_path.as_deref(), Some(custom));
        }
        assert!(!root.exists());
    }

    #[test]
    fn path_migration_replaces_empty_and_legacy_document_paths() {
        let mut paths = vec![String::new()];
        if let Some(documents) = dirs::document_dir() {
            paths.push(documents.join("Pullora Apps").display().to_string());
        }

        for (index, path) in paths.into_iter().enumerate() {
            let root = std::env::temp_dir().join(format!(
                "pullora-legacy-install-path-{}-{index}",
                std::process::id()
            ));
            let default_path = root.join("apps");
            let settings = migrate_installation_path(
                &root.join("config"),
                AppSettings {
                    installation_path: Some(path),
                    ..AppSettings::default()
                },
                &default_path,
            );

            assert_eq!(
                settings.installation_path,
                Some(default_path.display().to_string())
            );
            std::fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    fn path_migration_keeps_the_previous_value_when_config_cannot_be_saved() {
        let root = std::env::temp_dir().join(format!(
            "pullora-failed-install-path-migration-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let config_file = root.join("not-a-directory");
        std::fs::write(&config_file, "blocked").unwrap();
        let default_path = root.join("apps");

        let settings = migrate_installation_path(
            &config_file,
            AppSettings {
                installation_path: Some(String::new()),
                ..AppSettings::default()
            },
            &default_path,
        );

        assert_eq!(settings.installation_path.as_deref(), Some(""));
        assert!(!default_path.exists());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn config_never_serializes_github_token() {
        let settings = AppSettings {
            github_token: Some("github_pat_secret".to_string()),
            ..AppSettings::default()
        };

        let json = settings_json(&settings).unwrap();

        assert!(!json.contains("githubToken"));
        assert!(!json.contains("github_pat_secret"));
    }

    #[test]
    fn legacy_config_token_remains_migratable() {
        let json = serde_json::to_string(&AppSettings::default()).unwrap();
        let mut value: serde_json::Value = serde_json::from_str(&json).unwrap();
        value["githubToken"] = "legacy-token".into();

        let settings: AppSettings = serde_json::from_value(value).unwrap();

        assert_eq!(settings.github_token.as_deref(), Some("legacy-token"));
    }
}
