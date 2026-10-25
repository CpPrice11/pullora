//! One native decision for automatic selection and manual/bulk download guards.
use super::installed::{list_installed, VersionInfo};
use crate::{
    error::command_error,
    github::{
        assets::{classify_install_asset_name, InstallAssetKind},
        models::Asset,
    },
};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationPlan {
    pub allowed_asset_names: Vec<String>,
    pub recommended_asset_name: Option<String>,
    pub required_format: Option<String>,
}

pub fn active_record(
    config: &Path,
    owner: &str,
    repo: &str,
) -> Result<Option<VersionInfo>, String> {
    let apps = list_installed(config).map_err(|_| command_error("errors.commandFailed"))?;
    let Some(app) = apps
        .into_iter()
        .find(|app| app.owner.eq_ignore_ascii_case(owner) && app.repo.eq_ignore_ascii_case(repo))
    else {
        return Ok(None);
    };
    app.versions
        .into_iter()
        .find(|version| version.tag == app.active_version)
        .map(Some)
        .ok_or_else(|| command_error("errors.activeVersionNotFound"))
}

fn package_format(name: &str) -> Option<InstallAssetKind> {
    let kind = classify_install_asset_name(name)?;
    Some(if name.to_ascii_lowercase().ends_with(".zip") {
        InstallAssetKind::Archive
    } else {
        kind
    })
}

fn required_format(version: Option<&VersionInfo>) -> Result<Option<InstallAssetKind>, String> {
    let Some(version) = version else {
        return Ok(None);
    };
    let kind = match version.install_kind.as_deref() {
        Some("external" | "installer") => Some(InstallAssetKind::Installer),
        Some("archive") => Some(InstallAssetKind::Archive),
        // Older portable ZIPs were recorded as portable; the original asset retains their format.
        Some("portable") => version
            .asset_name
            .as_deref()
            .and_then(package_format)
            .or(Some(InstallAssetKind::Portable)),
        _ => version.asset_name.as_deref().and_then(package_format),
    };
    kind.map(Some)
        .ok_or_else(|| command_error("errors.installFormatUnknown"))
}

fn architecture(name: &str) -> &'static str {
    let name = name.to_ascii_lowercase();
    let parts = name
        .split(|c: char| !c.is_ascii_alphanumeric())
        .collect::<Vec<_>>();
    if parts
        .iter()
        .any(|part| ["x64", "amd64", "win64"].contains(part))
        || name.contains("x86_64")
        || name.contains("x86-64")
    {
        "x64"
    } else if parts.iter().any(|part| ["arm64", "aarch64"].contains(part)) {
        "arm64"
    } else if parts
        .iter()
        .any(|part| ["x86", "ia32", "win32", "i386", "i486", "i586", "i686"].contains(part))
    {
        "x86"
    } else if parts
        .iter()
        .any(|part| ["armv7", "armhf", "arm32"].contains(part))
    {
        "arm"
    } else {
        "unknown"
    }
}

pub fn native_architecture() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        "x86" => "x86",
        _ => "unknown",
    }
}

pub fn validate_file(
    version: Option<&VersionInfo>,
    name: &str,
    target: &str,
) -> Result<(), String> {
    let format =
        package_format(name).ok_or_else(|| command_error("errors.installFormatMismatch"))?;
    if required_format(version)?.is_some_and(|required| required != format)
        || !["unknown", target].contains(&architecture(name))
    {
        return Err(command_error("errors.installFormatMismatch"));
    }
    Ok(())
}

pub fn validate_recorded_file(
    config: &Path,
    owner: &str,
    repo: &str,
    name: &str,
) -> Result<(), String> {
    let current = active_record(config, owner, repo)?;
    validate_file(current.as_ref(), name, native_architecture())
}

