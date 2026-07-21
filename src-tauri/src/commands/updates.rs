use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::Write;
use tauri::{AppHandle, State};

use crate::error::command_error;
use crate::AppState;

const CHECKSUM_MANIFEST_NAME: &str = "SHA256SUMS.txt";
const MAX_CHECKSUM_MANIFEST_BYTES: usize = 64 * 1024;

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

#[tauri::command]
pub async fn install_launcher_release(
    app: AppHandle,
    version: String,
    asset_url: String,
    asset_name: String,
    checksum_url: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let _update_guard = state.launcher_update_lock.lock().await;

    if version.is_empty()
        || version == "."
        || version == ".."
        || version
            .chars()
            .any(|ch| !(ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_')))
    {
        return Err(command_error("errors.invalidVersion"));
    }

    let config_dir = crate::storage::get_config_dir();
    let update_dir = config_dir.join("launcher-updates").join(&version);
    reset_update_dir(&update_dir)?;

    let preparation = async {
        crate::github::assets::validate_versioned_release_asset_url(
            &asset_url,
            "CpPrice11",
            "pullora",
            &version,
            &asset_name,
        )?;
        crate::github::assets::validate_versioned_release_asset_url(
            &checksum_url,
            "CpPrice11",
            "pullora",
            &version,
            CHECKSUM_MANIFEST_NAME,
        )?;

        let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let downloaded_asset = update_dir.join(sanitize_asset_name(&asset_name));
        let downloaded_exe = update_dir.join("Pullora.exe");
        let script_path = update_dir.join("apply-launcher-update.ps1");
        let checksum_manifest =
            download_launcher_bytes(&checksum_url, Some(MAX_CHECKSUM_MANIFEST_BYTES)).await?;
        let expected_checksum = parse_sha256_manifest(&checksum_manifest, &asset_name)
            .ok_or_else(|| command_error("errors.launcherChecksumInvalid"))?;
        let asset_bytes = download_launcher_bytes(&asset_url, None).await?;
        verify_sha256(&asset_bytes, &expected_checksum)?;
        std::fs::write(&downloaded_asset, asset_bytes).map_err(|e| e.to_string())?;
        prepare_portable_launcher_asset(&downloaded_asset, &downloaded_exe, &update_dir)?;
        let prepared_checksum = sha256_file(&downloaded_exe)?;
        write_launcher_update_script(
            &script_path,
            &downloaded_exe,
            &current_exe,
            std::process::id(),
            &prepared_checksum,
        )?;
        Ok::<_, String>(script_path)
    }
    .await;

    let script_path = fail_closed(&update_dir, preparation)?;
    let launch_result = std::process::Command::new("powershell")
        .arg("-NoProfile")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(&script_path)
        .spawn();
    fail_closed(
        &update_dir,
        launch_result.map(|_| ()).map_err(|e| e.to_string()),
    )?;

    app.exit(0);
    Ok(())
}

fn reset_update_dir(update_dir: &std::path::Path) -> Result<(), String> {
    if update_dir.exists() {
        std::fs::remove_dir_all(update_dir).map_err(|e| e.to_string())?;
    }
    std::fs::create_dir_all(update_dir).map_err(|e| e.to_string())
}

fn fail_closed<T>(update_dir: &std::path::Path, result: Result<T, String>) -> Result<T, String> {
    result.inspect_err(|_| {
        let _ = std::fs::remove_dir_all(update_dir);
    })
}

fn sanitize_asset_name(asset_name: &str) -> String {
    let clean = asset_name
        .chars()
        .map(|ch| match ch {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => ch,
        })
        .collect::<String>();

    if clean.trim().is_empty() {
        "launcher-asset.exe".to_string()
    } else {
        clean
    }
}

fn prepare_portable_launcher_asset(
    downloaded_asset: &std::path::Path,
    destination_exe: &std::path::Path,
    update_dir: &std::path::Path,
) -> Result<(), String> {
    let asset_name = downloaded_asset
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_lowercase();

    if is_installer_asset(&asset_name) {
        return Err(command_error("errors.unsupportedLauncherAsset"));
    }

    if asset_name.ends_with(".exe") {
        std::fs::copy(downloaded_asset, destination_exe).map_err(|e| e.to_string())?;
        return Ok(());
    }

    if asset_name.ends_with(".zip") {
        let extract_dir = update_dir.join("portable");
        if extract_dir.exists() {
            std::fs::remove_dir_all(&extract_dir).map_err(|e| e.to_string())?;
        }
        std::fs::create_dir_all(&extract_dir).map_err(|e| e.to_string())?;

        let file = std::fs::File::open(downloaded_asset).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        archive.extract(&extract_dir).map_err(|e| e.to_string())?;

        let portable_exe = find_portable_launcher_exe(&extract_dir)
            .ok_or_else(|| command_error("errors.unsupportedLauncherAsset"))?;
        std::fs::copy(portable_exe, destination_exe).map_err(|e| e.to_string())?;
        return Ok(());
    }

    Err(command_error("errors.unsupportedLauncherAsset"))
}

fn is_installer_asset(name: &str) -> bool {
    name.contains("setup") || name.contains("installer") || name.ends_with(".msi")
}

fn find_portable_launcher_exe(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    let mut fallback = None;
    let entries = std::fs::read_dir(dir).ok()?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_portable_launcher_exe(&path) {
                return Some(found);
            }
            continue;
        }

        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_lowercase();

        if !name.ends_with(".exe") || is_installer_asset(&name) {
            continue;
        }

        if name.contains("pullora") || (name.contains("air") && name.contains("launcher")) {
            return Some(path);
        }

        fallback.get_or_insert(path);
    }

    fallback
}

