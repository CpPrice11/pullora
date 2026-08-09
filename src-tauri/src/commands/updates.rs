use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, State};
use tauri_plugin_updater::UpdaterExt;

use crate::error::command_error;
use crate::AppState;

const CHECKSUM_MANIFEST_NAME: &str = "SHA256SUMS.txt";
const MAX_CHECKSUM_MANIFEST_BYTES: usize = 64 * 1024;
const MAX_PORTABLE_UPDATE_BYTES: usize = 300 * 1024 * 1024;
const PORTABLE_UPDATE_ARG: &str = "--apply-portable-update";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherStorageInfo {
    pub launcher_dir: String,
    pub update_cache_path: String,
    pub backup_path: String,
    pub cleanup_bytes: u64,
    pub update_cache_count: usize,
    pub backup_count: usize,
}

#[tauri::command]
pub async fn get_launcher_version() -> Result<String, String> {
    Ok(format!("v{}", env!("CARGO_PKG_VERSION")))
}

#[tauri::command]
pub async fn get_launcher_installation_mode() -> Result<String, String> {
    Ok(if crate::storage::settings::is_portable() {
        "portable"
    } else {
        "installed"
    }
    .to_string())
}

#[tauri::command]
pub async fn install_launcher_update(
    app: AppHandle,
    version: String,
    asset_url: String,
    asset_name: String,
    checksum_url: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let _update_guard = state.launcher_update_lock.lock().await;
    validate_version(&version)?;

    if crate::storage::settings::is_portable() {
        install_portable_launcher_update(&app, &version, &asset_url, &asset_name, &checksum_url)
            .await
    } else {
        install_registered_launcher_update(&app, &version).await
    }
}

async fn install_registered_launcher_update(app: &AppHandle, version: &str) -> Result<(), String> {
    let update = app
        .updater()
        .map_err(|_| command_error("errors.launcherUpdaterFailed"))?
        .check()
        .await
        .map_err(|_| command_error("errors.launcherUpdaterFailed"))?
        .ok_or_else(|| command_error("errors.launcherUpdateUnavailable"))?;

    if update.version.to_string().trim_start_matches('v') != version.trim_start_matches('v') {
        return Err(command_error("errors.launcherUpdateVersionMismatch"));
    }

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|_| command_error("errors.launcherUpdaterFailed"))?;
    app.restart();
}

async fn install_portable_launcher_update(
    app: &AppHandle,
    version: &str,
    asset_url: &str,
    asset_name: &str,
    checksum_url: &str,
) -> Result<(), String> {
    if !asset_name.to_ascii_lowercase().contains("portable")
        || !asset_name.to_ascii_lowercase().ends_with(".exe")
    {
        return Err(command_error("errors.unsupportedLauncherAsset"));
    }

    crate::github::assets::validate_versioned_release_asset_url(
        asset_url,
        "CpPrice11",
        "pullora",
        version,
        asset_name,
    )?;
    crate::github::assets::validate_versioned_release_asset_url(
        checksum_url,
        "CpPrice11",
        "pullora",
        version,
        CHECKSUM_MANIFEST_NAME,
    )?;

    let current_exe = std::env::current_exe()
        .map_err(|_| command_error("errors.launcherDirectoryUnavailable"))?;
    let update_dir = crate::storage::get_config_dir()
        .join("launcher-updates")
        .join(version);
    reset_update_dir(&update_dir)?;

    let result = async {
        let manifest = download_launcher_bytes(checksum_url, MAX_CHECKSUM_MANIFEST_BYTES).await?;
        let expected = parse_sha256_manifest(&manifest, asset_name)
            .ok_or_else(|| command_error("errors.launcherChecksumInvalid"))?;
        let asset = download_launcher_bytes(asset_url, MAX_PORTABLE_UPDATE_BYTES).await?;
        verify_sha256(&asset, &expected)?;

        let candidate = update_dir.join(asset_name);
        std::fs::write(&candidate, asset)
            .map_err(|_| command_error("errors.launcherUpdaterFailed"))?;
        let helper_hash = sha256_file(&candidate)?;
        std::process::Command::new(&candidate)
            .arg(PORTABLE_UPDATE_ARG)
            .arg(std::process::id().to_string())
            .arg(&current_exe)
            .arg(&helper_hash)
            .spawn()
            .map_err(|_| command_error("errors.launcherUpdaterFailed"))?;
        Ok::<(), String>(())
    }
    .await;

    if result.is_err() {
        let _ = std::fs::remove_dir_all(&update_dir);
        return result;
    }

    app.exit(0);
    Ok(())
}

