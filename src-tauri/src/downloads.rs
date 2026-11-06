use chrono::{Local, Utc};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::{BTreeMap, HashSet}, fs, io::Read, path::{Path, PathBuf}, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}, time::Duration};

const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedWallpaper {
    pub id: String, pub title: String, pub category: String,
    pub width: u32, pub height: u32, pub original_width: u32, pub original_height: u32,
    pub author: String, pub license: String, pub license_url: String, pub source: String,
    pub original_title: String, pub bytes: u64, pub added_at: String, pub kind: String,
    pub file_name: String, pub content_hash: String, pub downloaded_day: String,
}
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Catalog {
    #[serde(default)] wallpapers: Vec<CachedWallpaper>,
    #[serde(default)] retry_after_ms: Option<i64>,
    #[serde(default)] search_offsets: BTreeMap<String, u32>,
    #[serde(default)] last_error: Option<String>,
}
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadStatus {
    pub running: bool, pub cancel_requested: bool, pub day: String,
    pub target: u32, pub completed: usize, pub failed: usize,
    pub last_error: Option<String>, pub retry_after_ms: Option<i64>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperView { #[serde(flatten)] wallpaper: CachedWallpaper, file_path: String }
#[derive(Serialize)]
pub struct Snapshot { pub status: DownloadStatus, pub wallpapers: Vec<WallpaperView> }
#[derive(Default)]
pub struct Downloader { status: Mutex<DownloadStatus>, cancel: AtomicBool }

fn today() -> String { Local::now().format("%Y-%m-%d").to_string() }
fn read_catalog(root: &Path) -> Result<Catalog, String> {
    let path = root.join("library/catalog.json");
    match fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| format!("本地下载目录索引无法读取，已保留原文件：{e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Catalog::default()),
        Err(e) => Err(e.to_string()),
    }
}
fn save_catalog(root: &Path, catalog: &Catalog) -> Result<(), String> {
    let folder = root.join("library");
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let bytes = serde_json::to_vec_pretty(catalog).map_err(|e| e.to_string())?;
    let temporary = folder.join("catalog.tmp");
    fs::write(&temporary, bytes).map_err(|e| e.to_string())?;
    fs::rename(temporary, folder.join("catalog.json")).map_err(|e| e.to_string())
}
fn daily_count(catalog: &Catalog, day: &str) -> usize { catalog.wallpapers.iter().filter(|w| w.downloaded_day == day).count() }
fn safe_file_name(name: &str) -> bool {
    !name.is_empty() && name.len() < 150 && name.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.')) && !name.contains("..")
}
impl Downloader {
    pub fn snapshot(&self, root: &Path, target: u32) -> Result<Snapshot, String> {
        let catalog = read_catalog(root)?;
        let mut status = self.status.lock().map_err(|e| e.to_string())?.clone();
        if !status.running { status.day = today(); status.target = target; }
        status.completed = daily_count(&catalog, &status.day);
        status.retry_after_ms = catalog.retry_after_ms;
        if status.last_error.is_none() { status.last_error = catalog.last_error.clone(); }
        let wallpapers = catalog.wallpapers.into_iter().filter(|w| safe_file_name(&w.file_name))
            .filter_map(|wallpaper| {
                let file = root.join("library/images").join(&wallpaper.file_name);
                file.is_file().then(|| WallpaperView { wallpaper, file_path: file.to_string_lossy().into_owned() })
            }).collect();
        Ok(Snapshot { status, wallpapers })
    }
    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::Relaxed);
        if let Ok(mut status) = self.status.lock() { if status.running { status.cancel_requested = true; } }
    }
    pub fn start(self: &Arc<Self>, root: PathBuf, target: u32, exclude_ids: Vec<String>) -> Result<(), String> {
        if ![12, 24, 48].contains(&target) { return Err("每日数量必须为 12、24 或 48".into()); }
        if exclude_ids.len() > 100_000 { return Err("图库标识过多".into()); }
        {
            let catalog = read_catalog(&root)?;
            let mut status = self.status.lock().map_err(|e| e.to_string())?;
            if status.running { return Ok(()); }
            let day = today();
            let completed = daily_count(&catalog, &day);
            if completed >= target as usize { return Ok(()); }
            if catalog.retry_after_ms.is_some_and(|time| time > Utc::now().timestamp_millis()) { return Ok(()); }
            self.cancel.store(false, Ordering::Relaxed);
            *status = DownloadStatus { running: true, day, target, completed, ..Default::default() };
        }
        let service = Arc::clone(self);
        std::thread::spawn(move || service.run(&root, target, exclude_ids));
        Ok(())
    }
    fn update_error(&self, message: String) {
        if let Ok(mut status) = self.status.lock() { status.last_error = Some(message); }
    }
    fn run(&self, root: &Path, target: u32, exclude_ids: Vec<String>) {
        let result = self.download(root, target, exclude_ids);
        if let Err(error) = result { self.update_error(error); }
        if let Ok(mut status) = self.status.lock() { status.running = false; status.cancel_requested = false; }
    }
    fn pause(&self, milliseconds: u64) -> bool {
        for _ in 0..milliseconds.div_ceil(200) {
            if self.cancel.load(Ordering::Relaxed) { return false; }
            std::thread::sleep(Duration::from_millis(200));
        }
        !self.cancel.load(Ordering::Relaxed)
    }
    fn download(&self, root: &Path, target: u32, exclude_ids: Vec<String>) -> Result<(), String> {
        fs::create_dir_all(root.join("library/images")).map_err(|e| e.to_string())?;
        // OS file lock is released on process exit, including an interrupted download.
        let lock = fs::OpenOptions::new().create(true).read(true).write(true).truncate(false).open(root.join("library/sync.lock")).map_err(|e| e.to_string())?;
        lock.try_lock().map_err(|_| "另一个青野窗口正在下载，请稍后重试".to_string())?;
        let mut catalog = read_catalog(root)?;
        let day = today();
        if daily_count(&catalog, &day) >= target as usize { return Ok(()); }
        if catalog.retry_after_ms.is_some_and(|time| time > Utc::now().timestamp_millis()) { return Ok(()); }
        let client = Client::builder().user_agent("QingyeWallpaper/0.1.1 (desktop wallpaper app; licensed Commons images; serial downloads)")
            .timeout(Duration::from_secs(45)).connect_timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() < 5 && allowed_url(attempt.url()) { attempt.follow() } else { attempt.stop() }
            })).build().map_err(|e| e.to_string())?;
        let mut ids: HashSet<String> = exclude_ids.into_iter().collect();
        ids.extend(catalog.wallpapers.iter().map(|w| w.id.clone()));
        let mut hashes: HashSet<String> = catalog.wallpapers.iter().map(|w| w.content_hash.clone()).collect();
        // Change query topic each day; advance through search pages without downloading duplicates.
        let topics = [("山野", "mountains lake landscape -painting -drawing -map"), ("森林", "forest landscape -painting -drawing -map"), ("海岸", "coast beach landscape -painting -drawing -map"), ("湖泊", "lake reflection landscape -painting -drawing -map"), ("花卉", "flowers field landscape -painting -drawing -map")];
        let topic_index = day.bytes().map(usize::from).sum::<usize>() % topics.len();
        for batch in 0..8 {
            if self.cancel.load(Ordering::Relaxed) || today() != day || daily_count(&catalog, &day) >= target as usize { break; }
            let (category, query) = topics[(topic_index + batch / 2) % topics.len()];
            let offset = catalog.search_offsets.get(query).copied().unwrap_or(0) % 9000;
            let params = [
                ("action", "query".to_string()), ("format", "json".into()), ("generator", "search".into()),
                ("gsrsearch", format!("{query} filetype:bitmap")), ("gsrnamespace", "6".into()),
                ("gsrlimit", "40".into()), ("gsroffset", offset.to_string()),
                ("prop", "imageinfo".into()), ("iiprop", "url|size|mime|extmetadata".into()),
                ("iiurlwidth", "1920".into()), ("iiextmetadatafilter", "Artist|LicenseShortName|LicenseUrl|AttributionRequired|Copyrighted".into()),
            ];
            let response = match client.get("https://commons.wikimedia.org/w/api.php").query(&params).send() {
                Ok(response) => response,
                Err(error) => return self.retry_error(root, &mut catalog, format!("连接 Wikimedia Commons 失败：{error}"), 5 * 60_000),
            };
            if response.status().as_u16() == 429 {
                let delay = response.headers().get("retry-after").and_then(|v| v.to_str().ok()).map(retry_delay_ms).unwrap_or(5 * 60_000);
                return self.retry_error(root, &mut catalog, "来源正在限流，将按要求稍后重试".into(), delay);
            }
            if !response.status().is_success() { return self.retry_error(root, &mut catalog, format!("来源返回 HTTP {}", response.status()), 5 * 60_000); }
            let data: Value = response.json().map_err(|e| format!("来源响应无法解析：{e}"))?;
            if let Some(error) = data.get("error") { return self.retry_error(root, &mut catalog, format!("来源暂时不可用：{}", error["info"].as_str().unwrap_or("API error")), 5 * 60_000); }
            let mut candidates: Vec<&Value> = data["query"]["pages"].as_object().map(|pages| pages.values().collect()).unwrap_or_default();
            catalog.search_offsets.insert(query.to_string(), if candidates.is_empty() { 0 } else { offset + 40 });
            save_catalog(root, &catalog)?;
            candidates.sort_by_key(|p| p["index"].as_u64().unwrap_or(u64::MAX));
            for page in candidates {
                if self.cancel.load(Ordering::Relaxed) || today() != day || daily_count(&catalog, &day) >= target as usize { break; }
                let Some(candidate) = candidate_from_page(page, category) else { continue; };
                if ids.contains(&candidate.id) { continue; }
                let id = candidate.id.clone();
                match download_image(&client, root, candidate, &day, &hashes, &ids) {
                    Ok(Some(wallpaper)) => {
                        hashes.insert(wallpaper.content_hash.clone());
                        catalog.wallpapers.push(wallpaper);
                        catalog.retry_after_ms = None;
                        catalog.last_error = None;
                        save_catalog(root, &catalog)?;
                        if let Ok(mut status) = self.status.lock() { status.completed = daily_count(&catalog, &day); status.last_error = None; }
                    }
                    Ok(None) => {},
                    Err(error) if error.rate_limited => return self.retry_error(root, &mut catalog, error.message, error.delay_ms),
                    Err(error) => {
                        if let Ok(mut status) = self.status.lock() { status.failed += 1; status.last_error = Some(error.message); }
                    }
                }
                ids.insert(id);
                if !self.pause(2200) { break; }
            }
            if !self.pause(3000) { break; }
        }
        if daily_count(&catalog, &day) < target as usize && !self.cancel.load(Ordering::Relaxed) && today() == day {
            let completed = daily_count(&catalog, &day);
            return self.retry_error(root, &mut catalog, format!("本次可用图片不足，今日已入库 {completed} / {target} 张；稍后可补齐"), 15 * 60_000);
        }
        Ok(())
    }
    fn retry_error(&self, root: &Path, catalog: &mut Catalog, message: String, delay: i64) -> Result<(), String> {
        catalog.retry_after_ms = Some(Utc::now().timestamp_millis() + delay.max(1000));
        catalog.last_error = Some(message.clone());
        save_catalog(root, catalog)?;
        Err(message)
    }
}