pub fn plan(
    assets: &[Asset],
    version: Option<&VersionInfo>,
    target: &str,
) -> Result<InstallationPlan, String> {
    let required = required_format(version)?;
    let mut candidates = assets
        .iter()
        .filter(|asset| validate_file(version, &asset.name, target).is_ok())
        .collect::<Vec<_>>();
    let score = |asset: &&Asset| {
        let rank = match package_format(&asset.name).unwrap() {
            InstallAssetKind::Portable => {
                if asset.name.to_ascii_lowercase().contains("portable") {
                    0
                } else {
                    1
                }
            }
            InstallAssetKind::Archive => {
                if asset.name.to_ascii_lowercase().contains("portable") {
                    0
                } else {
                    2
                }
            }
            InstallAssetKind::Installer => 3,
        };
        rank * 10 + usize::from(architecture(&asset.name) != target)
    };
    candidates.sort_by_key(score);
    let recommended = candidates
        .first()
        .filter(|_| candidates.len() == 1 || score(&candidates[0]) < score(&candidates[1]))
        .map(|asset| asset.name.clone());
    Ok(InstallationPlan {
        allowed_asset_names: candidates.iter().map(|asset| asset.name.clone()).collect(),
        recommended_asset_name: recommended,
        required_format: required.map(|kind| kind.as_install_kind().to_string()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn asset(name: &str) -> Asset {
        Asset {
            id: 1,
            name: name.into(),
            browser_download_url: String::new(),
            size: 0,
            content_type: String::new(),
            download_count: 0,
            digest: None,
        }
    }
    fn version(kind: &str, name: &str) -> VersionInfo {
        VersionInfo {
            tag: "v1".into(),
            installed_at: chrono::Utc::now(),
            executable: "App.exe".into(),
            size_bytes: 0,
            asset_name: Some(name.into()),
            install_kind: Some(kind.into()),
            install_dir: None,
        }
    }
    #[test]
    fn preserves_installer_portable_and_zip_in_every_entry_point() {
        let assets = [
            asset("App-x64-portable.exe"),
            asset("App-x64-setup.exe"),
            asset("App-x64-portable.zip"),
            asset("App-arm64-setup.exe"),
        ];
        for (kind, previous, expected) in [
            ("installer", "Old-setup.exe", "App-x64-setup.exe"),
            ("external", "App.exe", "App-x64-setup.exe"),
            ("portable", "Old-setup.exe", "App-x64-setup.exe"),
            ("portable", "Old.exe", "App-x64-portable.exe"),
            ("archive", "Old.zip", "App-x64-portable.zip"),
            ("portable", "Old-portable.zip", "App-x64-portable.zip"),
        ] {
            let version = version(kind, previous);
            let result = plan(&assets, Some(&version), "x64").unwrap();
            assert_eq!(result.recommended_asset_name.as_deref(), Some(expected));
            assert_eq!(result.allowed_asset_names, [expected]);
            for asset in &assets {
                assert_eq!(
                    validate_file(Some(&version), &asset.name, "x64").is_ok(),
                    asset.name == expected
                );
            }
        }
    }
    #[test]
    fn missing_format_never_falls_back_and_ambiguity_needs_a_choice() {
        let installed = version("installer", "Old.msi");
        assert!(plan(
            &[asset("App.exe"), asset("App.zip")],
            Some(&installed),
            "x64"
        )
        .unwrap()
        .allowed_asset_names
        .is_empty());
        assert_eq!(
            plan(
                &[asset("A-setup.exe"), asset("B.msi")],
                Some(&installed),
                "x64"
            )
            .unwrap()
            .recommended_asset_name,
            None
        );
        assert_eq!(
            plan(
                &[asset("App-x64-portable.exe"), asset("App-setup.exe")],
                None,
                "x64"
            )
            .unwrap()
            .recommended_asset_name
            .as_deref(),
            Some("App-x64-portable.exe")
        );
        for name in [
            "App-arm64.exe",
            "App-linux.zip",
            "App-update.zip",
            "App-setup.zip",
            "App-src.zip",
        ] {
            assert!(plan(&[asset(name)], None, "x64")
                .unwrap()
                .allowed_asset_names
                .is_empty());
        }
    }

    #[test]
    fn rechecks_the_saved_type_instead_of_trusting_a_stale_ui_plan() {
        let root = std::env::temp_dir().join(format!("pullora-format-{}", uuid::Uuid::new_v4()));
        super::super::installed::add_version(
            &root,
            "CpPrice11",
            "demo",
            version("portable", "Old.exe"),
        )
        .unwrap();
        assert!(validate_recorded_file(&root, "cpprice11", "DEMO", "App.exe").is_ok());
        super::super::installed::add_version(
            &root,
            "CpPrice11",
            "demo",
            version("installer", "Old-setup.exe"),
        )
        .unwrap();
        assert!(validate_recorded_file(&root, "CpPrice11", "demo", "App.exe").is_err());
        assert!(validate_recorded_file(&root, "CpPrice11", "demo", "App-setup.exe").is_ok());
        std::fs::remove_dir_all(root).unwrap();
    }
}
