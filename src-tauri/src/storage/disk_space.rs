use std::path::Path;

/// Free bytes available on the disk that hosts `path`, or `None` if the
/// platform or API call doesn't let us find out. `None` is treated as
/// "unknown" by callers and never blocks an operation on its own.
#[cfg(windows)]
pub fn available_bytes(path: &Path) -> Option<u64> {
    use std::iter::once;
    use std::os::windows::ffi::OsStrExt;

    let root = disk_root(path)?;
    let wide: Vec<u16> = root.as_os_str().encode_wide().chain(once(0)).collect();

    let mut free_bytes_available: u64 = 0;
    let succeeded = unsafe {
        GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut free_bytes_available,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };

    (succeeded != 0).then_some(free_bytes_available)
}

#[cfg(not(windows))]
pub fn available_bytes(_path: &Path) -> Option<u64> {
    None
}

#[cfg(windows)]
fn disk_root(path: &Path) -> Option<std::path::PathBuf> {
    match path.components().next()? {
        std::path::Component::Prefix(prefix) => {
            let mut root = std::path::PathBuf::from(prefix.as_os_str());
            root.push(std::path::MAIN_SEPARATOR_STR);
            Some(root)
        }
        _ => None,
    }
}

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn GetDiskFreeSpaceExW(
        lpdirectoryname: *const u16,
        lpfreebytesavailabletocaller: *mut u64,
        lptotalnumberofbytes: *mut u64,
        lptotalnumberoffreebytes: *mut u64,
    ) -> i32;
}

#[cfg(all(test, windows))]
mod tests {
    use super::{available_bytes, disk_root};

    #[test]
    fn reads_free_space_for_an_existing_drive_root() {
        let system_drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());
        let root = std::path::PathBuf::from(format!("{}\\", system_drive));

        let free = available_bytes(&root);

        assert!(free.unwrap_or(0) > 0);
    }

    #[test]
    fn resolves_the_drive_root_of_a_nested_path() {
        let path = std::path::Path::new(r"D:\Pullora\Apps\owner-repo");
        assert_eq!(disk_root(path), Some(std::path::PathBuf::from(r"D:\")));
    }

    #[test]
    fn has_no_drive_root_for_a_relative_path() {
        assert_eq!(disk_root(std::path::Path::new("relative/apps")), None);
    }
}
