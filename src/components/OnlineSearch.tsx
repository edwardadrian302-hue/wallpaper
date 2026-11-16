import { useEffect, useRef, useState, type FormEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ArrowDownToLine, ArrowUpRight, ChevronLeft, ChevronRight, LoaderCircle, Search } from 'lucide-react';
import { IMAGE_SOURCES, type ImageSource } from '../lib/model';
import { openSource } from '../lib/desktop';
import { Dialog } from './ui';

interface SearchImage {
  id: string; title: string; previewUrl: string; source: string; provider: ImageSource;
  author: string; license: string; licenseUrl: string; width: number; height: number;
}
interface SearchPage { items: SearchImage[]; page: number; hasMore: boolean; warnings: string[]; }
export function OnlineSearch({ sources, downloading, downloadedIds, onBusy, onAdded }: {
  sources: ImageSource[]; downloading: boolean; downloadedIds: string[];
  onBusy: (busy: boolean) => void; onAdded: (added: boolean) => void;
}) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<SearchImage | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const requestId = useRef(0);
  const saveLock = useRef(false);
  const sourceKey = JSON.stringify(sources);
  useEffect(() => {
    requestId.current++;
    setResult(null); setQuery(''); setSelected(null); setLoading(false); setError('');
    return () => { requestId.current++; };
  }, [sourceKey]);
  const search = async (term: string, page: number, restart: boolean) => {
    if (!term.trim() || saveLock.current) return;
    const id = ++requestId.current;
    setLoading(true); setError(''); setSelected(null);
    try {
      const data = await invoke<SearchPage>('search_wallpapers', { query: term.trim(), sources, page, restart });
      if (id === requestId.current) { setResult(data); setQuery(term.trim()); }
    } catch (e) { if (id === requestId.current) setError(String(e)); }
    finally { if (id === requestId.current) setLoading(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void search(input, 1, true); };
  const save = async (image: SearchImage) => {
    if (saveLock.current || downloading) return;
    saveLock.current = true; setSaving(image.id); onBusy(true); setError('');
    try {
      const added = await invoke<boolean>('download_search_wallpaper', { id: image.id, excludeIds: downloadedIds });
      setSavedIds(ids => [...ids, image.id]); onAdded(added);
    } catch (e) { setError(String(e)); }
    finally { saveLock.current = false; setSaving(''); onBusy(false); }
  };
  const downloaded = (image: SearchImage) => downloadedIds.includes(image.id) || savedIds.includes(image.id);
  const downloadButton = (image: SearchImage) => <button className="button button-primary button-small" disabled={!!saving || downloading || loading || downloaded(image)} onClick={() => { void save(image); }}>
    {saving === image.id ? <LoaderCircle className="spin" size={14} /> : <ArrowDownToLine size={14} />}
    {saving === image.id ? '正在下载…' : downloaded(image) ? '已在图库' : '下载到图库'}
  </button>;
  const showLink = async (url: string) => { try { await openSource(url); } catch (e) { setError(String(e)); } };
  return <>
    <div className="page-heading"><div><p className="eyebrow"><span /> FIND YOUR WALLPAPER</p><h1>搜索你喜欢的壁纸。</h1><p className="page-subtitle">使用当前生效图片源，每页 12 张。下载后可在图库中预览、收藏和设为桌面。</p></div></div>
    <section className="online-search-controls">
      <form onSubmit={submit}><label className="online-search-input"><Search size={18} /><input aria-label="在线壁纸关键词" maxLength={120} value={input} onChange={e => setInput(e.target.value)} placeholder="输入关键词，例如：人物写真、海岸、星云" /></label><button className="button button-primary" disabled={loading || !!saving || !input.trim()} type="submit">{loading ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />}{loading ? '正在搜索…' : '搜索壁纸'}</button></form>
      <p>当前来源：{IMAGE_SOURCES.filter(s => sources.includes(s.id)).map(s => s.name).join('、')} · 可在偏好设置中更改</p>
      <p>仅展示通过来源许可与横屏尺寸筛选的结果；英文关键词通常能匹配更多图片。搜索预览会联网加载，点击下载才加入本地图库。</p>
      {downloading && !saving && <p role="status">已有下载任务正在进行，搜索和浏览可继续；请等待任务结束，或在偏好设置中暂停后再下载选中的图片。</p>}
    </section>
    {error && <p role="alert" className="notice">{error}</p>}
    {result?.warnings.map(warning => <p key={warning} role="status" className="notice">{warning} · 可重新搜索重试</p>)}
    {loading && <p role="status" className="online-search-status"><LoaderCircle className="spin" size={18} /> 正在从已选来源查找壁纸…</p>}
    {result && <>
      <div className="results-label" aria-live="polite"><span>「{query}」· 第 {result.page} 页 · 本页 {result.items.length} 张</span><span>每页最多 12 张</span></div>
      <div className="wallpaper-grid library-grid online-search-grid" aria-busy={loading}>{result.items.map(image => <article className="wallpaper-card" key={image.id}>
        <div className="card-image-wrap"><button className="image-button" onClick={() => setSelected(image)} aria-label={`预览 ${image.title}`}><img src={image.previewUrl} alt={image.title} loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.visibility = 'hidden'; }} /><span className="card-image-shade" /><span className="card-open">查看详情</span></button></div>
        <div className="card-description"><div><h3 title={image.title}>{image.title}</h3><p>{IMAGE_SOURCES.find(s => s.id === image.provider)?.name}</p></div></div>
        <p className="online-search-credit" title={`${image.author} · ${image.license}`}>{image.author} · {image.license}</p>
        {downloadButton(image)}
      </article>)}</div>
      {!result.items.length && !loading && <div className="empty-state"><Search size={36} /><h2>这一页没有找到合适的图片</h2><p>试试其他关键词、其他来源，或在仍有结果时继续翻页。</p></div>}
      <div className="online-pagination"><button className="button button-secondary button-small" disabled={loading || !!saving || result.page <= 1} onClick={() => { void search(query, result.page - 1, false); }}><ChevronLeft size={15} />上一页</button><span>第 {result.page} 页</span><button className="button button-secondary button-small" disabled={loading || !!saving || !result.hasMore} onClick={() => { void search(query, result.page + 1, false); }}>下一页<ChevronRight size={15} /></button></div>
    </>}
    {!result && !loading && <div className="empty-state"><Search size={38} /><h2>从一个关键词开始</h2><p>搜索结果来自已勾选的图片源，已有本地图片可继续在壁纸库中搜索。</p></div>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }} title="在线壁纸预览" description="查看图片来源、作者和许可，下载后加入图库" className="online-preview">
      {selected && <><img className="online-preview-image" src={selected.previewUrl} alt={selected.title} referrerPolicy="no-referrer" /><h2>{selected.title}</h2><p>{selected.author} · {selected.license}</p><div className="online-preview-actions">{downloadButton(selected)}<button className="button button-secondary button-small" onClick={() => { void showLink(selected.source); }}>查看来源<ArrowUpRight size={14} /></button><button className="text-button" onClick={() => { void showLink(selected.licenseUrl); }}>许可说明</button></div></>}
    </Dialog>
  </>;
}
