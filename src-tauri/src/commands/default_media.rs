use futures_util::{stream, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::Path, time::Duration};
use tokio::sync::Mutex;

use crate::storage::get_config_dir;

const SOURCE: &str = "https://raw.githubusercontent.com/CpPrice11/pullora-assets/main/";
const MANIFEST_LIMIT: usize = 128 * 1024;
const IMAGE_LIMIT: usize = 4 * 1024 * 1024;
static MEDIA_LOCK: Mutex<()> = Mutex::const_new(());

#[derive(Deserialize)]
struct Manifest {
    version: u32,
    projects: BTreeMap<String, Media>,
}

#[derive(Deserialize)]
struct Media {
    icon: Option<String>,
    #[serde(default)]
    screenshots: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultProjectIcon {
    key: String,
    icon_path: String,
}

fn valid_key(key: &str) -> bool {
    let Some(repo) = key.strip_prefix("cpprice11/") else {
        return false;
    };
    !repo.is_empty()
        && repo.len() <= 100
        && repo.as_bytes()[0].is_ascii_alphanumeric()
        && repo
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"-_.".contains(&b))
}

fn valid_image_path(key: &str, path: &str) -> bool {
    let prefix = format!("media/{key}/");
    let Some(name) = path.strip_prefix(&prefix) else {
        return false;
    };
    !name.is_empty()
        && name.len() <= 120
        && name.as_bytes()[0].is_ascii_alphanumeric()
        && name
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"-_.".contains(&b))
        && [".png", ".jpg", ".jpeg", ".webp"]
            .iter()
            .any(|ext| name.ends_with(ext))
}

fn parse_manifest(bytes: &[u8]) -> Option<Manifest> {
    if bytes.len() > MANIFEST_LIMIT {
        return None;
    }
    let manifest: Manifest = serde_json::from_slice(bytes).ok()?;
    (manifest.version == 1
        && manifest.projects.len() <= 128
        && manifest.projects.iter().all(|(key, media)| {
            valid_key(key)
                && media.screenshots.len() <= 8
                && media
                    .icon
                    .iter()
                    .chain(media.screenshots.iter())
                    .all(|path| valid_image_path(key, path))
        }))
    .then_some(manifest)
}

fn valid_image(path: &str, bytes: &[u8]) -> bool {
    !bytes.is_empty()
        && bytes.len() <= IMAGE_LIMIT
        && ((path.ends_with(".png") && bytes.starts_with(b"\x89PNG\r\n\x1a\n"))
            || ((path.ends_with(".jpg") || path.ends_with(".jpeg"))
                && bytes.starts_with(b"\xff\xd8\xff"))
            || (path.ends_with(".webp")
                && bytes.starts_with(b"RIFF")
                && bytes.get(8..12) == Some(b"WEBP")))
}

fn client() -> Option<Client> {
    Client::builder()
        .user_agent("Pullora/default-media")
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(8))
        .build()
        .ok()
}

async fn download(client: &Client, path: &str, limit: usize) -> Option<Vec<u8>> {
    // Only validated relative paths from our public repository; no GitHub credentials.
    let response = client.get(format!("{SOURCE}{path}")).send().await.ok()?;
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|size| size > limit as u64)
    {
        return None;
    }
    let mut chunks = response.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(chunk) = chunks.next().await {
        let chunk = chunk.ok()?;
        if bytes.len() + chunk.len() > limit {
            return None;
        }
        bytes.extend_from_slice(&chunk);
    }
    Some(bytes)
}

async fn manifest(root: &Path, client: &Client, refresh: bool) -> Option<Manifest> {
    let file = root.join("manifest.json");
    let cached = tokio::fs::read(&file)
        .await
        .ok()
        .and_then(|bytes| parse_manifest(&bytes));
    let fresh = tokio::fs::metadata(&file)
        .await
        .ok()
        .and_then(|meta| meta.modified().ok())
        .and_then(|time| time.elapsed().ok())
        .is_some_and(|age| age < Duration::from_secs(3600));
    if !refresh && fresh && cached.is_some() {
        return cached;
    }
    if let Some(bytes) = download(client, "manifest.json", MANIFEST_LIMIT).await {
        if let Some(parsed) = parse_manifest(&bytes) {
            let _ = tokio::fs::create_dir_all(root).await;
            let temporary = root.join("manifest.tmp");
            if tokio::fs::write(&temporary, &bytes).await.is_ok() {
                let _ = tokio::fs::rename(temporary, &file).await;
            }
            return Some(parsed);
        }
    }
    cached
}

