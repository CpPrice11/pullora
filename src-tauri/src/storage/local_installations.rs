//! Read-only reconciliation. Missing files never erase library metadata or settings.
use super::{
    discovery::{self, DetectedInstallation},
    installed::{self, InstalledApp, VersionInfo},
    path_scope, settings,
};
use crate::error::command_error;
use serde::Serialize;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationHealth {
    pub owner: String,
    pub repo: String,
    pub status: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationSnapshot {
    pub installed_apps: Vec<InstalledApp>,
    pub discovered_apps: Vec<DetectedInstallation>,
    pub health: Vec<InstallationHealth>,
}

pub fn recorded_executable(app: &InstalledApp, version: &VersionInfo, root: &str) -> PathBuf {
    let executable = PathBuf::from(&version.executable);
    if executable.is_absolute() {
        return executable;
    }
    version
        .install_dir
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(root)
                .join(format!(
                    "{}-{}",
                    path_scope::safe_component(&app.owner),
                    path_scope::safe_component(&app.repo)
                ))
                .join(path_scope::safe_component(&version.tag))
        })
        .join(executable)
}

fn file_status(path: &Path) -> &'static str {
    if !path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir))
    {
        return "unavailable";
    }
    #[cfg(windows)]
    if !matches!(path.components().next(), Some(Component::Prefix(prefix)) if matches!(prefix.kind(), std::path::Prefix::Disk(_) | std::path::Prefix::VerbatimDisk(_)))
    {
        return "unavailable";
    }
    for ancestor in path.ancestors().collect::<Vec<_>>().into_iter().rev() {
        match std::fs::symlink_metadata(ancestor) {
            Ok(metadata) => {
                #[cfg(windows)]
                {
                    use std::os::windows::fs::MetadataExt;
                    if metadata.file_attributes() & 0x400 != 0 {
                        return "unavailable";
                    }
                }
                if metadata.file_type().is_symlink() {
                    return "unavailable";
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return "missing",
            Err(_) => return "unavailable",
        }
    }
    match std::fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => "ready",
        Ok(_) => "missing",
        Err(_) => "unavailable",
    }
}

pub fn inspect(apps: &[InstalledApp], root: &str) -> Vec<InstallationHealth> {
    apps.iter()
        .map(|app| InstallationHealth {
            owner: app.owner.clone(),
            repo: app.repo.clone(),
            status: app
                .versions
                .iter()
                .find(|version| version.tag == app.active_version)
                .map(|version| file_status(&recorded_executable(app, version, root)))
                .unwrap_or("unavailable"),
        })
        .collect()
}

pub fn snapshot(config: &Path) -> Result<InstallationSnapshot, String> {
    let apps =
        installed::list_installed(config).map_err(|_| command_error("errors.commandFailed"))?;
    let root = settings::load_settings(config)
        .map_err(|_| command_error("errors.commandFailed"))?
        .installation_path
        .unwrap_or_default();
    let health = inspect(&apps, &root);
    let discovered = discovery::discover()?
        .into_iter()
        .filter(|candidate| can_connect(&health, &candidate.owner, &candidate.repo))
        .collect();
    Ok(InstallationSnapshot {
        installed_apps: apps,
        discovered_apps: discovered,
        health,
    })
}

pub fn can_connect(health: &[InstallationHealth], owner: &str, repo: &str) -> bool {
    !health.iter().any(|app| {
        app.owner.eq_ignore_ascii_case(owner)
            && app.repo.eq_ignore_ascii_case(repo)
            && app.status != "missing"
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn detects_removal_and_return_without_removing_records() {
        let root = std::env::temp_dir().join(format!("pullora-rescan-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let exe = root.join("Fandom Wiki Translator.exe");
        std::fs::write(&exe, b"MZ-test").unwrap();
        installed::add_version(
            &root,
            "CpPrice11",
            "fandom-translator",
            VersionInfo {
                tag: "v1".into(),
                installed_at: chrono::Utc::now(),
                executable: exe.to_string_lossy().into(),
                size_bytes: 7,
                asset_name: None,
                install_kind: Some("external".into()),
                install_dir: Some(root.to_string_lossy().into()),
            },
        )
        .unwrap();
        let apps = installed::list_installed(&root).unwrap();
        let before = std::fs::read(root.join("installed_apps.json")).unwrap();
        assert_eq!(inspect(&apps, "")[0].status, "ready");
        assert!(!can_connect(
            &inspect(&apps, ""),
            "cpprice11",
            "FANDOM-TRANSLATOR"
        ));
        std::fs::remove_file(&exe).unwrap();
        assert_eq!(inspect(&apps, "")[0].status, "missing");
        assert!(can_connect(
            &inspect(&apps, ""),
            "CpPrice11",
            "fandom-translator"
        ));
        std::fs::write(&exe, b"MZ-returned").unwrap();
        assert_eq!(inspect(&apps, "")[0].status, "ready");
        assert_eq!(
            std::fs::read(root.join("installed_apps.json")).unwrap(),
            before
        );
        assert_eq!(file_status(Path::new("relative.exe")), "unavailable");
        #[cfg(windows)]
        assert_eq!(
            file_status(Path::new(r"\\server\share\App.exe")),
            "unavailable"
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
