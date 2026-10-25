use crate::{
    error::command_error,
    github::{
        assets::{
            checksum_entry, normalize_sha256 as digest, validate_versioned_release_asset_url,
        },
        models::Release,
        public_release::{manifest_text, public_client},
        GitHubClient,
    },
};
use sha2::{Digest, Sha256};
use std::{io::Read, path::Path};

pub fn manifest_digest(text: &str, file_name: &str, individual: bool) -> Result<String, String> {
    let mut found = None;
    for line in text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
    {
        let value = checksum_entry(line)
            .filter(|(name, _)| *name == file_name)
            .map(|(_, hash)| hash)
            .or_else(|| (individual && !line.contains(char::is_whitespace)).then_some(line));
        if let Some(value) = value {
            let value = digest(value)?;
            if found.as_ref().is_some_and(|previous| previous != &value) {
                return Err(command_error("errors.appChecksumInvalid"));
            }
            found = Some(value);
        }
    }
    found.ok_or_else(|| command_error("errors.appChecksumInvalid"))
}

pub async fn release_digest(
    client: &GitHubClient,
    owner: &str,
    repo: &str,
    tag: &str,
    name: &str,
) -> Result<Option<String>, String> {
    let releases = client.get_releases(owner, repo, false).await?;
    let release: &Release = releases
        .iter()
        .find(|r| !r.draft && r.tag_name == tag)
        .ok_or_else(|| command_error("errors.releaseAssetSource"))?;
    let asset = release
        .assets
        .iter()
        .find(|a| a.name == name)
        .ok_or_else(|| command_error("errors.releaseAssetSource"))?;
    if let Some(value) = &asset.digest {
        let value = value
            .strip_prefix("sha256:")
            .ok_or_else(|| command_error("errors.appChecksumInvalid"))?;
        return digest(value).map(Some);
    }
    let individual = format!("{name}.sha256");
    let manifest = release
        .assets
        .iter()
        .find(|a| a.name == individual)
        .or_else(|| {
            release.assets.iter().find(|a| {
                matches!(
                    a.name.to_ascii_lowercase().as_str(),
                    "sha256sums.txt" | "sha256sums" | "checksums.sha256"
                )
            })
        });
    let Some(manifest) = manifest else {
        return Ok(None);
    };
    validate_versioned_release_asset_url(
        &manifest.browser_download_url,
        owner,
        repo,
        tag,
        &manifest.name,
    )?;
    const LIMIT: usize = 128 * 1024;
    if manifest.size > LIMIT as u64 {
        return Err(command_error("errors.appChecksumInvalid"));
    }
    let text = manifest_text(&public_client()?, &manifest.browser_download_url)
        .await?
        .ok_or_else(|| command_error("errors.appChecksumUnavailable"))?;
    manifest_digest(
        text.trim_start_matches('\u{feff}'),
        name,
        manifest.name == individual,
    )
    .map(Some)
}

pub fn verify_file(path: &Path, expected: &str) -> Result<(), String> {
    let expected = digest(expected)?;
    let mut file =
        std::fs::File::open(path).map_err(|_| command_error("errors.appChecksumUnavailable"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|_| command_error("errors.appChecksumUnavailable"))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    if format!("{:x}", hasher.finalize()) != expected {
        return Err(command_error("errors.appChecksumMismatch"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn takes_digest_from_matching_github_metadata() {
        let path = std::env::temp_dir().join(format!(
            "pullora-digest-source-{}.json",
            uuid::Uuid::new_v4()
        ));
        let hash = "a".repeat(64);
        let json = serde_json::json!({ "version":2, "owner_repositories":{}, "releases":{
            "releases:owner/repo": {"cached_at":chrono::Utc::now().to_rfc3339(),"ttl_seconds":3600,"etag":null,"data":[{
                "id":1,"tag_name":"v1","name":null,"html_url":null,"draft":false,"prerelease":false,"published_at":null,"body":null,
                "assets":[{"id":1,"name":"App.exe","browser_download_url":"https://github.com/owner/repo/releases/download/v1/App.exe",
                "size":3,"content_type":"application/octet-stream","download_count":0,"digest":format!("sha256:{hash}")}]
            }]}
        }});
        std::fs::write(&path, serde_json::to_vec(&json).unwrap()).unwrap();
        let client = GitHubClient::new(None, path.clone());
        assert_eq!(
            release_digest(&client, "owner", "repo", "v1", "App.exe")
                .await
                .unwrap(),
            Some(hash)
        );
        assert!(release_digest(&client, "owner", "repo", "v2", "App.exe")
            .await
            .is_err());
        assert!(release_digest(&client, "owner", "repo", "v1", "Other.exe")
            .await
            .is_err());
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn binds_manifest_to_the_exact_file_and_detects_tampering() {
        let hash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        assert_eq!(
            manifest_digest(&format!("{hash} *My App.exe"), "My App.exe", false).unwrap(),
            hash
        );
        assert_eq!(
            manifest_digest(
                &format!("SHA256 (My App.exe) = {hash}"),
                "My App.exe",
                false
            )
            .unwrap(),
            hash
        );
        assert!(manifest_digest(&format!("{hash} Other.exe"), "My App.exe", false).is_err());
        assert!(manifest_digest(
            &format!("{hash} App.exe\n{} App.exe", "0".repeat(64)),
            "App.exe",
            false
        )
        .is_err());
        let path = std::env::temp_dir().join(format!("pullora-sha-{}", uuid::Uuid::new_v4()));
        std::fs::write(&path, b"abc").unwrap();
        assert!(verify_file(&path, hash).is_ok());
        std::fs::write(&path, b"changed").unwrap();
        assert!(verify_file(&path, hash).is_err());
        std::fs::remove_file(path).unwrap();
    }
}
