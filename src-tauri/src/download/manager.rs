use futures_util::StreamExt;
use reqwest::Client;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use super::extractor;

const INSTALLER_DETECTION_TIMEOUT: Duration = Duration::from_secs(180);
const INSTALLER_DETECTION_INTERVAL: Duration = Duration::from_secs(2);
const INSTALLER_PROCESS_WAIT_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub id: String,
    pub file_name: String,
    pub downloaded_size: u64,
    pub total_size: u64,
    pub progress: f64,
    pub status: DownloadStatus,
    pub stage: DownloadStage,
    pub owner: Option<String>,
    pub repo: Option<String>,
    pub tag: Option<String>,
    pub install_path: Option<String>,
    pub executable_path: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum DownloadStatus {
    Pending,
    Downloading,
    Extracting,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum DownloadStage {
    Queued,
    Downloading,
    Verifying,
    Extracting,
    RunningInstaller,
    DetectingExecutable,
    Registering,
    Completed,
    Failed,
}

pub struct DownloadRequest {
    pub id: String,
    pub url: String,
    pub file_name: String,
    pub dest_dir: PathBuf,
    pub owner: String,
    pub repo: String,
    pub tag: String,
}

struct DownloadTask {
    request: DownloadRequest,
    install_kind: String,
}

pub struct DownloadManager {
    active: Arc<Mutex<Vec<DownloadProgress>>>,
    cancelled: Arc<Mutex<HashSet<String>>>,
}

impl DownloadManager {
    pub fn new() -> Self {
        Self {
            active: Arc::new(Mutex::new(vec![])),
            cancelled: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    pub async fn start_download(
        &self,
        app: AppHandle,
        request: DownloadRequest,
    ) -> Result<String, String> {
        let install_kind = install_kind_for_asset(&request.file_name)?;
        let active = self.active.clone();
        let cancelled = self.cancelled.clone();
        let id = request.id.clone();

        let progress = DownloadProgress {
            id: id.clone(),
            file_name: request.file_name.clone(),
            downloaded_size: 0,
            total_size: 0,
            progress: 0.0,
            status: DownloadStatus::Pending,
            stage: DownloadStage::Queued,
            owner: Some(request.owner.clone()),
            repo: Some(request.repo.clone()),
            tag: Some(request.tag.clone()),
            install_path: Some(display_install_path(&install_kind, &request.dest_dir)),
            executable_path: None,
            error: None,
        };

        {
            let mut list = active.lock().await;
            list.retain(|p| p.id != id);
            list.push(progress.clone());
        }
        {
            let mut cancelled_ids = cancelled.lock().await;
            cancelled_ids.remove(&id);
        }

        let id_clone = id.clone();
        let active_clone = active.clone();
        let cancelled_clone = cancelled.clone();
        let task = DownloadTask {
            request,
            install_kind,
        };
        tokio::spawn(async move {
            let owner = task.request.owner.clone();
            let repo = task.request.repo.clone();
            let tag = task.request.tag.clone();
            log_download_event(&owner, &repo, &tag, "download started");

            let result = download_task(
                app.clone(),
                task,
                active_clone.clone(),
                cancelled_clone.clone(),
            )
            .await;

            match result {
                Ok(()) => {
                    log_download_event(&owner, &repo, &tag, "download installed successfully");
                }
                Err(e) => {
                    if is_cancelled(&cancelled_clone, &id_clone).await {
                        let mut cancelled_ids = cancelled_clone.lock().await;
                        cancelled_ids.remove(&id_clone);
                        log_download_event(&owner, &repo, &tag, "download canceled");
                        return;
                    }

                    log_download_event(&owner, &repo, &tag, &format!("download failed: {}", e));
                    let mut list = active_clone.lock().await;
                    if let Some(p) = list.iter_mut().find(|p| p.id == id_clone) {
                        p.status = DownloadStatus::Failed;
                        p.stage = DownloadStage::Failed;
                        p.error = Some(e);
                        let _ = app.emit("download-progress", p.clone());
                    }
                }
            }
        });

        Ok(id)
    }

    pub async fn get_progress(&self) -> Vec<DownloadProgress> {
        let list = self.active.lock().await;
        list.clone()
    }

    pub async fn cancel(&self, id: &str) {
        let mut cancelled_ids = self.cancelled.lock().await;
        cancelled_ids.insert(id.to_string());
        drop(cancelled_ids);

        let mut list = self.active.lock().await;
        list.retain(|p| p.id != id);
    }
}

fn log_download_event(owner: &str, repo: &str, tag: &str, message: &str) {
    let config_dir = crate::storage::get_config_dir();
    let _ = crate::storage::logs::append_log(
        &config_dir,
        &format!("install {}/{}@{}: {}", owner, repo, tag, message),
    );
}

fn installer_cache_root() -> PathBuf {
    crate::storage::get_config_dir().join("installer-cache")
}

fn install_workspace_dir(install_kind: &str, dest_dir: &Path) -> PathBuf {
    if install_kind == "installer" {
        installer_cache_root()
    } else {
        dest_dir.to_path_buf()
    }
}

fn display_install_path(install_kind: &str, dest_dir: &Path) -> String {
    if install_kind == "installer" {
        format!(
            "Системний інсталятор · кеш {}",
            installer_cache_root().display()
        )
    } else {
        dest_dir.display().to_string()
    }
}

fn ensure_writable_dir(dir: &Path, install_kind: &str) -> Result<(), String> {
    fs::create_dir_all(dir)
        .map_err(|error| format!("Не вдалося підготувати папку {}: {}", dir.display(), error))?;

    let test_file = dir.join(".pullora-write-test.tmp");
    fs::write(&test_file, b"ok").map_err(|error| {
        if install_kind == "installer" {
            format!(
                "Pullora не може записати installer-кеш {}. Перевір права доступу або запусти програму ще раз: {}",
                dir.display(),
                error
            )
        } else {
            format!(
                "Папка встановлення {} недоступна для запису. Обери іншу папку в Налаштуваннях, наприклад Documents\\Pullora Apps: {}",
                dir.display(),
                error
            )
        }
    })?;
    let _ = fs::remove_file(test_file);

    Ok(())
}

async fn download_task(
    app: AppHandle,
    task: DownloadTask,
    active: Arc<Mutex<Vec<DownloadProgress>>>,
    cancelled: Arc<Mutex<HashSet<String>>>,
) -> Result<(), String> {
    let DownloadTask {
        request:
            DownloadRequest {
                id,
                url,
                file_name,
                dest_dir,
                owner,
                repo,
                tag,
            },
        install_kind,
    } = task;

    let client = Client::builder()
        .user_agent("Pullora/0.1.0")
        .build()
        .map_err(|e| e.to_string())?;

    // HEAD request to get content length
    let head = client.head(&url).send().await.map_err(|e| e.to_string())?;
    let total_size = head
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);

    stop_if_cancelled(&cancelled, &id).await?;

    emit_progress(&app, &active, &id, |p| {
        p.status = DownloadStatus::Downloading;
        p.stage = DownloadStage::Downloading;
        p.total_size = total_size;
    })
    .await;

    let workspace_dir = install_workspace_dir(&install_kind, &dest_dir);
    ensure_writable_dir(&workspace_dir, &install_kind)?;
    let download_dir = workspace_dir.join(".pullora-downloads");
    std::fs::create_dir_all(&download_dir)
        .map_err(|e| format!("Не вдалося підготувати кеш завантаження Pullora: {}", e))?;
    let tmp_path = download_dir.join(format!("{}-{}", id, safe_file_name(&file_name)));

    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    let mut stream = response.bytes_stream();
    let mut out = tokio::fs::File::create(&tmp_path)
        .await
        .map_err(|e| e.to_string())?;

    let mut downloaded: u64 = 0;

    while let Some(chunk) = stream.next().await {
        if is_cancelled(&cancelled, &id).await {
            let _ = fs::remove_file(&tmp_path);
            return Err("Download canceled".to_string());
        }

        let chunk = match chunk {
            Ok(chunk) => chunk,
            Err(error) => {
                let _ = fs::remove_file(&tmp_path);
                return Err(error.to_string());
            }
        };
        if let Err(error) = tokio::io::AsyncWriteExt::write_all(&mut out, &chunk).await {
            let _ = fs::remove_file(&tmp_path);
            return Err(error.to_string());
        }
        downloaded += chunk.len() as u64;

        let progress = if total_size > 0 {
            (downloaded as f64 / total_size as f64) * 100.0
        } else {
            0.0
        };

        emit_progress(&app, &active, &id, |p| {
            p.downloaded_size = downloaded;
            p.progress = progress;
        })
        .await;
    }
    drop(out);

    if is_cancelled(&cancelled, &id).await {
        let _ = fs::remove_file(&tmp_path);
        return Err("Download canceled".to_string());
    }

    emit_progress(&app, &active, &id, |p| {
        p.stage = DownloadStage::Verifying;
        p.progress = 100.0;
    })
    .await;

    emit_progress(&app, &active, &id, |p| {
        p.status = DownloadStatus::Extracting;
        p.stage = DownloadStage::Extracting;
        p.progress = 100.0;
    })
    .await;

    let app_dir = workspace_dir.join(format!("{}-{}", owner, repo));
    let version_dir = app_dir.join(&tag);
    let partial_dir = app_dir.join(format!("{}.partial-{}", tag, id));
    let backup_dir = app_dir.join(format!("{}.backup-{}", tag, id));

    if install_kind == "installer" {
        cleanup_path(&backup_dir)?;
        if version_dir.exists() {
            fs::rename(&version_dir, &backup_dir).map_err(|e| e.to_string())?;
        }

        emit_progress(&app, &active, &id, |p| {
            p.status = DownloadStatus::Extracting;
            p.stage = DownloadStage::RunningInstaller;
            p.progress = 100.0;
        })
        .await;

        let installer_tmp_path = tmp_path.clone();
        let installer_owner = owner.clone();
        let installer_repo = repo.clone();
        let installer_file_name = file_name.clone();
        let installer_version_dir = version_dir.clone();
        let installer_started_at = SystemTime::now()
            .checked_sub(Duration::from_secs(5))
            .unwrap_or(SystemTime::UNIX_EPOCH);

        let installer_launch_result = tokio::task::spawn_blocking(move || {
            install_with_external_installer(
                &installer_tmp_path,
                &installer_version_dir,
                &installer_file_name,
            )
        })
        .await;

        match installer_launch_result {
            Ok(Ok(())) => {}
            Ok(Err(error)) => {
                let _ = fs::remove_file(&tmp_path);
                let _ = cleanup_path(&version_dir);
                let _ = restore_backup_dir(&backup_dir, &version_dir);
                return Err(error);
            }
            Err(error) => {
                let _ = fs::remove_file(&tmp_path);
                let _ = cleanup_path(&version_dir);
                let _ = restore_backup_dir(&backup_dir, &version_dir);
                return Err(error.to_string());
            }
        };

        emit_progress(&app, &active, &id, |p| {
            p.stage = DownloadStage::DetectingExecutable;
            p.progress = 100.0;
        })
        .await;

        let detect_dest_dir = dest_dir.clone();
        let detect_version_dir = version_dir.clone();
        let executable_path = match tokio::task::spawn_blocking(move || {
            wait_for_installed_executable(
                &detect_dest_dir,
                &detect_version_dir,
                &installer_owner,
                &installer_repo,
                installer_started_at,
            )
        })
        .await
        {
            Ok(Some(path)) => path,
            Ok(None) => {
                let _ = fs::remove_file(&tmp_path);
                let _ = cleanup_path(&version_dir);
                let _ = restore_backup_dir(&backup_dir, &version_dir);
                return Err("Інсталятор запущено, але Pullora не знайшла встановлений EXE. Запусти програму вручну або обери portable/архівний asset.".to_string());
            }
            Err(error) => {
                let _ = fs::remove_file(&tmp_path);
                let _ = cleanup_path(&version_dir);
                let _ = restore_backup_dir(&backup_dir, &version_dir);
                return Err(error.to_string());
            }
        };

        emit_progress(&app, &active, &id, |p| {
            p.stage = DownloadStage::Registering;
            p.executable_path = Some(executable_path.display().to_string());
            p.progress = 100.0;
        })
        .await;

        let install_record_result = record_installed_version(
            &owner,
            &repo,
            &tag,
            executable_path.display().to_string(),
            downloaded,
            file_name,
            install_kind,
        );

        if let Err(error) = install_record_result {
            let _ = fs::remove_file(&tmp_path);
            let _ = cleanup_path(&version_dir);
            let _ = restore_backup_dir(&backup_dir, &version_dir);
            return Err(error);
        }

        cleanup_path(&backup_dir)?;
        let _ = fs::remove_file(&tmp_path);

        emit_progress(&app, &active, &id, |p| {
            p.status = DownloadStatus::Completed;
            p.stage = DownloadStage::Completed;
            p.progress = 100.0;
        })
        .await;

        return Ok(());
    }

    cleanup_path(&partial_dir)?;

    let extract_tmp_path = tmp_path.clone();
    let extract_partial_dir = partial_dir.clone();
    let executable = match tokio::task::spawn_blocking(move || {
        extractor::extract(&extract_tmp_path, &extract_partial_dir)
    })
    .await
    {
        Ok(Ok(executable)) => executable,
        Ok(Err(error)) => {
            let _ = fs::remove_file(&tmp_path);
            let _ = cleanup_path(&partial_dir);
            return Err(error);
        }
        Err(error) => {
            let _ = fs::remove_file(&tmp_path);
            let _ = cleanup_path(&partial_dir);
            return Err(error.to_string());
        }
    };

    if is_cancelled(&cancelled, &id).await {
        let _ = fs::remove_file(&tmp_path);
        let _ = cleanup_path(&partial_dir);
        return Err("Download canceled".to_string());
    }

    emit_progress(&app, &active, &id, |p| {
        p.stage = DownloadStage::DetectingExecutable;
        p.progress = 100.0;
    })
    .await;

    let resolved_executable = if executable.trim().is_empty()
        || !partial_dir.join(&executable).exists()
    {
        let fallback_executable = find_executable_in_dir(&partial_dir).ok_or_else(|| {
            let _ = fs::remove_file(&tmp_path);
            let _ = cleanup_path(&partial_dir);
            "Архів не містить EXE/AppImage для запуску. Обери інший файл релізу або перевір структуру архіву.".to_string()
        })?;
        fallback_executable
            .strip_prefix(&partial_dir)
            .unwrap_or(&fallback_executable)
            .to_string_lossy()
            .to_string()
    } else {
        executable.clone()
    };

    if let Err(error) = replace_version_dir(&partial_dir, &version_dir, &backup_dir) {
        let _ = fs::remove_file(&tmp_path);
        let _ = cleanup_path(&partial_dir);
        return Err(error);
    }

    let executable_path = version_dir.join(&resolved_executable);
    if !executable_path.exists() {
        let fallback_executable = find_executable_in_dir(&version_dir).ok_or_else(|| {
            let _ = fs::remove_file(&tmp_path);
            let _ = cleanup_path(&version_dir);
            let _ = restore_backup_dir(&backup_dir, &version_dir);
            "Реліз встановлено неповністю: файл запуску не знайдено.".to_string()
        })?;
        let relative = fallback_executable
            .strip_prefix(&version_dir)
            .unwrap_or(&fallback_executable)
            .to_string_lossy()
            .to_string();
        let fallback_executable_path = fallback_executable.display().to_string();

        emit_progress(&app, &active, &id, |p| {
            p.stage = DownloadStage::Registering;
            p.executable_path = Some(fallback_executable_path);
            p.progress = 100.0;
        })
        .await;

        let install_record_result = record_installed_version(
            &owner,
            &repo,
            &tag,
            relative,
            downloaded,
            file_name.clone(),
            install_kind.clone(),
        );

        if let Err(error) = install_record_result {
            let _ = fs::remove_file(&tmp_path);
            let _ = cleanup_path(&version_dir);
            let _ = restore_backup_dir(&backup_dir, &version_dir);
            return Err(error);
        }

        cleanup_path(&backup_dir)?;
        let _ = fs::remove_file(&tmp_path);

        emit_progress(&app, &active, &id, |p| {
            p.status = DownloadStatus::Completed;
            p.stage = DownloadStage::Completed;
            p.progress = 100.0;
        })
        .await;

        return Ok(());
    }

    emit_progress(&app, &active, &id, |p| {
        p.stage = DownloadStage::Registering;
        p.executable_path = Some(executable_path.display().to_string());
        p.progress = 100.0;
    })
    .await;

    let install_record_result = record_installed_version(
        &owner,
        &repo,
        &tag,
        resolved_executable,
        downloaded,
        file_name,
        install_kind,
    );

    if let Err(error) = install_record_result {
        let _ = fs::remove_file(&tmp_path);
        let _ = cleanup_path(&version_dir);
        let _ = restore_backup_dir(&backup_dir, &version_dir);
        return Err(error);
    }

    cleanup_path(&backup_dir)?;
    let _ = fs::remove_file(&tmp_path);

    emit_progress(&app, &active, &id, |p| {
        p.status = DownloadStatus::Completed;
        p.stage = DownloadStage::Completed;
        p.progress = 100.0;
    })
    .await;

    Ok(())
}

fn record_installed_version(
    owner: &str,
    repo: &str,
    tag: &str,
    executable: String,
    downloaded: u64,
    asset_name: String,
    install_kind: String,
) -> Result<(), String> {
    let config_dir = crate::storage::get_config_dir();
    let version_info = crate::storage::installed::VersionInfo {
        tag: tag.to_string(),
        installed_at: chrono::Utc::now(),
        executable,
        size_bytes: downloaded,
        asset_name: Some(asset_name),
        install_kind: Some(install_kind),
    };
    crate::storage::installed::add_version(&config_dir, owner, repo, version_info)
        .map_err(|e| e.to_string())
}

fn install_kind_for_asset(file_name: &str) -> Result<String, String> {
    let name = file_name.to_lowercase();
    let is_installer =
        name.contains("setup") || name.contains("installer") || name.ends_with(".msi");
    if is_installer {
        return Ok("installer".to_string());
    }

    if name.ends_with(".zip")
        || name.ends_with(".tar.gz")
        || name.ends_with(".tgz")
        || name.ends_with(".tar.xz")
        || name.ends_with(".tar.bz2")
    {
        return Ok("archive".to_string());
    }

    if name.ends_with(".exe") || name.ends_with(".appimage") {
        return Ok("portable".to_string());
    }

    Err("Цей asset не підтримується для автоматичного встановлення.".to_string())
}

fn install_with_external_installer(
    installer_path: &Path,
    version_dir: &Path,
    file_name: &str,
) -> Result<(), String> {
    fs::create_dir_all(version_dir).map_err(|e| e.to_string())?;

    let installer_dir = version_dir.join(".installer");
    fs::create_dir_all(&installer_dir).map_err(|e| e.to_string())?;
    let cached_installer = installer_dir.join(safe_file_name(file_name));
    fs::copy(installer_path, &cached_installer).map_err(|e| e.to_string())?;

    run_installer_process(&cached_installer)?;
    Ok(())
}

fn run_installer_process(installer_path: &Path) -> Result<(), String> {
    let extension = installer_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase();

    let mut command = if extension == "msi" {
        let mut command = std::process::Command::new("msiexec");
        command.arg("/i").arg(installer_path);
        command
    } else {
        std::process::Command::new(installer_path)
    };

    match command.spawn() {
        Ok(mut child) => wait_for_installer_launcher(&mut child),
        Err(error) => {
            #[cfg(target_os = "windows")]
            {
                if error.raw_os_error() == Some(740) {
                    return run_elevated_installer_process(installer_path, &extension);
                }
            }

            Err(format!("Не вдалося запустити інсталятор: {}", error))
        }
    }
}

fn wait_for_installer_launcher(child: &mut std::process::Child) -> Result<(), String> {
    let deadline = Instant::now() + INSTALLER_PROCESS_WAIT_TIMEOUT;

    loop {
        match child
            .try_wait()
            .map_err(|error| format!("Не вдалося перевірити стан інсталятора: {}", error))?
        {
            Some(status) => return installer_exit_result(status),
            None if Instant::now() >= deadline => return Ok(()),
            None => std::thread::sleep(Duration::from_millis(500)),
        }
    }
}

fn installer_exit_result(status: std::process::ExitStatus) -> Result<(), String> {
    if status.success() || status.code() == Some(3010) {
        Ok(())
    } else {
        Err(format!(
            "Інсталятор завершився з кодом {}.",
            status
                .code()
                .map(|code| code.to_string())
                .unwrap_or_else(|| "невідомо".to_string())
        ))
    }
}

#[cfg(target_os = "windows")]
fn run_elevated_installer_process(installer_path: &Path, extension: &str) -> Result<(), String> {
    let script = r#"
$ErrorActionPreference = 'Stop'
$path = $env:PULLORA_INSTALLER_PATH
if ([string]::IsNullOrWhiteSpace($path)) {
  throw 'Missing installer path.'
}

if ($env:PULLORA_INSTALLER_KIND -eq 'msi') {
  $process = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', $path) -Verb RunAs -Wait -PassThru
} else {
  $process = Start-Process -FilePath $path -Verb RunAs -Wait -PassThru
}

if ($null -ne $process.ExitCode -and $process.ExitCode -ne 0 -and $process.ExitCode -ne 3010) {
  exit $process.ExitCode
}
"#;

    let mut child = std::process::Command::new("powershell")
        .arg("-NoProfile")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-Command")
        .arg(script)
        .env("PULLORA_INSTALLER_PATH", installer_path)
        .env("PULLORA_INSTALLER_KIND", extension)
        .spawn()
        .map_err(|error| {
            format!(
                "Не вдалося запустити інсталятор з правами адміністратора: {}",
                error
            )
        })?;

    wait_for_installer_launcher(&mut child)
}

fn wait_for_installed_executable(
    dest_dir: &Path,
    version_dir: &Path,
    owner: &str,
    repo: &str,
    installed_after: SystemTime,
) -> Option<PathBuf> {
    let deadline = Instant::now() + INSTALLER_DETECTION_TIMEOUT;

    loop {
        if let Some(path) =
            find_installed_executable(dest_dir, version_dir, owner, repo, installed_after)
        {
            return Some(path);
        }

        if Instant::now() >= deadline {
            return None;
        }

        std::thread::sleep(INSTALLER_DETECTION_INTERVAL);
    }
}

fn find_installed_executable(
    dest_dir: &Path,
    version_dir: &Path,
    owner: &str,
    repo: &str,
    installed_after: SystemTime,
) -> Option<PathBuf> {
    let tokens = app_tokens(owner, repo);
    let mut candidates = Vec::new();

    for root in installer_search_roots(dest_dir, version_dir, owner, repo) {
        let allow_recent_only = root == dest_dir || root == version_dir;
        scan_installed_executables(
            &root,
            0,
            7,
            &tokens,
            installed_after,
            allow_recent_only,
            &mut candidates,
        );
    }

    candidates.sort_by(|left, right| {
        right
            .0
            .cmp(&left.0)
            .then_with(|| {
                left.1
                    .components()
                    .count()
                    .cmp(&right.1.components().count())
            })
            .then_with(|| left.1.cmp(&right.1))
    });

    candidates.into_iter().map(|(_, path)| path).next()
}

fn installer_search_roots(
    dest_dir: &Path,
    version_dir: &Path,
    owner: &str,
    repo: &str,
) -> Vec<PathBuf> {
    let mut roots = vec![version_dir.to_path_buf(), dest_dir.to_path_buf()];

    let repo_dir = repo_path_name(repo);
    for variable in [
        "ProgramFiles",
        "ProgramFiles(x86)",
        "LOCALAPPDATA",
        "APPDATA",
    ] {
        if let Ok(value) = std::env::var(variable) {
            let root = PathBuf::from(value);
            if variable == "ProgramFiles" || variable == "ProgramFiles(x86)" {
                roots.push(root.clone());
            }
            roots.push(root.join(&repo_dir));
            roots.push(root.join(repo));
            if variable == "LOCALAPPDATA" {
                roots.push(root.join("Programs"));
                roots.push(root.join("Programs").join(&repo_dir));
                roots.push(root.join("Programs").join(repo));
            }
        }
    }

    if let Ok(value) = std::env::var("ProgramFiles") {
        roots.push(PathBuf::from(value).join(owner).join(repo));
    }

    roots.sort();
    roots.dedup();
    roots
}

fn scan_installed_executables(
    dir: &Path,
    depth: usize,
    max_depth: usize,
    tokens: &[String],
    installed_after: SystemTime,
    allow_recent_only: bool,
    candidates: &mut Vec<(i32, PathBuf)>,
) {
    if depth > max_depth || !dir.exists() {
        return;
    }

    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            scan_installed_executables(
                &path,
                depth + 1,
                max_depth,
                tokens,
                installed_after,
                allow_recent_only,
                candidates,
            );
            continue;
        }

        if !is_launchable_exe(&path) {
            continue;
        }

        let score = installer_candidate_score(&path, tokens, installed_after, allow_recent_only);
        if score > 0 {
            candidates.push((score, path));
        }
    }
}