pub(crate) fn apply_portable_update_if_requested() -> bool {
    let args = std::env::args_os().collect::<Vec<_>>();
    if args.get(1).and_then(|value| value.to_str()) != Some(PORTABLE_UPDATE_ARG) {
        return false;
    }

    let result = apply_portable_update(&args[2..]);
    if let Err(ref error) = result {
        if let Some(target) = args.get(3).map(std::path::PathBuf::from) {
            let _ = target
                .parent()
                .map(|dir| std::fs::write(dir.join("pullora-update-error.log"), error));
            let _ = std::process::Command::new(target).spawn();
        }
    }
    std::process::exit(if result.is_ok() { 0 } else { 1 });
}

fn apply_portable_update(args: &[std::ffi::OsString]) -> Result<(), String> {
    if args.len() != 3 {
        return Err("invalid portable update arguments".to_string());
    }

    let old_pid = args[0]
        .to_str()
        .and_then(|value| value.parse::<u32>().ok())
        .ok_or_else(|| "invalid portable update pid".to_string())?;
    let target = std::path::PathBuf::from(&args[1]);
    let expected_hash = args[2]
        .to_str()
        .filter(|value| value.len() == 64 && value.chars().all(|ch| ch.is_ascii_hexdigit()))
        .ok_or_else(|| "invalid portable update hash".to_string())?
        .to_ascii_lowercase();
    let source = std::env::current_exe().map_err(|error| error.to_string())?;

    validate_portable_update_paths(&source, &target)?;
    if sha256_file(&source)? != expected_hash {
        return Err("portable update source hash mismatch".to_string());
    }

    wait_for_process_exit(old_pid);
    let backup_dir = target
        .parent()
        .ok_or_else(|| "portable update target has no parent".to_string())?
        .join(".pullora-backups");
    std::fs::create_dir_all(&backup_dir).map_err(|error| error.to_string())?;
    let backup = backup_dir.join(format!(
        "Pullora backup {}.exe",
        chrono::Utc::now().format("%Y%m%d%H%M%S%3f")
    ));
    let target_hash = sha256_file(&target)?;
    std::fs::copy(&target, &backup).map_err(|error| error.to_string())?;
    if sha256_file(&backup)? != target_hash {
        return Err("portable update backup hash mismatch".to_string());
    }

    let replacement = (|| {
        std::fs::copy(&source, &target).map_err(|error| error.to_string())?;
        if sha256_file(&target)? != expected_hash {
            return Err("portable update target hash mismatch".to_string());
        }
        std::process::Command::new(&target)
            .spawn()
            .map_err(|error| error.to_string())?;
        Ok::<(), String>(())
    })();

    if replacement.is_err() {
        let _ = std::fs::copy(&backup, &target);
    }
    replacement
}

