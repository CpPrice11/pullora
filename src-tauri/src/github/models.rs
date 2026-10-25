use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OwnerRepositoriesResponse {
    pub items: Vec<Repository>,
    pub page: u32,
    pub has_more: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Repository {
    pub id: u64,
    pub name: String,
    pub full_name: String,
    pub owner: Owner,
    pub description: Option<String>,
    pub stargazers_count: u64,
    pub updated_at: String,
    pub html_url: String,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub website_url: Option<String>,
    pub language: Option<String>,
    pub topics: Option<Vec<String>>,
    #[serde(default)]
    pub has_releases: bool,
    #[serde(default)]
    pub fork: bool,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub private: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Owner {
    pub login: String,
    pub avatar_url: String,
}

pub fn website_url(owner: &str, repo: &str) -> Option<&'static str> {
    (owner.eq_ignore_ascii_case("CpPrice11") && repo.eq_ignore_ascii_case("warframe-arsenal"))
        .then_some("https://cpprice11.github.io/warframe-arsenal/")
}

#[cfg(test)]
mod tests {
    #[test]
    fn only_the_authors_web_project_is_a_website() {
        assert_eq!(
            super::website_url("CPPRICE11", "Warframe-Arsenal"),
            Some("https://cpprice11.github.io/warframe-arsenal/")
        );
        assert_eq!(
            super::website_url("another-owner", "warframe-arsenal"),
            None
        );
        assert_eq!(
            super::website_url("CpPrice11", "steam-achievement-manager"),
            None
        );
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Release {
    pub id: u64,
    pub tag_name: String,
    pub name: Option<String>,
    pub html_url: Option<String>,
    pub draft: bool,
    pub prerelease: bool,
    pub published_at: Option<String>,
    pub body: Option<String>,
    pub assets: Vec<Asset>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Asset {
    pub id: u64,
    pub name: String,
    pub browser_download_url: String,
    pub size: u64,
    pub content_type: String,
    pub download_count: u64,
    #[serde(default)]
    pub digest: Option<String>,
}
