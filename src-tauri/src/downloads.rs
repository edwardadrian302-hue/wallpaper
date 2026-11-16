use chrono::{Local, Utc};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::{BTreeMap, HashSet}, fs, io::Read, path::{Path, PathBuf}, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}, time::Duration};

use crate::providers::{self, Source};

const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;
const TOPICS: [(&str, &str); 7] = [
    ("人物写真", "woman portrait"), ("宇宙", "galaxy nebula space"),
    ("山野", "mountains"), ("森林", "forest"), ("海岸", "coast"), ("湖泊", "lake"), ("花卉", "flowers"),
];
fn search_topic(source: Source, index: usize) -> (&'static str, &'static str) {
    if source == Source::Nasa { ("宇宙", ["earth", "nebula", "galaxy", "moon"][(index / 2) % 4]) }
    else { TOPICS[index % TOPICS.len()] }
}
pub fn selected_topics(types: &[String]) -> Result<Vec<(&'static str, &'static str)>, String> {
    let topics: Vec<_> = TOPICS.iter().copied().filter(|(name, _)| types.iter().any(|t| t == name)).collect();
    if topics.is_empty() { Err("请至少选择一种下载类型".into()) } else { Ok(topics) }
}
pub fn selected_sources(sources: Vec<Source>, types: &[String]) -> Result<Vec<Source>, String> {
    selected_topics(types)?;
    let sources: Vec<_> = providers::normalize(sources).into_iter().filter(|s| *s != Source::Nasa || types.iter().any(|t| t == "宇宙")).collect();
    if sources.is_empty() { Err("NASA 仅提供宇宙类型，请勾选宇宙或启用其他来源".into()) } else { Ok(sources) }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedWallpaper {
    #[serde(default)] pub deleted: bool,
    #[serde(default)] pub manual_download: bool,
    #[serde(default)] pub provider: Source,
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
    #[serde(default)] source_retries: BTreeMap<Source, RetryState>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RetryState { retry_after_ms: i64, error: String }
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceProgress { pub id: Source, pub name: String, pub target: u32, pub completed: usize, pub retry_after_ms: Option<i64>, pub last_error: Option<String> }
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadStatus {
    pub manual: bool, pub daily_completed: usize,
    #[serde(skip)] baseline: BTreeMap<Source, usize>,
    pub running: bool, pub cancel_requested: bool, pub day: String,
    pub target: u32, pub completed: usize, pub failed: usize,
    pub last_error: Option<String>, pub retry_after_ms: Option<i64>,
    pub sources: Vec<SourceProgress>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperView { #[serde(flatten)] wallpaper: CachedWallpaper, file_path: String }
#[derive(Serialize)]
pub struct Snapshot { pub status: DownloadStatus, pub wallpapers: Vec<WallpaperView> }
#[derive(Serialize)]
pub struct DeleteResult { pub deleted: Vec<String>, pub warning: Option<String> }
#[derive(Default)]
pub struct Downloader { status: Mutex<DownloadStatus>, cancel: AtomicBool }

fn today() -> String { Local::now().format("%Y-%m-%d").to_string() }
fn read_catalog(root: &Path) -> Result<Catalog, String> {
    let path = root.join("library/catalog.json");
    match fs::read(&path) {
        Ok(bytes) => {
            let mut catalog: Catalog = serde_json::from_slice(&bytes).map_err(|e| format!("本地下载目录索引无法读取，已保留原文件：{e}"))?;
            if let Some(time) = catalog.retry_after_ms.take() {
                catalog.source_retries.entry(Source::Wikimedia).or_insert(RetryState { retry_after_ms: time, error: catalog.last_error.take().unwrap_or_default() });
            }
            Ok(catalog)
        },
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
fn source_count(catalog: &Catalog, day: &str, source: Source) -> usize { catalog.wallpapers.iter().filter(|w| !w.manual_download && w.downloaded_day == day && w.provider == source).count() }
fn daily_count(catalog: &Catalog, day: &str) -> usize { catalog.wallpapers.iter().filter(|w| !w.manual_download && w.downloaded_day == day).count() }
#[derive(Clone)]
struct DownloadPlan { manual: bool, day: String, baseline: BTreeMap<Source, usize> }
impl DownloadPlan {
    fn source_count(&self, catalog: &Catalog, source: Source) -> usize {
        if self.manual { catalog.wallpapers.iter().filter(|w| w.provider == source).count().saturating_sub(*self.baseline.get(&source).unwrap_or(&0)) }
        else { source_count(catalog, &self.day, source) }
    }
    fn completed(&self, catalog: &Catalog) -> usize {
        if self.manual { self.baseline.keys().map(|s| self.source_count(catalog, *s)).sum() }
        else { daily_count(catalog, &self.day) }
    }
}
fn safe_file_name(name: &str) -> bool {
    !name.is_empty() && name.len() < 150 && name.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.')) && !name.contains("..")
}
impl Downloader {
    pub fn delete_wallpapers(&self, root: &Path, ids: Vec<String>) -> Result<DeleteResult, String> {
        if ids.is_empty() || ids.len() > 100_000 { return Err("请选择需要删除的壁纸".into()); }
        let status = self.status.lock().unwrap();
        if status.running { return Err("请先暂停或等待下载完成，再删除壁纸".into()); }
        fs::create_dir_all(root.join("library")).map_err(|e| e.to_string())?;
        let lock = fs::OpenOptions::new().create(true).read(true).write(true).truncate(false).open(root.join("library/sync.lock")).map_err(|e| e.to_string())?;
        lock.try_lock().map_err(|_| "图库正被其他窗口使用，请稍后重试")?;
        let mut catalog = read_catalog(root)?;
        let ids: HashSet<_> = ids.into_iter().collect();
        let mut moved = Vec::new();
        let mut deleted = Vec::new();
        let result = (|| -> Result<(), String> {
            for w in catalog.wallpapers.iter_mut().filter(|w| !w.deleted && ids.contains(&w.id)) {
                if !safe_file_name(&w.file_name) { return Err("图片文件名无效，已取消删除".into()); }
                let path = root.join("library/images").join(&w.file_name);
                match fs::symlink_metadata(&path) {
                    Ok(meta) => {
                        if !meta.is_file() || meta.file_type().is_symlink() { return Err("图片路径异常，已取消删除".into()); }
                        let library = root.join("library").canonicalize().map_err(|e| e.to_string())?;
                        let parent = root.join("library/images").canonicalize().map_err(|e| e.to_string())?;
                        if library.parent() != Some(root.canonicalize().map_err(|e| e.to_string())?.as_path()) || parent.parent() != Some(library.as_path()) { return Err("图库目录异常，已取消删除".into()); }
                        if path.canonicalize().map_err(|e| e.to_string())?.parent() != Some(parent.as_path()) { return Err("图片路径超出图库".into()); }
                        let staged = path.with_file_name(format!(".delete-{}-{}", Utc::now().timestamp_nanos_opt().unwrap_or_default(), w.file_name));
                        fs::rename(&path, &staged).map_err(|e| e.to_string())?;
                        moved.push((path, staged));
                    },
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {},
                    Err(e) => return Err(e.to_string()),
                }
                w.deleted = true;
                deleted.push(w.id.clone());
            }
            save_catalog(root, &catalog)
        })();
        if let Err(error) = result {
            let mut rollback_errors = Vec::new();
            for (path, staged) in moved.iter().rev() {
                if let Err(e) = fs::rename(staged, path) { rollback_errors.push(e.to_string()); }
            }
            return Err(format!("删除失败：{error}{}", if rollback_errors.is_empty() { String::new() } else { format!("；文件恢复失败，请保留图库目录：{}", rollback_errors.join("；")) }));
        }
        let mut warnings = Vec::new();
        for (_, staged) in moved { if let Err(e) = fs::remove_file(staged) { warnings.push(e.to_string()); } }
        Ok(DeleteResult { deleted, warning: if warnings.is_empty() { None } else { Some(format!("图库记录已移除，部分暂存文件未能清理：{}", warnings.join("；"))) } })
    }
    pub fn save_search_result(&self, root: &Path, candidate: Candidate, exclude_ids: Vec<String>) -> Result<bool, String> {
        if exclude_ids.len() > 100_000 { return Err("图库标识过多".into()); }
        let catalog = read_catalog(root)?;
        {
            let mut status = self.status.lock().map_err(|e| e.to_string())?;
            if status.running { return Err("已有下载任务正在进行，请完成或暂停后再下载搜索图片".into()); }
            let baseline = [(candidate.provider, catalog.wallpapers.iter().filter(|w| w.provider == candidate.provider).count())].into_iter().collect();
            *status = DownloadStatus { running: true, manual: true, baseline, day: today(), target: 1, ..Default::default() };
        }
        let result = (|| {
            fs::create_dir_all(root.join("library/images")).map_err(|e| e.to_string())?;
            let lock = fs::OpenOptions::new().create(true).read(true).write(true).truncate(false).open(root.join("library/sync.lock")).map_err(|e| e.to_string())?;
            lock.try_lock().map_err(|_| "另一个潮汐窗口正在下载".to_string())?;
            let mut catalog = read_catalog(root)?;
            if exclude_ids.contains(&candidate.id) || catalog.wallpapers.iter().any(|w| w.id == candidate.id) { return Ok(false); }
            if let Some(retry) = catalog.source_retries.get(&candidate.provider).filter(|r| r.retry_after_ms > Utc::now().timestamp_millis()) {
                return Err(format!("{}，请稍后再试", retry.error));
            }
            let source = candidate.provider;
            let client = Client::builder().user_agent("ChaoxiWallpaper/1.1.0")
                .connect_timeout(Duration::from_secs(15)).timeout(Duration::from_secs(45))
                .redirect(reqwest::redirect::Policy::custom(move |attempt| {
                    if attempt.previous().len() < 5 && providers::allowed_image_url(source, attempt.url()) { attempt.follow() } else { attempt.stop() }
                })).build().map_err(|e| e.to_string())?;
            let hashes = catalog.wallpapers.iter().map(|w| w.content_hash.clone()).collect();
            let mut ids: HashSet<String> = exclude_ids.into_iter().collect();
            ids.extend(catalog.wallpapers.iter().map(|w| w.id.clone()));
            match download_image(&client, root, candidate, &today(), &hashes, &ids) {
                Ok(Some(mut wallpaper)) => {
                    wallpaper.manual_download = true;
                    catalog.wallpapers.push(wallpaper);
                    catalog.source_retries.remove(&source);
                    save_catalog(root, &catalog)?;
                    Ok(true)
                },
                Ok(None) => Ok(false),
                Err(error) => {
                    if error.rate_limited {
                        catalog.source_retries.insert(source, RetryState { retry_after_ms: Utc::now().timestamp_millis() + error.delay_ms, error: error.message.clone() });
                        save_catalog(root, &catalog)?;
                    }
                    Err(error.message)
                },
            }
        })();
        if let Ok(mut status) = self.status.lock() { status.running = false; status.cancel_requested = false; }
        result
    }
    pub fn snapshot(&self, root: &Path, target: u32, sources: Vec<Source>) -> Result<Snapshot, String> {
        let catalog = read_catalog(root)?;
        let mut status = self.status.lock().map_err(|e| e.to_string())?.clone();
        let selection_changed = status.manual && status.baseline.keys().copied().collect::<Vec<_>>() != providers::normalize(sources.clone());
        if !status.running && (!status.manual || status.day != today() || status.target != target || selection_changed) { status.day = today(); status.target = target; status.manual = false; }
        let plan = DownloadPlan { manual: status.manual, day: status.day.clone(), baseline: status.baseline.clone() };
        let selected = if status.manual { status.baseline.keys().copied().collect() } else { sources };
        status.daily_completed = daily_count(&catalog, &today());
        status.completed = plan.completed(&catalog);
        status.sources = providers::quotas(status.target, &selected).into_iter().map(|(id, quota)| {
            let retry = catalog.source_retries.get(&id);
            SourceProgress { id, name: id.name().into(), target: quota, completed: plan.source_count(&catalog, id), retry_after_ms: retry.map(|r| r.retry_after_ms), last_error: retry.map(|r| r.error.clone()) }
        }).collect();
        // Only block automatic retry when every source still needing pictures is cooling down.
        let pending: Vec<_> = status.sources.iter().filter(|s| s.completed < s.target as usize).collect();
        status.retry_after_ms = if !pending.is_empty() && pending.iter().all(|s| s.retry_after_ms.is_some_and(|t| t > Utc::now().timestamp_millis())) {
            pending.iter().filter_map(|s| s.retry_after_ms).min()
        } else { None };
        let fatal_error = status.last_error.take();
        status.last_error = status.sources.iter().filter_map(|s| s.last_error.as_ref().map(|e| format!("{}：{}", s.name, e))).reduce(|a, b| format!("{a}；{b}")).or(fatal_error);
        let wallpapers = catalog.wallpapers.into_iter().filter(|w| !w.deleted && safe_file_name(&w.file_name))
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
    pub fn start(self: &Arc<Self>, root: PathBuf, target: u32, sources: Vec<Source>, exclude_ids: Vec<String>, manual: bool, types: Vec<String>) -> Result<(), String> {
        if ![12, 24, 48].contains(&target) { return Err("每日数量必须为 12、24 或 48".into()); }
        if exclude_ids.len() > 100_000 { return Err("图库标识过多".into()); }
        let sources = selected_sources(sources, &types)?;
        let topics = selected_topics(&types)?;
        let plan = {
            let mut status = self.status.lock().map_err(|e| e.to_string())?;
            let catalog = read_catalog(&root)?;
            if status.running { return Err("已有下载任务正在进行".into()); }
            let day = today();
            let baseline = if manual { sources.iter().map(|s| (*s, catalog.wallpapers.iter().filter(|w| w.provider == *s).count())).collect() } else { BTreeMap::new() };
            let plan = DownloadPlan { manual, day: day.clone(), baseline };
            let completed = plan.completed(&catalog);
            if !manual && completed >= target as usize { return Ok(()); }

            self.cancel.store(false, Ordering::Relaxed);
            *status = DownloadStatus { running: true, day, target, completed, manual, baseline: plan.baseline.clone(), ..Default::default() };
            plan
        };
        let service = Arc::clone(self);
        std::thread::spawn(move || service.run(&root, target, sources, exclude_ids, plan, topics));
        Ok(())
    }
    fn update_error(&self, message: String) {
        if let Ok(mut status) = self.status.lock() { status.last_error = Some(message); }
    }
    fn run(&self, root: &Path, target: u32, sources: Vec<Source>, exclude_ids: Vec<String>, plan: DownloadPlan, topics: Vec<(&'static str, &'static str)>) {
        let result = self.download(root, target, sources, exclude_ids, plan, topics);
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
    fn download(&self, root: &Path, target: u32, sources: Vec<Source>, exclude_ids: Vec<String>, plan: DownloadPlan, topics: Vec<(&'static str, &'static str)>) -> Result<(), String> {
        fs::create_dir_all(root.join("library/images")).map_err(|e| e.to_string())?;
        let lock = fs::OpenOptions::new().create(true).read(true).write(true).truncate(false).open(root.join("library/sync.lock")).map_err(|e| e.to_string())?;
        lock.try_lock().map_err(|_| "另一个潮汐窗口正在下载，请稍后重试".to_string())?;
        let mut catalog = read_catalog(root)?;
        let day = plan.day.clone();
        let mut ids: HashSet<String> = exclude_ids.into_iter().collect();
        ids.extend(catalog.wallpapers.iter().map(|w| w.id.clone()));
        let mut hashes: HashSet<String> = catalog.wallpapers.iter().map(|w| w.content_hash.clone()).collect();
        for (source, quota) in providers::quotas(target, &sources) {
            if self.cancel.load(Ordering::Relaxed) || today() != day || plan.completed(&catalog) >= target as usize { break; }
            if plan.source_count(&catalog, source) >= quota as usize { continue; }
            if catalog.source_retries.get(&source).is_some_and(|r| r.retry_after_ms > Utc::now().timestamp_millis()) { continue; }
            let client = Client::builder().user_agent("ChaoxiWallpaper/1.1.0 (+https://github.com/edwardadrian302-hue/wallpaper; serial downloads)")
                .timeout(Duration::from_secs(45)).connect_timeout(Duration::from_secs(15))
                .redirect(reqwest::redirect::Policy::custom(move |attempt| {
                    if attempt.previous().len() < 5 && providers::allowed_image_url(source, attempt.url()) { attempt.follow() } else { attempt.stop() }
                })).build().map_err(|e| e.to_string())?;
            let mut failure = None;
            let topic_key = format!("topic-cycle:{source:?}");
            let topic_start = catalog.search_offsets.get(&topic_key).copied().unwrap_or(0) as usize % topics.len();
            let batches = if source == Source::Nasa { 8 } else { topics.len() * 2 };
            for batch in 0..batches {
                if self.cancel.load(Ordering::Relaxed) || today() != day || plan.completed(&catalog) >= target as usize || plan.source_count(&catalog, source) >= quota as usize { break; }
                let (category, query) = if source == Source::Nasa { search_topic(source, batch) } else { topics[(topic_start + batch) % topics.len()] };
                // Give other themes a turn before a single search fills the source quota.
                let batch_goal = if source == Source::Nasa { quota as usize } else {
                    (plan.source_count(&catalog, source) + quota.div_ceil(topics.len() as u32) as usize).min(quota as usize)
                };
                let key = format!("{source:?}:{query}");
                let offset = catalog.search_offsets.get(&key).copied().unwrap_or(0);
                let (candidates, next) = match providers::fetch(&client, source, query, category, offset) {
                    Ok(result) => result,
                    Err(error) => { failure = Some(error); break; }
                };
                // Keep the current page on cancellation/rate limiting so unprocessed results are retried.
                for candidate in candidates {
                    if self.cancel.load(Ordering::Relaxed) || today() != day || plan.completed(&catalog) >= target as usize || plan.source_count(&catalog, source) >= batch_goal { break; }
                    if ids.contains(&candidate.id) { continue; }
                    let id = candidate.id.clone();
                    match download_image(&client, root, candidate, &day, &hashes, &ids) {
                        Ok(Some(mut wallpaper)) => {
                            wallpaper.manual_download = plan.manual;
                            hashes.insert(wallpaper.content_hash.clone());
                            catalog.wallpapers.push(wallpaper);
                            catalog.source_retries.remove(&source);
                            if let Ok(mut status) = self.status.lock() { status.last_error = None; }
                            save_catalog(root, &catalog)?;
                        }
                        Ok(None) => {},
                        Err(error) if error.rate_limited => { failure = Some(error); break; }
                        Err(error) => { if let Ok(mut status) = self.status.lock() { status.failed += 1; status.last_error = Some(error.message); } }
                    }
                    ids.insert(id);
                    if !self.pause(2200) { break; }
                }
                if self.cancel.load(Ordering::Relaxed) || failure.is_some() { break; }
                catalog.search_offsets.insert(key, next);
                if source != Source::Nasa { catalog.search_offsets.insert(topic_key.clone(), ((topic_start + batch + 1) % topics.len()) as u32); }
                save_catalog(root, &catalog)?;
                if !self.pause(3000) { break; }
            }
            if !self.cancel.load(Ordering::Relaxed) && today() == day && plan.source_count(&catalog, source) < quota as usize && plan.completed(&catalog) < target as usize {
                let error = failure.unwrap_or_else(|| ImageError { message: format!("可用图片不足，已入库 {} / {} 张", plan.source_count(&catalog, source), quota), rate_limited: false, delay_ms: 900_000 });
                catalog.source_retries.insert(source, RetryState { retry_after_ms: Utc::now().timestamp_millis() + error.delay_ms.max(300_000), error: error.message });
                save_catalog(root, &catalog)?;
            }
        }
        Ok(())
    }
}

fn allowed_url(url: &url::Url) -> bool {
    url.scheme() == "https" && url.username().is_empty() && url.password().is_none() && url.port_or_known_default() == Some(443)
        && matches!(url.host_str(), Some("commons.wikimedia.org" | "upload.wikimedia.org" | "thumb.wikimedia.org"))
}
pub(crate) fn plain_text(value: &str) -> String {
    let mut inside = false;
    value.chars().filter(|c| { if *c == '<' { inside = true; false } else if *c == '>' { inside = false; false } else { !inside } }).collect::<String>()
        .replace("&amp;", "&").replace("&quot;", "\"").replace("&#39;", "'").trim().to_string()
}
pub(crate) fn allowed_license(short: &str, link: &str) -> bool {
    let Ok(url) = url::Url::parse(link) else { return false; };
    let official = url.host_str() == Some("creativecommons.org") && matches!(url.scheme(), "https" | "http") && url.username().is_empty() && url.password().is_none();
    official && ((short.starts_with("CC BY ") && url.path().starts_with("/licenses/by/"))
        || (short.starts_with("CC BY-SA ") && url.path().starts_with("/licenses/by-sa/"))
        || (short == "CC0" && url.path().starts_with("/publicdomain/zero/")))
}
#[derive(Clone)]
pub(crate) struct Candidate { pub provider: Source, pub id: String, pub title: String, pub category: String, pub width: u32, pub height: u32, pub author: String, pub license: String, pub license_url: String, pub source: String, pub image_url: String, pub preview_url: String }
pub(crate) fn candidate_from_page(page: &Value, category: &str) -> Option<Candidate> {
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
    Some(Candidate { provider: Source::Wikimedia, id: format!("commons-{}", page["pageid"].as_u64()?), title: page["title"].as_str()?.trim_start_matches("File:").to_string(), category: category.into(), width, height, author, license, license_url: license_url.replacen("http://", "https://", 1), source, preview_url: image_url.clone(), image_url })
}
pub(crate) struct ImageError { pub message: String, pub rate_limited: bool, pub delay_ms: i64 }
impl ImageError {
    pub(crate) fn ordinary(message: impl ToString) -> Self { Self { message: message.to_string(), rate_limited: false, delay_ms: 0 } }
    pub(crate) fn request(error: reqwest::Error) -> Self {
        use std::error::Error;
        let mut message = error.to_string();
        let mut cause = error.source();
        while let Some(error) = cause { message.push_str(&format!("：{error}")); cause = error.source(); }
        Self::ordinary(message)
    }
}
pub(crate) fn retry_delay_ms(value: &str) -> i64 {
    value.parse::<i64>().map(|seconds| seconds.saturating_mul(1000)).unwrap_or_else(|_| chrono::DateTime::parse_from_rfc2822(value).map(|date| date.timestamp_millis() - Utc::now().timestamp_millis()).unwrap_or(300_000)).max(1000)
}
fn download_image(client: &Client, root: &Path, candidate: Candidate, day: &str, hashes: &HashSet<String>, ids: &HashSet<String>) -> Result<Option<CachedWallpaper>, ImageError> {
    let image_url = if candidate.provider == Source::Nasa {
        let manifest = providers::json(client, &candidate.image_url, &[])?;
        providers::nasa_asset_url(&manifest).ok_or_else(|| ImageError::ordinary("NASA 缺少可下载的 JPG 图片"))?
    } else { candidate.image_url.clone() };
    if !url::Url::parse(&image_url).is_ok_and(|u| providers::allowed_image_url(candidate.provider, &u)) { return Err(ImageError::ordinary("图片地址不在允许的来源内")); }
    let response = client.get(&image_url).send().map_err(ImageError::request)?;
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
    if width < 1280 || height == 0 || !(1.4..=2.5).contains(&(width as f64 / height as f64)) { return Err(ImageError::ordinary("图片尺寸不适合桌面")); }
    let file_name = format!("{}-{}.{}", candidate.id, &hash[..16], extension);
    let folder = root.join("library/images");
    let temporary = folder.join(format!("{file_name}.part"));
    fs::write(&temporary, &bytes).map_err(ImageError::ordinary)?;
    fs::rename(&temporary, folder.join(&file_name)).map_err(ImageError::ordinary)?;
    let title = display_title(&candidate.title);
    Ok(Some(CachedWallpaper { deleted: false, manual_download: false, provider: candidate.provider, id: candidate.id, title, category: candidate.category, width, height, original_width: if candidate.width == 0 { width } else { candidate.width }, original_height: if candidate.height == 0 { height } else { candidate.height }, author: candidate.author, license: candidate.license, license_url: candidate.license_url, source: candidate.source, original_title: candidate.title, bytes: bytes.len() as u64, added_at: Utc::now().to_rfc3339(), kind: "download".into(), file_name, content_hash: hash, downloaded_day: day.into() }))
}
fn display_title(original: &str) -> String {
    let stem = original.rsplit_once('.').map(|(stem, _)| stem).unwrap_or(original).replace('_', " ");
    if stem.chars().count() > 24 { format!("{}…", stem.chars().take(24).collect::<String>()) } else { stem }
}

pub fn run_smoke(root: &Path, target: u32, sources: Vec<Source>, manual: bool) -> Result<(), String> {
    if ![1, 24].contains(&target) { return Err("Smoke count must be 1 or 24".into()); }
    let service = Downloader::default();
    let catalog = read_catalog(root)?;
    let baseline = if manual { sources.iter().map(|s| (*s, catalog.wallpapers.iter().filter(|w| w.provider == *s).count())).collect() } else { BTreeMap::new() };
    let plan = DownloadPlan { manual, day: today(), baseline };
    *service.status.lock().unwrap() = DownloadStatus { running: true, manual, baseline: plan.baseline.clone(), day: today(), target, ..Default::default() };
    let sample_catalog: Value = serde_json::from_str(include_str!("../../src/data/wallpapers.json")).map_err(|e| e.to_string())?;
    let excluded = sample_catalog.as_array().map(|rows| rows.iter().filter_map(|row| row["id"].as_str().map(str::to_owned)).collect()).unwrap_or_default();
    service.run(root, target, sources.clone(), excluded, plan, TOPICS.to_vec());
    let snapshot = service.snapshot(root, target, sources)?;
    fs::write(root.join("report.json"), serde_json::to_vec_pretty(&snapshot).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    if snapshot.status.completed < target as usize { return Err(snapshot.status.last_error.unwrap_or("Download incomplete".into())); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn configured_types_filter_topics_and_incompatible_sources() {
        let types = vec!["花卉".into(), "人物写真".into(), "invalid".into()];
        let topics = selected_topics(&types).unwrap();
        assert_eq!(topics.len(), 2);
        assert!(topics.iter().all(|(name, _)| types.iter().any(|t| t == name)));
        assert_eq!(selected_sources(vec![Source::Nasa, Source::Wikimedia], &types).unwrap(), vec![Source::Wikimedia]);
        assert!(selected_sources(vec![Source::Nasa], &types).is_err());
        assert_eq!(selected_sources(vec![Source::Nasa], &["宇宙".into()]).unwrap(), vec![Source::Nasa]);
        assert!(selected_topics(&[]).is_err());
        assert!(!providers::wikimedia_query("galaxy nebula", "宇宙").contains("landscape"));
    }
    #[test]
    fn batch_deletion_preserves_daily_counts_and_rolls_back_invalid_paths() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join(".local-data").join(format!("delete-test-{}", Utc::now().timestamp_nanos_opt().unwrap()));
        fs::create_dir_all(root.join("library/images")).unwrap();
        let mut catalog = Catalog::default();
        catalog.wallpapers.push(cached(Source::Wikimedia, &today(), "one"));
        catalog.wallpapers.push(cached(Source::Nasa, &today(), "two"));
        for name in ["one.jpg", "two.jpg"] { fs::write(root.join("library/images").join(name), b"image").unwrap(); }
        let service = Downloader::default();
        // Any invalid indexed path cancels the batch and restores already staged files.
        catalog.wallpapers[1].file_name = "../outside.jpg".into();
        save_catalog(&root, &catalog).unwrap();
        assert!(service.delete_wallpapers(&root, vec!["one".into(), "two".into()]).is_err());
        assert!(root.join("library/images/one.jpg").is_file());
        assert!(!read_catalog(&root).unwrap().wallpapers[0].deleted);
        catalog.wallpapers[1].file_name = "two.jpg".into();
        save_catalog(&root, &catalog).unwrap();
        service.status.lock().unwrap().running = true;
        assert!(service.delete_wallpapers(&root, vec!["one".into()]).is_err());
        service.status.lock().unwrap().running = false;
        let result = service.delete_wallpapers(&root, vec!["one".into(), "one".into(), "unknown".into()]).unwrap();
        assert_eq!(result.deleted, vec!["one"]);
        assert!(result.warning.is_none());
        assert!(!root.join("library/images/one.jpg").exists());
        assert!(root.join("library/images/two.jpg").exists());
        let after = read_catalog(&root).unwrap();
        assert_eq!(daily_count(&after, &today()), 2);
        assert_eq!(source_count(&after, &today(), Source::Wikimedia), 1);
        assert_eq!(service.snapshot(&root, 24, vec![Source::Wikimedia]).unwrap().wallpapers.len(), 1);
        assert!(service.delete_wallpapers(&root, vec!["one".into()]).unwrap().deleted.is_empty());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn source_topic_cycle_includes_new_themes_without_landscape_bias() {
        for source in [Source::Wikimedia, Source::Openverse] {
            let cycle: Vec<_> = (0..TOPICS.len()).map(|i| search_topic(source, i)).collect();
            for category in ["人物写真"] {
                let (label, query) = cycle.iter().find(|(label, _)| *label == category).unwrap();
                let search = providers::wikimedia_query(query, label);
                assert!(!search.contains("landscape"));
                assert!(search.contains(query));
            }
            assert_eq!(search_topic(source, TOPICS.len()), search_topic(source, 0));
        }
        assert_eq!(search_topic(Source::Nasa, 0), ("宇宙", "earth"));
        assert!(providers::wikimedia_query("mountains", "山野").contains("landscape"));
    }
    fn cached(provider: Source, day: &str, id: &str) -> CachedWallpaper {
        serde_json::from_value(serde_json::json!({"provider":provider,"id":id,"title":"test","category":"山野","width":1920,"height":1080,"originalWidth":1920,"originalHeight":1080,"author":"Artist","license":"CC0","licenseUrl":"https://creativecommons.org/publicdomain/zero/1.0/","source":"https://commons.wikimedia.org/wiki/File:test","originalTitle":"test","bytes":1,"addedAt":day,"kind":"download","fileName":format!("{id}.jpg"),"contentHash":id,"downloadedDay":day})).unwrap()
    }
    #[test]
    fn source_counts_resume_independently_and_cooldowns_do_not_block_healthy_sources() {
        let parent = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join(".local-data");
        let root = parent.join(format!("source-plan-test-{}", Utc::now().timestamp_nanos_opt().unwrap()));
        let day = today();
        let mut catalog = Catalog::default();
        for source in [Source::Wikimedia, Source::Openverse, Source::Nasa] {
            for n in 0..3 { catalog.wallpapers.push(cached(source, &day, &format!("{source:?}-{n}"))); }
        }
        catalog.wallpapers.push(cached(Source::Nasa, "2000-01-01", "old"));
        let later = Utc::now().timestamp_millis() + 300_000;
        catalog.source_retries.insert(Source::Openverse, RetryState { retry_after_ms: later, error: "rate limit".into() });
        save_catalog(&root, &catalog).unwrap();
        let service = Downloader::default();
        let selected = vec![Source::Wikimedia, Source::Openverse, Source::Nasa];
        let status = service.snapshot(&root, 24, selected.clone()).unwrap().status;
        assert_eq!(status.completed, 9);
        assert_eq!(status.sources.iter().map(|s| (s.completed, s.target)).collect::<Vec<_>>(), vec![(3, 8); 3]);
        assert!(status.retry_after_ms.is_none());
        assert!(status.last_error.unwrap().contains("Openverse"));
        for source in [Source::Wikimedia, Source::Nasa] { catalog.source_retries.insert(source, RetryState { retry_after_ms: later + 1000, error: "retry".into() }); }
        save_catalog(&root, &catalog).unwrap();
        assert_eq!(service.snapshot(&root, 24, selected).unwrap().status.retry_after_ms, Some(later));
        // Changing selected sources preserves today's global count and the existing catalog.
        let status = service.snapshot(&root, 24, vec![Source::Nasa]).unwrap().status;
        assert_eq!(status.completed, 9);
        assert_eq!(status.sources[0].completed, 3);
        assert_eq!(status.sources[0].target, 24);
        assert_eq!(read_catalog(&root).unwrap().wallpapers.len(), 10);
        assert!(root.is_absolute() && root.starts_with(&parent));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn manual_batches_are_additive_balanced_and_do_not_consume_daily_allowance() {
        let day = today();
        let mut catalog = Catalog::default();
        for n in 0..24 { catalog.wallpapers.push(cached(Source::Wikimedia, &day, &format!("daily-{n}"))); }
        let sources = vec![Source::Wikimedia, Source::Openverse, Source::Nasa];
        let baseline = sources.iter().map(|s| (*s, catalog.wallpapers.iter().filter(|w| w.provider == *s).count())).collect();
        let plan = DownloadPlan { manual: true, day: day.clone(), baseline };
        assert_eq!(plan.completed(&catalog), 0);
        for (source, quota) in providers::quotas(24, &sources) {
            for n in 0..quota {
                let mut image = cached(source, &day, &format!("extra-{source:?}-{n}"));
                image.manual_download = true;
                catalog.wallpapers.push(image);
            }
            assert_eq!(plan.source_count(&catalog, source), 8);
        }
        assert_eq!(plan.completed(&catalog), 24);
        assert_eq!(daily_count(&catalog, &day), 24);
        assert_eq!(source_count(&catalog, &day, Source::Wikimedia), 24);
        assert_eq!(source_count(&catalog, &day, Source::Nasa), 0);
        // Every subsequent click takes a fresh baseline, even on the same day.
        let next = DownloadPlan { manual: true, day, baseline: sources.iter().map(|s| (*s, catalog.wallpapers.iter().filter(|w| w.provider == *s).count())).collect() };
        assert_eq!(next.completed(&catalog), 0);
        let restored: Catalog = serde_json::from_slice(&serde_json::to_vec(&catalog).unwrap()).unwrap();
        assert_eq!(daily_count(&restored, &next.day), 24);
        assert_eq!(restored.wallpapers.len(), 48);
    }
    #[test]
    fn old_catalog_images_default_to_wikimedia() {
        let row = cached(Source::Wikimedia, "2026-11-16", "commons-1");
        let mut value = serde_json::to_value(row).unwrap();
        value.as_object_mut().unwrap().remove("provider");
        let migrated: CachedWallpaper = serde_json::from_value(value).unwrap();
        assert_eq!(migrated.provider, Source::Wikimedia);
    }
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
        let root = test_parent.join(format!("chaoxi-catalog-test-{}", Utc::now().timestamp_nanos_opt().unwrap()));
        save_catalog(&root, &Catalog::default()).unwrap();
        save_catalog(&root, &Catalog { retry_after_ms: Some(123), ..Default::default() }).unwrap();
        assert_eq!(read_catalog(&root).unwrap().source_retries[&Source::Wikimedia].retry_after_ms, 123);
        fs::write(root.join("library/catalog.json"), b"corrupt").unwrap();
        assert!(read_catalog(&root).is_err());
        assert_eq!(fs::read(root.join("library/catalog.json")).unwrap(), b"corrupt");
        assert!(root.is_absolute() && root.starts_with(&test_parent));
        fs::remove_dir_all(root).unwrap();
    }
}