fn is_launchable_exe(path: &Path) -> bool {
    let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
        return false;
    };
    if !extension.eq_ignore_ascii_case("exe") {
        return false;
    }

    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase();

    ![
        "setup",
        "install",
        "installer",
        "uninstall",
        "unins",
        "updater",
        "update",
        "crashhandler",
    ]
    .iter()
    .any(|blocked| name.contains(blocked))
}

fn installer_candidate_score(
    path: &Path,
    tokens: &[String],
    installed_after: SystemTime,
    allow_recent_only: bool,
) -> i32 {
    let path_text = path.to_string_lossy().to_lowercase();
    let file_stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase();

    let mut score = 0;
    for token in tokens {
        if token.len() < 3 {
            continue;
        }
        if file_stem.contains(token) {
            score += 80;
        }
        if path_text.contains(token) {
            score += 30;
        }
    }

    if score == 0 && !allow_recent_only {
        return 0;
    }

    if fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .map(|modified| modified >= installed_after)
        .unwrap_or(false)
    {
        score += 40;
    }

    score
}

fn app_tokens(owner: &str, repo: &str) -> Vec<String> {
    let mut tokens = vec![
        owner.to_lowercase(),
        repo.to_lowercase(),
        repo_path_name(repo),
    ];
    tokens.extend(
        repo.split(|character: char| !character.is_ascii_alphanumeric())
            .filter(|part| part.len() >= 3)
            .map(|part| part.to_lowercase()),
    );
    tokens.sort();
    tokens.dedup();
    tokens
}

