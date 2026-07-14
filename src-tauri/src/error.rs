const ERROR_PREFIX: &str = "PULLORA_ERROR:";

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
    use super::{command_error, command_error_with_detail, normalize_command_error};

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
}
