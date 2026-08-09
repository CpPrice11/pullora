use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::download::manager::{DownloadProgress, DownloadRequest};
use crate::error::{command_error, command_error_with_detail};
use crate::AppState;

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn start_download(
    app: AppHandle,
    url: String,
    file_name: String,
    owner: String,
    repo: String,
    tag: String,
    size: u64,
    state: State<'_, AppState>,
) -> Result<String, String> {
    crate::github::assets::validate_versioned_release_asset_url(
        &url, &owner, &repo, &tag, &file_name,
    )?;

    let install_path = {
        let settings = state.settings.lock().await;
        settings
            .installation_path
            .as_ref()
            .filter(|path| !path.trim().is_empty())
            .ok_or_else(|| command_error("errors.installPathUnavailable"))?
            .clone()
    };

    if let Some(error) = install_path_guard_error(&install_path) {
        return Err(error);
    }

    let id = Uuid::new_v4().to_string();
    let dest_dir = crate::storage::path_scope::installation_root(&install_path)?;

    if let Some(error) = disk_space_guard_error(&dest_dir, size) {
        return Err(error);
    }

    state
        .download_manager
        .start_download(
            app,
            DownloadRequest {
                id: id.clone(),
                url,
                file_name,
                dest_dir,
                owner,
                repo,
                tag,
                asset_size: size,
            },
        )
        .await
}

#[tauri::command]
pub async fn get_downloads(state: State<'_, AppState>) -> Result<Vec<DownloadProgress>, String> {
    Ok(state.download_manager.get_progress().await)
}

#[tauri::command]
pub async fn cancel_download(id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.download_manager.cancel(&id).await;
    Ok(())
}

/// Refuses to start a download whose destination cannot be created or written to,
/// instead of discovering that mid-transfer.
fn install_path_guard_error(install_path: &str) -> Option<String> {
    let path_status = crate::commands::settings::ensure_installation_path(install_path);
    if !path_status.ok {
        let code = match path_status.status.as_str() {
            "missing" => "errors.installPathRequired",
            "unsafe" => "errors.installPathUnsafe",
            "noWritePermission" => "errors.installPathRequiresWritable",
            "busy" => "errors.installPathBusy",
            _ => "errors.installPathUnavailable",
        };
        return Some(command_error(code));
    }
    None
}

/// ponytail: doubles the asset size as a cheap download-plus-extraction estimate;
/// inspect archive metadata only if real packages prove this too inaccurate.
fn disk_space_guard_error(dest_dir: &std::path::Path, asset_size: u64) -> Option<String> {
    let available = crate::storage::disk_space::available_bytes(dest_dir)?;
    let required = asset_size.saturating_mul(2);
    if available >= required {
        return None;
    }

    Some(command_error_with_detail(
        "errors.insufficientDiskSpace",
        format!("{}:{}", required, available),
    ))
}

#[cfg(test)]
mod tests {
    use super::{disk_space_guard_error, install_path_guard_error};

    #[test]
    fn blocks_download_when_destination_cannot_be_prepared() {
        let error = install_path_guard_error("relative/does-not-resolve");
        assert_eq!(
            error.as_deref(),
            Some("PULLORA_ERROR:errors.installPathUnsafe")
        );
    }

    #[test]
    fn allows_download_to_a_writable_destination() {
        let target = std::env::temp_dir().join(format!(
            "pullora-start-download-guard-{}",
            std::process::id()
        ));

        let error = install_path_guard_error(&target.display().to_string());

        assert_eq!(error, None);
        std::fs::remove_dir_all(&target).unwrap();
    }

    #[test]
    fn blocks_download_when_the_disk_has_no_room_for_it() {
        let target = std::env::temp_dir();
        let error = disk_space_guard_error(&target, u64::MAX / 2);
        assert!(error
            .as_deref()
            .is_some_and(|value| value.starts_with("PULLORA_ERROR:errors.insufficientDiskSpace|")));
    }

    #[test]
    fn allows_download_when_the_disk_has_plenty_of_room() {
        let target = std::env::temp_dir();
        let error = disk_space_guard_error(&target, 1024);
        assert_eq!(error, None);
    }
}
