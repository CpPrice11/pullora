//! Read Windows installer registrations for the fixed CpPrice11 catalog only.
use crate::error::command_error;
use serde::Serialize;
use std::{
    io::Read,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedInstallation {
    pub owner: String,
    pub repo: String,
    pub version: String,
    pub executable_path: String,
    pub install_dir: String,
}

fn normalized(value: &str) -> String {
    value
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .flat_map(char::to_lowercase)
        .collect()
}

fn repo_for_name(name: &str) -> Option<&'static str> {
    match normalized(name).as_str() {
        "steamachievementmanager" => Some("steam-achievement-manager"),
        "fandomwikitranslator" => Some("fandom-translator"),
        "recycledesk" => Some("recycle-desk"),
        _ => None,
    }
}

fn expected_names(repo: &str) -> &'static [&'static str] {
    match repo {
        "steam-achievement-manager" => &[
            "Steam Achievement Manager.exe",
            "SteamAchievementManager.exe",
        ],
        "fandom-translator" => &["Fandom Wiki Translator.exe"],
        "recycle-desk" => &["recycle-desk.exe", "RecycleDesk.exe"],
        _ => &[],
    }
}

pub fn external_executable(owner: &str, repo: &str, value: &str) -> Result<PathBuf, String> {
    if !owner.eq_ignore_ascii_case("CpPrice11") {
        return Err(command_error("errors.discoveryInvalid"));
    }
    let path = Path::new(value);
    if !path.is_absolute()
        || !expected_names(&repo.to_ascii_lowercase())
            .iter()
            .any(|name| {
                path.file_name()
                    .is_some_and(|file| normalized(&file.to_string_lossy()) == normalized(name))
            })
    {
        return Err(command_error("errors.discoveryInvalid"));
    }
    #[cfg(windows)]
    if !matches!(path.components().next(), Some(std::path::Component::Prefix(p)) if matches!(p.kind(), std::path::Prefix::Disk(_) | std::path::Prefix::VerbatimDisk(_)))
    {
        return Err(command_error("errors.discoveryInvalid"));
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        for ancestor in path.ancestors().collect::<Vec<_>>().into_iter().rev() {
            let metadata = std::fs::symlink_metadata(ancestor)
                .map_err(|_| command_error("errors.discoveryInvalid"))?;
            if metadata.file_attributes() & 0x400 != 0 {
                return Err(command_error("errors.discoveryInvalid"));
            }
        }
    }
    let path = std::fs::canonicalize(path).map_err(|_| command_error("errors.discoveryInvalid"))?;
    if path.parent().and_then(Path::parent).is_none() {
        return Err(command_error("errors.discoveryInvalid"));
    }
    if let Some(system) = std::env::var_os("SystemRoot").and_then(|p| std::fs::canonicalize(p).ok())
    {
        if path.starts_with(system) {
            return Err(command_error("errors.discoveryInvalid"));
        }
    }
    let mut signature = [0; 2];
    std::fs::File::open(&path)
        .and_then(|mut file| file.read_exact(&mut signature))
        .map_err(|_| command_error("errors.discoveryInvalid"))?;
    if signature != *b"MZ" {
        return Err(command_error("errors.discoveryInvalid"));
    }
    Ok(path)
}

fn icon_path(value: &str) -> Option<PathBuf> {
    let value = value.trim();
    let value = if let Some(quoted) = value.strip_prefix('"') {
        quoted.split_once('"')?.0
    } else if let Some((path, index)) = value.rsplit_once(',') {
        if index.trim().parse::<i32>().is_ok() {
            path
        } else {
            value
        }
    } else {
        value
    };
    Some(PathBuf::from(value))
}

fn version_tag(version: &str) -> Option<String> {
    let value = version.trim().trim_start_matches('v');
    (value.len() <= 64
        && value.as_bytes().first().is_some_and(u8::is_ascii_digit)
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b".-+_".contains(&c)))
    .then(|| format!("v{value}"))
}

#[cfg(not(windows))]
pub fn discover() -> Result<Vec<DetectedInstallation>, String> {
    Ok(Vec::new())
}

