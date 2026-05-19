use futures_util::StreamExt;
use reqwest::Client;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use super::extractor;

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
    DetectingExecutable,
    Registering,
    Completed,
    Failed,
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
        id: String,
        url: String,
        file_name: String,
        dest_dir: PathBuf,
        owner: String,
        repo: String,
        tag: String,
    ) -> Result<String, String> {
        let install_kind = install_kind_for_asset(&file_name)?;
        let active = self.active.clone();
        let cancelled = self.cancelled.clone();

        let progress = DownloadProgress {
            id: id.clone(),
            file_name: file_name.clone(),
            downloaded_size: 0,
            total_size: 0,
            progress: 0.0,
            status: DownloadStatus::Pending,
            stage: DownloadStage::Queued,
            owner: Some(owner.clone()),
            repo: Some(repo.clone()),
            tag: Some(tag.clone()),
            install_path: Some(dest_dir.display().to_string()),
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
        tokio::spawn(async move {
            log_download_event(&owner, &repo, &tag, "download started");

            let result = download_task(
                app.clone(),
                id_clone.clone(),
                url,
                file_name,
                dest_dir,
                owner.clone(),
                repo.clone(),
                tag.clone(),
                install_kind,
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

async fn download_task(
    app: AppHandle,
    id: String,
    url: String,
    file_name: String,
    dest_dir: PathBuf,
    owner: String,
    repo: String,
    tag: String,
    install_kind: String,
    active: Arc<Mutex<Vec<DownloadProgress>>>,
    cancelled: Arc<Mutex<HashSet<String>>>,
) -> Result<(), String> {
    let client = Client::builder()
        .user_agent("Air-Launcher/0.1.0")
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

    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let download_dir = dest_dir.join(".air-launcher-downloads");
    std::fs::create_dir_all(&download_dir).map_err(|e| e.to_string())?;
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

    let app_dir = dest_dir.join(format!("{}-{}", owner, repo));
    let version_dir = app_dir.join(&tag);
    let partial_dir = app_dir.join(format!("{}.partial-{}", tag, id));
    let backup_dir = app_dir.join(format!("{}.backup-{}", tag, id));

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

    let resolved_executable = if executable.trim().is_empty() || !partial_dir.join(&executable).exists() {
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
    if false {
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
        return Err(
            "Setup/MSI assets не встановлюються як portable-версії. Обери portable EXE або архів."
                .to_string(),
        );
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
                let is_better = best.as_ref().map_or(true, |current| {
                    path.components().count() < current.components().count()
                });
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
