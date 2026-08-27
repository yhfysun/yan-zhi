// MCP 子进程管理（stdio 传输）
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;
use tokio::process::{Child, Command};

/// 子进程注册表：child_id -> Child
type ChildRegistry = Mutex<HashMap<String, Child>>;

/// 启动 MCP 子进程
#[tauri::command]
pub async fn mcp_start(
    registry: State<'_, ChildRegistry>,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
) -> Result<String, String> {
    let mut cmd = Command::new(&command);
    cmd.args(&args);
    for (k, v) in env {
        cmd.env(k, v);
    }

    let child = cmd.spawn().map_err(|e| format!("启动子进程失败: {}", e))?;
    let child_id = uuid::Uuid::new_v4().to_string();

    let mut reg = registry.lock().map_err(|e| format!("锁错误: {}", e))?;
    reg.insert(child_id.clone(), child);

    Ok(child_id)
}

/// 通过 JSON-RPC 调用子进程（简化版：写 stdin 读 stdout）
#[tauri::command]
pub async fn mcp_call(
    _registry: State<'_, ChildRegistry>,
    child_id: String,
    _method: String,
    _params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    // 当前桌面端主壳为 Electron，其 main.cjs 已实现完整的 stdio JSON-RPC。
    // 该 Tauri 壳未实现 stdio 协议，这里明确返回不支持，避免返回虚假成功结果。
    Err(format!(
        "stdio JSON-RPC 未在此 Tauri 壳实现（child_id: {}），请使用 Electron 桌面端或改用 SSE/HTTP 传输",
        child_id
    ))
}

/// 终止子进程
#[tauri::command]
pub async fn mcp_kill(
    registry: State<'_, ChildRegistry>,
    child_id: String,
) -> Result<(), String> {
    let child = {
        let mut reg = registry.lock().map_err(|e| format!("锁错误: {}", e))?;
        reg.remove(&child_id)
    };
    if let Some(mut child) = child {
        child.kill().await.map_err(|e| format!("终止子进程失败: {}", e))?;
    }
    Ok(())
}
