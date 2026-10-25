use reqwest::Client;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::{command_error, command_error_with_detail};

use super::cache::ApiCache;
use super::models::{OwnerRepositoriesResponse, Release, Repository};

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

fn rate_limited(
    status: reqwest::StatusCode,
    headers: &reqwest::header::HeaderMap,
    body: &str,
) -> bool {
    status == reqwest::StatusCode::TOO_MANY_REQUESTS
        || (status == reqwest::StatusCode::FORBIDDEN
            && (headers
                .get("x-ratelimit-remaining")
                .and_then(|v| v.to_str().ok())
                == Some("0")
                || headers.contains_key(reqwest::header::RETRY_AFTER)
                || body.to_ascii_lowercase().contains("rate limit")))
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
    // Apply the curated project kind to fresh responses and older cached catalogs alike.
    for repo in &mut data.items {
        repo.website_url =
            super::models::website_url(&repo.owner.login, &repo.name).map(str::to_owned);
    }
    data.items.retain(|repo| {
        !(repo.owner.login.eq_ignore_ascii_case("cpprice11")
            && (repo.name.eq_ignore_ascii_case("pullora")
                || repo.name.eq_ignore_ascii_case("pullora-assets")))
    });
    data
}

impl GitHubClient {
    async fn public_releases(
        &self,
        owner: &str,
        repo: &str,
        cache_key: &str,
        api_error: String,
    ) -> Result<Vec<Release>, String> {
        let mut latest = match super::public_release::latest(owner, repo).await {
            Ok(latest) => latest,
            Err(error) => {
                log::warn!("Public release check unavailable for {owner}/{repo}: {error}");
                return Err(api_error);
            }
        };
        let mut cache = self.cache.lock().unwrap();
        let mut releases = cache
            .get_releases_stale(cache_key)
            .cloned()
            .unwrap_or_default();
        if let Some(previous) = releases
            .iter()
            .find(|release| release.tag_name == latest.tag_name)
        {
            latest.id = previous.id;
            latest.name.clone_from(&previous.name);
            latest.body.clone_from(&previous.body);
            latest.published_at.clone_from(&previous.published_at);
        }
        releases.retain(|release| release.tag_name != latest.tag_name);
        releases.insert(0, latest);
        // Public metadata must not retain the API ETag or erase known older versions.
        cache.set_releases(cache_key.to_owned(), releases.clone(), None);
        Ok(releases)
    }

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
            return Err(command_error_with_detail(
                "errors.githubRateLimited",
                bucket.reset_at.unwrap_or(0),
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
            return command_error_with_detail("errors.githubRateLimited", reset_at);
        }
        command_error_with_detail("errors.commandFailed", format!("HTTP {}: {}", status, body))
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
            return Err(command_error("errors.githubOwnerRequired"));
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
        let page_query = page.to_string();
        let mut url = reqwest::Url::parse("https://api.github.com")
            .map_err(|_| command_error("errors.invalidUrl"))?;
        url.path_segments_mut()
            .map_err(|_| command_error("errors.invalidUrl"))?
            .extend(["users", normalized_owner.as_str(), "repos"]);
        url.query_pairs_mut().extend_pairs([
            ("type", "owner"),
            ("sort", "updated"),
            ("direction", "desc"),
            ("per_page", "30"),
            ("page", page_query.as_str()),
        ]);

        let mut req = self.client.get(url);
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
                .ok_or_else(|| command_error("errors.githubCacheUnavailable"));
        }
        let etag = Self::response_etag(response.headers());

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            if status.as_u16() == 404 {
                return Err(command_error("errors.githubOwnerNotFound"));
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

        if let Err(error) = self.check_rate_limit("core", 10) {
            return self.public_releases(owner, repo, &cache_key, error).await;
        }

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
            return cached.ok_or_else(|| command_error("errors.githubCacheUnavailable"));
        }
        let etag = Self::response_etag(response.headers());

