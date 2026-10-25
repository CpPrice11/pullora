use std::path::{Component, Path, PathBuf};

use crate::error::command_error;

pub fn installation_root(path: &str) -> Result<PathBuf, String> {
    let root = absolute_path(Path::new(path.trim()))?;
    let root = resolve_path(&root).map_err(|_| command_error("errors.installPathUnavailable"))?;
    #[cfg(windows)]
    if is_program_files_apps(&root) {
        return resolve_path(&program_files_apps());
    }
    if root.parent().is_none()
        || (is_system_installation_path(&root) && !is_program_files_apps(&root))
    {
        return Err(command_error("errors.installPathUnsafe"));
    }
    Ok(root)
}

#[cfg(windows)]
pub fn program_files_apps() -> PathBuf {
    std::env::var_os("ProgramW6432")
        .or_else(|| std::env::var_os("ProgramFiles"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Program Files"))
        .join("Pullora")
        .join("Apps")
}

/// Only the exact managed root is selectable inside Program Files. Reject
/// junctions at every existing component instead of allowing them to redefine it.
pub fn is_program_files_apps(path: &Path) -> bool {
    #[cfg(windows)]
    {
        let expected = program_files_apps();
        let Ok(resolved) = resolve_path(&expected) else {
            return false;
        };
        let Ok(base) = std::fs::canonicalize(expected.parent().unwrap().parent().unwrap()) else {
            return false;
        };
        let canonical_expected = base.join("Pullora").join("Apps");
        let matches = |value: &Path| {
            value
                .to_string_lossy()
                .eq_ignore_ascii_case(&canonical_expected.to_string_lossy())
        };
        matches(&resolved) && resolve_path(path).is_ok_and(|p| matches(&p))
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        false
    }
}

pub fn is_program_files_descendant(path: &Path) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        let root = program_files_apps();
        is_program_files_apps(&root)
            && ensure_within(path, &root, false).is_ok()
            && path.ancestors().all(|ancestor| {
                std::fs::symlink_metadata(ancestor)
                    .map(|m| m.file_attributes() & 0x400 == 0)
                    .unwrap_or(true)
            })
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        false
    }
}

#[cfg(windows)]
fn is_system_installation_path(path: &Path) -> bool {
    [
        "SystemRoot",
        "WINDIR",
        "ProgramFiles",
        "ProgramW6432",
        "ProgramFiles(x86)",
        "ProgramData",
    ]
    .into_iter()
    .filter_map(std::env::var_os)
    .filter_map(|root| std::fs::canonicalize(root).ok())
    .any(|root| path.starts_with(root))
}

#[cfg(not(windows))]
fn is_system_installation_path(_path: &Path) -> bool {
    false
}

pub fn ensure_within(path: &Path, root: &Path, allow_root: bool) -> Result<PathBuf, String> {
    let root = resolve_path(root)?;
    let path = resolve_path(path)?;
    if !path.starts_with(&root) || (!allow_root && path == root) {
        return Err(command_error("errors.pathOutsideAllowedRoots"));
    }
    Ok(path)
}

pub fn ensure_within_any(
    path: &Path,
    roots: &[PathBuf],
    allow_root: bool,
) -> Result<PathBuf, String> {
    roots
        .iter()
        .find_map(|root| ensure_within(path, root, allow_root).ok())
        .ok_or_else(|| command_error("errors.pathOutsideAllowedRoots"))
}

pub fn safe_component(value: &str) -> String {
    let value = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();

    match value.as_str() {
        "" | "." | ".." => "_".to_string(),
        _ => value,
    }
}

fn resolve_path(path: &Path) -> Result<PathBuf, String> {
    let path = absolute_path(path)?;
    if path.exists() {
        return std::fs::canonicalize(path)
            .map_err(|_| command_error("errors.pathOutsideAllowedRoots"));
    }

    let mut ancestor = path.as_path();
    let mut tail = Vec::new();
    while !ancestor.exists() {
        let name = ancestor
            .file_name()
            .ok_or_else(|| command_error("errors.pathOutsideAllowedRoots"))?;
        tail.push(name.to_os_string());
        ancestor = ancestor
            .parent()
            .ok_or_else(|| command_error("errors.pathOutsideAllowedRoots"))?;
    }

    let mut resolved = std::fs::canonicalize(ancestor)
        .map_err(|_| command_error("errors.pathOutsideAllowedRoots"))?;
    for part in tail.into_iter().rev() {
        resolved.push(part);
    }
    Ok(resolved)
}

