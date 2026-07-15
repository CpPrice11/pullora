pub mod favorites;
pub mod installed;
pub mod library_folders;
pub mod logs;
pub mod path_scope;
pub mod project_art;
pub mod secret_store;
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

    let base_dir = dirs::config_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    let config_dir = base_dir.join("pullora");
    migrate_legacy_config_dir(&base_dir, &config_dir);
    config_dir
}

fn migrate_legacy_config_dir(base_dir: &std::path::Path, target_dir: &std::path::Path) {
    for legacy_name in [
        "air-launcher",
        "air_launcher",
        "air launcher",
        "Air Launcher",
    ] {
        let source_dir = base_dir.join(legacy_name);
        if !source_dir.is_dir() || source_dir == target_dir {
            continue;
        }

        migrate_installed_registry(&source_dir, target_dir);

        for file_name in [
            "config.json",
            "favorites.json",
            "library-folders.json",
            "project_art.json",
            "github-api-cache.json",
        ] {
            copy_file_if_missing(&source_dir.join(file_name), &target_dir.join(file_name));
        }

        copy_dir_entries_if_missing(
            &source_dir.join("project-art"),
            &target_dir.join("project-art"),
        );
    }
}

fn migrate_installed_registry(source_dir: &std::path::Path, target_dir: &std::path::Path) {
    let source = source_dir.join("installed_apps.json");
    let target = target_dir.join("installed_apps.json");

    if !source.is_file() {
        return;
    }

    if !target.exists() {
        copy_file_if_missing(&source, &target);
        return;
    }

    let Ok(source_content) = std::fs::read_to_string(&source) else {
        return;
    };
    let Ok(target_content) = std::fs::read_to_string(&target) else {
        return;
    };
    let Ok(source_value) = serde_json::from_str::<serde_json::Value>(&source_content) else {
        return;
    };
    let Ok(mut target_value) = serde_json::from_str::<serde_json::Value>(&target_content) else {
        return;
    };

    let Some(source_apps) = source_value.get("apps").and_then(|value| value.as_array()) else {
        return;
    };
    let Some(target_apps) = target_value
        .get_mut("apps")
        .and_then(|value| value.as_array_mut())
    else {
        return;
    };

    let mut changed = false;
    for source_app in source_apps {
        let owner = source_app
            .get("owner")
            .and_then(|value| value.as_str())
            .unwrap_or_default();
        let repo = source_app
            .get("repo")
            .and_then(|value| value.as_str())
            .unwrap_or_default();

        if owner.trim().is_empty() || repo.trim().is_empty() {
            continue;
        }

        let target_app = target_apps.iter_mut().find(|app| {
            app.get("owner").and_then(|value| value.as_str()) == Some(owner)
                && app.get("repo").and_then(|value| value.as_str()) == Some(repo)
        });

        if let Some(target_app) = target_app {
            changed |= merge_installed_versions(target_app, source_app);
        } else {
            target_apps.push(source_app.clone());
            changed = true;
        }
    }

    if changed {
        if let Some(parent) = target.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(content) = serde_json::to_string_pretty(&target_value) {
            let _ = std::fs::write(target, content);
        }
    }
}

fn merge_installed_versions(
    target_app: &mut serde_json::Value,
    source_app: &serde_json::Value,
) -> bool {
    let Some(source_versions) = source_app
        .get("versions")
        .and_then(|value| value.as_array())
    else {
        return false;
    };
    let Some(target_versions) = target_app
        .get_mut("versions")
        .and_then(|value| value.as_array_mut())
    else {
        return false;
    };

    let mut changed = false;
    for source_version in source_versions {
        let tag = source_version
            .get("tag")
            .and_then(|value| value.as_str())
            .unwrap_or_default();
        if tag.trim().is_empty() {
            continue;
        }

        let exists = target_versions
            .iter()
            .any(|version| version.get("tag").and_then(|value| value.as_str()) == Some(tag));
        if !exists {
            target_versions.push(source_version.clone());
            changed = true;
        }
    }

    let target_active_is_empty = target_app
        .get("activeVersion")
        .and_then(|value| value.as_str())
        .is_none_or(|value| value.trim().is_empty());
    if target_active_is_empty {
        if let Some(source_active) = source_app
            .get("activeVersion")
            .and_then(|value| value.as_str())
            .filter(|value| !value.trim().is_empty())
        {
            target_app["activeVersion"] = serde_json::Value::String(source_active.to_string());
            changed = true;
        }
    }

    changed
}

fn copy_file_if_missing(source: &std::path::Path, target: &std::path::Path) {
    if !source.is_file() || target.exists() {
        return;
    }

    if let Some(parent) = target.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::copy(source, target);
}

fn copy_dir_entries_if_missing(source: &std::path::Path, target: &std::path::Path) {
    let Ok(entries) = std::fs::read_dir(source) else {
        return;
    };

    let _ = std::fs::create_dir_all(target);
    for entry in entries.flatten() {
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        if source_path.is_dir() {
            copy_dir_entries_if_missing(&source_path, &target_path);
        } else {
            copy_file_if_missing(&source_path, &target_path);
        }
    }
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