fn validate_version(version: &str) -> Result<(), String> {
    (!version.is_empty()
        && version != "."
        && version != ".."
        && version
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_')))
    .then_some(())
    .ok_or_else(|| command_error("errors.invalidVersion"))
}

fn validate_portable_update_paths(
    source: &std::path::Path,
    target: &std::path::Path,
) -> Result<(), String> {
    let source = source.canonicalize().map_err(|error| error.to_string())?;
    let target = target.canonicalize().map_err(|error| error.to_string())?;
    let target_name = target
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let update_root = source
        .parent()
        .and_then(std::path::Path::parent)
        .ok_or_else(|| "portable update source is outside the update cache".to_string())?;
    let expected_target_dir = update_root
        .parent()
        .ok_or_else(|| "portable update source is outside the launcher directory".to_string())?;

    if update_root.file_name().and_then(|name| name.to_str()) != Some("launcher-updates")
        || target.parent() != Some(expected_target_dir)
        || !target_name.ends_with(".exe")
        || !(target_name.starts_with("pullora") || target_name.contains("air launcher"))
    {
        return Err("portable update path validation failed".to_string());
    }
    Ok(())
}

async fn download_launcher_bytes(url: &str, max_bytes: usize) -> Result<Vec<u8>, String> {
    let response = reqwest::Client::builder()
        .user_agent(concat!("Pullora/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| command_error("errors.githubDownloadFailed"))?
        .get(url)
        .send()
        .await
        .map_err(|_| command_error("errors.githubDownloadFailed"))?;

    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|size| size > max_bytes as u64)
    {
        return Err(command_error("errors.githubDownloadFailed"));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|_| command_error("errors.githubDownloadFailed"))?;
    (bytes.len() <= max_bytes)
        .then(|| bytes.to_vec())
        .ok_or_else(|| command_error("errors.githubDownloadFailed"))
}

fn parse_sha256_manifest(bytes: &[u8], asset_name: &str) -> Option<String> {
    std::str::from_utf8(bytes).ok()?.lines().find_map(|line| {
        let (checksum, file_name) = line.trim().split_once(char::is_whitespace)?;
        (file_name.trim().trim_start_matches('*') == asset_name
            && checksum.len() == 64
            && checksum.chars().all(|ch| ch.is_ascii_hexdigit()))
        .then(|| checksum.to_ascii_lowercase())
    })
}

fn verify_sha256(bytes: &[u8], expected: &str) -> Result<(), String> {
    (sha256_hex(bytes) == expected)
        .then_some(())
        .ok_or_else(|| command_error("errors.launcherChecksumMismatch"))
}

fn sha256_file(path: &std::path::Path) -> Result<String, String> {
    std::fs::read(path)
        .map(|bytes| sha256_hex(&bytes))
        .map_err(|error| error.to_string())
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn reset_update_dir(path: &std::path::Path) -> Result<(), String> {
    if path.exists() {
        std::fs::remove_dir_all(path).map_err(|_| command_error("errors.launcherUpdaterFailed"))?;
    }
    std::fs::create_dir_all(path).map_err(|_| command_error("errors.launcherUpdaterFailed"))
}

#[cfg(windows)]
fn wait_for_process_exit(pid: u32) {
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE},
    };

    unsafe {
        let process = OpenProcess(PROCESS_SYNCHRONIZE, 0, pid);
        if !process.is_null() {
            WaitForSingleObject(process, 30_000);
            CloseHandle(process);
        }
    }
}

#[cfg(not(windows))]
fn wait_for_process_exit(_pid: u32) {}

#[tauri::command]
pub async fn open_dir(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut roots = vec![crate::storage::get_config_dir()];
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            roots.push(dir.to_path_buf());
        }
    }
    if let Some(path) = state.settings.lock().await.installation_path.as_deref() {
        if let Ok(root) = crate::storage::path_scope::installation_root(path) {
            roots.push(root);
        }
    }

    let path =
        crate::storage::path_scope::ensure_within_any(std::path::Path::new(&path), &roots, true)?;
    open_directory(&path)
}

pub(crate) fn open_directory(path: &std::path::Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(path)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn open_external_url(url: String) -> Result<(), String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| command_error("errors.invalidUrl"))?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("github.com")
        || parsed.port_or_known_default() != Some(443)
    {
        return Err(command_error("errors.githubUrlOnly"));
    }

    #[cfg(target_os = "windows")]
    std::process::Command::new("rundll32")
        .arg("url.dll,FileProtocolHandler")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_launcher_storage_info() -> Result<LauncherStorageInfo, String> {
    collect_launcher_storage_info()
}

#[tauri::command]
pub async fn get_event_log() -> Result<Vec<String>, String> {
    crate::storage::logs::read_recent_logs(&crate::storage::get_config_dir(), 200)
        .map_err(|_| command_error("errors.eventLogReadFailed"))
}

