use reqwest::Client;
use std::sync::{Arc, Mutex};

use super::cache::ApiCache;
use super::models::{OwnerRepositoriesResponse, Release, Repository, SearchResponse};

pub struct GitHubClient {
    client: Client,
    token: Option<String>,
    cache: Arc<Mutex<ApiCache>>,
}

impl GitHubClient {
    pub fn new(token: Option<String>) -> Self {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::ACCEPT,
            "application/vnd.github.v3+json".parse().unwrap(),
        );
        headers.insert(
            reqwest::header::USER_AGENT,
            "Air-Launcher/0.1.0".parse().unwrap(),
        );

        let client = Client::builder()
            .default_headers(headers)
            .build()
            .expect("Failed to build HTTP client");

        Self {
            client,
            token,
            cache: Arc::new(Mutex::new(ApiCache::new())),
        }
    }

    pub fn update_token(&mut self, token: Option<String>) {
        self.token = token;
    }

    fn auth_header(&self) -> Option<String> {
        self.token.as_ref().map(|t| format!("Bearer {}", t))
    }

    pub async fn search_repositories(
        &self,
        query: &str,
        page: u32,
    ) -> Result<SearchResponse, String> {
        let cache_key = format!("search:{}:{}", query, page);

        {
            let cache = self.cache.lock().unwrap();
            if let Some(cached) = cache.get_search(&cache_key) {
                return Ok(cached.clone());
            }
        }

        let url = format!(
            "https://api.github.com/search/repositories?q={}&sort=stars&order=desc&per_page=20&page={}",
            urlencoding::encode(query),
            page
        );

        let mut req = self.client.get(&url);
        if let Some(auth) = self.auth_header() {
            req = req.header(reqwest::header::AUTHORIZATION, auth);
        }

        let response = req.send().await.map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            if status.as_u16() == 403 {
                return Err("GitHub API rate limit exceeded. Add a GitHub token in Settings to increase limits.".to_string());
            }
            return Err(format!("GitHub API error {}: {}", status, body));
        }

        let data: SearchResponse = response.json().await.map_err(|e| e.to_string())?;

        {
            let mut cache = self.cache.lock().unwrap();
            cache.set_search(cache_key, data.clone());
        }

        Ok(data)
    }

    pub async fn list_owner_repositories(
        &self,
        owner: &str,
        page: u32,
        releases_only: bool,
    ) -> Result<OwnerRepositoriesResponse, String> {
        let normalized_owner = owner.trim().to_lowercase();
        if normalized_owner.is_empty() {
            return Err("GitHub owner is required.".to_string());
        }

        let cache_key = format!("owner:{}:{}:{}", normalized_owner, page, releases_only);

        {
            let cache = self.cache.lock().unwrap();
            if let Some(cached) = cache.get_owner_repositories(&cache_key) {
                return Ok(cached.clone());
            }
        }

        let per_page = 30;
        let url = format!(
            "https://api.github.com/users/{}/repos?type=owner&sort=updated&direction=desc&per_page={}&page={}",
            urlencoding::encode(&normalized_owner),
            per_page,
            page
        );

        let mut req = self.client.get(&url);
        if let Some(auth) = self.auth_header() {
            req = req.header(reqwest::header::AUTHORIZATION, auth);
        }

        let response = req.send().await.map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            if status.as_u16() == 404 {
                return Err(format!("GitHub owner \"{}\" was not found.", owner.trim()));
            }
            if status.as_u16() == 403 {
                return Err("GitHub API rate limit exceeded. Try again later.".to_string());
            }
            return Err(format!("GitHub API error {}: {}", status, body));
        }

        let raw_items: Vec<Repository> = response.json().await.map_err(|e| e.to_string())?;
        let has_more = raw_items.len() == per_page as usize;
        let items = raw_items
            .into_iter()
            .filter(|repo| !repo.private && !repo.fork && !repo.archived)
            .filter(|repo| !releases_only || repo.has_releases)
            .collect();

        let data = OwnerRepositoriesResponse {
            items,
            page,
            has_more,
        };

        {
            let mut cache = self.cache.lock().unwrap();
            cache.set_owner_repositories(cache_key, data.clone());
        }

        Ok(data)
    }

    pub async fn get_releases(&self, owner: &str, repo: &str) -> Result<Vec<Release>, String> {
        let cache_key = format!("releases:{}/{}", owner, repo);

        {
            let cache = self.cache.lock().unwrap();
            if let Some(cached) = cache.get_releases(&cache_key) {
                return Ok(cached.clone());
            }
        }

        let url = format!(
            "https://api.github.com/repos/{}/{}/releases?per_page=10",
            owner, repo
        );

        let mut req = self.client.get(&url);
        if let Some(auth) = self.auth_header() {
            req = req.header(reqwest::header::AUTHORIZATION, auth);
        }

        let response = req.send().await.map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("GitHub API error {}: {}", status, body));
        }

        let data: Vec<Release> = response.json().await.map_err(|e| e.to_string())?;

        {
            let mut cache = self.cache.lock().unwrap();
            cache.set_releases(cache_key, data.clone());
        }

        Ok(data)
    }

    pub fn clear_cache(&self) {
        let mut cache = self.cache.lock().unwrap();
        cache.clear();
    }
}

// Simple URL encoding (avoid adding another dependency)
mod urlencoding {
    pub fn encode(s: &str) -> String {
        let mut encoded = String::with_capacity(s.len());
        for c in s.chars() {
            match c {
                'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => encoded.push(c),
                ' ' => encoded.push('+'),
                c => {
                    for byte in c.to_string().as_bytes() {
                        encoded.push_str(&format!("%{:02X}", byte));
                    }
                }
            }
        }
        encoded
    }
}
