use std::path::{Component, Path, PathBuf};

use crate::error::command_error;

pub fn installation_root(path: &str) -> Result<PathBuf, String> {
    let root = absolute_path(Path::new(path.trim()))?;
    if root.parent().is_none() {
        return Err(command_error("errors.installPathUnsafe"));
    }

    if root.exists() {
        std::fs::canonicalize(root).map_err(|_| command_error("errors.installPathUnavailable"))
    } else {
        Ok(root)
    }
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
}