fn absolute_path(path: &Path) -> Result<PathBuf, String> {
    if path.as_os_str().is_empty() || !path.is_absolute() {
        return Err(command_error("errors.installPathUnsafe"));
    }

    let mut clean = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir | Component::CurDir => {
                return Err(command_error("errors.installPathUnsafe"));
            }
            _ => clean.push(component.as_os_str()),
        }
    }
    Ok(clean)
}

#[cfg(test)]
mod tests {
    use super::{ensure_within, installation_root, safe_component};

    #[test]
    fn accepts_root_and_descendant_but_rejects_sibling() {
        let base = std::env::temp_dir().join(format!("pullora-path-scope-{}", std::process::id()));
        let root = base.join("apps");
        let sibling = base.join("apps-evil");
        std::fs::create_dir_all(root.join("owner-repo")).unwrap();
        std::fs::create_dir_all(&sibling).unwrap();

        assert!(ensure_within(&root, &root, true).is_ok());
        assert!(ensure_within(&root.join("owner-repo"), &root, false).is_ok());
        assert!(ensure_within(&sibling, &root, true).is_err());
        assert!(ensure_within(&root, &root, false).is_err());

        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn rejects_relative_and_filesystem_root_install_paths() {
        assert!(installation_root("relative/apps").is_err());
        let root = std::path::Path::new(std::path::MAIN_SEPARATOR_STR)
            .display()
            .to_string();
        assert!(installation_root(&root).is_err());
    }

    #[test]
    fn makes_untrusted_values_single_path_components() {
        assert_eq!(
            safe_component("release/../../escape"),
            "release_.._.._escape"
        );
        assert_eq!(safe_component(".."), "_");
    }

    #[cfg(windows)]
    #[test]
    fn only_the_managed_program_files_root_is_selectable() {
        let root = super::program_files_apps();
        assert!(super::is_program_files_apps(&root));
        assert!(installation_root(&root.to_string_lossy()).is_ok());
        assert_eq!(
            installation_root(&root.to_string_lossy().to_ascii_lowercase()).unwrap(),
            installation_root(&root.to_string_lossy()).unwrap()
        );
        assert!(installation_root(&root.parent().unwrap().to_string_lossy()).is_err());
        assert!(installation_root(&root.join("other").to_string_lossy()).is_err());
        assert!(!super::is_program_files_descendant(&root));
        assert!(super::is_program_files_descendant(
            &root.join("owner-repo").join("v1")
        ));
        assert!(!super::is_program_files_descendant(
            &root.with_file_name("Apps-evil").join("v1")
        ));
    }

    #[cfg(windows)]
    #[test]
    fn resolves_junctions_and_rejects_system_targets() {
        fn junction(link: &std::path::Path, target: &std::path::Path) {
            let status = std::process::Command::new("cmd")
                .args(["/C", "mklink", "/J"])
                .arg(link)
                .arg(target)
                .status()
                .unwrap();
            assert!(status.success());
        }

        let base =
            std::env::temp_dir().join(format!("pullora-path-junction-{}", std::process::id()));
        let real = base.join("real");
        let linked = base.join("linked");
        std::fs::create_dir_all(&real).unwrap();
        junction(&linked, &real);

        assert_eq!(
            installation_root(&linked.join("apps").display().to_string()).unwrap(),
            std::fs::canonicalize(&real).unwrap().join("apps")
        );

        let system_link = base.join("system");
        let windows = std::path::PathBuf::from(std::env::var_os("WINDIR").unwrap());
        junction(&system_link, &windows);
        assert!(installation_root(&system_link.display().to_string()).is_err());

        std::fs::remove_dir(system_link).unwrap();
        std::fs::remove_dir(linked).unwrap();
        std::fs::remove_dir_all(base).unwrap();
    }
}