#[cfg(windows)]
pub fn discover() -> Result<Vec<DetectedInstallation>, String> {
    use windows_sys::Win32::{
        Foundation::{ERROR_NO_MORE_ITEMS, ERROR_SUCCESS},
        System::Registry::*,
    };
    struct Key(HKEY);
    impl Drop for Key {
        fn drop(&mut self) {
            unsafe {
                RegCloseKey(self.0);
            }
        }
    }
    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(Some(0)).collect()
    }
    fn read(key: HKEY, name: &str) -> String {
        let name = wide(name);
        let mut size = 0;
        if unsafe {
            RegGetValueW(
                key,
                std::ptr::null(),
                name.as_ptr(),
                RRF_RT_REG_SZ,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut size,
            )
        } != ERROR_SUCCESS
            || size > 16384
            || size % 2 != 0
        {
            return String::new();
        }
        let mut value = vec![0u16; size as usize / 2];
        if unsafe {
            RegGetValueW(
                key,
                std::ptr::null(),
                name.as_ptr(),
                RRF_RT_REG_SZ,
                std::ptr::null_mut(),
                value.as_mut_ptr().cast(),
                &mut size,
            )
        } != ERROR_SUCCESS
        {
            return String::new();
        }
        String::from_utf16_lossy(
            &value[..value.iter().position(|c| *c == 0).unwrap_or(value.len())],
        )
    }
    let mut found = Vec::new();
    for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        for view in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
            let mut base = std::ptr::null_mut();
            if unsafe {
                RegOpenKeyExW(
                    root,
                    wide(r"Software\Microsoft\Windows\CurrentVersion\Uninstall").as_ptr(),
                    0,
                    KEY_READ | view,
                    &mut base,
                )
            } != ERROR_SUCCESS
            {
                continue;
            }
            let base = Key(base);
            for index in 0..4096 {
                let mut name = [0u16; 256];
                let mut size = name.len() as u32;
                let code = unsafe {
                    RegEnumKeyExW(
                        base.0,
                        index,
                        name.as_mut_ptr(),
                        &mut size,
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                    )
                };
                if code == ERROR_NO_MORE_ITEMS {
                    break;
                }
                if code != ERROR_SUCCESS {
                    continue;
                }
                let mut key = std::ptr::null_mut();
                if unsafe { RegOpenKeyExW(base.0, name.as_ptr(), 0, KEY_READ | view, &mut key) }
                    != ERROR_SUCCESS
                {
                    continue;
                }
                let key = Key(key);
                let Some(repo) = repo_for_name(&read(key.0, "DisplayName")) else {
                    continue;
                };
                let publisher = normalized(&read(key.0, "Publisher"));
                if !publisher.is_empty()
                    && !["cpprice11", "fandomtranslator"].contains(&publisher.as_str())
                {
                    continue;
                }
                let Some(version) = version_tag(&read(key.0, "DisplayVersion")) else {
                    continue;
                };
                let mut candidates = icon_path(&read(key.0, "DisplayIcon"))
                    .into_iter()
                    .collect::<Vec<_>>();
                let location = read(key.0, "InstallLocation");
                if !location.is_empty() {
                    candidates.extend(
                        expected_names(repo)
                            .iter()
                            .map(|name| Path::new(&location).join(name)),
                    );
                }
                let Some(path) = candidates.into_iter().find_map(|path| {
                    external_executable("CpPrice11", repo, &path.to_string_lossy()).ok()
                }) else {
                    continue;
                };
                let executable_path = path.to_string_lossy().to_string();
                if found.iter().any(|item: &DetectedInstallation| {
                    item.executable_path.eq_ignore_ascii_case(&executable_path)
                }) {
                    continue;
                }
                found.push(DetectedInstallation {
                    owner: "CpPrice11".into(),
                    repo: repo.into(),
                    version,
                    executable_path,
                    install_dir: path.parent().unwrap().to_string_lossy().to_string(),
                });
            }
        }
    }
    Ok(found)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn reads_real_windows_registrations_without_modifying_them() {
        let apps = discover().unwrap();
        for app in &apps {
            assert!(expected_names(&app.repo).len() > 0);
            assert!(external_executable(&app.owner, &app.repo, &app.executable_path).is_ok());
            assert!(app.version.starts_with('v'));
        }
        eprintln!(
            "Discovery registry smoke: {} validated candidates",
            apps.len()
        );
    }
    #[test]
    fn accepts_only_catalog_names_exact_paths_and_sane_versions() {
        assert_eq!(
            repo_for_name("Steam Achievement Manager"),
            Some("steam-achievement-manager")
        );
        assert_eq!(repo_for_name("Other Steam Manager"), None);
        assert_eq!(version_tag("1.2.3"), Some("v1.2.3".into()));
        assert!(version_tag("1.2 /run").is_none());
        assert_eq!(
            icon_path(r#""C:\App, Inc\App.exe",0"#).unwrap(),
            PathBuf::from(r"C:\App, Inc\App.exe")
        );
        assert!(external_executable("other", "recycle-desk", r"C:\App\recycle-desk.exe").is_err());
        assert!(external_executable("CpPrice11", "recycle-desk", r"C:\App\setup.exe").is_err());
    }
}
