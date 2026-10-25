//! Windows owns elevation. Pullora never elevates itself or changes directory ACLs.
use std::path::{Path, PathBuf};

use super::path_scope::{ensure_within, is_program_files_descendant};
use crate::error::command_error;

pub fn remove_dir(path: &Path) -> Result<(), String> {
    remove_dirs(&[path.to_path_buf()])
}

pub fn remove_dirs(paths: &[PathBuf]) -> Result<(), String> {
    let (protected, ordinary): (Vec<_>, Vec<_>) = paths
        .iter()
        .filter(|p| p.exists())
        .cloned()
        .partition(|p| is_program_files_descendant(p));
    for path in &protected {
        reject_links(path)?;
    }
    if !protected.is_empty() {
        shell_operation(&protected, None)?;
    }
    for path in ordinary {
        std::fs::remove_dir_all(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Each protected install has a fresh directory. An interrupted copy or denied
/// UAC cannot overwrite the previous registered version.
pub fn publish(source: &Path, target: &Path) -> Result<(), String> {
    if !is_program_files_descendant(target) || target.exists() {
        return Err(command_error("errors.pathOutsideAllowedRoots"));
    }
    let cache = super::get_config_dir().join("package-cache");
    let source = ensure_within(source, &cache, false)?;
    reject_links(&source)?;

    // Copy the first missing subtree, so Windows can create nested protected
    // directories in the same operation and with inherited destination ACLs.
    let mut missing = target;
    while let Some(parent) = missing.parent() {
        if parent.exists() {
            break;
        }
        missing = parent;
    }
    let parent = missing
        .parent()
        .ok_or_else(|| command_error("errors.installPathUnsafe"))?;
    let relative = target
        .strip_prefix(missing)
        .map_err(|_| command_error("errors.installPathUnsafe"))?;
    let scratch = cache.join(format!(".publish-{}", uuid::Uuid::new_v4()));
    let tree = scratch.join(
        missing
            .file_name()
            .ok_or_else(|| command_error("errors.installPathUnsafe"))?,
    );
    let staged_version = tree.join(relative);
    std::fs::create_dir_all(staged_version.parent().unwrap()).map_err(|e| e.to_string())?;
    std::fs::rename(&source, &staged_version).map_err(|e| e.to_string())?;
    let result = shell_operation(&[tree], Some(parent));
    let _ = std::fs::remove_dir_all(&scratch);
    if result.is_err() && target.exists() {
        // A denied/failed copy is never registered. If Windows also refuses its
        // cleanup, the explicit recovery action can remove the orphan later.
        if let Err(error) = remove_dir(target) {
            log::warn!("Protected install cleanup failed: {error}");
        }
    }
    result
}

fn reject_links(path: &Path) -> Result<(), String> {
    let metadata = std::fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err(command_error("errors.pathOutsideAllowedRoots"));
        }
    }
    if metadata.file_type().is_symlink() {
        return Err(command_error("errors.pathOutsideAllowedRoots"));
    }
    if metadata.is_dir() {
        for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
            reject_links(&entry.map_err(|e| e.to_string())?.path())?;
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn shell_operation(_sources: &[PathBuf], _destination: Option<&Path>) -> Result<(), String> {
    Err(command_error("errors.installPathUnavailable"))
}

#[cfg(windows)]
fn shell_operation(sources: &[PathBuf], destination: Option<&Path>) -> Result<(), String> {
    let sources = sources.to_vec();
    let destination = destination.map(Path::to_path_buf);
    // A separate STA avoids reinitializing Tauri's COM apartment. Only the
    // Windows copy engine is elevated; downloaded executables are never run here.
    std::thread::spawn(move || {
        use std::os::windows::ffi::OsStrExt;
        use windows::core::PCWSTR;
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
        };
        use windows::Win32::UI::Shell::*;
        struct Apartment;
        impl Drop for Apartment {
            fn drop(&mut self) {
                unsafe { CoUninitialize() }
            }
        }
        fn item(path: &Path) -> windows::core::Result<IShellItem> {
            let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
            unsafe { SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None) }
        }
        let run = || -> windows::core::Result<()> {
            unsafe {
                CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok()?;
                let _apartment = Apartment;
                let operation: IFileOperation = CoCreateInstance(&FileOperation, None, CLSCTX_ALL)?;
                operation.SetOperationFlags(
                    FOF_NOCONFIRMATION
                        | FOF_NOCONFIRMMKDIR
                        | FOF_SILENT
                        | FOF_NOERRORUI
                        | FOFX_EARLYFAILURE
                        | FOFX_SHOWELEVATIONPROMPT
                        | FOFX_REQUIREELEVATION
                        | FOF_NOCOPYSECURITYATTRIBS
                        | FOFX_NOCOPYHOOKS,
                )?;
                for source in &sources {
                    let source = item(source)?;
                    if let Some(destination) = &destination {
                        operation.CopyItem(&source, &item(destination)?, PCWSTR::null(), None)?;
                    } else {
                        operation.DeleteItem(&source, None)?;
                    }
                }
                operation.PerformOperations()?;
                if operation.GetAnyOperationsAborted()?.as_bool() {
                    return Err(windows::core::Error::from_hresult(windows::core::HRESULT(
                        0x800704c7u32 as i32,
                    )));
                }
            }
            Ok(())
        };
        run().map_err(|e| {
            log::warn!("Windows file operation failed: {e}");
            command_error(if e.code().0 as u32 == 0x800704c7 {
                "errors.installElevationCancelled"
            } else {
                "errors.installPathUnavailable"
            })
        })
    })
    .join()
    .map_err(|_| command_error("errors.commandFailed"))?
}
