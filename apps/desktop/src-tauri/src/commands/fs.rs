// 文件系统命令（补充 Tauri FS 插件未覆盖的能力）
use std::fs;
use std::path::PathBuf;

#[tauri::command]
pub async fn fs_read(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("读取文件失败: {}", e))
}

#[tauri::command]
pub async fn fs_write(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("写入文件失败: {}", e))
}

#[tauri::command]
pub async fn fs_list_dir(path: String) -> Result<Vec<String>, String> {
    let entries = fs::read_dir(&path).map_err(|e| format!("读取目录失败: {}", e))?;
    let mut names = Vec::new();
    for entry in entries {
        if let Ok(entry) = entry {
            names.push(entry.file_name().to_string_lossy().to_string());
        }
    }
    Ok(names)
}