async fn image(root: &Path, client: &Client, path: &str) -> Option<String> {
    let file = root.join(path);
    if let Ok(bytes) = tokio::fs::read(&file).await {
        if valid_image(path, &bytes) {
            return Some(file.to_string_lossy().into_owned());
        }
    }
    let bytes = download(client, path, IMAGE_LIMIT).await?;
    if !valid_image(path, &bytes) {
        return None;
    }
    tokio::fs::create_dir_all(file.parent()?).await.ok()?;
    let temporary = root.join(format!("{path}.pending"));
    tokio::fs::write(&temporary, bytes).await.ok()?;
    tokio::fs::rename(temporary, &file).await.ok()?;
    Some(file.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn list_default_project_icons(refresh: Option<bool>) -> Vec<DefaultProjectIcon> {
    let _guard = MEDIA_LOCK.lock().await;
    let Some(client) = client() else {
        return vec![];
    };
    let root = get_config_dir().join("default-media");
    let Some(manifest) = manifest(&root, &client, refresh.unwrap_or(false)).await else {
        return vec![];
    };
    stream::iter(
        manifest
            .projects
            .into_iter()
            .filter_map(|(key, media)| media.icon.map(|path| (key, path))),
    )
    .map(|(key, path)| {
        let root = root.clone();
        let client = client.clone();
        async move {
            image(&root, &client, &path)
                .await
                .map(|icon_path| DefaultProjectIcon { key, icon_path })
        }
    })
    .buffered(4)
    .filter_map(|item| async { item })
    .collect()
    .await
}

#[tauri::command]
pub async fn get_default_project_screenshots(key: String) -> Vec<String> {
    if !valid_key(&key) {
        return vec![];
    }
    let _guard = MEDIA_LOCK.lock().await;
    let Some(client) = client() else {
        return vec![];
    };
    let root = get_config_dir().join("default-media");
    let Some(manifest) = manifest(&root, &client, false).await else {
        return vec![];
    };
    let Some(media) = manifest.projects.get(&key) else {
        return vec![];
    };
    stream::iter(media.screenshots.clone())
        .map(|path| {
            let root = root.clone();
            let client = client.clone();
            async move { image(&root, &client, &path).await }
        })
        .buffered(4)
        .filter_map(|item| async { item })
        .collect()
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_media_validates_manifest_paths_and_files() {
        let good = br#"{"version":1,"projects":{"cpprice11/app":{"icon":"media/cpprice11/app/icon-v1.png","screenshots":[]}}}"#;
        assert!(parse_manifest(good).is_some());
        for bad in [
            "../secret.png",
            "https://example.com/icon.png",
            "media/cpprice11/app/../../icon.png",
            "media/cpprice11/other/icon.png",
            "media/cpprice11/app/icon.svg",
            "media/cpprice11/app/%2e%2e.png",
        ] {
            assert!(!valid_image_path("cpprice11/app", bad), "{bad}");
        }
        assert!(!valid_key("../app"));
        assert!(!valid_key("another-owner/app"));
        assert!(parse_manifest(br#"{"version":2,"projects":{}}"#).is_none());
        assert!(parse_manifest(br#"{"version":1,"projects":{"cpprice11/app":{"icon":"https://example.com/icon.png"}}}"#).is_none());
        assert!(valid_image("icon-v1.png", b"\x89PNG\r\n\x1a\nimage"));
        assert!(!valid_image("icon-v1.png", b"<html>not an image</html>"));
        assert!(!valid_image("icon-v1.jpg", b"\x89PNG\r\n\x1a\nimage"));
    }
}
