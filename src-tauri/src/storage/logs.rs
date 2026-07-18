use chrono::Utc;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use super::StorageError;

const REDACTED: &str = "<redacted>";
const MAX_LOG_BYTES: u64 = 1024 * 1024;
const ROTATED_LOG_FILES: usize = 3;
static LOG_WRITE_LOCK: Mutex<()> = Mutex::new(());

fn log_path(config_dir: &Path, index: usize) -> PathBuf {
    if index == 0 {
        config_dir.join("pullora.log")
    } else {
        config_dir.join(format!("pullora.log.{index}"))
    }
}

fn rotate_logs(config_dir: &Path) -> Result<(), StorageError> {
    let active = log_path(config_dir, 0);
    if active
        .metadata()
        .map_or(true, |metadata| metadata.len() < MAX_LOG_BYTES)
    {
        return Ok(());
    }

    let oldest = log_path(config_dir, ROTATED_LOG_FILES);
    if oldest.exists() {
        std::fs::remove_file(oldest)?;
    }
    for index in (1..ROTATED_LOG_FILES).rev() {
        let source = log_path(config_dir, index);
        if source.exists() {
            std::fs::rename(source, log_path(config_dir, index + 1))?;
        }
    }
    std::fs::rename(active, log_path(config_dir, 1))?;
    Ok(())
}

fn redact_after_marker(mut text: String, marker: &str, include_marker: bool) -> String {
    let mut search_from = 0;
    while let Some(relative_start) = text[search_from..].find(marker) {
        let marker_start = search_from + relative_start;
        let value_start = marker_start + marker.len();
        let value_end = text[value_start..]
            .char_indices()
            .find(|(_, ch)| {
                ch.is_whitespace() || matches!(ch, '&' | '"' | '\'' | ',' | '}' | ']' | ')')
            })
            .map_or(text.len(), |(index, _)| value_start + index);

        if value_start == value_end {
            search_from = value_start;
            continue;
        }

        let replace_start = if include_marker {
            marker_start
        } else {
            value_start
        };
        text.replace_range(replace_start..value_end, REDACTED);
        search_from = replace_start + REDACTED.len();
    }
    text
}

pub fn redact_sensitive_text(value: &str) -> String {
    let mut redacted = value.to_owned();
    if let Some(home) = dirs::home_dir().and_then(|path| path.to_str().map(str::to_owned)) {
        redacted = redacted.replace(&home, "<home>");
        redacted = redacted.replace(&home.replace('\\', "/"), "<home>");
    }

    for prefix in ["github_pat_", "ghp_", "gho_", "ghu_", "ghs_", "ghr_"] {
        redacted = redact_after_marker(redacted, prefix, true);
    }
    for marker in [
        "token=",
        "token:",
        "Token=",
        "Token:",
        "Authorization: Bearer ",
        "authorization: bearer ",
    ] {
        redacted = redact_after_marker(redacted, marker, false);
    }
    redacted
}

pub fn append_log(config_dir: &Path, message: &str) -> Result<(), StorageError> {
    let _guard = LOG_WRITE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    std::fs::create_dir_all(config_dir)?;
    rotate_logs(config_dir)?;
    let path = log_path(config_dir, 0);
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;

    writeln!(
        file,
        "[{}] {}",
        Utc::now().to_rfc3339(),
        redact_sensitive_text(message)
    )?;
    Ok(())
}

pub fn read_recent_logs(config_dir: &Path, limit: usize) -> Result<Vec<String>, StorageError> {
    let _guard = LOG_WRITE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut entries = Vec::with_capacity(limit);
    for index in 0..=ROTATED_LOG_FILES {
        let path = log_path(config_dir, index);
        if !path.exists() {
            continue;
        }
        let content = std::fs::read_to_string(path)?;
        entries.extend(
            content
                .lines()
                .rev()
                .take(limit - entries.len())
                .map(redact_sensitive_text),
        );
        if entries.len() == limit {
            break;
        }
    }
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::{append_log, read_recent_logs, MAX_LOG_BYTES};

    #[test]
    fn reads_newest_entries_first_and_respects_limit() {
        let dir = std::env::temp_dir().join(format!("pullora-log-test-{}", uuid::Uuid::new_v4()));
        append_log(&dir, "first").unwrap();
        append_log(&dir, "second").unwrap();

        let entries = read_recent_logs(&dir, 1).unwrap();
        assert_eq!(entries.len(), 1);
        assert!(entries[0].ends_with("second"));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn redacts_secrets_and_personal_paths_on_write_and_read() {
        let dir =
            std::env::temp_dir().join(format!("pullora-log-redaction-{}", uuid::Uuid::new_v4()));
        let home = dirs::home_dir().unwrap();
        let secret = "ghp_super_secret_value";
        append_log(
            &dir,
            &format!("token={} path={}", secret, home.join("private").display()),
        )
        .unwrap();

        let stored = std::fs::read_to_string(dir.join("pullora.log")).unwrap();
        assert!(!stored.contains(secret));
        assert!(!stored.contains(home.to_string_lossy().as_ref()));
        assert!(stored.contains("token=<redacted>"));
        assert!(stored.contains("<home>"));

        std::fs::write(
            dir.join("pullora.log"),
            format!("legacy {} {}", secret, home.display()),
        )
        .unwrap();
        let legacy = read_recent_logs(&dir, 1).unwrap();
        assert!(!legacy[0].contains(secret));
        assert!(!legacy[0].contains(home.to_string_lossy().as_ref()));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn rotates_full_logs_and_keeps_history_readable() {
        let dir =
            std::env::temp_dir().join(format!("pullora-log-rotation-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("pullora.log"), vec![b'x'; MAX_LOG_BYTES as usize]).unwrap();

        append_log(&dir, "new entry").unwrap();

        assert!(dir.join("pullora.log.1").exists());
        let entries = read_recent_logs(&dir, 2).unwrap();
        assert!(entries[0].ends_with("new entry"));
        assert_eq!(entries[1].len(), MAX_LOG_BYTES as usize);

        let _ = std::fs::remove_dir_all(dir);
    }
}
