use keyring::{Entry, Error};

const SERVICE: &str = "Pullora";
const GITHUB_TOKEN_ACCOUNT: &str = "github-token";

fn github_token_entry() -> Result<Entry, Error> {
    Entry::new(SERVICE, GITHUB_TOKEN_ACCOUNT)
}

pub fn load_github_token() -> Result<Option<String>, Error> {
    match github_token_entry()?.get_password() {
        Ok(token) if token.trim().is_empty() => Ok(None),
        Ok(token) => Ok(Some(token)),
        Err(Error::NoEntry) => Ok(None),
        Err(error) => Err(error),
    }
}

pub fn save_github_token(token: Option<&str>) -> Result<(), Error> {
    let entry = github_token_entry()?;
    match token.map(str::trim).filter(|token| !token.is_empty()) {
        Some(token) => entry.set_password(token),
        None => match entry.delete_credential() {
            Ok(()) | Err(Error::NoEntry) => Ok(()),
            Err(error) => Err(error),
        },
    }
}