fn allowed_url(url: &url::Url) -> bool {
    url.scheme() == "https" && url.username().is_empty() && url.password().is_none() && url.port_or_known_default() == Some(443)
        && matches!(url.host_str(), Some("commons.wikimedia.org" | "upload.wikimedia.org" | "thumb.wikimedia.org"))
}
fn plain_text(value: &str) -> String {
    let mut inside = false;
    value.chars().filter(|c| { if *c == '<' { inside = true; false } else if *c == '>' { inside = false; false } else { !inside } }).collect::<String>()
        .replace("&amp;", "&").replace("&quot;", "\"").replace("&#39;", "'").trim().to_string()
}
fn allowed_license(short: &str, link: &str) -> bool {
    let Ok(url) = url::Url::parse(link) else { return false; };
    let official = url.host_str() == Some("creativecommons.org") && matches!(url.scheme(), "https" | "http") && url.username().is_empty() && url.password().is_none();
    official && ((short.starts_with("CC BY ") && url.path().starts_with("/licenses/by/"))
        || (short.starts_with("CC BY-SA ") && url.path().starts_with("/licenses/by-sa/"))
        || (short == "CC0" && url.path().starts_with("/publicdomain/zero/")))
}
struct Candidate { id: String, title: String, category: String, width: u32, height: u32, author: String, license: String, license_url: String, source: String, image_url: String }
fn candidate_from_page(page: &Value, category: &str) -> Option<Candidate> {
    let info = &page["imageinfo"][0];
    let width = info["width"].as_u64()? as u32; let height = info["height"].as_u64()? as u32;
    if width < 1920 || height == 0 || !(1.4..=2.5).contains(&(width as f64 / height as f64)) { return None; }
    if !matches!(info["mime"].as_str()?, "image/jpeg" | "image/png" | "image/webp") { return None; }
    let meta = &info["extmetadata"];
    let license = plain_text(meta["LicenseShortName"]["value"].as_str()?);
    let license_url = meta["LicenseUrl"]["value"].as_str()?;
    if !allowed_license(&license, license_url) { return None; }
    let author = plain_text(meta["Artist"]["value"].as_str()?);
    if author.is_empty() { return None; }
    let source = info["descriptionurl"].as_str()?.to_string();
    let source_url = url::Url::parse(&source).ok()?;
    if source_url.scheme() != "https" || source_url.host_str() != Some("commons.wikimedia.org") { return None; }
    let image_url = info["thumburl"].as_str()?.to_string();
    if !allowed_url(&url::Url::parse(&image_url).ok()?) { return None; }
    Some(Candidate { id: format!("commons-{}", page["pageid"].as_u64()?), title: page["title"].as_str()?.trim_start_matches("File:").to_string(), category: category.into(), width, height, author, license, license_url: license_url.replacen("http://", "https://", 1), source, image_url })
}
struct ImageError { message: String, rate_limited: bool, delay_ms: i64 }
impl ImageError { fn ordinary(message: impl ToString) -> Self { Self { message: message.to_string(), rate_limited: false, delay_ms: 0 } } }
fn retry_delay_ms(value: &str) -> i64 {
    value.parse::<i64>().map(|seconds| seconds.saturating_mul(1000)).unwrap_or_else(|_| chrono::DateTime::parse_from_rfc2822(value).map(|date| date.timestamp_millis() - Utc::now().timestamp_millis()).unwrap_or(300_000)).max(1000)
}
fn download_image(client: &Client, root: &Path, candidate: Candidate, day: &str, hashes: &HashSet<String>, ids: &HashSet<String>) -> Result<Option<CachedWallpaper>, ImageError> {
    let response = client.get(&candidate.image_url).send().map_err(ImageError::ordinary)?;
    if response.status().as_u16() == 429 {
        let delay = response.headers().get("retry-after").and_then(|v| v.to_str().ok()).map(retry_delay_ms).unwrap_or(300_000);
        return Err(ImageError { message: "图片来源限流，将稍后重试".into(), rate_limited: true, delay_ms: delay });
    }
    if !response.status().is_success() { return Err(ImageError::ordinary(format!("图片下载 HTTP {}", response.status()))); }
    if response.content_length().is_some_and(|size| size > MAX_IMAGE_BYTES) { return Err(ImageError::ordinary("图片超过单张 20 MB 限制")); }
    let mut bytes = Vec::new();
    response.take(MAX_IMAGE_BYTES + 1).read_to_end(&mut bytes).map_err(ImageError::ordinary)?;
    if bytes.len() as u64 > MAX_IMAGE_BYTES { return Err(ImageError::ordinary("图片超过单张 20 MB 限制")); }
    let hash = format!("{:x}", Sha256::digest(&bytes));
    if hashes.contains(&hash) || ids.contains(&format!("local-{hash}")) { return Ok(None); }
    let mut reader = image::ImageReader::new(std::io::Cursor::new(&bytes)).with_guessed_format().map_err(ImageError::ordinary)?;
    let format = reader.format().ok_or_else(|| ImageError::ordinary("无效的图片内容"))?;
    let extension = match format { image::ImageFormat::Jpeg => "jpg", image::ImageFormat::Png => "png", image::ImageFormat::WebP => "webp", _ => return Err(ImageError::ordinary("不支持的图片格式")) };
    let mut limits = image::Limits::default(); limits.max_image_width = Some(12000); limits.max_image_height = Some(12000); limits.max_alloc = Some(256 * 1024 * 1024); reader.limits(limits);
    let decoded = reader.decode().map_err(ImageError::ordinary)?;
    let width = decoded.width(); let height = decoded.height(); drop(decoded);
    if width < 1280 || height == 0 { return Err(ImageError::ordinary("图片尺寸不适合桌面")); }
    let file_name = format!("{}-{}.{}", candidate.id, &hash[..16], extension);
    let folder = root.join("library/images");
    let temporary = folder.join(format!("{file_name}.part"));
    fs::write(&temporary, &bytes).map_err(ImageError::ordinary)?;
    fs::rename(&temporary, folder.join(&file_name)).map_err(ImageError::ordinary)?;
    let title = display_title(&candidate.title);
    Ok(Some(CachedWallpaper { id: candidate.id, title, category: candidate.category, width, height, original_width: candidate.width, original_height: candidate.height, author: candidate.author, license: candidate.license, license_url: candidate.license_url, source: candidate.source, original_title: candidate.title, bytes: bytes.len() as u64, added_at: Utc::now().to_rfc3339(), kind: "download".into(), file_name, content_hash: hash, downloaded_day: day.into() }))
}
fn display_title(original: &str) -> String {
    let stem = original.rsplit_once('.').map(|(stem, _)| stem).unwrap_or(original).replace('_', " ");
    if stem.chars().count() > 24 { format!("{}…", stem.chars().take(24).collect::<String>()) } else { stem }
}

