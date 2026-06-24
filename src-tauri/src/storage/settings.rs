use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use super::StorageError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub version: u32,
    pub installation_path: Option<String>,
    pub auto_update_check: bool,
    pub check_interval_hours: u32,
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
    pub preset: String,
    pub accent: String,
    pub accent_hover: String,
    pub background: String,
    pub surface: String,
    pub surface2: String,
    pub sidebar: String,
    pub text: String,
    pub muted: String,
    pub border: String,
    pub font_family: String,
    pub font_size: u32,
    pub radius: u32,
    pub density: String,
    pub custom_css: String,
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

pub fn default_installation_path() -> String {
    if is_portable() {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                return exe_dir.join("apps").to_string_lossy().to_string();
            }
        }
    }

    dirs::document_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("Pullora Apps")
        .to_string_lossy()
        .to_string()
}

fn is_legacy_git_installation_path(path: &str) -> bool {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return false;
    }

    let path_buf = PathBuf::from(trimmed);
    let ends_with_git = path_buf
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case("Git"));

    if !ends_with_git {
        return false;
    }

    let normalized = trimmed.replace('/', "\\").to_ascii_lowercase();
    normalized.ends_with("\\program files\\git")
        || normalized.ends_with("\\program files (x86)\\git")
}

fn normalize_loaded_settings(mut settings: AppSettings) -> AppSettings {
    if settings
        .installation_path
        .as_deref()
        .is_some_and(is_legacy_git_installation_path)
    {
        settings.installation_path = Some(default_installation_path());
    }

    settings
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            version: 2,
            installation_path: if is_portable() {
                Some(default_installation_path())
            } else {
                None
            },
            auto_update_check: true,
            check_interval_hours: 24,
            include_prereleases: false,
            asset_strategy: default_asset_strategy(),
            github_owner: Some("CpPrice11".to_string()),
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
    Ok(normalize_loaded_settings(settings))
}

pub fn save_settings(config_dir: &Path, settings: &AppSettings) -> Result<(), StorageError> {
    std::fs::create_dir_all(config_dir)?;
    let path = config_dir.join("config.json");
    let content = serde_json::to_string_pretty(settings)?;
    std::fs::write(&path, content)?;
    Ok(())
}
