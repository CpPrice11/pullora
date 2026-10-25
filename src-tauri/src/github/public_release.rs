//! Anonymous, bounded latest-release fallback; only packages with published hashes are offered.
use super::{
    assets::{
        checksum_entry, classify_install_asset_name, normalize_sha256,
        validate_versioned_release_asset_url,
    },
    models::{Asset, Release},
};
use crate::error::command_error;
use futures_util::StreamExt;
use reqwest::{Client, Url};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, time::Duration};

const MANIFEST_LIMIT: usize = 128 * 1024;

pub(crate) fn public_client() -> Result<Client, String> {
    // A new client deliberately carries no GitHub API Authorization header.
    Client::builder()
        .user_agent("Pullora public release check")
        .timeout(Duration::from_secs(20))
        .connect_timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            let url = attempt.url();
            let host = url.host_str().unwrap_or_default();
            if attempt.previous().len() < 5
                && url.scheme() == "https"
                && url.port_or_known_default() == Some(443)
                && url.username().is_empty()
                && url.password().is_none()
                && (host == "github.com" || host.ends_with(".githubusercontent.com"))
            {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|_| command_error("errors.appChecksumUnavailable"))
}

pub(crate) async fn manifest_text(client: &Client, url: &str) -> Result<Option<String>, String> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|_| command_error("errors.appChecksumUnavailable"))?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(command_error("errors.appChecksumUnavailable"));
    }
    if response
        .content_length()
        .is_some_and(|size| size > MANIFEST_LIMIT as u64)
    {
        return Err(command_error("errors.appChecksumInvalid"));
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| command_error("errors.appChecksumUnavailable"))?;
        if bytes.len() + chunk.len() > MANIFEST_LIMIT {
            return Err(command_error("errors.appChecksumInvalid"));
        }
        bytes.extend_from_slice(&chunk);
    }
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| command_error("errors.appChecksumInvalid"))
}

fn safe_segment(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 255
        && value != "."
        && value != ".."
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
}

fn latest_tag(url: &Url, owner: &str, repo: &str) -> Result<String, String> {
    let segments: Vec<_> = url.path_segments().into_iter().flatten().collect();
    if url.scheme() != "https"
        || url.host_str() != Some("github.com")
        || url.port_or_known_default() != Some(443)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || segments.len() != 5
        || !segments[0].eq_ignore_ascii_case(owner)
        || !segments[1].eq_ignore_ascii_case(repo)
        || segments[2] != "releases"
        || segments[3] != "tag"
        || !safe_segment(segments[4])
    {
        return Err(command_error("errors.releaseAssetSource"));
    }
    Ok(segments[4].to_owned())
}

fn from_manifest(owner: &str, repo: &str, tag: &str, text: &str) -> Result<Release, String> {
    if text.len() > MANIFEST_LIMIT || ![owner, repo, tag].into_iter().all(safe_segment) {
        return Err(command_error("errors.appChecksumInvalid"));
    }
    let mut entries = BTreeMap::new();
    for line in text
        .trim_start_matches('\u{feff}')
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
    {
        let (name, hash) =
            checksum_entry(line).ok_or_else(|| command_error("errors.appChecksumInvalid"))?;
        let hash = normalize_sha256(hash)?;
        if !safe_segment(name) {
            return Err(command_error("errors.appChecksumInvalid"));
        }
        if let Some(previous) = entries.insert(name.to_owned(), hash.clone()) {
            if previous != hash {
                return Err(command_error("errors.appChecksumInvalid"));
            }
        }
    }
    let mut assets = Vec::new();
    for (name, hash) in entries {
        if classify_install_asset_name(&name).is_none() {
            continue;
        }
        let url = format!("https://github.com/{owner}/{repo}/releases/download/{tag}/{name}");
        validate_versioned_release_asset_url(&url, owner, repo, tag, &name)?;
        // Public manifests provide no GitHub numeric IDs, sizes or timestamps.
        // These IDs are local selector keys; zero size means unknown, not an empty file.
        assets.push(Asset {
            id: assets.len() as u64 + 1,
            name,
            browser_download_url: url,
            size: 0,
            content_type: "application/octet-stream".into(),
            download_count: 0,
            digest: Some(format!("sha256:{hash}")),
        });
        if assets.len() > 64 {
            return Err(command_error("errors.appChecksumInvalid"));
        }
    }
    if assets.is_empty() {
        return Err(command_error("errors.appChecksumUnavailable"));
    }
    // Stable local selector key, restricted to 48 bits for exact JavaScript numbers.
    let id = Sha256::digest(format!("{owner}/{repo}/{tag}").as_bytes())[..6]
        .iter()
        .fold(0u64, |id, byte| (id << 8) | u64::from(*byte));
    Ok(Release {
        id,
        tag_name: tag.into(),
        name: Some(tag.into()),
        html_url: Some(format!(
            "https://github.com/{owner}/{repo}/releases/tag/{tag}"
        )),
        draft: false,
        prerelease: false,
        published_at: None,
        body: None,
        assets,
    })
}

