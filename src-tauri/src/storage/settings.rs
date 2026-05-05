use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use super::StorageError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub version: u32,
    pub installation_path: Option<String>,
    pub auto_update_check: bool,
    pub check_interval_hours: u32,
    pub github_owner: Option<String>,
    pub github_token: Option<String>,
    pub theme: String,
    pub language: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            version: 1,
            installation_path: None,
            auto_update_check: true,
            check_interval_hours: 24,
            github_owner: Some("CpPrice11".to_string()),
            github_token: None,
            theme: "auto".to_string(),
            language: "uk".to_string(),
        }
    }
}

pub fn load_settings(config_dir: &PathBuf) -> Result<AppSettings, StorageError> {
    let path = config_dir.join("config.json");
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let content = std::fs::read_to_string(&path)?;
    let settings: AppSettings = serde_json::from_str(&content)?;
    Ok(settings)
}

pub fn save_settings(config_dir: &PathBuf, settings: &AppSettings) -> Result<(), StorageError> {
    std::fs::create_dir_all(config_dir)?;
    let path = config_dir.join("config.json");
    let content = serde_json::to_string_pretty(settings)?;
    std::fs::write(&path, content)?;
    Ok(())
}
