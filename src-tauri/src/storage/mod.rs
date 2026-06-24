pub mod favorites;
pub mod installed;
pub mod library_folders;
pub mod logs;
pub mod project_art;
pub mod settings;

#[derive(Debug)]
pub enum StorageError {
    Io(std::io::Error),
    Json(serde_json::Error),
    NotFound(String),
    InvalidData(String),
}

impl std::fmt::Display for StorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StorageError::Io(e) => write!(f, "IO error: {}", e),
            StorageError::Json(e) => write!(f, "JSON error: {}", e),
            StorageError::NotFound(s) => write!(f, "Not found: {}", s),
            StorageError::InvalidData(s) => write!(f, "Invalid data: {}", s),
        }
    }
}

impl From<std::io::Error> for StorageError {
    fn from(e: std::io::Error) -> Self {
        StorageError::Io(e)
    }
}

impl From<serde_json::Error> for StorageError {
    fn from(e: serde_json::Error) -> Self {
        StorageError::Json(e)
    }
}

pub fn get_config_dir() -> std::path::PathBuf {
    if is_portable_executable() {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                return exe_dir.to_path_buf();
            }
        }
    }

    dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("pullora")
}

fn is_portable_executable() -> bool {
    if let Ok(exe_path) = std::env::current_exe() {
        let portable_file_name = exe_path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.to_ascii_lowercase().contains("portable"));
        let portable_marker = exe_path
            .parent()
            .map(|dir| dir.join(".portable").exists())
            .unwrap_or(false);

        return portable_file_name || portable_marker;
    }

    false
}
