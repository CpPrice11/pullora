const ERROR_PREFIX: &str = "PULLORA_ERROR:";

pub fn is_busy_io_error(error: &std::io::Error) -> bool {
    matches!(error.kind(), std::io::ErrorKind::WouldBlock)
        || matches!(error.raw_os_error(), Some(32 | 33))
}

pub fn install_io_error(error: &std::io::Error) -> String {
    if is_busy_io_error(error) {
        command_error("errors.installTargetBusy")
    } else {
        error.to_string()
    }
}

pub fn command_error(code: &str) -> String {
    format!("{}{}", ERROR_PREFIX, code)
}

pub fn command_error_with_detail(code: &str, detail: impl std::fmt::Display) -> String {
    format!("{}{}|{}", ERROR_PREFIX, code, detail)
}

pub fn normalize_command_error(error: &str, fallback_code: &str) -> String {
    if error.starts_with(ERROR_PREFIX) {
        error.to_string()
    } else {
        command_error(fallback_code)
    }
}

#[cfg(test)]
mod tests {
    use super::{
        command_error, command_error_with_detail, install_io_error, is_busy_io_error,
        normalize_command_error,
    };

    #[test]
    fn formats_stable_command_errors() {
        assert_eq!(
            command_error("errors.invalidUrl"),
            "PULLORA_ERROR:errors.invalidUrl"
        );
        assert_eq!(
            command_error_with_detail("errors.githubRateLimited", 123),
            "PULLORA_ERROR:errors.githubRateLimited|123"
        );
        assert_eq!(
            normalize_command_error("disk failure", "errors.installFailed"),
            "PULLORA_ERROR:errors.installFailed"
        );
        assert_eq!(
            normalize_command_error(
                "PULLORA_ERROR:errors.downloadCanceled",
                "errors.installFailed"
            ),
            "PULLORA_ERROR:errors.downloadCanceled"
        );
    }

    #[test]
    fn classifies_windows_file_locks_without_exposing_raw_errors() {
        for code in [32, 33] {
            let error = std::io::Error::from_raw_os_error(code);
            assert!(is_busy_io_error(&error));
            assert_eq!(
                install_io_error(&error),
                "PULLORA_ERROR:errors.installTargetBusy"
            );
        }

        let error = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "private detail");
        assert!(!is_busy_io_error(&error));
        assert_eq!(install_io_error(&error), "private detail");
    }
}