async fn download_launcher_bytes(url: &str, max_bytes: Option<usize>) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Pullora/0.1.0")
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|_| command_error("errors.githubDownloadFailed"))?;

    if !response.status().is_success() {
        return Err(command_error("errors.githubDownloadFailed"));
    }

    if max_bytes.is_some_and(|limit| {
        response
            .content_length()
            .is_some_and(|size| size > limit as u64)
    }) {
        return Err(command_error("errors.launcherChecksumInvalid"));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|_| command_error("errors.githubDownloadFailed"))?;
    if max_bytes.is_some_and(|limit| bytes.len() > limit) {
        return Err(command_error("errors.launcherChecksumInvalid"));
    }

    Ok(bytes.to_vec())
}

fn parse_sha256_manifest(bytes: &[u8], asset_name: &str) -> Option<String> {
    let manifest = std::str::from_utf8(bytes).ok()?;
    manifest.lines().find_map(|line| {
        let (checksum, file_name) = line.trim().split_once(char::is_whitespace)?;
        let file_name = file_name.trim().trim_start_matches('*');
        (file_name == asset_name
            && checksum.len() == 64
            && checksum.chars().all(|ch| ch.is_ascii_hexdigit()))
        .then(|| checksum.to_ascii_lowercase())
    })
}

fn verify_sha256(bytes: &[u8], expected_checksum: &str) -> Result<(), String> {
    let actual_checksum = sha256_hex(bytes);
    if actual_checksum == expected_checksum {
        Ok(())
    } else {
        Err(command_error("errors.launcherChecksumMismatch"))
    }
}

