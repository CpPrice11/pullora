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

const ARCHIVE_EXTENSIONS: [&str; 5] = [".zip", ".tar.gz", ".tgz", ".tar.xz", ".tar.bz2"];
const SOURCE_ARCHIVE_NAMES: [&str; 3] = ["source code", "source-code", "source_code"];

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

    if name.contains("portable") || name.ends_with(".appimage") {
        return Some(InstallAssetKind::Portable);
    }

    if ARCHIVE_EXTENSIONS
        .iter()
        .any(|extension| name.ends_with(extension))
    {
        return Some(InstallAssetKind::Archive);
    }

    if name.ends_with(".exe") {
        return Some(InstallAssetKind::Portable);
    }

    None
}

pub fn is_installable_asset_name(file_name: &str) -> bool {
    classify_install_asset_name(file_name).is_some()
}

#[cfg(test)]
mod tests {
    use super::{classify_install_asset_name, InstallAssetKind};

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
        assert_eq!(
            classify_install_asset_name("tool-windows-x64.tar.gz"),
            Some(InstallAssetKind::Archive)
        );
    }

    #[test]
    fn rejects_source_and_unsupported_assets() {
        assert_eq!(classify_install_asset_name("Source code.zip"), None);
        assert_eq!(classify_install_asset_name("source-code.tar.gz"), None);
        assert_eq!(classify_install_asset_name("source_code.tar.xz"), None);
        assert_eq!(classify_install_asset_name("checksums.txt"), None);
        assert_eq!(classify_install_asset_name("tool.dmg"), None);
        assert_eq!(
            classify_install_asset_name("tool.AppImage"),
            Some(InstallAssetKind::Portable)
        );
    }

    #[test]
    fn installability_matches_classifier() {
        assert!(super::is_installable_asset_name("app.exe"));
        assert!(super::is_installable_asset_name("app-setup.exe"));
        assert!(super::is_installable_asset_name("app.msi"));
        assert!(super::is_installable_asset_name("app-windows.zip"));
        assert!(!super::is_installable_asset_name("source-code.zip"));
        assert!(!super::is_installable_asset_name("readme.md"));
    }
}
