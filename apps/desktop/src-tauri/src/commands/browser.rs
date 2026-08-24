use tauri::{AppHandle, WebviewWindowBuilder, WebviewUrl, Manager, LogicalPosition, LogicalSize};
use serde::Serialize;

#[derive(Serialize)]
pub struct BrowserWindowInfo {
    pub label: String,
    pub title: String,
}

/// 打开无边框浏览器子窗口，精确覆盖主窗口的浏览器区域
/// x, y, width, height 为相对于屏幕的坐标（由前端计算）
/// label 可选：前端传入固定 label 以便后续 browser_navigate/browser_move 复用；
/// 不传则随机生成。
#[tauri::command]
pub async fn browser_open(
    app: AppHandle,
    url: String,
    title: Option<String>,
    label: Option<String>,
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<BrowserWindowInfo, String> {
    let label = label.unwrap_or_else(|| format!("browser-{}", uuid::Uuid::new_v4().simple()));
    let parsed_url = url::Url::parse(&url).map_err(|e| format!("URL 解析失败: {}", e))?;
    let window_title = title.unwrap_or_else(|| {
        parsed_url.host_str().unwrap_or("浏览器").to_string()
    });

    let w = width.unwrap_or(1024.0);
    let h = height.unwrap_or(768.0);

    // 若同 label 子窗口已存在，先关闭再重建（避免重复创建报错）
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.close();
    }

    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed_url))
        .title(&window_title)
        .decorations(false)       // 无边框——视觉上融入应用
        .transparent(false)
        .always_on_top(true)      // 始终在主窗口之上
        .skip_taskbar(true)       // 不在任务栏显示
        .inner_size(w, h)
        .min_inner_size(200.0, 150.0);

    if let (Some(px), Some(py)) = (x, y) {
        builder = builder.position(px, py);
    }

    builder.build()
        .map_err(|e| format!("创建浏览器窗口失败: {}", e))?;

    Ok(BrowserWindowInfo { label, title: window_title })
}

/// 移动/调整浏览器子窗口位置和大小（主窗口移动或调整大小时同步调用）
#[tauri::command]
pub async fn browser_move(
    app: AppHandle,
    label: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.set_size(LogicalSize::new(width, height)).map_err(|e| format!("调整大小失败: {}", e))?;
        window.set_position(LogicalPosition::new(x, y)).map_err(|e| format!("移动失败: {}", e))?;
    }
    Ok(())
}

/// 显示/隐藏浏览器子窗口
#[tauri::command]
pub async fn browser_set_visible(app: AppHandle, label: String, visible: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        if visible {
            window.show().map_err(|e| format!("显示失败: {}", e))?;
        } else {
            window.hide().map_err(|e| format!("隐藏失败: {}", e))?;
        }
    }
    Ok(())
}

/// 关闭指定浏览器窗口
#[tauri::command]
pub async fn browser_close(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|e| format!("关闭窗口失败: {}", e))?;
    }
    Ok(())
}

/// 在已打开的浏览器窗口中导航到新 URL
#[tauri::command]
pub async fn browser_navigate(app: AppHandle, label: String, url: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        let js = format!("window.location.href = '{}'", url.replace("'", "\\'"));
        window.eval(&js).map_err(|e| format!("导航失败: {}", e))?;
    } else {
        return Err("浏览器窗口不存在".to_string());
    }
    Ok(())
}

/// 将浏览器窗口置于前台
#[tauri::command]
pub async fn browser_focus(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.set_focus().map_err(|e| format!("聚焦失败: {}", e))?;
    }
    Ok(())
}

/// 子窗口后退
#[tauri::command]
pub async fn browser_go_back(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        let js = "if(window.history.length > 1) window.history.back();";
        window.eval(js).map_err(|e| format!("后退失败: {}", e))?;
    }
    Ok(())
}

/// 子窗口前进
#[tauri::command]
pub async fn browser_go_forward(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        let js = "window.history.forward();";
        window.eval(js).map_err(|e| format!("前进失败: {}", e))?;
    }
    Ok(())
}

/// 子窗口刷新
#[tauri::command]
pub async fn browser_refresh(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        let js = "window.location.reload();";
        window.eval(js).map_err(|e| format!("刷新失败: {}", e))?;
    }
    Ok(())
}
