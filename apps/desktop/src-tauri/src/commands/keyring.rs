// 系统钥匙串（安全存储 API Key）
use keyring::Entry;

#[tauri::command]
pub async fn keyring_set(key: String, value: String) -> Result<(), String> {
    let entry = Entry::new("yan-zhi", &key).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn keyring_get(key: String) -> Result<Option<String>, String> {
    let entry = Entry::new("yan-zhi", &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn keyring_delete(key: String) -> Result<(), String> {
    let entry = Entry::new("yan-zhi", &key).map_err(|e| e.to_string())?;
    entry.delete_password().map_err(|e| e.to_string())
}
