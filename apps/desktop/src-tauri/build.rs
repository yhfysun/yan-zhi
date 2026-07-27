fn main() {
    tauri_build::build();
    // 将 WebView2Loader.dll 输出到 exe 同级目录（windows-gnu 需要）
    println!("cargo:rerun-if-changed=WebView2Loader.dll");
    println!("cargo:rustc-cdylib-link-arg=WebView2Loader.dll");
}