fn repo_path_name(repo: &str) -> String {
    repo.chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect::<String>()
        .to_lowercase()
}

async fn emit_progress<F>(
    app: &AppHandle,
    active: &Arc<Mutex<Vec<DownloadProgress>>>,
    id: &str,
    mutate: F,
) where
    F: FnOnce(&mut DownloadProgress),
{
    let mut list = active.lock().await;
    if let Some(p) = list.iter_mut().find(|p| p.id == id) {
        mutate(p);
        let _ = app.emit("download-progress", p.clone());
    }
}

async fn is_cancelled(cancelled: &Arc<Mutex<HashSet<String>>>, id: &str) -> bool {
    let cancelled_ids = cancelled.lock().await;
    cancelled_ids.contains(id)
}

async fn stop_if_cancelled(
    cancelled: &Arc<Mutex<HashSet<String>>>,
    id: &str,
) -> Result<(), String> {
    if is_cancelled(cancelled, id).await {
        Err("Download canceled".to_string())
    } else {
        Ok(())
    }
}

fn safe_file_name(file_name: &str) -> String {
    std::path::Path::new(file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("download.bin")
        .to_string()
}

fn cleanup_path(path: &std::path::Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    if metadata.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())
    }
}

fn replace_version_dir(
    partial_dir: &std::path::Path,
    version_dir: &std::path::Path,
    backup_dir: &std::path::Path,
) -> Result<(), String> {
    cleanup_path(backup_dir)?;

    if version_dir.exists() {
        fs::rename(version_dir, backup_dir).map_err(|e| e.to_string())?;
    }

    fs::rename(partial_dir, version_dir).map_err(|e| {
        let _ = restore_backup_dir(backup_dir, version_dir);
        e.to_string()
    })
}

fn restore_backup_dir(
    backup_dir: &std::path::Path,
    version_dir: &std::path::Path,
) -> Result<(), String> {
    if !backup_dir.exists() {
        return Ok(());
    }

    cleanup_path(version_dir)?;
    fs::rename(backup_dir, version_dir).map_err(|e| e.to_string())
}

fn find_executable_in_dir(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    fn scan(dir: &std::path::Path, best: &mut Option<std::path::PathBuf>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                scan(&path, best);
            } else if path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("exe") || e.eq_ignore_ascii_case("appimage"))
                .unwrap_or(false)
            {
                let is_better = best
                    .as_ref()
                    .is_none_or(|current| path.components().count() < current.components().count());
                if is_better {
                    *best = Some(path);
                }
            }
        }
    }

    let mut best = None;
    scan(dir, &mut best);
    best
}
