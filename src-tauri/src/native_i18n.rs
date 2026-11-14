use std::collections::BTreeMap;

pub fn labels(language: &str) -> BTreeMap<String, String> {
    serde_json::from_str(match language {
        "en" => include_str!("../../src/i18n/native/en.json"),
        "ru" => include_str!("../../src/i18n/native/ru.json"),
        _ => include_str!("../../src/i18n/native/uk.json"),
    })
    .expect("bundled native translations must be valid JSON")
}
