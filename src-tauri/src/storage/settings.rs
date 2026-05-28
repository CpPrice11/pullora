use serde::{Deserialize, Serialize};
use std::path::Path;

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
    pub ai_workspace_enabled: bool,
    #[serde(default = "default_ai_workspace_root")]
    pub ai_workspace_root: String,
    #[serde(default = "default_codex_runtime_preference")]
    pub codex_runtime_preference: String,
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

pub fn default_ai_workspace_root() -> String {
    dirs::document_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("Air Launcher Workspaces")
        .to_string_lossy()
        .to_string()
}

fn default_codex_runtime_preference() -> String {
    "system".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            version: 2,
            installation_path: None,
            auto_update_check: true,
            check_interval_hours: 24,
            include_prereleases: false,
            asset_strategy: default_asset_strategy(),
            github_owner: Some("CpPrice11".to_string()),
            github_token: None,
            theme: "auto".to_string(),
            language: "uk".to_string(),
            ai_workspace_enabled: false,
            ai_workspace_root: default_ai_workspace_root(),
            codex_runtime_preference: default_codex_runtime_preference(),
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
    Ok(settings)
}

pub fn save_settings(config_dir: &Path, settings: &AppSettings) -> Result<(), StorageError> {
    std::fs::create_dir_all(config_dir)?;
    let path = config_dir.join("config.json");
    let content = serde_json::to_string_pretty(settings)?;
    std::fs::write(&path, content)?;
    Ok(())
}
