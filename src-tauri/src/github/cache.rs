use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::models::{Release, SearchResponse};

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
    search_cache: HashMap<String, CacheEntry<SearchResponse>>,
    release_cache: HashMap<String, CacheEntry<Vec<Release>>>,
    search_ttl: i64,
    release_ttl: i64,
}

impl ApiCache {
    pub fn new() -> Self {
        Self {
            search_cache: HashMap::new(),
            release_cache: HashMap::new(),
            search_ttl: 3600,   // 1 hour for search results
            release_ttl: 300,   // 5 minutes for release data
        }
    }

    pub fn get_search(&self, key: &str) -> Option<&SearchResponse> {
        self.search_cache.get(key).and_then(|entry| {
            if entry.is_expired() {
                None
            } else {
                Some(&entry.data)
            }
        })
    }

    pub fn set_search(&mut self, key: String, data: SearchResponse) {
        self.search_cache.insert(
            key,
            CacheEntry {
                data,
                cached_at: Utc::now(),
                ttl_seconds: self.search_ttl,
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
        self.search_cache.clear();
        self.release_cache.clear();
    }

    #[allow(dead_code)]
    pub fn purge_expired(&mut self) {
        self.search_cache.retain(|_, v| !v.is_expired());
        self.release_cache.retain(|_, v| !v.is_expired());
    }
}