pub(crate) async fn latest(owner: &str, repo: &str) -> Result<Release, String> {
    if ![owner, repo].into_iter().all(safe_segment) {
        return Err(command_error("errors.releaseAssetSource"));
    }
    let client = public_client()?;
    let response = client
        .get(format!("https://github.com/{owner}/{repo}/releases/latest"))
        .send()
        .await
        .map_err(|_| command_error("errors.appChecksumUnavailable"))?;
    if !response.status().is_success() {
        return Err(command_error("errors.appChecksumUnavailable"));
    }
    let tag = latest_tag(response.url(), owner, repo)?;
    drop(response); // Only the final URL is used; the HTML body is not read or parsed.
    for name in ["SHA256SUMS.txt", "SHA256SUMS", "checksums.sha256"] {
        let url = format!("https://github.com/{owner}/{repo}/releases/download/{tag}/{name}");
        if let Some(text) = manifest_text(&client, &url).await? {
            return from_manifest(owner, repo, &tag, &text);
        }
    }
    Err(command_error("errors.appChecksumUnavailable"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_only_supported_packages_from_exact_published_checksums() {
        let hash = "A".repeat(64);
        let text = format!("\u{feff}# release files\n{hash} *App-portable.exe\nSHA256 (App-x64.zip) = {hash}\n{hash} App.dmg\n{hash} App-update.zip\n");
        let release = from_manifest("owner", "repo", "v1", &text).unwrap();
        assert_eq!(release.assets.len(), 2);
        assert_eq!(release.assets[0].name, "App-portable.exe");
        assert_eq!(
            release.assets[0].digest,
            Some(format!("sha256:{}", "a".repeat(64)))
        );
        assert_eq!(release.assets[0].size, 0);
        assert!(release.published_at.is_none());
        assert!(!release.draft && !release.prerelease);
        assert!(release.id < (1u64 << 48));
        assert_ne!(
            release.id,
            from_manifest("owner", "repo", "v2", &text).unwrap().id
        );
        for asset in &release.assets {
            validate_versioned_release_asset_url(
                &asset.browser_download_url,
                "owner",
                "repo",
                "v1",
                &asset.name,
            )
            .unwrap();
        }
    }

    #[test]
    fn rejects_bad_hashes_conflicts_paths_and_missing_packages() {
        let hash = "a".repeat(64);
        for text in [
            format!("invalid App.exe"),
            format!("{hash} App.exe\n{} App.exe", "b".repeat(64)),
            format!("{hash} ../App.exe"),
            format!("{hash} App%2fother.exe"),
            format!("{hash} App.exe?redirect=evil"),
            format!("{hash} https://evil.test/App.exe"),
            format!("{hash} App.dmg"),
            String::new(),
            "x".repeat(MANIFEST_LIMIT + 1),
        ] {
            assert!(from_manifest("owner", "repo", "v1", &text).is_err());
        }
        let duplicate = from_manifest(
            "owner",
            "repo",
            "v1",
            &format!("{hash} App.exe\n{hash} App.exe"),
        )
        .unwrap();
        assert_eq!(duplicate.assets.len(), 1);
        assert!(from_manifest("owner", "../repo", "v1", &format!("{hash} App.exe")).is_err());
        let many = (0..65)
            .map(|i| format!("{hash} App{i}.exe\n"))
            .collect::<String>();
        assert!(from_manifest("owner", "repo", "v1", &many).is_err());
    }

    #[test]
    fn accepts_only_the_same_repositories_public_tag_url() {
        assert_eq!(
            latest_tag(
                &Url::parse("https://github.com/Owner/Repo/releases/tag/v1.2").unwrap(),
                "owner",
                "repo"
            )
            .unwrap(),
            "v1.2"
        );
        for value in [
            "http://github.com/owner/repo/releases/tag/v1",
            "https://github.com/other/repo/releases/tag/v1",
            "https://github.com.evil.test/owner/repo/releases/tag/v1",
            "https://github.com/login",
            "https://github.com/owner/repo/releases/tag/v1?x=1",
            "https://github.com/owner/repo/releases/tag/v1#x",
            "https://name@github.com/owner/repo/releases/tag/v1",
            "https://github.com:444/owner/repo/releases/tag/v1",
            "https://github.com/owner/repo/releases/tag/v1%2fextra",
            "https://github.com/owner/repo/releases/latest",
        ] {
            assert!(
                latest_tag(&Url::parse(value).unwrap(), "owner", "repo").is_err(),
                "{value}"
            );
        }
    }

    #[tokio::test]
    async fn bounds_manifest_responses_and_rejects_invalid_utf8() {
        use std::io::{Read, Write};
        for (headers, body, expected) in [
            ("200 OK\r\nContent-Length: 2", vec![0xff, 0xff], "invalid"),
            ("200 OK\r\nContent-Length: 131073", vec![], "invalid"),
            ("200 OK", vec![b'a'; MANIFEST_LIMIT + 1], "invalid"),
            ("404 Not Found\r\nContent-Length: 0", vec![], "missing"),
            ("403 Forbidden\r\nContent-Length: 0", vec![], "unavailable"),
            ("200 OK\r\nContent-Length: 2", b"ok".to_vec(), "ok"),
        ] {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let worker = std::thread::spawn(move || {
                let (mut socket, _) = listener.accept().unwrap();
                socket
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut request = [0; 4096];
                let count = socket.read(&mut request).unwrap();
                assert!(!String::from_utf8_lossy(&request[..count])
                    .to_ascii_lowercase()
                    .contains("authorization:"));
                write!(socket, "HTTP/1.1 {headers}\r\nConnection: close\r\n\r\n").unwrap();
                socket.write_all(&body).unwrap();
            });
            let result =
                manifest_text(&public_client().unwrap(), &format!("http://{address}/sums")).await;
            worker.join().unwrap();
            match expected {
                "ok" => assert_eq!(result.unwrap(), Some("ok".into())),
                "missing" => assert_eq!(result.unwrap(), None),
                "invalid" => assert_eq!(
                    result.unwrap_err(),
                    command_error("errors.appChecksumInvalid")
                ),
                _ => assert_eq!(
                    result.unwrap_err(),
                    command_error("errors.appChecksumUnavailable")
                ),
            }
        }
    }
}