fn sha256_file(path: &std::path::Path) -> Result<String, String> {
    std::fs::read(path)
        .map(|bytes| sha256_hex(&bytes))
        .map_err(|e| e.to_string())
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn write_launcher_update_script(
    script_path: &std::path::Path,
    source_exe: &std::path::Path,
    target_exe: &std::path::Path,
    current_pid: u32,
    expected_checksum: &str,
) -> Result<(), String> {
    let backup_dir = target_exe
        .parent()
        .ok_or_else(|| command_error("errors.launcherDirectoryUnavailable"))?
        .join(".pullora-backups");
    std::fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    let backup_exe = backup_dir.join(format!(
        "Pullora backup {}.exe",
        chrono::Utc::now().format("%Y%m%d%H%M%S%3f")
    ));

    let script = format!(
        r#"$ErrorActionPreference = 'Stop'
$pidToWait = {pid}
$source = @'
{source}
'@
$target = @'
{target}
'@
$backup = @'
{backup}
'@
$expectedHash = '{expected_hash}'
try {{
  Wait-Process -Id $pidToWait -Timeout 30 -ErrorAction SilentlyContinue
}} catch {{}}
$sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
if ($sourceHash -ne $expectedHash) {{
  throw 'Pullora update checksum verification failed.'
}}
$backupCreated = $false
$targetReplaced = $false
$targetHash = $null
try {{
  if (Test-Path -LiteralPath $target) {{
    $targetHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    Copy-Item -LiteralPath $target -Destination $backup -Force
    $backupHash = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($backupHash -ne $targetHash) {{
      throw 'Pullora backup verification failed.'
    }}
    $backupCreated = $true
  }}
  Copy-Item -LiteralPath $source -Destination $target -Force
  $targetReplaced = $true
  $installedHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($installedHash -ne $expectedHash) {{
    throw 'Pullora installed update verification failed.'
  }}
  Start-Process -FilePath $target
}} catch {{
  $canRestart = -not $targetReplaced
  if ($targetReplaced -and $backupCreated -and (Test-Path -LiteralPath $backup)) {{
    Copy-Item -LiteralPath $backup -Destination $target -Force
    $restoredHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    $canRestart = $restoredHash -eq $targetHash
  }}
  if ($canRestart -and (Test-Path -LiteralPath $target)) {{
    Start-Process -FilePath $target
  }}
  throw
}}
"#,
        pid = current_pid,
        source = source_exe.display(),
        target = target_exe.display(),
        backup = backup_exe.display(),
        expected_hash = expected_checksum,
    );

    let mut file = std::fs::File::create(script_path).map_err(|e| e.to_string())?;
    file.write_all(script.as_bytes()).map_err(|e| e.to_string())
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
        fail_closed, parse_sha256_manifest, prepare_portable_launcher_asset, reset_update_dir,
        verify_sha256, write_launcher_update_script,
    };

    #[test]
    fn failed_verification_removes_the_entire_update_attempt() {
        let dir =
            std::env::temp_dir().join(format!("pullora-failed-update-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let stale_script = dir.join("apply-launcher-update.ps1");
        std::fs::write(&stale_script, b"stale").unwrap();
        reset_update_dir(&dir).unwrap();
        assert!(!stale_script.exists());
        std::fs::write(dir.join("candidate.exe"), b"invalid").unwrap();

        let result = fail_closed::<()>(&dir, Err("verification failed".to_string()));

        assert!(result.is_err());
        assert!(!dir.exists());
    }

    #[test]
    fn finds_named_asset_checksum() {
        let manifest =
            b"b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9  other.exe\n\
b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9  Pullora.exe\n";
        assert_eq!(
            parse_sha256_manifest(manifest, "Pullora.exe").as_deref(),
            Some("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9")
        );
        assert!(parse_sha256_manifest(manifest, "missing.exe").is_none());
    }

    #[test]
    fn rejects_malformed_or_mismatched_checksum() {
        assert!(parse_sha256_manifest(b"not-a-hash  Pullora.exe\n", "Pullora.exe").is_none());
        assert!(verify_sha256(
            b"hello world",
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        )
        .is_ok());
        assert!(verify_sha256(b"tampered", &"0".repeat(64)).is_err());
    }

    #[test]
    fn accepts_portable_exe_and_rejects_installer_assets() {
        let dir = std::env::temp_dir().join(format!(
            "pullora-portable-asset-test-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let destination = dir.join("Pullora.exe");
        let portable = dir.join("Pullora_portable_x64.exe");
        std::fs::write(&portable, b"portable").unwrap();

        prepare_portable_launcher_asset(&portable, &destination, &dir).unwrap();
        assert_eq!(std::fs::read(&destination).unwrap(), b"portable");

        for name in [
            "Pullora_setup.exe",
            "Pullora_installer.exe",
            "Pullora.msi",
            "Pullora.txt",
        ] {
            let asset = dir.join(name);
            std::fs::write(&asset, b"unsupported").unwrap();
            assert!(prepare_portable_launcher_asset(&asset, &destination, &dir).is_err());
        }

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn apply_script_rechecks_sha256_and_restores_backup() {
        let dir =
            std::env::temp_dir().join(format!("pullora-update-script-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let script_path = dir.join("apply.ps1");
        write_launcher_update_script(
            &script_path,
            &dir.join("candidate.exe"),
            &dir.join("Pullora.exe"),
            1,
            &"0".repeat(64),
        )
        .unwrap();

        let script = std::fs::read_to_string(&script_path).unwrap();
        assert!(
            script.find("$sourceHash").unwrap()
                < script.find("Copy-Item -LiteralPath $source").unwrap()
        );
        assert!(script.contains("$backupCreated = $true"));
        assert!(script.contains("Copy-Item -LiteralPath $backup -Destination $target -Force"));
        assert!(script.contains("$restoredHash"));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
