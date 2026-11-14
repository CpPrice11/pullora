use crate::error::command_error;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppRuntimeState {
    pub owner: String,
    pub repo: String,
    pub running: bool,
    pub uncertain: bool,
}

pub fn ensure_stopped(config_dir: &std::path::Path, owner: &str, repo: &str) -> Result<(), String> {
    if let Some(status) = inspect(config_dir)?
        .into_iter()
        .find(|app| app.owner.eq_ignore_ascii_case(owner) && app.repo.eq_ignore_ascii_case(repo))
    {
        if status.uncertain {
            return Err(command_error("errors.appRuntimeUnknown"));
        }
        if status.running {
            return Err(command_error("errors.appRunning"));
        }
    }
    Ok(())
}

pub fn inspect(config_dir: &std::path::Path) -> Result<Vec<AppRuntimeState>, String> {
    let apps = super::installed::list_installed(config_dir)
        .map_err(|_| command_error("errors.commandFailed"))?;
    if apps.is_empty() {
        return Ok(Vec::new());
    }
    let root = super::settings::load_settings(config_dir)
        .map_err(|_| command_error("errors.commandFailed"))?
        .installation_path
        .unwrap_or_default();
    let targets = apps
        .iter()
        .map(|app| {
            app.versions
                .iter()
                .filter_map(|version| {
                    let executable =
                        super::local_installations::recorded_executable(app, version, &root);
                    std::fs::canonicalize(&executable)
                        .ok()
                        .or_else(|| executable.is_absolute().then_some(executable))
                })
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    let names = targets
        .iter()
        .flatten()
        .filter_map(|path| {
            path.file_name()
                .map(|s| s.to_string_lossy().to_ascii_lowercase())
        })
        .collect::<std::collections::HashSet<_>>();
    let processes = processes(&names)?;
    Ok(apps
        .into_iter()
        .zip(targets)
        .map(|(app, targets)| {
            let running = processes.iter().any(|(_, _, path)| {
                path.as_ref()
                    .is_some_and(|path| targets.iter().any(|target| same_image(path, target)))
            });
            let uncertain = processes.iter().any(|(_, name, path)| {
                path.is_none()
                    && targets.iter().any(|target| {
                        target
                            .file_name()
                            .is_some_and(|file| file.to_string_lossy().eq_ignore_ascii_case(name))
                    })
            });
            AppRuntimeState {
                owner: app.owner,
                repo: app.repo,
                running,
                uncertain,
            }
        })
        .collect())
}

fn same_image(left: &std::path::Path, right: &std::path::Path) -> bool {
    fn win32_name(path: &std::path::Path) -> Option<&str> {
        path.to_str().map(|s| s.strip_prefix(r"\\?\").unwrap_or(s))
    }
    win32_name(left)
        .zip(win32_name(right))
        .is_some_and(|(left, right)| left.eq_ignore_ascii_case(right))
}

type ProcessImage = (u32, String, Option<PathBuf>);

#[cfg(windows)]
struct Handle(windows_sys::Win32::Foundation::HANDLE);

#[cfg(windows)]
impl Drop for Handle {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

#[cfg(windows)]
fn image_path(process: &Handle) -> Option<PathBuf> {
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::System::Threading::QueryFullProcessImageNameW;
    let mut buffer = vec![0u16; 32768];
    let mut count = buffer.len() as u32;
    (unsafe { QueryFullProcessImageNameW(process.0, 0, buffer.as_mut_ptr(), &mut count) } != 0)
        .then(|| PathBuf::from(std::ffi::OsString::from_wide(&buffer[..count as usize])))
}

#[cfg(not(windows))]
pub fn stop(_targets: &[PathBuf]) -> Result<(), String> {
    Err(command_error("errors.stopFailed"))
}

#[cfg(windows)]
pub fn stop(targets: &[PathBuf]) -> Result<(), String> {
    use windows_sys::Win32::{
        Foundation::{ERROR_INVALID_PARAMETER, WAIT_OBJECT_0},
        System::Threading::{
            OpenProcess, TerminateProcess, WaitForSingleObject, PROCESS_QUERY_LIMITED_INFORMATION,
            PROCESS_SYNCHRONIZE, PROCESS_TERMINATE,
        },
    };

    let matches = |path: &std::path::Path| targets.iter().any(|target| same_image(path, target));
    let names = targets
        .iter()
        .filter_map(|path| path.file_name())
        .map(|name| name.to_string_lossy().to_ascii_lowercase())
        .collect();
    let mut denied = false;
    let mut stopping = Vec::new();
    for (pid, _, path) in processes(&names)? {
        if pid == std::process::id() || !path.as_deref().is_some_and(matches) {
            continue;
        }
        let process = unsafe {
            OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE | PROCESS_SYNCHRONIZE,
                0,
                pid,
            )
        };
        if process.is_null() {
            denied |= std::io::Error::last_os_error().raw_os_error()
                != Some(ERROR_INVALID_PARAMETER as i32);
            continue;
        }
        let process = Handle(process);
        if unsafe { WaitForSingleObject(process.0, 0) } == WAIT_OBJECT_0 {
            continue;
        }
        // Recheck the image on the same handle used to terminate, in case Windows reused the PID.
        let Some(image) = image_path(&process) else {
            denied = true;
            continue;
        };
        if !matches(&image) && !std::fs::canonicalize(&image).is_ok_and(|image| matches(&image)) {
            continue;
        }
        if unsafe { TerminateProcess(process.0, 1) } != 0 {
            stopping.push(process);
        } else if unsafe { WaitForSingleObject(process.0, 0) } != WAIT_OBJECT_0 {
            denied = true;
        }
    }
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
    for process in stopping {
        let wait_ms = deadline
            .saturating_duration_since(std::time::Instant::now())
            .as_millis() as u32;
        denied |= unsafe { WaitForSingleObject(process.0, wait_ms) } != WAIT_OBJECT_0;
    }
    if denied {
        Err(command_error("errors.stopFailed"))
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn processes(_names: &std::collections::HashSet<String>) -> Result<Vec<ProcessImage>, String> {
    Err(command_error("errors.appRuntimeUnknown"))
}

#[cfg(windows)]
fn processes(names: &std::collections::HashSet<String>) -> Result<Vec<ProcessImage>, String> {
    use windows_sys::Win32::{
        Foundation::{ERROR_NO_MORE_FILES, INVALID_HANDLE_VALUE},
        System::{
            Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
                TH32CS_SNAPPROCESS,
            },
            Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION},
        },
    };
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return Err(command_error("errors.appRuntimeUnknown"));
    }
    let snapshot = Handle(snapshot);
    let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
    let mut valid = unsafe { Process32FirstW(snapshot.0, &mut entry) };
    let mut result = Vec::new();
    while valid != 0 {
        let len = entry
            .szExeFile
            .iter()
            .position(|c| *c == 0)
            .unwrap_or(entry.szExeFile.len());
        let name = String::from_utf16_lossy(&entry.szExeFile[..len]).to_ascii_lowercase();
        if names.contains(&name) {
            let process =
                unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, entry.th32ProcessID) };
            let path = (!process.is_null())
                .then(|| Handle(process))
                .and_then(|process| image_path(&process))
                .map(|path| std::fs::canonicalize(&path).unwrap_or(path));
            result.push((entry.th32ProcessID, name, path));
        }
        valid = unsafe { Process32NextW(snapshot.0, &mut entry) };
    }
    if std::io::Error::last_os_error().raw_os_error() != Some(ERROR_NO_MORE_FILES as i32) {
        return Err(command_error("errors.appRuntimeUnknown"));
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    #[cfg(windows)]
    #[test]
    fn queries_the_real_image_of_a_child_process() {
        use std::{
            collections::HashSet,
            os::windows::process::CommandExt,
            path::PathBuf,
            process::{Command, Stdio},
        };
        let image = PathBuf::from(std::env::var_os("SystemRoot").unwrap())
            .join("System32")
            .join("ping.exe");
        struct Child(std::process::Child);
        impl Drop for Child {
            fn drop(&mut self) {
                let _ = self.0.kill();
                let _ = self.0.wait();
            }
        }
        let mut child = Child(
            Command::new(&image)
                .args(["-n", "20", "127.0.0.1"])
                .creation_flags(0x08000000)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .unwrap(),
        );
        let names = HashSet::from(["ping.exe".to_string()]);
        let expected = std::fs::canonicalize(&image).unwrap();
        assert!(super::processes(&names)
            .unwrap()
            .iter()
            .any(|(_, _, path)| path
                .as_ref()
                .is_some_and(|p| super::same_image(p, &expected))));
        let root =
            std::env::temp_dir().join(format!("pullora-running-guard-{}", uuid::Uuid::new_v4()));
        crate::storage::installed::add_version(
            &root,
            "owner",
            "probe",
            crate::storage::installed::VersionInfo {
                tag: "v1".into(),
                installed_at: chrono::Utc::now(),
                executable: image.to_string_lossy().into(),
                size_bytes: 0,
                asset_name: None,
                install_kind: Some("portable".into()),
                install_dir: Some(image.parent().unwrap().to_string_lossy().into()),
            },
        )
        .unwrap();
        assert_eq!(
            super::ensure_stopped(&root, "OWNER", "PROBE").unwrap_err(),
            "PULLORA_ERROR:errors.appRunning"
        );
        std::fs::remove_dir_all(root).unwrap();
        child.0.kill().unwrap();
        child.0.wait().unwrap();
    }
    #[test]
    fn image_identity_is_the_full_path_not_the_filename_or_pid() {
        use std::path::Path;
        assert!(super::same_image(
            Path::new(r"C:\Apps\MyApp.exe"),
            Path::new(r"c:\apps\myapp.exe")
        ));
        assert!(!super::same_image(
            Path::new(r"C:\Other\MyApp.exe"),
            Path::new(r"C:\Apps\MyApp.exe")
        ));
    }

    #[cfg(windows)]
    #[test]
    fn stop_terminates_only_the_verified_image() {
        use std::{
            os::windows::process::CommandExt,
            path::PathBuf,
            process::{Child, Command, Stdio},
        };

        struct Fixture {
            root: PathBuf,
            children: Vec<Child>,
        }
        impl Drop for Fixture {
            fn drop(&mut self) {
                for child in &mut self.children {
                    let _ = child.kill();
                    let _ = child.wait();
                }
                let _ = std::fs::remove_dir_all(&self.root);
            }
        }

        let mut fixture = Fixture {
            root: std::env::temp_dir().join(format!("pullora-stop-{}", uuid::Uuid::new_v4())),
            children: Vec::new(),
        };
        let source =
            PathBuf::from(std::env::var_os("SystemRoot").unwrap()).join("System32/ping.exe");
        let mut images = Vec::new();
        for folder in ["target", "unrelated"] {
            let dir = fixture.root.join(folder);
            std::fs::create_dir_all(&dir).unwrap();
            let image = dir.join("pullora-stop-fixture.exe");
            std::fs::copy(&source, &image).unwrap();
            fixture.children.push(
                Command::new(&image)
                    .args(["-n", "20", "127.0.0.1"])
                    .creation_flags(0x08000000)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .unwrap(),
            );
            images.push(std::fs::canonicalize(image).unwrap());
        }

        assert!(fixture
            .children
            .iter_mut()
            .all(|child| child.try_wait().unwrap().is_none()));
        let names = std::collections::HashSet::from(["pullora-stop-fixture.exe".to_string()]);
        let expected = fixture.children[0].id();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
        loop {
            let processes = super::processes(&names).unwrap();
            if processes.iter().any(|(pid, _, image)| {
                *pid == expected
                    && image
                        .as_ref()
                        .is_some_and(|path| super::same_image(path, &images[0]))
            }) {
                break;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "Cannot resolve fixture image {:?}: {processes:?}",
                images[0]
            );
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
        super::stop(&images[..1]).unwrap();
        assert!(
            fixture.children[0].try_wait().unwrap().is_some(),
            "The registered fixture must exit"
        );
        assert!(fixture.children[1].try_wait().unwrap().is_none());
        super::stop(&images[..1]).unwrap();
    }
}
