use reqwest::Client;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use super::cache::ApiCache;
use super::models::{OwnerRepositoriesResponse, Release, Repository, SearchRepositoriesResponse};

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct RateLimitBucket {
    remaining: Option<u32>,
    limit: Option<u32>,
    reset_at: Option<u64>,
}

#[derive(Default)]
struct RateLimitState {
    resources: HashMap<String, RateLimitBucket>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRateLimitStatus {
    core: RateLimitBucket,
    search: RateLimitBucket,
}

pub struct GitHubClient {
    client: Client,
    token: Mutex<Option<String>>,
    cache: Arc<Mutex<ApiCache>>,
    rate_limit: Arc<Mutex<RateLimitState>>,
}

fn remove_launcher_repository(mut data: OwnerRepositoriesResponse) -> OwnerRepositoriesResponse {
    data.items.retain(|repo| {
        !(repo.owner.login.eq_ignore_ascii_case("cpprice11")
            && repo.name.eq_ignore_ascii_case("pullora"))
    });
    data
}

impl GitHubClient {
    pub fn new(token: Option<String>, cache_path: PathBuf) -> Self {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::ACCEPT,
            "application/vnd.github.v3+json".parse().unwrap(),
        );
        headers.insert(
            reqwest::header::USER_AGENT,
            "Pullora/0.1.0".parse().unwrap(),
        );

        let client = Client::builder()
            .default_headers(headers)
            .build()
            .expect("Failed to build HTTP client");

        Self {
            client,
            token: Mutex::new(token),
            cache: Arc::new(Mutex::new(ApiCache::load(cache_path))),
            rate_limit: Arc::new(Mutex::new(RateLimitState::default())),
        }
    }

    pub fn update_token(&self, token: Option<String>) {
        *self.token.lock().unwrap() = token;
        *self.rate_limit.lock().unwrap() = RateLimitState::default();
    }

    fn auth_header(&self) -> Option<String> {
        self.token
            .lock()
            .unwrap()
            .as_ref()
            .map(|token| format!("Bearer {}", token))
    }

    fn check_rate_limit(&self, resource: &str, reserve: u32) -> Result<(), String> {
        let state = self.rate_limit.lock().unwrap();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let Some(bucket) = state.resources.get(resource) else {
            return Ok(());
        };

        if bucket.remaining.unwrap_or(u32::MAX) <= reserve && bucket.reset_at.unwrap_or(0) > now {
            return Err(format!(
                "GitHub {} API rate limit is nearly exhausted; reset at {}.",
                resource,
                bucket.reset_at.unwrap_or(0)
            ));
        }

        Ok(())
    }

