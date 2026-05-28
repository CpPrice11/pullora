use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
use tokio::process::Command;

use crate::codex::CodexRuntimeStatus;
use crate::storage::ai_workspace::{self, AiWorkspace};
use crate::storage::get_config_dir;
use crate::AppState;

fn folder_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("Workspace")
        .to_string()
}

fn parse_github_repo(url: &str) -> Result<(String, String), String> {
    let trimmed = url.trim().trim_end_matches('/').trim_end_matches(".git");
    if !trimmed.starts_with("https://github.com/") {
        return Err("Вкажіть HTTPS-посилання на GitHub-репозиторій.".to_string());
    }
    let segments: Vec<&str> = trimmed.split('/').collect();
    if segments.len() < 5 {
        return Err("Посилання GitHub не містить owner і repo.".to_string());
    }
    Ok((segments[3].to_string(), segments[4].to_string()))
}

#[tauri::command]
pub async fn list_ai_workspaces() -> Result<Vec<AiWorkspace>, String> {
    ai_workspace::list(&get_config_dir()).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn add_ai_workspace(
    path: String,
    linked_library_repo: Option<String>,
) -> Result<AiWorkspace, String> {
    let folder = PathBuf::from(path.trim());
    if !folder.exists() || !folder.is_dir() {
        return Err("Обрана папка workspace не існує або недоступна.".to_string());
    }
    ai_workspace::save_workspace(
        &get_config_dir(),
        folder_name(&folder),
        folder.to_string_lossy().to_string(),
        None,
        None,
        None,
        linked_library_repo,
        false,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn clone_ai_workspace(
    github_url: String,
    linked_library_repo: Option<String>,
    state: State<'_, AppState>,
) -> Result<AiWorkspace, String> {
    let (owner, repo) = parse_github_repo(&github_url)?;
    let root = {
        let settings = state.settings.lock().await;
        PathBuf::from(&settings.ai_workspace_root)
    };
    std::fs::create_dir_all(&root)
        .map_err(|error| format!("Не вдалося створити каталог AI Workspace: {}", error))?;
    let destination = root.join(&repo);
    if destination.exists() {
        return Err(
            "Папка для цього репозиторію вже існує. Додайте її як локальну папку.".to_string(),
        );
    }

    let result = Command::new("git")
        .args(["clone", "--", github_url.trim()])
        .arg(&destination)
        .status()
        .await
        .map_err(|error| format!("Не вдалося запустити git clone: {}", error))?;
    if !result.success() {
        return Err(
            "Git не зміг клонувати репозиторій. Перевірте URL і системну авторизацію Git."
                .to_string(),
        );
    }

    ai_workspace::save_workspace(
        &get_config_dir(),
        repo.clone(),
        destination.to_string_lossy().to_string(),
        Some(github_url),
        Some(owner),
        Some(repo),
        linked_library_repo,
        true,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn touch_ai_workspace(id: String) -> Result<AiWorkspace, String> {
    ai_workspace::touch(&get_config_dir(), &id).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn unlink_ai_workspace(id: String) -> Result<(), String> {
    ai_workspace::unlink(&get_config_dir(), &id).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_ai_workspace_files(
    id: String,
    confirmed: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if !confirmed {
        return Err("Видалення потребує підтвердження.".to_string());
    }
    let workspace =
        ai_workspace::find(&get_config_dir(), &id).map_err(|error| error.to_string())?;
    if !workspace.cloned_by_launcher {
        return Err("Лаунчер не видаляє вручну додані папки.".to_string());
    }
    let root = {
        let settings = state.settings.lock().await;
        PathBuf::from(&settings.ai_workspace_root)
    };
    let target = PathBuf::from(&workspace.path);
    let resolved_root = root.canonicalize().map_err(|error| error.to_string())?;
    let resolved_target = target.canonicalize().map_err(|error| error.to_string())?;
    if resolved_target == resolved_root || !resolved_target.starts_with(&resolved_root) {
        return Err(
            "Видалення заблоковано: папка перебуває поза каталогом AI Workspace.".to_string(),
        );
    }
    std::fs::remove_dir_all(&resolved_target).map_err(|error| error.to_string())?;
    ai_workspace::unlink(&get_config_dir(), &id).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_codex_runtime_status(
    state: State<'_, AppState>,
) -> Result<CodexRuntimeStatus, String> {
    Ok(state.codex_runtime.status().await)
}

#[tauri::command]
pub async fn codex_request(
    method: String,
    params: Value,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    state.codex_runtime.request(app, method, params).await
}

#[tauri::command]
pub async fn codex_respond(
    id: Value,
    result: Value,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.codex_runtime.respond(id, result).await
}

#[tauri::command]
pub async fn codex_account_status(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    state
        .codex_runtime
        .request(
            app,
            "account/read".to_string(),
            json!({ "refreshToken": false }),
        )
        .await
}

#[tauri::command]
pub async fn codex_login_with_api_key(
    api_key: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if api_key.trim().is_empty() {
        return Err("API key порожній.".to_string());
    }
    state.codex_runtime.login_with_api_key(api_key).await
}

#[tauri::command]
pub async fn stop_codex_runtime(state: State<'_, AppState>) -> Result<(), String> {
    state.codex_runtime.stop().await
}

#[tauri::command]
pub async fn open_codex_desktop(
    path: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.codex_runtime.open_desktop(path).await
}
