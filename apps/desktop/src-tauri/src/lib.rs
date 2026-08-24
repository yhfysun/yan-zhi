mod commands;

use std::collections::HashMap;
use std::sync::Mutex;
use commands::{mcp, fs as fs_cmd, keyring, browser};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
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
            fs_cmd::fs_read_base64,
            fs_cmd::fs_write,
            fs_cmd::fs_list_dir,
            fs_cmd::fs_exists,
            fs_cmd::fs_mkdir,
            fs_cmd::fs_remove,
            keyring::keyring_set,
            keyring::keyring_get,
            keyring::keyring_delete,
            browser::browser_open,
            browser::browser_close,
            browser::browser_navigate,
            browser::browser_focus,
            browser::browser_move,
            browser::browser_set_visible,
            browser::browser_go_back,
            browser::browser_go_forward,
            browser::browser_refresh,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
