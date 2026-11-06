#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, path::PathBuf};
use tauri::Manager;
mod downloads;
use std::sync::Arc;

#[tauri::command]
fn get_download_state(app: tauri::AppHandle, service: tauri::State<Arc<downloads::Downloader>>, target: u32) -> Result<downloads::Snapshot, String> {
    service.snapshot(&project_data_dir(&app)?, target)
}
#[tauri::command]
fn start_daily_downloads(app: tauri::AppHandle, service: tauri::State<Arc<downloads::Downloader>>, target: u32, exclude_ids: Vec<String>) -> Result<(), String> {
    service.inner().start(project_data_dir(&app)?, target, exclude_ids)
}
#[tauri::command]
fn cancel_daily_downloads(service: tauri::State<Arc<downloads::Downloader>>) { service.cancel(); }

fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 100 || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
        return Err("Invalid image identifier".into());
    }
    Ok(())
}

fn project_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // Portable: all native application data stays beside the executable.
    let root = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&root).map_err(|e| format!("Cannot create local data folder: {e}"))?;
    Ok(root)
}

fn save_image(app: &tauri::AppHandle, id: &str, bytes: &[u8], folder: &str) -> Result<PathBuf, String> {
    validate_id(id)?;
    if bytes.is_empty() || bytes.len() > 40 * 1024 * 1024 { return Err("Image must be between 1 byte and 40 MB".into()); }
    let reader = image::ImageReader::new(std::io::Cursor::new(bytes)).with_guessed_format().map_err(|e| e.to_string())?;
    let mut reader = reader;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(20000);
    limits.max_image_height = Some(20000);
    limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.decode().map_err(|e| format!("Invalid or unsupported image: {e}"))?;
    let directory = project_data_dir(app)?.join(folder);
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let path = directory.join(format!("{id}.png"));
    let temporary = directory.join(format!("{id}.tmp.png"));
    image.save_with_format(&temporary, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    fs::rename(&temporary, &path).map_err(|e| e.to_string())?;
    Ok(path)
}

#[tauri::command]
async fn export_wallpaper(app: tauri::AppHandle, id: String, bytes: Vec<u8>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || save_image(&app, &id, &bytes, "exports").map(|p| p.to_string_lossy().into_owned())).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn set_wallpaper(app: tauri::AppHandle, id: String, bytes: Vec<u8>, fit: String) -> Result<String, String> {
    if fit != "fill" && fit != "fit" { return Err("Unsupported wallpaper position".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        let path = save_image(&app, &id, &bytes, "wallpapers")?;
        set_windows_wallpaper(&path, &fit)?;
        Ok(path.to_string_lossy().into_owned())
    }).await.map_err(|e| e.to_string())?
}

#[cfg(windows)]
fn set_windows_wallpaper(path: &std::path::Path, fit: &str) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::{core::PCWSTR, Win32::{System::Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_APARTMENTTHREADED}, UI::Shell::{DesktopWallpaper, IDesktopWallpaper, DWPOS_FILL, DWPOS_FIT}}};
    // COM is initialized and uninitialized on the same blocking thread.
    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok().map_err(|e| e.to_string())?;
        let result = (|| -> windows::core::Result<()> {
            let desktop: IDesktopWallpaper = CoCreateInstance(&DesktopWallpaper, None, CLSCTX_ALL)?;
            desktop.SetPosition(if fit == "fit" { DWPOS_FIT } else { DWPOS_FILL })?;
            let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
            desktop.SetWallpaper(PCWSTR::null(), PCWSTR(wide.as_ptr()))?;
            Ok(())
        })();
        CoUninitialize();
        result.map_err(|e| e.to_string())
    }
}

#[cfg(not(windows))]
fn set_windows_wallpaper(_: &std::path::Path, _: &str) -> Result<(), String> { Err("Only Windows is supported".into()) }

#[tauri::command]
fn open_source(url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|e| e.to_string())?;
    if parsed.scheme() != "https" || !matches!(parsed.host_str(), Some("commons.wikimedia.org" | "creativecommons.org")) || !parsed.username().is_empty() || parsed.password().is_some() { return Err("Source URL is not allowed".into()); }
    #[cfg(windows)]
    {
        use windows::{core::PCWSTR, Win32::{Foundation::HWND, UI::Shell::ShellExecuteW}};
        let wide: Vec<u16> = url.encode_utf16().chain(Some(0)).collect();
        let action: Vec<u16> = "open".encode_utf16().chain(Some(0)).collect();
        let result = unsafe { ShellExecuteW(Some(HWND(std::ptr::null_mut())), PCWSTR(action.as_ptr()), PCWSTR(wide.as_ptr()), PCWSTR::null(), PCWSTR::null(), windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL) };
        if result.0 as isize <= 32 { return Err("Unable to open source in browser".into()); }
    }
    Ok(())
}

fn main() {
    if std::env::args().nth(1).as_deref() == Some("--check-download") {
        let root = std::env::args().nth(2).map(PathBuf::from).expect("Diagnostic output directory required");
        let target = std::env::args().nth(3).and_then(|v| v.parse().ok()).unwrap_or(1);
        std::process::exit(if downloads::run_smoke(&root, target).is_ok() { 0 } else { 1 });
    }
    let mut context = tauri::generate_context!();
    if cfg!(debug_assertions) {
        context.config_mut().app.app_directories_override = Some(tauri::utils::config::AppDirectoriesOverride::Root(
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().expect("project directory").join(".local-data")
        ));
    }
    tauri::Builder::default()
        .manage(Arc::new(downloads::Downloader::default()))
        .invoke_handler(tauri::generate_handler![set_wallpaper, export_wallpaper, open_source, get_download_state, start_daily_downloads, cancel_daily_downloads])
        .run(context)
        .expect("Unable to start Qingye");
}

#[cfg(test)]
mod tests {
    use super::validate_id;
    #[test]
    fn rejects_paths_as_image_identifiers() {
        for id in ["", "../secret", "a/b", "a\\b", "C:system", "a.png"] { assert!(validate_id(id).is_err()); }
        assert!(validate_id("commons-12345").is_ok());
        assert!(validate_id("local-0123abcdef").is_ok());
    }
}
