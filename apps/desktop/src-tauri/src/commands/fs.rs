// 文件系统命令（绕过 Tauri FS 插件的 scope 限制，直接使用 std::fs）
// 用于访问任意路径（如 C:\Users\...），不受沙盒 scope 约束
use std::fs;
use std::path::Path;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::Serialize;

#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[tauri::command]
pub async fn fs_read(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("读取文件失败: {}", e))
}

/// 以 base64 读取文件原始字节（用于图片/PDF 等二进制内容的预览）。
/// 文本预览仍走 fs_read；本命令仅用于需要原始字节的场景。
#[tauri::command]
pub async fn fs_read_base64(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| format!("读取文件失败: {}", e))?;
    Ok(STANDARD.encode(bytes))
}

#[tauri::command]
pub async fn fs_write(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("写入文件失败: {}", e))
}

/// 列出目录内容，返回结构化条目（含名称、完整路径、是否目录）
#[tauri::command]
pub async fn fs_list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let entries = fs::read_dir(&path).map_err(|e| format!("读取目录失败: {}", e))?;
    let mut result = Vec::new();
    for entry in entries {
        if let Ok(entry) = entry {
            let name = entry.file_name().to_string_lossy().to_string();
            let full_path = entry.path().to_string_lossy().to_string();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            result.push(DirEntry { name, path: full_path, is_dir });
        }
    }
    Ok(result)
}

/// 检查路径是否存在（文件或目录）
#[tauri::command]
pub async fn fs_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

/// 递归创建目录
#[tauri::command]
pub async fn fs_mkdir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("创建目录失败: {}", e))
}

/// 删除文件或目录（目录递归删除）
#[tauri::command]
pub async fn fs_remove(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| format!("删除目录失败: {}", e))
    } else {
        fs::remove_file(p).map_err(|e| format!("删除文件失败: {}", e))
    }
}
