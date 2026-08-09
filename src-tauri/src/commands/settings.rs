use serde::Serialize;
use tauri::State;

use crate::error::command_error;
use crate::storage::get_config_dir;
use crate::storage::secret_store::save_github_token;
use crate::storage::settings::{
    default_installation_path, save_settings, AppSettings, CATALOG_OWNER,
};
use crate::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPathValidation {
    pub ok: bool,
    pub status: String,
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let settings = state.settings.lock().await;
    Ok(settings.clone())
}

#[tauri::command]
pub async fn update_settings(
    mut new_settings: AppSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let current_settings = state.settings.lock().await;
    new_settings.installation_path = current_settings.installation_path.clone();
    new_settings.github_owner = Some(CATALOG_OWNER.to_string());
    let previous_token = current_settings.github_token.clone();
    drop(current_settings);

    new_settings.github_token = new_settings
        .github_token
        .take()
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty());

    let token_changed = new_settings.github_token != previous_token;
    if token_changed {
        save_github_token(new_settings.github_token.as_deref()).map_err(|error| {
            log::error!("Failed to update GitHub token in the system credential store: {error}");
            command_error("errors.secretStoreUnavailable")
        })?;
    }

    let config_dir = get_config_dir();
    if let Err(error) = save_settings(&config_dir, &new_settings) {
        log::error!("Failed to save settings: {error}");
        if token_changed {
            let _ = save_github_token(previous_token.as_deref());
        }
        return Err(command_error("errors.commandFailed"));
    }

    state
        .github_client
        .update_token(new_settings.github_token.clone());

    let mut settings = state.settings.lock().await;
    *settings = new_settings;

    Ok(())
}

#[tauri::command]
pub async fn set_installation_path(
    path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let path = prepare_installation_path_setting(&path)?;

    let mut settings = state.settings.lock().await;
    let mut next_settings = settings.clone();
    next_settings.installation_path = Some(path.clone());
    let config_dir = get_config_dir();
    save_settings(&config_dir, &next_settings).map_err(|error| {
        log::error!("Failed to save the installation path: {error}");
        command_error("errors.commandFailed")
    })?;
    *settings = next_settings;
    Ok(path)
}

#[tauri::command]
pub async fn is_first_launch(state: State<'_, AppState>) -> Result<bool, String> {
    let settings = state.settings.lock().await;
    Ok(settings.installation_path.is_none())
}

#[tauri::command]
pub async fn validate_installation_path(path: String) -> Result<InstallPathValidation, String> {
    Ok(ensure_installation_path(&path))
}

/// Creates the folder if missing and confirms it is a writable directory.
/// Shared by settings validation and every download entry point.
pub fn ensure_installation_path(path: &str) -> InstallPathValidation {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return InstallPathValidation {
            ok: false,
            status: "missing".to_string(),
        };
    }

    let folder = match crate::storage::path_scope::installation_root(trimmed) {
        Ok(folder) => folder,
        Err(error) => {
            return InstallPathValidation {
                ok: false,
                status: if error == command_error("errors.installPathUnsafe") {
                    "unsafe"
                } else {
                    "inaccessible"
                }
                .to_string(),
            };
        }
    };
    if is_pullora_service_path(&folder) {
        return InstallPathValidation {
            ok: false,
            status: "unsafe".to_string(),
        };
    }
    if !folder.exists() {
        if let Err(error) = std::fs::create_dir_all(&folder) {
            return InstallPathValidation {
                ok: false,
                status: install_path_io_status(&error).to_string(),
            };
        }
    }

    if !folder.is_dir() {
        return InstallPathValidation {
            ok: false,
            status: "inaccessible".to_string(),
        };
    }

    let test_file = folder.join(".pullora-write-test.tmp");
    if test_file.exists() {
        if let Err(error) = std::fs::remove_file(&test_file) {
            return InstallPathValidation {
                ok: false,
                status: install_path_io_status(&error).to_string(),
            };
        }
    }

    match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&test_file)
    {
        Ok(mut file) => {
            use std::io::Write;
            let write_result = file.write_all(b"ok");
            drop(file);
            let remove_result = std::fs::remove_file(&test_file);
            if let Err(error) = write_result.and(remove_result) {
                return InstallPathValidation {
                    ok: false,
                    status: install_path_io_status(&error).to_string(),
                };
            }

            InstallPathValidation {
                ok: true,
                status: "ok".to_string(),
            }
        }
        Err(error) => InstallPathValidation {
            ok: false,
            status: install_path_io_status(&error).to_string(),
        },
    }
}

fn install_path_io_status(error: &std::io::Error) -> &'static str {
    #[cfg(windows)]
    if matches!(error.raw_os_error(), Some(32 | 33)) {
        return "busy";
    }

    match error.kind() {
        std::io::ErrorKind::PermissionDenied => "noWritePermission",
        std::io::ErrorKind::AlreadyExists | std::io::ErrorKind::WouldBlock => "busy",
        _ => "inaccessible",
    }
}

