use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, Mutex};
use tokio::time::{timeout, Duration};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexRuntimeStatus {
    pub installed: bool,
    pub running: bool,
    pub executable_path: Option<String>,
    pub protocol: &'static str,
    pub error: Option<String>,
}

pub struct CodexRuntime {
    child: Mutex<Option<Child>>,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>,
    next_id: AtomicU64,
    running: Arc<AtomicBool>,
    initialized: AtomicBool,
}

impl CodexRuntime {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            stdin: Arc::new(Mutex::new(None)),
            pending: Arc::new(Mutex::new(HashMap::new())),
            next_id: AtomicU64::new(1),
            running: Arc::new(AtomicBool::new(false)),
            initialized: AtomicBool::new(false),
        }
    }

    async fn find_executable() -> Option<PathBuf> {
        if let Ok(output) = Command::new("where.exe").arg("codex.exe").output().await {
            if output.status.success() {
                if let Some(first) = String::from_utf8_lossy(&output.stdout).lines().next() {
                    let path = PathBuf::from(first.trim());
                    if path.exists() {
                        return Some(path);
                    }
                }
            }
        }

        std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .map(|path| {
                path.join("Programs")
                    .join("OpenAI")
                    .join("Codex")
                    .join("bin")
                    .join("codex.exe")
            })
            .filter(|path| path.exists())
    }

    pub async fn status(&self) -> CodexRuntimeStatus {
        let executable = Self::find_executable().await;
        CodexRuntimeStatus {
            installed: executable.is_some(),
            running: self.running.load(Ordering::Relaxed),
            executable_path: executable.map(|path| path.to_string_lossy().to_string()),
            protocol: "experimental-app-server",
            error: None,
        }
    }

    async fn start(&self, app: AppHandle) -> Result<(), String> {
        if self.running.load(Ordering::Relaxed) {
            return Ok(());
        }
        let executable = Self::find_executable()
            .await
            .ok_or_else(|| "Codex не встановлено або codex.exe не знайдено.".to_string())?;
        let mut child = Command::new(&executable)
            .args(["app-server", "--listen", "stdio://"])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .map_err(|error| format!("Не вдалося запустити Codex app-server: {}", error))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Codex app-server не надав stdin.".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Codex app-server не надав stdout.".to_string())?;
        *self.stdin.lock().await = Some(stdin);
        *self.child.lock().await = Some(child);
        self.running.store(true, Ordering::Relaxed);
        self.initialized.store(false, Ordering::Relaxed);

        let pending = Arc::clone(&self.pending);
        let running = Arc::clone(&self.running);
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let Ok(payload) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                if let Some(id) = payload.get("id").and_then(Value::as_u64) {
                    if payload.get("method").is_none() {
                        if let Some(sender) = pending.lock().await.remove(&id) {
                            let result = payload
                                .get("error")
                                .map(|value| Err(value.to_string()))
                                .unwrap_or_else(|| {
                                    Ok(payload.get("result").cloned().unwrap_or(Value::Null))
                                });
                            let _ = sender.send(result);
                        }
                        continue;
                    }
                }
                let _ = app.emit("ai-workspace-codex-event", payload);
            }
            running.store(false, Ordering::Relaxed);
            let mut waiting = pending.lock().await;
            for (_, sender) in waiting.drain() {
                let _ = sender.send(Err("З'єднання з Codex перервано.".to_string()));
            }
            let _ = app.emit(
                "ai-workspace-runtime-failure",
                "З'єднання з Codex перервано.",
            );
        });
        Ok(())
    }

    async fn write_message(&self, message: Value) -> Result<(), String> {
        let mut guard = self.stdin.lock().await;
        let stdin = guard
            .as_mut()
            .ok_or_else(|| "Codex app-server ще не запущено.".to_string())?;
        let line = format!("{}\n", message);
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|error| error.to_string())?;
        stdin.flush().await.map_err(|error| error.to_string())
    }

    async fn request_raw(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().await.insert(id, sender);
        if let Err(error) = self
            .write_message(json!({ "id": id, "method": method, "params": params }))
            .await
        {
            self.pending.lock().await.remove(&id);
            return Err(error);
        }
        timeout(Duration::from_secs(45), receiver)
            .await
            .map_err(|_| "Codex не відповів вчасно.".to_string())?
            .map_err(|_| "Відповідь Codex втрачено.".to_string())?
    }

    pub async fn request(
        &self,
        app: AppHandle,
        method: String,
        params: Value,
    ) -> Result<Value, String> {
        self.start(app).await?;
        if !self.initialized.load(Ordering::Relaxed) {
            self.request_raw(
                "initialize",
                json!({
                    "clientInfo": { "name": "air-launcher", "version": "3.0.0" },
                    "capabilities": { "experimentalApi": true }
                }),
            )
            .await?;
            self.write_message(json!({ "method": "initialized" }))
                .await?;
            self.initialized.store(true, Ordering::Relaxed);
        }
        self.request_raw(&method, params).await
    }

    pub async fn respond(&self, id: Value, result: Value) -> Result<(), String> {
        self.write_message(json!({ "id": id, "result": result }))
            .await
    }

    pub async fn stop(&self) -> Result<(), String> {
        if let Some(mut child) = self.child.lock().await.take() {
            child.kill().await.map_err(|error| error.to_string())?;
        }
        *self.stdin.lock().await = None;
        self.running.store(false, Ordering::Relaxed);
        self.initialized.store(false, Ordering::Relaxed);
        Ok(())
    }

    pub async fn open_desktop(&self, path: Option<String>) -> Result<(), String> {
        let executable = Self::find_executable()
            .await
            .ok_or_else(|| "Codex не встановлено або codex.exe не знайдено.".to_string())?;
        let mut command = Command::new(executable);
        command.arg("app");
        if let Some(path) = path {
            command.arg(path);
        }
        command
            .spawn()
            .map_err(|error| format!("Не вдалося відкрити Codex Desktop: {}", error))?;
        Ok(())
    }

    pub async fn login_with_api_key(&self, api_key: String) -> Result<(), String> {
        let executable = Self::find_executable()
            .await
            .ok_or_else(|| "Codex не встановлено або codex.exe не знайдено.".to_string())?;
        let mut child = Command::new(executable)
            .args(["login", "--with-api-key"])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|error| format!("Не вдалося запустити login Codex: {}", error))?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(api_key.as_bytes())
                .await
                .map_err(|error| error.to_string())?;
            stdin
                .write_all(b"\n")
                .await
                .map_err(|error| error.to_string())?;
        }
        let output = child
            .wait_with_output()
            .await
            .map_err(|error| error.to_string())?;
        if output.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
    }
}