        if !response.status().is_success() {
            let status = response.status();
            let headers = response.headers().clone();
            let body = response.text().await.unwrap_or_default();
            let limited = rate_limited(status, &headers, &body);
            let error = self.github_error("core", status, body);
            return if limited {
                self.public_releases(owner, repo, &cache_key, error).await
            } else {
                Err(error)
            };
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn distinguishes_quota_errors_from_access_and_missing_resources() {
        use reqwest::{header::HeaderMap, StatusCode};
        let mut headers = HeaderMap::new();
        assert!(rate_limited(StatusCode::TOO_MANY_REQUESTS, &headers, ""));
        assert!(!rate_limited(
            StatusCode::FORBIDDEN,
            &headers,
            "Resource not accessible"
        ));
        assert!(!rate_limited(
            StatusCode::UNAUTHORIZED,
            &headers,
            "Bad credentials"
        ));
        assert!(!rate_limited(StatusCode::NOT_FOUND, &headers, "Not Found"));
        assert!(rate_limited(
            StatusCode::FORBIDDEN,
            &headers,
            "Secondary rate limit exceeded"
        ));
        headers.insert("x-ratelimit-remaining", "0".parse().unwrap());
        assert!(rate_limited(StatusCode::FORBIDDEN, &headers, ""));
        headers.clear();
        headers.insert(reqwest::header::RETRY_AFTER, "60".parse().unwrap());
        assert!(rate_limited(StatusCode::FORBIDDEN, &headers, ""));
    }

    fn limited_client(path: PathBuf) -> GitHubClient {
        let client = GitHubClient::new(Some("test-token-must-not-reach-public-hosts".into()), path);
        client.rate_limit.lock().unwrap().resources.insert(
            "core".into(),
            RateLimitBucket {
                remaining: Some(0),
                limit: Some(60),
                reset_at: Some(
                    SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap()
                        .as_secs()
                        + 600,
                ),
            },
        );
        client
    }

    #[tokio::test]
    async fn quota_fallback_failure_preserves_existing_cache_and_error() {
        let path = std::env::temp_dir().join(format!(
            "pullora-public-failure-{}.json",
            uuid::Uuid::new_v4()
        ));
        let client = limited_client(path.clone());
        let key = "releases:owner/../repo";
        client
            .cache
            .lock()
            .unwrap()
            .set_releases(key.into(), vec![], Some("known-etag".into()));
        let result = client.get_releases("owner", "../repo", true).await;
        assert!(result.unwrap_err().contains("errors.githubRateLimited"));
        let cache = client.cache.lock().unwrap();
        assert_eq!(cache.get_releases_etag(key), Some("known-etag"));
        assert_eq!(cache.get_releases_stale(key).unwrap().len(), 0);
        drop(cache);
        std::fs::remove_file(path).unwrap();
    }

    #[tokio::test]
    #[ignore = "opt-in: public GitHub HTTP smoke; no API request or executable download"]
    async fn public_release_live_smoke() {
        for repo in ["pullora", "recycle-desk"] {
            let path = std::env::temp_dir().join(format!(
                "pullora-public-smoke-{}.json",
                uuid::Uuid::new_v4()
            ));
            let client = limited_client(path.clone());
            let key = format!("releases:cpprice11/{repo}");
            let old = Release {
                id: 42,
                tag_name: "v0.0.0-qa".into(),
                name: None,
                html_url: None,
                draft: false,
                prerelease: false,
                published_at: None,
                body: None,
                assets: vec![],
            };
            client.cache.lock().unwrap().set_releases(
                key.clone(),
                vec![old],
                Some("old-api-etag".into()),
            );
            let releases = client.get_releases("CpPrice11", repo, true).await.unwrap();
            let latest = &releases[0];
            assert!(!latest.assets.is_empty());
            let checksum = crate::download::checksum::release_digest(
                &client,
                "CpPrice11",
                repo,
                &latest.tag_name,
                &latest.assets[0].name,
            )
            .await
            .unwrap();
            assert_eq!(
                checksum.as_deref(),
                latest.assets[0]
                    .digest
                    .as_deref()
                    .and_then(|value| value.strip_prefix("sha256:"))
            );
            assert!(latest.assets.iter().all(|a| a
                .digest
                .as_deref()
                .is_some_and(|v| v.starts_with("sha256:"))));
            assert_eq!(releases[1].tag_name, "v0.0.0-qa");
            assert_ne!(latest.id, releases[1].id);
            assert!(client
                .cache
                .lock()
                .unwrap()
                .get_releases_etag(&key)
                .is_none());
            let cached = client.get_releases("CpPrice11", repo, false).await.unwrap();
            assert_eq!(cached[0].tag_name, latest.tag_name);
            assert_eq!(client.rate_limit_status().core.remaining, Some(0));
            println!(
                "Public fallback {repo}: {} / {} verified package hashes; old history kept",
                latest.tag_name,
                latest.assets.len()
            );
            std::fs::remove_file(path).unwrap();
        }
    }
}