pub fn run_smoke(root: &Path, target: u32) -> Result<(), String> {
    if ![1, 24].contains(&target) { return Err("Smoke count must be 1 or 24".into()); }
    let service = Downloader::default();
    *service.status.lock().unwrap() = DownloadStatus { running: true, day: today(), target, ..Default::default() };
    let sample_catalog: Value = serde_json::from_str(include_str!("../../src/data/wallpapers.json")).map_err(|e| e.to_string())?;
    let excluded = sample_catalog.as_array().map(|rows| rows.iter().filter_map(|row| row["id"].as_str().map(str::to_owned)).collect()).unwrap_or_default();
    service.run(root, target, excluded);
    let snapshot = service.snapshot(root, target)?;
    fs::write(root.join("report.json"), serde_json::to_vec_pretty(&snapshot).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    if snapshot.status.completed < target as usize { return Err(snapshot.status.last_error.unwrap_or("Download incomplete".into())); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn validates_source_hosts_and_licenses() {
        assert!(allowed_url(&url::Url::parse("https://upload.wikimedia.org/example.jpg").unwrap()));
        for url in ["http://upload.wikimedia.org/a", "https://upload.wikimedia.org.evil.test/a", "https://127.0.0.1/a", "https://u@upload.wikimedia.org/a"] { assert!(!allowed_url(&url::Url::parse(url).unwrap())); }
        assert!(allowed_license("CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"));
        assert!(!allowed_license("CC BY-NC 4.0", "https://creativecommons.org/licenses/by-nc/4.0/"));
        assert!(!allowed_license("CC BY 4.0", "https://example.com/licenses/by/4.0/"));
        assert!(!allowed_license("CC BY 4.0", "https://creativecommons.org/licenses/by-nc/4.0/"));
        assert!(safe_file_name("commons-123-abc.jpg")); assert!(!safe_file_name("../catalog.json"));
    }
    #[test] fn parses_retry_after_without_skipping_backoff() { assert_eq!(retry_delay_ms("120"), 120_000); assert_eq!(retry_delay_ms("bad"), 300_000); }
    #[test] fn catalog_survives_atomic_replacement_and_corruption_is_not_overwritten() {
        let test_parent = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join(".local-data");
        let root = test_parent.join(format!("qingye-catalog-test-{}", Utc::now().timestamp_nanos_opt().unwrap()));
        save_catalog(&root, &Catalog::default()).unwrap();
        save_catalog(&root, &Catalog { retry_after_ms: Some(123), ..Default::default() }).unwrap();
        assert_eq!(read_catalog(&root).unwrap().retry_after_ms, Some(123));
        fs::write(root.join("library/catalog.json"), b"corrupt").unwrap();
        assert!(read_catalog(&root).is_err());
        assert_eq!(fs::read(root.join("library/catalog.json")).unwrap(), b"corrupt");
        assert!(root.is_absolute() && root.starts_with(&test_parent));
        fs::remove_dir_all(root).unwrap();
    }
}
