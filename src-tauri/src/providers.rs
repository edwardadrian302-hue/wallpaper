//! Provider adapters. Downloads and redirects are restricted to known HTTPS hosts.
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use crate::downloads::{Candidate, ImageError, allowed_license, candidate_from_page, plain_text, retry_delay_ms};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Source { #[default] Wikimedia, Openverse, Nasa }
impl Source {
    pub fn name(self) -> &'static str { match self { Self::Wikimedia => "Wikimedia Commons", Self::Openverse => "Openverse", Self::Nasa => "NASA" } }
}
pub fn normalize(mut sources: Vec<Source>) -> Vec<Source> {
    sources.sort(); sources.dedup();
    if sources.is_empty() { sources.push(Source::Wikimedia); }
    sources
}
pub fn quotas(target: u32, sources: &[Source]) -> Vec<(Source, u32)> {
    let sources = normalize(sources.to_vec());
    sources.iter().enumerate().map(|(i, source)| (*source, target / sources.len() as u32 + u32::from((i as u32) < target % sources.len() as u32))).collect()
}
pub fn valid_https(url: &url::Url) -> bool {
    url.scheme() == "https" && url.username().is_empty() && url.password().is_none() && url.port_or_known_default() == Some(443)
}
pub fn allowed_image_url(source: Source, url: &url::Url) -> bool {
    if !valid_https(url) { return false; }
    let host = url.host_str().unwrap_or_default();
    let commons = matches!(host, "commons.wikimedia.org" | "upload.wikimedia.org" | "thumb.wikimedia.org");
    match source {
        Source::Wikimedia => commons,
        Source::Openverse => commons || host == "live.staticflickr.com" || host == "farm.staticflickr.com" || host.ends_with(".staticflickr.com"),
        Source::Nasa => matches!(host, "images-assets.nasa.gov" | "images.nasa.gov"),
    }
}
pub fn allowed_link(url: &url::Url) -> bool {
    valid_https(url) && matches!(url.host_str(), Some("commons.wikimedia.org" | "creativecommons.org" | "www.flickr.com" | "flickr.com" | "openverse.org" | "images.nasa.gov" | "www.nasa.gov"))
}
pub fn json(client: &Client, endpoint: &str, params: &[(&str, String)]) -> Result<Value, ImageError> {
    let response = client.get(endpoint).query(params).send().map_err(ImageError::request)?;
    if response.status().as_u16() == 429 || response.status().as_u16() == 503 {
        let delay_ms = response.headers().get("retry-after").and_then(|v| v.to_str().ok()).map(retry_delay_ms).unwrap_or(300_000);
        return Err(ImageError { message: format!("来源返回 HTTP {}，稍后重试", response.status()), rate_limited: true, delay_ms });
    }
    if !response.status().is_success() { return Err(ImageError::ordinary(format!("来源返回 HTTP {}", response.status()))); }
    response.json().map_err(ImageError::ordinary)
}

pub fn wikimedia_query(query: &str, category: &str) -> String {
    match category {
        "在线搜索" | "宇宙" => format!("{query} filetype:bitmap"),
        "人物写真" => format!("{query} -nude -nudity -drawing -painting -map filetype:bitmap"),
        _ => format!("{query} landscape -painting -drawing -map filetype:bitmap"),
    }
}
pub fn fetch(client: &Client, source: Source, query: &str, category: &str, offset: u32) -> Result<(Vec<Candidate>, u32), ImageError> {
    match source {
        Source::Wikimedia => {
            let data = json(client, "https://commons.wikimedia.org/w/api.php", &[
                ("action", "query".into()), ("format", "json".into()), ("generator", "search".into()),
                ("gsrsearch", wikimedia_query(query, category)), ("gsrnamespace", "6".into()),
                ("gsrlimit", "40".into()), ("gsroffset", (offset % 9000).to_string()),
                ("prop", "imageinfo".into()), ("iiprop", "url|size|mime|extmetadata".into()),
                ("iiurlwidth", "1920".into()), ("iiextmetadatafilter", "Artist|LicenseShortName|LicenseUrl|AttributionRequired|Copyrighted".into()),
            ])?;
            if let Some(error) = data.get("error") { return Err(ImageError::ordinary(error["info"].as_str().unwrap_or("Wikimedia API error"))); }
            let pages = data["query"]["pages"].as_object();
            let mut rows: Vec<&Value> = pages.map(|p| p.values().collect()).unwrap_or_default();
            rows.sort_by_key(|p| p["index"].as_u64().unwrap_or(u64::MAX));
            let next = if rows.is_empty() { 0 } else { offset + 40 };
            Ok((rows.into_iter().filter_map(|p| candidate_from_page(p, category)).collect(), next))
        }
        Source::Openverse => {
            // Restrict to hosts whose media URLs and source pages we can validate.
            let data = json(client, "https://api.openverse.org/v1/images/", &[
                ("q", query.into()), ("license", "by,by-sa,cc0".into()), ("source", "flickr,wikimedia".into()),
                ("mature", "false".into()), ("size", "large".into()), ("page_size", "20".into()), ("page", (offset % 20 + 1).to_string()),
            ])?;
            let rows = data["results"].as_array().ok_or_else(|| ImageError::ordinary("Openverse 返回无效的搜索结果"))?;
            Ok((rows.iter().filter_map(|v| openverse_candidate(v, category)).collect(), if rows.is_empty() { 0 } else { offset + 1 }))
        }
        Source::Nasa => {
            let data = json(client, "https://images-api.nasa.gov/search", &[
                ("q", query.into()), ("media_type", "image".into()), ("page_size", "40".into()), ("page", (offset % 100 + 1).to_string()),
            ])?;
            let rows = data["collection"]["items"].as_array().ok_or_else(|| ImageError::ordinary("NASA 返回无效的搜索结果"))?;
            Ok((rows.iter().filter_map(nasa_candidate).collect(), if rows.is_empty() { 0 } else { offset + 1 }))
        }
    }
}
fn identifier(value: &str) -> bool { !value.is_empty() && value.len() <= 70 && value.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') }
pub fn openverse_candidate(v: &Value, category: &str) -> Option<Candidate> {
    if v["mature"].as_bool() != Some(false) { return None; }
    let id = v["id"].as_str()?;
    if !identifier(id) { return None; }
    let width = u32::try_from(v["width"].as_u64()?).ok()?;
    let height = u32::try_from(v["height"].as_u64()?).ok()?;
    if width < 1920 || height == 0 || !(1.4..=2.5).contains(&(width as f64 / height as f64)) { return None; }
    let license = match v["license"].as_str()? {
        "cc0" => "CC0".to_string(),
        "by" => format!("CC BY {}", v["license_version"].as_str()?),
        "by-sa" => format!("CC BY-SA {}", v["license_version"].as_str()?),
        _ => return None,
    };
    let license_url = v["license_url"].as_str()?.replacen("http://", "https://", 1);
    let source = v["foreign_landing_url"].as_str()?.replacen("http://", "https://", 1);
    let image_url = v["url"].as_str()?.replacen("http://", "https://", 1);
    if !allowed_license(&license, &license_url) || !allowed_link(&url::Url::parse(&source).ok()?) || !allowed_image_url(Source::Openverse, &url::Url::parse(&image_url).ok()?) { return None; }
    let author = plain_text(v["creator"].as_str()?);
    if author.is_empty() { return None; }
    Some(Candidate { provider: Source::Openverse, id: format!("openverse-{id}"), title: plain_text(v["title"].as_str()?), category: category.into(), width, height, author, license, license_url, source, preview_url: v["thumbnail"].as_str().filter(|u| url::Url::parse(u).is_ok_and(|u| allowed_image_url(Source::Openverse, &u))).unwrap_or(&image_url).into(), image_url })
}
pub fn nasa_candidate(v: &Value) -> Option<Candidate> {
    let meta = &v["data"][0];
    if meta["media_type"].as_str()? != "image" { return None; }
    // The library includes third-party works. Skip explicit restrictions, retain the NASA usage notice.
    let description = meta["description"].as_str().unwrap_or_default().to_lowercase();
    if ["copyright", "©", "all rights reserved", "getty", "shutterstock", "associated press"].iter().any(|s| description.contains(s)) { return None; }
    let nasa_id = meta["nasa_id"].as_str()?;
    // Skip known portrait/small results before fetching manifests or image bytes.
    if let Some(links) = v["links"].as_array() {
        let suitable = links.iter().filter(|l| l["render"] == "image").any(|l| {
            let w = l["width"].as_u64().unwrap_or(0); let h = l["height"].as_u64().unwrap_or(0);
            w >= 1280 && h > 0 && (1.4..=2.5).contains(&(w as f64 / h as f64))
        });
        let dimensions_known = links.iter().any(|l| l["width"].as_u64().is_some());
        if dimensions_known && !suitable { return None; }
    }
    // NASA IDs can contain underscores; hash the ID to keep filenames and IPC IDs safe.
    use sha2::{Digest, Sha256};
    let id = format!("nasa-{:x}", Sha256::digest(nasa_id.as_bytes()));
    let image_url = v["href"].as_str()?.to_string();
    if !url::Url::parse(&image_url).is_ok_and(|u| allowed_image_url(Source::Nasa, &u)) { return None; }
    let mut source = url::Url::parse("https://images.nasa.gov/details/").ok()?;
    source.path_segments_mut().ok()?.pop_if_empty().push(nasa_id);
    let author = meta["secondary_creator"].as_str().filter(|v| !v.is_empty()).or_else(|| meta["photographer"].as_str().filter(|v| !v.is_empty())).map(plain_text).unwrap_or_else(|| format!("NASA / {}", meta["center"].as_str().unwrap_or("NASA")));
    Some(Candidate { provider: Source::Nasa, id, title: plain_text(meta["title"].as_str()?), category: "宇宙".into(), width: 0, height: 0, author,
        license: "NASA 媒体使用指南（请核对原图署名与第三方权利）".into(), license_url: "https://www.nasa.gov/nasa-brand-center/images-and-media/".into(), source: source.into(),
        preview_url: v["links"].as_array().and_then(|links| links.iter().filter_map(|l| l["href"].as_str()).find(|u| url::Url::parse(u).is_ok_and(|u| allowed_image_url(Source::Nasa, &u)))).unwrap_or("").into(), image_url })
}

pub fn nasa_asset_url(manifest: &Value) -> Option<String> {
    // Static collection.json is an array of URLs; /asset returns Collection+JSON.
    let urls: Vec<String> = if let Some(rows) = manifest.as_array() {
        rows.iter().filter_map(Value::as_str).map(str::to_owned).collect()
    } else {
        manifest["collection"]["items"].as_array()?.iter().filter_map(|v| v["href"].as_str().map(str::to_owned)).collect()
    };
    for suffix in ["~large.jpg", "~orig.jpg", "~medium.jpg"] {
        if let Some(value) = urls.iter().find(|value| value.ends_with(suffix) && url::Url::parse(&value.replacen("http://", "https://", 1)).is_ok_and(|u| allowed_image_url(Source::Nasa, &u))) {
            return Some(value.replacen("http://", "https://", 1));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn nasa_static_manifest_and_asset_api_both_resolve_to_https_images() {
        let original = "http://images-assets.nasa.gov/image/PIA00342/PIA00342~orig.jpg";
        assert_eq!(nasa_asset_url(&json!([original])).unwrap(), original.replacen("http://", "https://", 1));
        assert!(nasa_asset_url(&json!({"collection":{"items":[{"href":original}]}})).is_some());
        assert!(nasa_asset_url(&json!(["https://evil.test/PIA00342~orig.jpg"])).is_none());
        assert!(nasa_asset_url(&json!(["https://images-assets.nasa.gov/metadata.json"])).is_none());
    }
    #[test]
    fn source_quotas_are_stable_and_sum_to_daily_limit() {
        for target in [12, 24, 48] {
            assert_eq!(quotas(target, &[Source::Nasa, Source::Openverse, Source::Wikimedia]), vec![(Source::Wikimedia, target / 3), (Source::Openverse, target / 3), (Source::Nasa, target / 3)]);
            assert_eq!(quotas(target, &[Source::Nasa, Source::Nasa]), vec![(Source::Nasa, target)]);
            assert_eq!(quotas(target, &[]), vec![(Source::Wikimedia, target)]);
        }
        assert_eq!(quotas(25, &[Source::Nasa, Source::Openverse, Source::Wikimedia]).iter().map(|(_, n)| *n).collect::<Vec<_>>(), vec![9, 8, 8]);
        assert!(serde_json::from_str::<Source>("\"unknown\"").is_err());
    }
    #[test]
    fn download_hosts_and_source_links_remain_scoped() {
        for value in ["https://127.0.0.1/a", "http://images-assets.nasa.gov/a", "https://images-assets.nasa.gov.evil.test/a", "https://u@images-assets.nasa.gov/a", "https://images-assets.nasa.gov:444/a", "https://evil.test/a"] {
            for source in [Source::Wikimedia, Source::Openverse, Source::Nasa] { assert!(!allowed_image_url(source, &url::Url::parse(value).unwrap())); }
            assert!(!allowed_link(&url::Url::parse(value).unwrap()));
        }
        assert!(allowed_image_url(Source::Openverse, &url::Url::parse("https://live.staticflickr.com/a.jpg").unwrap()));
        assert!(!allowed_image_url(Source::Nasa, &url::Url::parse("https://live.staticflickr.com/a.jpg").unwrap()));
        assert!(allowed_link(&url::Url::parse("https://images.nasa.gov/details/example").unwrap()));
    }
    fn openverse_row() -> Value { json!({"id":"123-abc", "mature":false,"width":2400,"height":1600,"license":"by-sa","license_version":"4.0","license_url":"https://creativecommons.org/licenses/by-sa/4.0/","foreign_landing_url":"https://www.flickr.com/photos/example/123","url":"https://live.staticflickr.com/example.jpg","creator":"Artist","title":"Mountains"}) }
    #[test]
    fn openverse_rejects_restricted_licenses_mature_small_and_unsafe_images() {
        let row = openverse_row();
        let candidate = openverse_candidate(&row, "山野").unwrap();
        assert_eq!(candidate.provider, Source::Openverse);
        assert_eq!(candidate.author, "Artist");
        assert_eq!(candidate.license, "CC BY-SA 4.0");
        for (field, value) in [("mature", json!(true)), ("width", json!(1024)), ("license", json!("by-nc")), ("url", json!("https://127.0.0.1/a")), ("foreign_landing_url", json!("https://evil.test/a")), ("id", json!("../x"))] {
            let mut bad = row.clone(); bad[field] = value; assert!(openverse_candidate(&bad, "山野").is_none());
        }
    }
    #[test]
    fn nasa_preserves_credit_and_usage_notice_without_claiming_cc0() {
        let mut row = json!({"href":"https://images-assets.nasa.gov/image/PIA_1/collection.json","data":[{"media_type":"image","nasa_id":"PIA_1","title":"Earth","secondary_creator":"NASA/JPL/USGS","center":"JPL","description":"Earth from space"}],"links":[{"render":"image","width":2400,"height":1600}]});
        let c = nasa_candidate(&row).unwrap();
        assert_eq!(c.author, "NASA/JPL/USGS");
        assert!(c.id.starts_with("nasa-"));
        assert!(!c.license.contains("CC0"));
        assert_eq!(c.source, "https://images.nasa.gov/details/PIA_1");
        row["data"][0]["description"] = json!("Copyright Example photographer");
        assert!(nasa_candidate(&row).is_none());
        row["data"][0]["description"] = json!("Earth");
        row["links"][0]["width"] = json!(600);
        assert!(nasa_candidate(&row).is_none());
    }
}
