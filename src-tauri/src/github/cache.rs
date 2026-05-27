use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::models::{OwnerRepositoriesResponse, Release};

#[derive(Debug, Serialize, Deserialize)]
struct CacheEntry<T> {
    data: T,
    cached_at: DateTime<Utc>,
    ttl_seconds: i64,
}

impl<T> CacheEntry<T> {
    fn is_expired(&self) -> bool {
        let expires_at = self.cached_at + Duration::seconds(self.ttl_seconds);
        Utc::now() > expires_at
    }
}

pub struct ApiCache {
    owner_repositories_cache: HashMap<String, CacheEntry<OwnerRepositoriesResponse>>,
    release_cache: HashMap<String, CacheEntry<Vec<Release>>>,
    owner_repositories_ttl: i64,
    release_ttl: i64,
}

impl ApiCache {
    pub fn new() -> Self {
        Self {
            owner_repositories_cache: HashMap::new(),
            release_cache: HashMap::new(),
            owner_repositories_ttl: 3600,
            release_ttl: 300, // 5 minutes for release data
        }
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

    pub fn set_owner_repositories(&mut self, key: String, data: OwnerRepositoriesResponse) {
        self.owner_repositories_cache.insert(
            key,
            CacheEntry {
                data,
                cached_at: Utc::now(),
                ttl_seconds: self.owner_repositories_ttl,
            },
        );
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

    pub fn set_releases(&mut self, key: String, data: Vec<Release>) {
        self.release_cache.insert(
            key,
            CacheEntry {
                data,
                cached_at: Utc::now(),
                ttl_seconds: self.release_ttl,
            },
        );
    }

    pub fn clear(&mut self) {
        self.owner_repositories_cache.clear();
        self.release_cache.clear();
    }
}
