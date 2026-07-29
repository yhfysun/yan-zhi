mod commands;

use std::collections::HashMap;
use std::sync::Mutex;
use commands::{mcp, fs as fs_cmd, keyring};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("yan-zhi".into()),
                    }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                ])
                .build(),
        )
        .manage(Mutex::new(HashMap::<String, tokio::process::Child>::new()))
        .invoke_handler(tauri::generate_handler![
            mcp::mcp_start,
            mcp::mcp_call,
            mcp::mcp_kill,
            fs_cmd::fs_read,
            fs_cmd::fs_write,
            fs_cmd::fs_list_dir,
            keyring::keyring_set,
            keyring::keyring_get,
            keyring::keyring_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