fn is_pullora_service_path(path: &std::path::Path) -> bool {
    let allowed_apps = std::path::PathBuf::from(default_installation_path());
    let mut protected_roots = vec![get_config_dir()];
    if let Ok(executable) = std::env::current_exe() {
        if let Some(launcher_dir) = executable.parent() {
            protected_roots.push(launcher_dir.to_path_buf());
        }
    }

    is_protected_installation_path(path, &allowed_apps, &protected_roots)
}

fn is_protected_installation_path(
    path: &std::path::Path,
    allowed_apps: &std::path::Path,
    protected_roots: &[std::path::PathBuf],
) -> bool {
    if crate::storage::path_scope::ensure_within(path, allowed_apps, true).is_ok() {
        return false;
    }

    protected_roots
        .iter()
        .any(|root| crate::storage::path_scope::ensure_within(path, root, true).is_ok())
}

fn prepare_installation_path_setting(path: &str) -> Result<String, String> {
    let requested = requested_installation_path(path);

    let folder = crate::storage::path_scope::installation_root(&requested)?;
    if is_pullora_service_path(&folder) {
        return Err(command_error("errors.installPathUnsafe"));
    }
    if folder.exists() {
        if folder.is_dir() {
            return Ok(folder.display().to_string());
        }
        return Err(command_error("errors.installPathNotDirectory"));
    }

    if let Err(error) = std::fs::create_dir_all(&folder) {
        if error.kind() == std::io::ErrorKind::PermissionDenied {
            return Err(command_error("errors.installPathRequiresWritable"));
        }

        return Err(command_error("errors.installPathUnavailable"));
    }

    crate::storage::path_scope::installation_root(&folder.display().to_string())
        .map(|path| path.display().to_string())
}

fn requested_installation_path(path: &str) -> String {
    if path.trim().is_empty() {
        default_installation_path()
    } else {
        path.trim().to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::{
        ensure_installation_path, install_path_io_status, is_protected_installation_path,
        requested_installation_path,
    };
    use crate::storage::settings::default_installation_path;

    #[test]
    fn empty_installation_path_selects_the_default() {
        assert_eq!(requested_installation_path(""), default_installation_path());
        assert_eq!(requested_installation_path("  C:\\Apps  "), "C:\\Apps");
    }

    #[test]
    fn ensure_installation_path_creates_a_missing_writable_folder() {
        let target = std::env::temp_dir()
            .join(format!(
                "pullora-ensure-install-path-{}",
                std::process::id()
            ))
            .join("Apps");
        assert!(!target.exists());

        let result = ensure_installation_path(&target.display().to_string());

        assert!(result.ok);
        assert_eq!(result.status, "ok");
        assert!(target.is_dir());

        std::fs::remove_dir_all(target.parent().unwrap()).unwrap();
    }

    #[test]
    fn ensure_installation_path_rejects_a_file() {
        let target =
            std::env::temp_dir().join(format!("pullora-install-path-file-{}", std::process::id()));
        std::fs::write(&target, "not a directory").unwrap();

        let result = ensure_installation_path(&target.display().to_string());

        assert!(!result.ok);
        assert_eq!(result.status, "inaccessible");
        std::fs::remove_file(target).unwrap();
    }

    #[test]
    fn installation_path_reports_unsafe_paths() {
        let result = ensure_installation_path("relative/apps");

        assert!(!result.ok);
        assert_eq!(result.status, "unsafe");
    }

    #[test]
    fn protects_pullora_storage_but_allows_its_apps_folder() {
        let root = std::env::temp_dir().join(format!(
            "pullora-protected-install-path-{}",
            std::process::id()
        ));
        let protected_root = root.join("pullora");
        let allowed_apps = protected_root.join("apps");
        std::fs::create_dir_all(&allowed_apps).unwrap();

        assert!(is_protected_installation_path(
            &protected_root,
            &allowed_apps,
            std::slice::from_ref(&protected_root),
        ));
        assert!(is_protected_installation_path(
            &protected_root.join("package-cache"),
            &allowed_apps,
            std::slice::from_ref(&protected_root),
        ));
        assert!(!is_protected_installation_path(
            &allowed_apps,
            &allowed_apps,
            std::slice::from_ref(&protected_root),
        ));
        assert!(!is_protected_installation_path(
            &allowed_apps.join("CpPrice11-demo"),
            &allowed_apps,
            std::slice::from_ref(&protected_root),
        ));

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn install_path_permission_errors_are_stable() {
        let error = std::io::Error::from(std::io::ErrorKind::PermissionDenied);
        assert_eq!(install_path_io_status(&error), "noWritePermission");
    }

    #[cfg(windows)]
    #[test]
    fn ensure_installation_path_reports_a_locked_probe() {
        use std::os::windows::fs::OpenOptionsExt;

        let target = std::env::temp_dir().join(format!(
            "pullora-locked-install-path-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&target).unwrap();
        let probe = target.join(".pullora-write-test.tmp");
        let locked = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .share_mode(0)
            .open(&probe)
            .unwrap();

        let result = ensure_installation_path(&target.display().to_string());

        assert!(!result.ok);
        assert_eq!(result.status, "busy");
        drop(locked);
        std::fs::remove_file(probe).unwrap();
        std::fs::remove_dir(target).unwrap();
    }
}
