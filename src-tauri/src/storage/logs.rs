use chrono::Utc;
use std::io::Write;
use std::path::PathBuf;

use super::StorageError;

pub fn append_log(config_dir: &PathBuf, message: &str) -> Result<(), StorageError> {
    std::fs::create_dir_all(config_dir)?;
    let path = config_dir.join("air-launcher.log");
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;

    writeln!(file, "[{}] {}", Utc::now().to_rfc3339(), message)?;
    Ok(())
}
