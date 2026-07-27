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
    method: String,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    // TODO: 实现完整的 JSON-RPC over stdio 协议
    // 当前为骨架，实际需要：
    // 1. 序列化 {"jsonrpc":"2.0","id":x,"method":method,"params":params}
    // 2. 写入子进程 stdin（带换行）
    // 3. 从 stdout 读取响应行
    // 4. 反序列化并返回 result 字段
    Ok(serde_json::json!({
        "child_id": child_id,
        "method": method,
        "params": params,
        "note": "stdio 传输骨架，待实现完整 JSON-RPC"
    }))
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
