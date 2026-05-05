use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};

pub fn extract(archive_path: &Path, dest_dir: &Path) -> Result<String, String> {
    fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;

    let name = archive_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();

    if name.ends_with(".zip") {
        extract_zip(archive_path, dest_dir)
    } else if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
        extract_tar_gz(archive_path, dest_dir)
    } else if name.ends_with(".tar.xz") || name.ends_with(".tar.bz2") {
        extract_tar(archive_path, dest_dir)
    } else {
        let dest = dest_dir.join(archive_path.file_name().unwrap());
        fs::copy(archive_path, &dest).map_err(|e| e.to_string())?;
        make_executable(&dest)?;
        Ok(dest.file_name().unwrap().to_string_lossy().to_string())
    }
}

fn extract_zip(archive_path: &Path, dest_dir: &Path) -> Result<String, String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    let mut main_exe: Option<(String, u8)> = None;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let Some(safe_path) = entry.enclosed_name() else {
            return Err(format!("Archive contains an unsafe path: {}", entry.name()));
        };
        let entry_name = safe_path.to_string_lossy().to_string();
        let out_path = dest_dir.join(&safe_path);

        if entry.is_dir() {
            fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out = fs::File::create(&out_path).map_err(|e| e.to_string())?;
            io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
            make_executable(&out_path).ok();

            let score = executable_score(&entry_name);
            if score > 0 && main_exe.as_ref().map_or(true, |(_, s)| score > *s) {
                main_exe = Some((entry_name, score));
            }
        }
    }

    Ok(main_exe.map(|(name, _)| name).unwrap_or_default())
}

fn extract_tar_gz(archive_path: &Path, dest_dir: &Path) -> Result<String, String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let gz = flate2::read::GzDecoder::new(file);
    extract_tar_from_reader(gz, dest_dir)
}

fn extract_tar(archive_path: &Path, dest_dir: &Path) -> Result<String, String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    extract_tar_from_reader(file, dest_dir)
}

fn extract_tar_from_reader<R: io::Read>(reader: R, dest_dir: &Path) -> Result<String, String> {
    let mut archive = tar::Archive::new(reader);
    let mut main_exe: Option<(String, u8)> = None;

    for entry in archive.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path().map_err(|e| e.to_string())?.into_owned();
        let safe_path = safe_relative_path(&path)?;
        let out_path = dest_dir.join(&safe_path);

        if entry.header().entry_type().is_dir() {
            fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            entry.unpack(&out_path).map_err(|e| e.to_string())?;
            make_executable(&out_path).ok();

            let name = safe_path.to_string_lossy().to_string();
            let score = executable_score(&name);
            if score > 0 && main_exe.as_ref().map_or(true, |(_, s)| score > *s) {
                main_exe = Some((name, score));
            }
        }
    }

    Ok(main_exe.map(|(name, _)| name).unwrap_or_default())
}

fn executable_score(name: &str) -> u8 {
    let lower = name.to_lowercase();
    if lower.ends_with(".exe") && !lower.contains('/') && !lower.contains('\\') {
        2
    } else if lower.ends_with(".exe") || lower.ends_with(".appimage") {
        1
    } else {
        0
    }
}

fn safe_relative_path(path: &Path) -> Result<PathBuf, String> {
    let mut safe = PathBuf::new();

    for component in path.components() {
        match component {
            Component::Normal(part) => safe.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(format!(
                    "Archive contains an unsafe path: {}",
                    path.display()
                ));
            }
        }
    }

    if safe.as_os_str().is_empty() {
        Err("Archive contains an empty path".to_string())
    } else {
        Ok(safe)
    }
}

#[cfg(unix)]
fn make_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = fs::metadata(path).map_err(|e| e.to_string())?.permissions();
    perms.set_mode(perms.mode() | 0o755);
    fs::set_permissions(path, perms).map_err(|e| e.to_string())
}

#[cfg(not(unix))]
fn make_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}
