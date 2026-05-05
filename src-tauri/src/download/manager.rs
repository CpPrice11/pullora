use futures_util::StreamExt;
use reqwest::Client;
use serde::Serialize;
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

pub struct DownloadManager {
    active: Arc<Mutex<Vec<DownloadProgress>>>,
}

impl DownloadManager {
    pub fn new() -> Self {
        Self {
            active: Arc::new(Mutex::new(vec![])),
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
        let active = self.active.clone();

        let progress = DownloadProgress {
            id: id.clone(),
            file_name: file_name.clone(),
            downloaded_size: 0,
            total_size: 0,
            progress: 0.0,
            status: DownloadStatus::Pending,
            error: None,
        };

        {
            let mut list = active.lock().await;
            list.retain(|p| p.id != id);
            list.push(progress.clone());
        }

        // Spawn the download task
        let id_clone = id.clone();
        let active_clone = active.clone();
        tokio::spawn(async move {
            let result = download_task(
                app.clone(),
                id_clone.clone(),
                url,
                file_name,
                dest_dir,
                owner,
                repo,
                tag,
                active_clone.clone(),
            )
            .await;

            if let Err(e) = result {
                let mut list = active_clone.lock().await;
                if let Some(p) = list.iter_mut().find(|p| p.id == id_clone) {
                    p.status = DownloadStatus::Failed;
                    p.error = Some(e.clone());
                    let _ = app.emit("download-progress", p.clone());
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
        let mut list = self.active.lock().await;
        list.retain(|p| p.id != id);
    }
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
    active: Arc<Mutex<Vec<DownloadProgress>>>,
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

    emit_progress(&app, &active, &id, |p| {
        p.status = DownloadStatus::Downloading;
        p.total_size = total_size;
    })
    .await;

    // Download to temp file
    let tmp_path = dest_dir.join(format!("__tmp_{}", &file_name));
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

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
        let chunk = chunk.map_err(|e| e.to_string())?;
        tokio::io::AsyncWriteExt::write_all(&mut out, &chunk)
            .await
            .map_err(|e| e.to_string())?;
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

    // Extract
    emit_progress(&app, &active, &id, |p| {
        p.status = DownloadStatus::Extracting;
        p.progress = 100.0;
    })
    .await;

    let version_dir = dest_dir.join(format!("{}-{}", owner, repo)).join(&tag);
    let executable =
        tokio::task::spawn_blocking(move || extractor::extract(&tmp_path, &version_dir))
            .await
            .map_err(|e| e.to_string())??;

    // Remove temp download file
    let tmp_cleanup = dest_dir.join(format!("__tmp_{}", &file_name));
    let _ = std::fs::remove_file(&tmp_cleanup);

    // Record in installed_apps.json
    let config_dir = crate::storage::get_config_dir();
    let version_info = crate::storage::installed::VersionInfo {
        tag: tag.clone(),
        installed_at: chrono::Utc::now(),
        executable: executable.clone(),
        size_bytes: downloaded,
    };
    crate::storage::installed::add_version(&config_dir, &owner, &repo, version_info)
        .map_err(|e| e.to_string())?;

    emit_progress(&app, &active, &id, |p| {
        p.status = DownloadStatus::Completed;
        p.progress = 100.0;
    })
    .await;

    Ok(())
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