    fn record_rate_limit(&self, headers: &reqwest::header::HeaderMap) {
        let remaining = headers
            .get("x-ratelimit-remaining")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u32>().ok());
        let reset_at = headers
            .get("x-ratelimit-reset")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok());
        let limit = headers
            .get("x-ratelimit-limit")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u32>().ok());
        let resource = headers
            .get("x-ratelimit-resource")
            .and_then(|value| value.to_str().ok())
            .unwrap_or("core")
            .to_string();

        if remaining.is_none() && limit.is_none() && reset_at.is_none() {
            return;
        }

        let mut state = self.rate_limit.lock().unwrap();
        let bucket = state.resources.entry(resource).or_default();
        if let Some(value) = remaining {
            bucket.remaining = Some(value);
        }
        if let Some(value) = limit {
            bucket.limit = Some(value);
        }
        if let Some(value) = reset_at {
            bucket.reset_at = Some(value);
        }
    }

    fn github_error(&self, resource: &str, status: reqwest::StatusCode, body: String) -> String {
        if status.as_u16() == 403 || status.as_u16() == 429 {
            let reset_at = self
                .rate_limit
                .lock()
                .unwrap()
                .resources
                .get(resource)
                .and_then(|bucket| bucket.reset_at)
                .unwrap_or(0);
            return format!(
                "GitHub {} API rate limit exceeded; reset at {}. {}",
                resource, reset_at, body
            );
        }
        format!("GitHub API error {}: {}", status, body)
    }

    fn response_etag(headers: &reqwest::header::HeaderMap) -> Option<String> {
        headers
            .get(reqwest::header::ETAG)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string)
    }

    pub async fn list_owner_repositories(
        &self,
        owner: &str,
        page: u32,
        _releases_only: bool,
        force_refresh: bool,
    ) -> Result<OwnerRepositoriesResponse, String> {
        let normalized_owner = owner.trim().to_lowercase();
        if normalized_owner.is_empty() {
            return Err("GitHub owner is required.".to_string());
        }

        let cache_key = format!("owner:{}:{}", normalized_owner, page);

        if !force_refresh {
            let cache = self.cache.lock().unwrap();
            if let Some(cached) = cache.get_owner_repositories(&cache_key) {
                return Ok(remove_launcher_repository(cached.clone()));
            }
        }

        self.check_rate_limit("core", 10)?;

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
        if let Some(etag) = self
            .cache
            .lock()
            .unwrap()
            .get_owner_repositories_etag(&cache_key)
            .map(str::to_string)
        {
            req = req.header(reqwest::header::IF_NONE_MATCH, etag);
        }

        let response = match req.send().await {
            Ok(response) => response,
            Err(error) => {
                if let Some(cached) = self
                    .cache
                    .lock()
                    .unwrap()
                    .get_owner_repositories_stale(&cache_key)
                    .cloned()
                {
                    return Ok(remove_launcher_repository(cached));
                }
                return Err(error.to_string());
            }
        };
        self.record_rate_limit(response.headers());
        if response.status() == reqwest::StatusCode::NOT_MODIFIED {
            let mut cache = self.cache.lock().unwrap();
            let cached = cache.get_owner_repositories_stale(&cache_key).cloned();
            cache.touch_owner_repositories(&cache_key);
            return cached
                .map(remove_launcher_repository)
                .ok_or_else(|| "GitHub returned 304 without cached data.".to_string());
        }
        let etag = Self::response_etag(response.headers());

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            if status.as_u16() == 404 {
                return Err(format!("GitHub owner \"{}\" was not found.", owner.trim()));
            }
            return Err(self.github_error("core", status, body));
        }

        let raw_items: Vec<Repository> = response.json().await.map_err(|e| e.to_string())?;
        let has_more = raw_items.len() == per_page as usize;
        let items = raw_items
            .into_iter()
            .filter(|repo| !repo.private && !repo.fork && !repo.archived)
            .filter(|repo| {
                !(normalized_owner.eq_ignore_ascii_case("cpprice11")
                    && repo.name.eq_ignore_ascii_case("pullora"))
            })
            .collect();

        let data = remove_launcher_repository(OwnerRepositoriesResponse {
            items,
            page,
            has_more,
        });

        {
            let mut cache = self.cache.lock().unwrap();
            cache.set_owner_repositories(cache_key, data.clone(), etag);
        }

        Ok(data)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn search_public_repositories(
        &self,
        query: &str,
        page: u32,
        sort: Option<&str>,
        language: Option<&str>,
        topic: Option<&str>,
        _releases_only: bool,
        force_refresh: bool,
    ) -> Result<OwnerRepositoriesResponse, String> {
        let normalized_query = query.trim();
        let normalized_language = language.unwrap_or("").trim();
        let normalized_topic = topic.unwrap_or("").trim();
        let mut query_parts = Vec::new();

        if normalized_query.is_empty() {
            query_parts.push("stars:>=0".to_string());
        } else {
            query_parts.push(normalized_query.to_string());
        }
        if !normalized_language.is_empty() {
            query_parts.push(format!("language:{}", normalized_language));
        }
        if !normalized_topic.is_empty() {
            query_parts.push(format!("topic:{}", normalized_topic));
        }
        query_parts.push("fork:false".to_string());
        query_parts.push("archived:false".to_string());

        let search_query = query_parts.join(" ");
        let normalized_sort = match sort.unwrap_or("updated") {
            "stars" => "stars",
            "forks" => "forks",
            "updated" => "updated",
            _ => "updated",
        };
        let cache_key = format!(
            "search:{}:{}:{}",
            normalized_sort,
            search_query.to_lowercase(),
            page
        );

        if !force_refresh {
            let cache = self.cache.lock().unwrap();
            if let Some(cached) = cache.get_owner_repositories(&cache_key) {
                return Ok(cached.clone());
            }
        }

        self.check_rate_limit("search", 1)?;

        let per_page = 30;
        let url = format!(
            "https://api.github.com/search/repositories?q={}&sort={}&order=desc&per_page={}&page={}",
            urlencoding::encode(&search_query),
            normalized_sort,
            per_page,
            page
        );

        let mut req = self.client.get(&url);
        if let Some(auth) = self.auth_header() {
            req = req.header(reqwest::header::AUTHORIZATION, auth);
        }
        if let Some(etag) = self
            .cache
            .lock()
            .unwrap()
            .get_owner_repositories_etag(&cache_key)
            .map(str::to_string)
        {
            req = req.header(reqwest::header::IF_NONE_MATCH, etag);
        }

        let response = match req.send().await {
            Ok(response) => response,
            Err(error) => {
                if let Some(cached) = self
                    .cache
                    .lock()
                    .unwrap()
                    .get_owner_repositories_stale(&cache_key)
                    .cloned()
                {
                    return Ok(cached);
                }
                return Err(error.to_string());
            }
        };
        self.record_rate_limit(response.headers());
        if response.status() == reqwest::StatusCode::NOT_MODIFIED {
            let mut cache = self.cache.lock().unwrap();
            let cached = cache.get_owner_repositories_stale(&cache_key).cloned();
            cache.touch_owner_repositories(&cache_key);
            return cached.ok_or_else(|| "GitHub returned 304 without cached data.".to_string());
        }
        let etag = Self::response_etag(response.headers());

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(self.github_error("search", status, body));
        }

        let raw: SearchRepositoriesResponse = response.json().await.map_err(|e| e.to_string())?;
        let items: Vec<Repository> = raw
            .items
            .into_iter()
            .filter(|repo| !repo.private && !repo.fork && !repo.archived)
            .collect();
        let max_search_results = 1000_u64;
        let loaded_count = u64::from(page) * per_page as u64;
        let has_more = items.len() == per_page as usize
            && loaded_count < raw.total_count.min(max_search_results);

        let data = OwnerRepositoriesResponse {
            items,
            page,
            has_more,
        };

        {
            let mut cache = self.cache.lock().unwrap();
            cache.set_owner_repositories(cache_key, data.clone(), etag);
        }

        Ok(data)
    }

    pub async fn get_releases(
        &self,
        owner: &str,
        repo: &str,
        force_refresh: bool,
    ) -> Result<Vec<Release>, String> {
        let cache_key = format!("releases:{}/{}", owner.to_lowercase(), repo.to_lowercase());

        if !force_refresh {
            let cache = self.cache.lock().unwrap();
            if let Some(cached) = cache.get_releases(&cache_key) {
                return Ok(cached.clone());
            }
        }

        self.check_rate_limit("core", 10)?;

        let url = format!(
            "https://api.github.com/repos/{}/{}/releases?per_page=10",
            owner, repo
        );

        let mut req = self.client.get(&url);
        if let Some(auth) = self.auth_header() {
            req = req.header(reqwest::header::AUTHORIZATION, auth);
        }
        if let Some(etag) = self
            .cache
            .lock()
            .unwrap()
            .get_releases_etag(&cache_key)
            .map(str::to_string)
        {
            req = req.header(reqwest::header::IF_NONE_MATCH, etag);
        }

        let response = match req.send().await {
            Ok(response) => response,
            Err(error) => {
                if let Some(cached) = self
                    .cache
                    .lock()
                    .unwrap()
                    .get_releases_stale(&cache_key)
                    .cloned()
                {
                    return Ok(cached);
                }
                return Err(error.to_string());
            }
        };
        self.record_rate_limit(response.headers());
        if response.status() == reqwest::StatusCode::NOT_MODIFIED {
            let mut cache = self.cache.lock().unwrap();
            let cached = cache.get_releases_stale(&cache_key).cloned();
            cache.touch_releases(&cache_key);
            return cached.ok_or_else(|| "GitHub returned 304 without cached data.".to_string());
        }
        let etag = Self::response_etag(response.headers());

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(self.github_error("core", status, body));
        }

        let data: Vec<Release> = response.json().await.map_err(|e| e.to_string())?;

        {
            let mut cache = self.cache.lock().unwrap();
            cache.set_releases(cache_key, data.clone(), etag);
        }

        Ok(data)
    }

    pub fn clear_cache(&self) {
        let mut cache = self.cache.lock().unwrap();
        cache.clear();
        *self.rate_limit.lock().unwrap() = RateLimitState::default();
    }

    pub fn rate_limit_status(&self) -> GitHubRateLimitStatus {
        let state = self.rate_limit.lock().unwrap();
        GitHubRateLimitStatus {
            core: state.resources.get("core").cloned().unwrap_or_default(),
            search: state.resources.get("search").cloned().unwrap_or_default(),
        }
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
