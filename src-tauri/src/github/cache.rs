use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::models::{OwnerRepositoriesResponse, Release};

const CACHE_VERSION: u32 = 1;
const CACHE_RETENTION_DAYS: i64 = 7;
const MAX_CACHE_ENTRIES: usize = 250;

#[derive(Clone, Debug, Serialize, Deserialize)]
struct CacheEntry<T> {
    data: T,
    cached_at: DateTime<Utc>,
    ttl_seconds: i64,
    #[serde(default)]
    etag: Option<String>,
}

impl<T> CacheEntry<T> {
    fn is_expired(&self) -> bool {
        let expires_at = self.cached_at + Duration::seconds(self.ttl_seconds);
        Utc::now() > expires_at
    }
}

#[derive(Serialize, Deserialize)]
struct PersistentApiCache {
    version: u32,
    #[serde(default)]
    owner_repositories: HashMap<String, CacheEntry<OwnerRepositoriesResponse>>,
    #[serde(default)]
    releases: HashMap<String, CacheEntry<Vec<Release>>>,
}

pub struct ApiCache {
    owner_repositories_cache: HashMap<String, CacheEntry<OwnerRepositoriesResponse>>,
    release_cache: HashMap<String, CacheEntry<Vec<Release>>>,
    owner_repositories_ttl: i64,
    release_ttl: i64,
    storage_path: PathBuf,
}

impl ApiCache {
    pub fn load(storage_path: PathBuf) -> Self {
        let persisted = Self::read_persistent_cache(&storage_path);
        let mut cache = Self {
            owner_repositories_cache: persisted
                .as_ref()
                .map(|data| data.owner_repositories.clone())
                .unwrap_or_default(),
            release_cache: persisted.map(|data| data.releases).unwrap_or_default(),
            owner_repositories_ttl: 3600,
            release_ttl: 21600,
            storage_path,
        };
        cache.prune();
        if cache.storage_path.exists() {
            cache.persist();
        }
        cache
    }

    pub fn get_owner_repositories(&self, key: &str) -> Option<&OwnerRepositoriesResponse> {
        self.owner_repositories_cache.get(key).and_then(|entry| {
            if entry.is_expired() {
                None
            } else {
                Some(&entry.data)
            }
        })
    }

    pub fn get_owner_repositories_stale(&self, key: &str) -> Option<&OwnerRepositoriesResponse> {
        self.owner_repositories_cache
            .get(key)
            .map(|entry| &entry.data)
    }

    pub fn get_owner_repositories_etag(&self, key: &str) -> Option<&str> {
        self.owner_repositories_cache
            .get(key)
            .and_then(|entry| entry.etag.as_deref())
    }

    pub fn set_owner_repositories(
        &mut self,
        key: String,
        data: OwnerRepositoriesResponse,
        etag: Option<String>,
    ) {
        self.owner_repositories_cache.insert(
            key,
            CacheEntry {
                data,
                cached_at: Utc::now(),
                ttl_seconds: self.owner_repositories_ttl,
                etag,
            },
        );
        self.persist();
    }

    pub fn touch_owner_repositories(&mut self, key: &str) {
        if let Some(entry) = self.owner_repositories_cache.get_mut(key) {
            entry.cached_at = Utc::now();
            self.persist();
        }
    }

    pub fn get_releases(&self, key: &str) -> Option<&Vec<Release>> {
        self.release_cache.get(key).and_then(|entry| {
            if entry.is_expired() {
                None
            } else {
                Some(&entry.data)
            }
        })
    }

    pub fn get_releases_stale(&self, key: &str) -> Option<&Vec<Release>> {
        self.release_cache.get(key).map(|entry| &entry.data)
    }

    pub fn get_releases_etag(&self, key: &str) -> Option<&str> {
        self.release_cache
            .get(key)
            .and_then(|entry| entry.etag.as_deref())
    }

    pub fn set_releases(&mut self, key: String, data: Vec<Release>, etag: Option<String>) {
        self.release_cache.insert(
            key,
            CacheEntry {
                data,
                cached_at: Utc::now(),
                ttl_seconds: self.release_ttl,
                etag,
            },
        );
        self.persist();
    }

    pub fn touch_releases(&mut self, key: &str) {
        if let Some(entry) = self.release_cache.get_mut(key) {
            entry.cached_at = Utc::now();
            self.persist();
        }
    }

    pub fn clear(&mut self) {
        self.owner_repositories_cache.clear();
        self.release_cache.clear();
        if self.storage_path.exists() {
            let _ = std::fs::remove_file(&self.storage_path);
        }
    }

    fn read_persistent_cache(path: &Path) -> Option<PersistentApiCache> {
        let content = std::fs::read_to_string(path).ok()?;
        match serde_json::from_str::<PersistentApiCache>(&content) {
            Ok(cache) if cache.version == CACHE_VERSION => Some(cache),
            _ => {
                let _ = std::fs::remove_file(path);
                None
            }
        }
    }

    fn prune(&mut self) {
        let oldest_allowed = Utc::now() - Duration::days(CACHE_RETENTION_DAYS);
        self.owner_repositories_cache
            .retain(|_, entry| entry.cached_at >= oldest_allowed);
        self.release_cache
            .retain(|_, entry| entry.cached_at >= oldest_allowed);
        trim_oldest(&mut self.owner_repositories_cache);
        trim_oldest(&mut self.release_cache);
    }

    fn persist(&mut self) {
        self.prune();
        let data = PersistentApiCache {
            version: CACHE_VERSION,
            owner_repositories: self.owner_repositories_cache.clone(),
            releases: self.release_cache.clone(),
        };
        let Ok(content) = serde_json::to_vec(&data) else {
            return;
        };
        let Some(parent) = self.storage_path.parent() else {
            return;
        };
        if std::fs::create_dir_all(parent).is_err() {
            return;
        }

        let temporary_path = self.storage_path.with_extension("json.tmp");
        if std::fs::write(&temporary_path, content).is_err() {
            return;
        }
        if std::fs::rename(&temporary_path, &self.storage_path).is_err() {
            let _ = std::fs::remove_file(&self.storage_path);
            let _ = std::fs::rename(&temporary_path, &self.storage_path);
        }
    }
}

fn trim_oldest<T>(entries: &mut HashMap<String, CacheEntry<T>>) {
    if entries.len() <= MAX_CACHE_ENTRIES {
        return;
    }

    let mut keys_by_age = entries
        .iter()
        .map(|(key, entry)| (key.clone(), entry.cached_at))
        .collect::<Vec<_>>();
    keys_by_age.sort_by_key(|(_, cached_at)| *cached_at);

    let remove_count = entries.len() - MAX_CACHE_ENTRIES;
    for (key, _) in keys_by_age.into_iter().take(remove_count) {
        entries.remove(&key);
    }
}

#[cfg(test)]
mod tests {
    use super::ApiCache;

    #[test]
    fn persists_release_data_and_etag_between_instances() {
        let cache_path = std::env::temp_dir().join(format!(
            "pullora-github-cache-{}.json",
            uuid::Uuid::new_v4()
        ));

        {
            let mut cache = ApiCache::load(cache_path.clone());
            cache.set_releases(
                "releases:owner/repo".to_string(),
                Vec::new(),
                Some("\"etag-value\"".to_string()),
            );
        }

        let mut reloaded = ApiCache::load(cache_path.clone());
        assert!(reloaded.get_releases("releases:owner/repo").is_some());
        assert_eq!(
            reloaded.get_releases_etag("releases:owner/repo"),
            Some("\"etag-value\"")
        );

        reloaded.clear();
        assert!(!cache_path.exists());
    }
}
