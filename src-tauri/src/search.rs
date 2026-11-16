use std::collections::{BTreeMap, HashSet, VecDeque};
use std::sync::Mutex;
use std::time::Duration;
use reqwest::blocking::Client;
use serde::Serialize;
use crate::downloads::Candidate;
use crate::providers::{self, Source};

const PAGE_SIZE: usize = 12;
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchImage {
    pub id: String, pub title: String, pub preview_url: String, pub source: String,
    pub provider: Source, pub author: String, pub license: String, pub license_url: String,
    pub width: u32, pub height: u32,
}
impl From<&Candidate> for SearchImage {
    fn from(c: &Candidate) -> Self {
        Self { id: c.id.clone(), title: c.title.clone(), preview_url: c.preview_url.clone(), source: c.source.clone(), provider: c.provider,
            author: c.author.clone(), license: c.license.clone(), license_url: c.license_url.clone(), width: c.width, height: c.height }
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchPage { pub items: Vec<SearchImage>, pub page: usize, pub has_more: bool, pub warnings: Vec<String> }
#[derive(Default)]
struct Session {
    query: String, sources: Vec<Source>, pages: Vec<SearchPage>,
    buffers: BTreeMap<Source, VecDeque<Candidate>>, offsets: BTreeMap<Source, u32>,
    exhausted: HashSet<Source>, seen: HashSet<String>, items: BTreeMap<String, Candidate>,
}
#[derive(Default)]
pub struct SearchService { state: Mutex<Session> }
impl SearchService {
    pub fn search(&self, query: String, sources: Vec<Source>, page: usize, restart: bool) -> Result<SearchPage, String> {
        let query = query.trim();
        if query.is_empty() || query.chars().count() > 120 { return Err("请输入 1–120 字的搜索关键词".into()); }
        if !(1..=100).contains(&page) { return Err("搜索页码需在 1–100 之间".into()); }
        let sources = providers::normalize(sources);
        let mut state = self.state.lock().map_err(|e| e.to_string())?;
        if restart || state.query != query || state.sources != sources {
            *state = Session { query: query.into(), sources: sources.clone(), ..Default::default() };
        }
        if let Some(cached) = state.pages.get(page - 1) { return Ok(cached.clone()); }
        if page != state.pages.len() + 1 { return Err("请从第一页开始逐页搜索".into()); }
        let mut warnings = Vec::new();
        let mut attempts: BTreeMap<Source, usize> = BTreeMap::new();
        let mut results = Vec::new();
        // Round-robin mixing keeps each selected provider represented where results are available.
        while results.len() < PAGE_SIZE {
            let mut progressed = false;
            for source in &sources {
                if results.len() == PAGE_SIZE { break; }
                while state.buffers.get(source).is_none_or(|b| b.is_empty()) && !state.exhausted.contains(source) && *attempts.get(source).unwrap_or(&0) < 2 {
                    *attempts.entry(*source).or_default() += 1;
                    let offset = *state.offsets.get(source).unwrap_or(&0);
                    let provider = *source;
                    let client = Client::builder().user_agent("ChaoxiWallpaper/1.1.0")
                        .connect_timeout(Duration::from_secs(10)).timeout(Duration::from_secs(25))
                        .redirect(reqwest::redirect::Policy::custom(move |attempt| {
                            if attempt.previous().len() < 5 && providers::allowed_image_url(provider, attempt.url()) { attempt.follow() } else { attempt.stop() }
                        })).build().map_err(|e| e.to_string())?;
                    match providers::fetch(&client, *source, query, "在线搜索", offset) {
                        Ok((candidates, next)) => {
                            if next == 0 || next <= offset { state.exhausted.insert(*source); }
                            state.offsets.insert(*source, next);
                            for candidate in candidates {
                                if candidate.preview_url.is_empty() || !state.seen.insert(candidate.id.clone()) { continue; }
                                state.buffers.entry(*source).or_default().push_back(candidate);
                            }
                        },
                        Err(error) => {
                            warnings.push(format!("{}：{}", source.name(), error.message));
                            state.exhausted.insert(*source);
                        },
                    }
                }
                if let Some(candidate) = state.buffers.entry(*source).or_default().pop_front() {
                    results.push(SearchImage::from(&candidate));
                    state.items.insert(candidate.id.clone(), candidate);
                    progressed = true;
                }
            }
            if !progressed { break; }
        }
        let has_more = page < 100 && sources.iter().any(|s| !state.exhausted.contains(s) || state.buffers.get(s).is_some_and(|b| !b.is_empty()));
        let result = SearchPage { items: results, page, has_more, warnings };
        state.pages.push(result.clone());
        Ok(result)
    }
    pub fn candidate(&self, id: &str) -> Result<Candidate, String> {
        self.state.lock().map_err(|e| e.to_string())?.items.get(id).cloned().ok_or_else(|| "搜索结果已过期，请重新搜索".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_queries_pages_and_cached_pagination_without_network() {
        let service = SearchService::default();
        assert!(service.search(" ".into(), vec![], 1, false).is_err());
        assert!(service.search("x".repeat(121), vec![], 1, false).is_err());
        assert!(service.search("forest".into(), vec![], 0, false).is_err());
        assert!(service.search("forest".into(), vec![], 101, false).is_err());
        let first = SearchPage { items: vec![], page: 1, has_more: true, warnings: vec![] };
        *service.state.lock().unwrap() = Session { query: "forest".into(), sources: vec![Source::Nasa], pages: vec![first], ..Default::default() };
        assert_eq!(service.search("forest".into(), vec![Source::Nasa], 1, false).unwrap().page, 1);
        assert!(service.search("forest".into(), vec![Source::Nasa], 3, false).is_err());
        assert!(service.candidate("../invalid").is_err());
    }
    #[test]
    fn pages_mix_only_selected_sources_and_never_repeat_items() {
        let service = SearchService::default();
        let sources = vec![Source::Wikimedia, Source::Nasa];
        let mut state = Session { query: "earth".into(), sources: sources.clone(), exhausted: sources.iter().copied().collect(), ..Default::default() };
        for source in &sources {
            for n in 0..12 {
                let id = format!("{source:?}-{n}");
                state.buffers.entry(*source).or_default().push_back(Candidate { provider: *source, id, title: "Earth".into(), category: "在线搜索".into(),
                    width: 1920, height: 1080, author: "NASA".into(), license: "CC0".into(), license_url: "https://creativecommons.org/publicdomain/zero/1.0/".into(),
                    source: "https://images.nasa.gov/".into(), image_url: "https://images-assets.nasa.gov/test.jpg".into(), preview_url: "https://images-assets.nasa.gov/test.jpg".into() });
            }
        }
        *service.state.lock().unwrap() = state;
        let first = service.search("earth".into(), sources.clone(), 1, false).unwrap();
        let second = service.search("earth".into(), sources.clone(), 2, false).unwrap();
        assert_eq!(first.items.len(), 12);
        assert_eq!(second.items.len(), 12);
        assert!(first.has_more);
        assert!(!second.has_more);
        assert_eq!(first.items.iter().filter(|c| c.provider == Source::Nasa).count(), 6);
        let ids: HashSet<_> = first.items.iter().chain(second.items.iter()).map(|c| &c.id).collect();
        assert_eq!(ids.len(), 24);
        assert!(first.items.iter().all(|c| sources.contains(&c.provider)));
        assert_eq!(service.search("earth".into(), sources, 1, false).unwrap().items[0].id, first.items[0].id);
        assert!(service.candidate(&first.items[0].id).is_ok());
    }
}
