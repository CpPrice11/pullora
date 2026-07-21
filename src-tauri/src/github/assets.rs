use crate::error::command_error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallAssetKind {
    Portable,
    Installer,
    Archive,
}

impl InstallAssetKind {
    pub fn as_install_kind(self) -> &'static str {
        match self {
            Self::Portable => "portable",
            Self::Installer => "installer",
            Self::Archive => "archive",
        }
    }
}

const SOURCE_ARCHIVE_NAMES: [&str; 3] = ["source code", "source-code", "source_code"];

pub fn validate_release_asset_url(url: &str, owner: &str, repo: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| command_error("errors.invalidUrl"))?;
    let segments = parsed
        .path_segments()
        .map(|segments| segments.collect::<Vec<_>>())
        .unwrap_or_default();

    let trusted = parsed.scheme() == "https"
        && parsed.host_str() == Some("github.com")
        && parsed.port_or_known_default() == Some(443)
        && segments.len() >= 6
        && segments[0].eq_ignore_ascii_case(owner)
        && segments[1].eq_ignore_ascii_case(repo)
        && segments[2] == "releases"
        && segments[3] == "download";

    trusted
        .then_some(())
        .ok_or_else(|| command_error("errors.releaseAssetSource"))
}

pub fn validate_versioned_release_asset_url(
    url: &str,
    owner: &str,
    repo: &str,
    version: &str,
    asset_name: &str,
) -> Result<(), String> {
    validate_release_asset_url(url, owner, repo)?;
    let parsed = reqwest::Url::parse(url).map_err(|_| command_error("errors.invalidUrl"))?;
    let segments = parsed
        .path_segments()
        .map(|segments| segments.collect::<Vec<_>>())
        .unwrap_or_default();

    (segments.len() == 6 && segments[4] == version && segments[5] == asset_name)
        .then_some(())
        .ok_or_else(|| command_error("errors.releaseAssetSource"))
}

pub fn classify_install_asset_name(file_name: &str) -> Option<InstallAssetKind> {
    let name = file_name.trim().to_lowercase();
    if name.is_empty() {
        return None;
    }

    if SOURCE_ARCHIVE_NAMES
        .iter()
        .any(|source_name| name.contains(source_name))
    {
        return None;
    }

    let is_installer =
        name.contains("setup") || name.contains("installer") || name.ends_with(".msi");
    if is_installer {
        return Some(InstallAssetKind::Installer);
    }

    if name.contains("portable") {
        return Some(InstallAssetKind::Portable);
    }

    if name.ends_with(".zip") {
        return Some(InstallAssetKind::Archive);
    }

    if name.ends_with(".exe") {
        return Some(InstallAssetKind::Portable);
    }

    None
}

#[cfg(test)]
mod tests {
    use super::{
        classify_install_asset_name, validate_release_asset_url,
        validate_versioned_release_asset_url, InstallAssetKind,
    };

    #[test]
    fn classifies_supported_windows_assets() {
        assert_eq!(
            classify_install_asset_name("tool-portable.exe"),
            Some(InstallAssetKind::Portable)
        );
        assert_eq!(
            classify_install_asset_name("tool-setup.exe"),
            Some(InstallAssetKind::Installer)
        );
        assert_eq!(
            classify_install_asset_name("tool.msi"),
            Some(InstallAssetKind::Installer)
        );
        assert_eq!(
            classify_install_asset_name("tool-windows-x64.zip"),
            Some(InstallAssetKind::Archive)
        );
    }

    #[test]
    fn rejects_source_and_unsupported_assets() {
        assert_eq!(classify_install_asset_name("Source code.zip"), None);
        assert_eq!(classify_install_asset_name("source-code.zip"), None);
        assert_eq!(classify_install_asset_name("checksums.txt"), None);
        assert_eq!(classify_install_asset_name("tool.dmg"), None);
        assert_eq!(classify_install_asset_name("tool.AppImage"), None);
    }

    #[test]
    fn accepts_only_matching_github_release_assets() {
        assert!(validate_release_asset_url(
            "https://github.com/CpPrice11/pullora/releases/download/v1.0.0/Pullora.exe",
            "CpPrice11",
            "pullora",
        )
        .is_ok());
        assert!(validate_release_asset_url(
            "http://github.com/CpPrice11/pullora/releases/download/v1.0.0/Pullora.exe",
            "CpPrice11",
            "pullora",
        )
        .is_err());
        assert!(validate_release_asset_url(
            "https://example.com/CpPrice11/pullora/releases/download/v1.0.0/Pullora.exe",
            "CpPrice11",
            "pullora",
        )
        .is_err());
        assert!(validate_release_asset_url(
            "https://github.com/other/pullora/releases/download/v1.0.0/Pullora.exe",
            "CpPrice11",
            "pullora",
        )
        .is_err());
    }

    #[test]
    fn versioned_asset_must_match_tag_and_file_name() {
        let url = "https://github.com/CpPrice11/pullora/releases/download/v5.4.0/Pullora_5.4.0_portable_x64.exe";
        assert!(validate_versioned_release_asset_url(
            url,
            "CpPrice11",
            "pullora",
            "v5.4.0",
            "Pullora_5.4.0_portable_x64.exe",
        )
        .is_ok());
        assert!(validate_versioned_release_asset_url(
            url,
            "CpPrice11",
            "pullora",
            "v5.3.0",
            "Pullora_5.4.0_portable_x64.exe",
        )
        .is_err());
        assert!(validate_versioned_release_asset_url(
            url,
            "CpPrice11",
            "pullora",
            "v5.4.0",
            "other.exe",
        )
        .is_err());
    }
}
