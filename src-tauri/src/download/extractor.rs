use std::fs;
use std::io;
use std::path::Path;

pub fn extract(archive_path: &Path, dest_dir: &Path) -> Result<String, String> {
    fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;

    let name = archive_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();

    if name.ends_with(".zip") {
        extract_zip(archive_path, dest_dir)
    } else {
        let dest = dest_dir.join(archive_path.file_name().unwrap());
        fs::copy(archive_path, &dest).map_err(|e| e.to_string())?;
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
            let score = executable_score(&entry_name);
            if score > 0 && main_exe.as_ref().is_none_or(|(_, s)| score > *s) {
                main_exe = Some((entry_name, score));
            }
        }
    }

    Ok(main_exe.map(|(name, _)| name).unwrap_or_default())
}

fn executable_score(name: &str) -> u8 {
    let lower = name.to_lowercase();
    if lower.ends_with(".exe") && !lower.contains('/') && !lower.contains('\\') {
        2
    } else if lower.ends_with(".exe") {
        1
    } else {
        0
    }
}