#[tauri::command]
pub async fn cleanup_launcher_update_files() -> Result<LauncherStorageInfo, String> {
    let config_dir = crate::storage::get_config_dir();
    let update_cache_dir = config_dir.join("launcher-updates");
    if update_cache_dir.exists() {
        std::fs::remove_dir_all(&update_cache_dir).map_err(|e| e.to_string())?;
    }

    let backup_dir = launcher_backup_dir()?;
    let mut backups = backup_files(&backup_dir)?;
    backups.sort_by_key(|item| item.0);
    backups.reverse();

    for (_, path) in backups.into_iter().skip(1) {
        if path.is_file() {
            std::fs::remove_file(path).map_err(|e| e.to_string())?;
        }
    }

    collect_launcher_storage_info()
}

fn collect_launcher_storage_info() -> Result<LauncherStorageInfo, String> {
    let config_dir = crate::storage::get_config_dir();
    let update_cache_dir = config_dir.join("launcher-updates");
    let backup_dir = launcher_backup_dir()?;
    let cleanup_bytes = dir_size(&update_cache_dir)? + old_backup_size(&backup_dir)?;
    let update_cache_count = child_count(&update_cache_dir)?;
    let backup_count = backup_files(&backup_dir)?.len();
    let launcher_dir = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or_else(|| command_error("errors.launcherDirectoryUnavailable"))?
        .display()
        .to_string();

    Ok(LauncherStorageInfo {
        launcher_dir,
        update_cache_path: update_cache_dir.display().to_string(),
        backup_path: backup_dir.display().to_string(),
        cleanup_bytes,
        update_cache_count,
        backup_count,
    })
}

fn launcher_backup_dir() -> Result<std::path::PathBuf, String> {
    Ok(std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or_else(|| command_error("errors.launcherDirectoryUnavailable"))?
        .join(".pullora-backups"))
}

fn child_count(path: &std::path::Path) -> Result<usize, String> {
    if !path.exists() {
        return Ok(0);
    }

    Ok(std::fs::read_dir(path)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .count())
}

fn dir_size(path: &std::path::Path) -> Result<u64, String> {
    if !path.exists() {
        return Ok(0);
    }

    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
    if metadata.is_file() {
        return Ok(metadata.len());
    }

    let mut total = 0;
    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        total += dir_size(&entry.path())?;
    }

    Ok(total)
}

fn backup_files(
    path: &std::path::Path,
) -> Result<Vec<(std::time::SystemTime, std::path::PathBuf)>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_lowercase();
        if !name.ends_with(".exe") {
            continue;
        }

        let modified = std::fs::metadata(&path)
            .and_then(|metadata| metadata.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        files.push((modified, path));
    }

    Ok(files)
}

fn old_backup_size(path: &std::path::Path) -> Result<u64, String> {
    let mut backups = backup_files(path)?;
    backups.sort_by_key(|item| item.0);
    backups.reverse();

    let mut total = 0;
    for (_, path) in backups.into_iter().skip(1) {
        total += dir_size(&path)?;
    }

    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::{
        parse_sha256_manifest, validate_portable_update_paths, validate_version, verify_sha256,
    };

    #[test]
    fn portable_update_accepts_only_a_scoped_verified_candidate() {
        let root = std::env::temp_dir().join(format!("pullora-update-test-{}", std::process::id()));
        let update_dir = root.join("launcher-updates").join("v5.17.0");
        std::fs::create_dir_all(&update_dir).unwrap();
        let source = update_dir.join("Pullora_5.17.0_portable_x64.exe");
        let target = root.join("Pullora_5.16.1_portable_x64.exe");
        let outside = root.join("other").join("Pullora.exe");
        std::fs::write(&source, b"candidate").unwrap();
        std::fs::write(&target, b"current").unwrap();
        std::fs::create_dir_all(outside.parent().unwrap()).unwrap();
        std::fs::write(&outside, b"outside").unwrap();

        assert!(validate_portable_update_paths(&source, &target).is_ok());
        assert!(validate_portable_update_paths(&source, &outside).is_err());
        assert!(validate_version("v5.17.0").is_ok());
        assert!(validate_version("../5.17.0").is_err());

        let manifest =
            b"b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9  Pullora.exe\n";
        assert_eq!(
            parse_sha256_manifest(manifest, "Pullora.exe").as_deref(),
            Some("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9")
        );
        assert!(verify_sha256(
            b"hello world",
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        )
        .is_ok());

        std::fs::remove_dir_all(root).unwrap();
    }
}
