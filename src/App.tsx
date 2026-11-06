import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronLeft, ChevronRight, CircleHelp, Clock3, FolderHeart, Grid2X2, HardDrive, Heart, ImagePlus, Images, Leaf, LoaderCircle, Monitor, Search, Settings2, ShieldCheck, Shuffle, SlidersHorizontal, Sparkles, Sprout, Sun, Upload, X } from 'lucide-react';
import { Dialog, Select, Toggle } from './components/ui';
import { CATEGORIES, DEFAULT_PREFERENCES, LIBRARY_PAGE_SIZE, dailySelection, dateKey, filterWallpapers, formatBytes, nextWallpaper, paginate, validatePreferences, type Page, type Preferences, type Wallpaper } from './lib/model';
import { importImage, loadImports, readLocal, writeLocal } from './lib/storage';
import { applyWallpaper, exportWallpaper, openSource } from './lib/desktop';
import samples from './data/wallpapers.json';
import { version } from '../package.json';
import { useDailyDownloads } from './lib/useDailyDownloads';
import { DownloadPanel } from './components/DownloadPanel';

const sampleWallpapers = samples as Wallpaper[];
const pageNames: Record<Page, string> = { today: '今日精选', library: '壁纸库', favorites: '我的收藏', settings: '偏好设置' };
const navigation = [{ id: 'today', icon: Sun }, { id: 'library', icon: Images }, { id: 'favorites', icon: Heart }] as const;
const FAVORITES_KEY = 'qingye.favorites.v1', SETTINGS_KEY = 'qingye.preferences.v1';

export default function App() {
  const [page, setPage] = useState<Page>('today');
  const [favorites, setFavorites] = useState<string[]>(() => readLocal(FAVORITES_KEY, [], v => Array.isArray(v) ? v.filter(x => typeof x === 'string') : []));
  const [preferences, setPreferences] = useState<Preferences>(() => readLocal(SETTINGS_KEY, DEFAULT_PREFERENCES, validatePreferences));
  const [imports, setImports] = useState<Wallpaper[]>([]);
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('全部');
  const [sort, setSort] = useState('newest');
  const [collectionPage, setCollectionPage] = useState(1);
  const [density, setDensity] = useState('comfortable');
  const [day, setDay] = useState(dateKey());
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [selected, setSelected] = useState<Wallpaper | null>(null);
  const [desktopPreview, setDesktopPreview] = useState(false);
  const [toast, setToast] = useState('');
  const [notice, setNotice] = useState('');
  const [importing, setImporting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const ownedUrls = useRef(new Set<string>());
  const excludeIds = useMemo(() => [...sampleWallpapers, ...imports].map(w => w.id), [imports]);
  const downloads = useDailyDownloads(preferences.dailyCount, preferences.autoDownload, excludeIds);
  const allWallpapers = useMemo(() => Array.from(new Map([...sampleWallpapers, ...downloads.wallpapers, ...imports].map(w => [w.id, w])).values()), [imports, downloads.wallpapers]);
  const favoriteWallpapers = useMemo(() => allWallpapers.filter(w => favorites.includes(w.id)), [allWallpapers, favorites]);
  const daily = useMemo(() => dailySelection(allWallpapers, day + (refreshSeed ? ':' + refreshSeed : ''), preferences.dailyCount), [allWallpapers, day, preferences.dailyCount, refreshSeed]);
  const featured = allWallpapers.find(w => w.id === featuredId) ?? daily[0] ?? allWallpapers[0];
  const storageBytes = allWallpapers.reduce((sum, w) => sum + w.bytes, 0);
  const date = new Date(day + 'T12:00:00');
  const dateLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(date);

  useEffect(() => {
    let cancelled = false;
    loadImports().then(items => {
      if (cancelled) { items.forEach(w => URL.revokeObjectURL(w.src)); return; }
      items.forEach(w => ownedUrls.current.add(w.src));
      setImports(items);
    }).catch(() => { if (!cancelled) setNotice('本地图片库暂时无法读取。请检查数据目录的读写权限或重启程序；示例壁纸仍可浏览。'); }).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; ownedUrls.current.forEach(url => URL.revokeObjectURL(url)); ownedUrls.current.clear(); };
  }, []);
  useEffect(() => { const timer = window.setInterval(() => setDay(dateKey()), 30000); return () => clearInterval(timer); }, []);
  useEffect(() => { setFeaturedId(null); setRefreshSeed(0); }, [day]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 4200); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { document.documentElement.dataset.reducedMotion = String(preferences.reducedMotion); }, [preferences.reducedMotion]);
  useEffect(() => { setCollectionPage(1); }, [page, category, search, sort]);

  function notify(message: string) { setToast(message); }
  const downloadPanel = <DownloadPanel status={downloads.status} error={downloads.error} automatic={preferences.autoDownload} onStart={() => { void downloads.start(); }} onPause={() => { updatePreferences({ autoDownload: false }); void downloads.cancel(); }} />;
  function updatePreferences(patch: Partial<Preferences>) {
    const next = { ...preferences, ...patch };
    if (!writeLocal(SETTINGS_KEY, next)) setNotice('设置已在本次运行中生效，但未能保存。请检查本地存储空间，重启后可能需要重新设置。');
    setPreferences(next);
  }
  function toggleFavorite(w: Wallpaper) {
    const adding = !favorites.includes(w.id);
    const next = adding ? [...favorites, w.id] : favorites.filter(id => id !== w.id);
    if (!writeLocal(FAVORITES_KEY, next)) { setNotice('收藏保存失败，请检查本地存储空间。'); return; }
    setFavorites(next);
    notify(adding ? '已收藏，让喜欢的风景留下来' : '已取消收藏，图片仍保留在壁纸库');
  }
  function navigate(next: Page) { setPage(next); setSearch(''); setCategory('全部'); }
  function cycle(direction = 1) {
    const pool = preferences.favoritesOnly ? favoriteWallpapers : allWallpapers;
    if (!pool.length) { notify('先收藏几张喜欢的壁纸吧'); return; }
    const next = direction < 0 ? pool[(pool.findIndex(w => w.id === featured?.id) - 1 + pool.length) % pool.length] : nextWallpaper(pool, featured?.id ?? null, recent);
    if (next) { setFeaturedId(next.id); setRecent(prev => [...prev.slice(-Math.max(0, pool.length - 2)), next.id]); }
  }
  async function apply(w: Wallpaper) {
    setApplying(true);
    try { await applyWallpaper(w, preferences.fit); setActiveId(w.id); setFeaturedId(w.id); notify('已将「' + w.title + '」设为桌面壁纸'); }
    catch (error) { setNotice('设置壁纸失败：' + String(error)); }
    finally { setApplying(false); }
  }
  const rotationPool = preferences.favoritesOnly ? favoriteWallpapers : allWallpapers;
  const rotationRef = useRef({ pool: rotationPool, featured, preferences, recent });
  rotationRef.current = { pool: rotationPool, featured, preferences, recent };
  useEffect(() => {
    if (!preferences.rotation) return;
    const timer = window.setInterval(async () => {
      const state = rotationRef.current;
      const next = nextWallpaper(state.pool, state.featured?.id ?? null, state.recent);
      if (!next) return;
      try {
        await applyWallpaper(next, state.preferences.fit); setActiveId(next.id);
        setFeaturedId(next.id);
        setRecent(prev => [...prev.slice(-Math.max(0, state.pool.length - 2)), next.id]);
      } catch (error) { setNotice('自动轮换失败：' + String(error)); }
    }, preferences.interval * 60000);
    return () => clearInterval(timer);
  }, [preferences.rotation, preferences.interval]);

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    setImporting(true);
    let added = 0, duplicate = 0;
    const errors: string[] = [];
    for (const file of files) {
      try {
        const wallpaper = await importImage(file);
        if (!wallpaper) { duplicate++; continue; }
        ownedUrls.current.add(wallpaper.src);
        setImports(prev => [...prev, wallpaper]); added++;
      } catch (error) { errors.push(error instanceof Error ? error.message : file.name + '：导入失败'); }
    }
    setImporting(false);
    if (added) { navigate('library'); setCategory('本地'); }
    if (errors.length) setNotice(errors.join('；'));
    notify(`已导入 ${added} 张${duplicate ? `，跳过 ${duplicate} 张重复图片` : ''}${errors.length ? `，${errors.length} 张失败` : ''}`);
  }
  async function download(w: Wallpaper) {
    try {
      const response = await fetch(w.src);
      if (!response.ok) throw new Error('无法读取图片');
      const blob = await response.blob();
      const path = await exportWallpaper(blob, w.id);
      notify('图片已导出至：' + path);
    } catch (error) { setNotice('导出失败：' + String(error)); }
  }

  const collection = page === 'favorites' ? favoriteWallpapers : allWallpapers;
  const filtered = useMemo(() => {
    const items = filterWallpapers(collection, category, search);
    return items.sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'zh-CN') : sort === 'resolution' ? b.width * b.height - a.width * a.height : b.addedAt.localeCompare(a.addedAt));
  }, [collection, category, search, sort]);
  const paged = paginate(filtered, collectionPage);
  useEffect(() => { setCollectionPage(current => Math.min(current, paged.totalPages)); }, [paged.totalPages]);
  function changeCollectionPage(next: number) {
    setCollectionPage(next);
    requestAnimationFrame(() => document.getElementById('library-top')?.scrollIntoView({ block: 'start' }));
  }

  function Card({ wallpaper: w, index = 0 }: { wallpaper: Wallpaper; index?: number }) {
    const liked = favorites.includes(w.id);
    return <article className="wallpaper-card" style={{ animationDelay: `${index * 40}ms` }}>
      <div className="card-image-wrap">
        <button className="image-button" onClick={() => { setSelected(w); setDesktopPreview(false); }} aria-label={`预览 ${w.title}`}><img src={w.src} alt={w.title} loading="lazy" /><span className="card-image-shade" /><span className="card-open"><Monitor size={16} /> 预览壁纸</span></button>
        <span className="resolution-label">{w.width} × {w.height}</span>
        <button className={`favorite-button ${liked ? 'is-favorite' : ''}`} aria-label={`${liked ? '取消收藏' : '收藏'} ${w.title}`} aria-pressed={liked} onClick={() => toggleFavorite(w)}><Heart size={17} fill={liked ? 'currentColor' : 'none'} /></button>
        {activeId === w.id && <span className="active-label"><Check size={12} /> 当前桌面</span>}
      </div>
      <div className="card-description"><div><h3>{w.title}</h3><p>{w.category}<span>·</span>{w.kind === 'import' ? '本地导入' : w.kind === 'download' ? '每日下载' : '精选摄影'}</p></div><button className="icon-button card-arrow" aria-label={`查看 ${w.title} 详情`} onClick={() => { setSelected(w); setDesktopPreview(false); }}><ArrowUpRight size={18} /></button></div>
    </article>;
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('today'); }} aria-label="青野首页"><span className="brand-symbol"><Sprout size={26} strokeWidth={1.6} /></span><span className="brand-word">青野<span>QINGYE WALLPAPER</span></span></a>
      <div className="sidebar-label">我的风景</div>
      <nav aria-label="主导航">{navigation.map(({ id, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={19} strokeWidth={1.7} /><span>{pageNames[id]}</span>{id === 'favorites' ? <span className="nav-count">{favoriteWallpapers.length}</span> : page === id ? <span className="nav-dot" /> : null}</button>)}</nav>
      <div className="sidebar-divider" />
      <button className="nav-item" disabled={importing || !ready} onClick={() => fileInput.current?.click()}>{importing ? <LoaderCircle size={19} className="spin" /> : <ImagePlus size={19} strokeWidth={1.7} />}<span>{importing ? '正在导入…' : '导入本地壁纸'}</span></button>
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={handleImport} className="sr-only" tabIndex={-1} aria-label="选择本地壁纸" />
      <div className="sidebar-spacer" />
      <div className="sidebar-note"><span className="note-illustration"><Leaf size={42} strokeWidth={1} /><span className="note-sun" /></span><p>给桌面一点绿意<br />给生活一点留白。</p><span>YOUR LITTLE DAILY ESCAPE</span></div>
      <button className={`nav-item settings-nav ${page === 'settings' ? 'active' : ''}`} aria-current={page === 'settings' ? 'page' : undefined} onClick={() => navigate('settings')}><Settings2 size={19} strokeWidth={1.7} /><span>偏好设置</span></button>
      <div className="sidebar-footer"><span className="status-dot" />本地优先<span>v{version}</span></div>
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="breadcrumb">我的空间<span>/</span><strong>{pageNames[page]}</strong></div><div className="topbar-actions"><label className="search-box"><Search size={16} /><input aria-label="搜索壁纸" value={search} placeholder="寻找一处喜欢的风景" onChange={e => { setSearch(e.target.value); if (page === 'today' || page === 'settings') setPage('library'); }} />{search && <button aria-label="清空搜索" onClick={() => setSearch('')}><X size={14} /></button>}</label><button className="icon-button help-button" aria-label="关于青野" onClick={() => setHelpOpen(true)}><CircleHelp size={19} /></button><span className="user-avatar"><Leaf size={18} /></span></div></header>
      <main className={page === 'settings' ? 'main-content settings-main' : 'main-content'}>
        {notice && <div role="alert" className="notice"><CircleHelp size={17} /><span>{notice}</span><button className="icon-button" aria-label="关闭提示" onClick={() => setNotice('')}><X size={16} /></button></div>}
        {page === 'today' && featured && <>
          <div className="page-heading today-heading"><div><p className="eyebrow"><span /> A LITTLE NATURE, EVERY DAY</p><h1>每一天，自然一点<span className="heading-period">。</span></h1><p className="page-subtitle">从一张喜欢的壁纸开始，遇见日常里的小美好。</p></div><div className="date-label"><Sun size={21} strokeWidth={1.4} /><span>{dateLabel}<small>今天，也有好风景</small></span></div></div>
          <section className="hero" aria-label="今日主推壁纸">
            <img key={featured.id} className="hero-image" src={featured.src} alt={featured.title} fetchPriority="high" /><div className="hero-shade" />
            <div className="hero-topline"><span className="hero-badge"><Sparkles size={13} /> 今日为你精选</span><span className="hero-local"><CheckCheck size={14} /> 已在本地 · 离线可看</span></div>
            <div className="hero-content"><p className="hero-category">{featured.category} / DAILY INSPIRATION</p><h2>{featured.title}</h2><p className="hero-copy">让目光停一停，把片刻宁静留给自己。</p><div className="hero-buttons"><button className="button button-light" disabled={applying} onClick={() => apply(featured)}><Monitor size={17} />{applying ? '正在设置…' : '设为桌面壁纸'}</button><button className={`hero-heart ${favorites.includes(featured.id) ? 'liked' : ''}`} onClick={() => toggleFavorite(featured)} aria-label={`${favorites.includes(featured.id) ? '取消收藏' : '收藏'} ${featured.title}`} aria-pressed={favorites.includes(featured.id)}><Heart size={19} fill={favorites.includes(featured.id) ? 'currentColor' : 'none'} /></button></div></div>
            <div className="hero-bottom"><span className="hero-credit">摄影 / {featured.author.length > 36 ? featured.author.slice(0, 33) + '…' : featured.author}</span><div className="hero-navigation"><button aria-label="上一张风景" onClick={() => cycle(-1)}><ChevronLeft size={18} /></button><span>{String(Math.max(0, allWallpapers.findIndex(w => w.id === featured.id)) + 1).padStart(2, '0')}<i>/</i>{String(allWallpapers.length).padStart(2, '0')}</span><button aria-label="下一张风景" onClick={() => cycle()}><ChevronRight size={18} /></button></div></div>
          </section>
          <div className="daily-strip"><span><span className="status-dot" />桌面版<span className="strip-divider" />今日精选 {daily.length} / {preferences.dailyCount} 张 · 来自本地图库</span><button onClick={() => { cycle(); notify('换一处风景，换一种心情'); }}><Shuffle size={14} /> 换个风景</button></div>
          {downloadPanel}
          <section className="recommendations"><div className="section-heading"><div><h2>还想看看这些 <span className="tiny-leaf">✳</span></h2><p>山川、湖海和花草，总有一处让你心动。</p></div><button className="text-button" onClick={() => navigate('library')}>探索壁纸库 <ArrowRight size={16} /></button></div><div className="wallpaper-grid">{daily.filter(w => w.id !== featured.id).slice(0, 3).map((w, index) => <Card key={w.id} wallpaper={w} index={index} />)}</div></section>
          <div className="home-bottom"><ShieldCheck size={14} /><span>喜欢的风景，安心留在本地。</span><span className="home-bottom-count">已收录 {allWallpapers.length} 张 · {formatBytes(storageBytes)}</span></div>
        </>}

        {(page === 'library' || page === 'favorites') && <>
          <div className="page-heading"><div><p className="eyebrow"><span /> {page === 'favorites' ? 'KEEP WHAT YOU LOVE' : 'YOUR GROWING COLLECTION'}</p><h1>{page === 'favorites' ? '心动的风景，都在这里。' : '把世界，慢慢收藏。'}</h1><p className="page-subtitle">{page === 'favorites' ? `已收藏 ${favoriteWallpapers.length} 张壁纸，每一次喜欢都值得留下。` : `${allWallpapers.length} 张风景，${formatBytes(storageBytes)} 的小小世界。离线也能随时遇见。`}</p></div><button className="button button-primary" onClick={() => fileInput.current?.click()} disabled={importing || !ready}><Upload size={16} />{importing ? '正在导入…' : '导入壁纸'}</button></div>
          {page === 'favorites' && favoriteWallpapers.length > 0 && <div className="collection-banner"><span className="collection-icon"><FolderHeart size={24} strokeWidth={1.5} /></span><div><h3>让喜欢，常常出现在眼前</h3><p>开启「仅轮换收藏」，每一次相遇都合心意。</p></div><button className="text-button" onClick={() => { navigate('settings'); }}>轮换设置 <ArrowRight size={15} /></button></div>}
          {page === 'library' && downloadPanel}
          <div id="library-top" className="library-toolbar"><div className="category-tabs" role="group" aria-label="壁纸分类">{CATEGORIES.map(c => <button key={c} className={category === c ? 'selected' : ''} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div><div className="view-tools"><Select value={sort} onValueChange={setSort} label="排序方式" options={[{ value: 'newest', label: '最近加入' }, { value: 'title', label: '按名称' }, { value: 'resolution', label: '按分辨率' }]} /><button className={`icon-button ${density === 'compact' ? 'selected' : ''}`} aria-label="切换紧凑布局" aria-pressed={density === 'compact'} onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}><Grid2X2 size={17} /></button></div></div>
          <div className="results-label" aria-live="polite"><span>{page === 'favorites' ? '收藏总数' : '图库总数'} <strong>{collection.length}</strong> 张{(search || category !== '全部') && <> · 筛选结果 <strong>{filtered.length}</strong> 张</>}</span><span><HardDrive size={12} /> {paged.start}–{paged.end} 张 · 每页 {LIBRARY_PAGE_SIZE} 张</span></div>
          {filtered.length ? <div className={`wallpaper-grid library-grid ${density === 'compact' ? 'compact' : ''}`}>{paged.items.map((w, index) => <Card key={w.id} wallpaper={w} index={Math.min(index, 8)} />)}</div> : <div className="empty-state">{page === 'favorites' && !favoriteWallpapers.length ? <Heart size={42} strokeWidth={1} /> : <Search size={42} strokeWidth={1} />}<h2>{page === 'favorites' && !favoriteWallpapers.length ? '给喜欢的风景，一颗小心心' : '这处风景，还没有找到'}</h2><p>{page === 'favorites' && !favoriteWallpapers.length ? '点击壁纸上的爱心，就能在这里再次遇见。' : '试试其他关键词，或换一个分类看看。'}</p><button className="button button-primary" onClick={() => { if (page === 'favorites' && !favoriteWallpapers.length) navigate('library'); else { setSearch(''); setCategory('全部'); } }}>{page === 'favorites' && !favoriteWallpapers.length ? '去发现好风景' : '查看全部壁纸'}<ArrowRight size={15} /></button></div>}
          {filtered.length > 0 && <CollectionPagination page={paged.page} totalPages={paged.totalPages} onChange={changeCollectionPage} />}
          {!!filtered.length && <p className="collection-end"><Leaf size={13} /> 风景慢慢积攒，美好日日相伴</p>}
        </>}

        {page === 'settings' && <>
          <div className="page-heading"><div><p className="eyebrow"><span /> MAKE YOURSELF AT HOME</p><h1>按你的节奏，遇见风景。</h1><p className="page-subtitle">一些小小的偏好，让青野更懂你。设置会自动保存在本机。</p></div><SlidersHorizontal size={30} strokeWidth={1} className="settings-heading-icon" /></div>
          {downloadPanel}<div className="settings-layout"><div>
            <section className="settings-card"><h2><Shuffle size={18} /> 壁纸轮换</h2><SettingRow title="自动更换桌面壁纸" description="应用运行期间，按设定间隔更换 Windows 桌面。"><Toggle label="自动轮换" checked={preferences.rotation} onCheckedChange={rotation => updatePreferences({ rotation })} /></SettingRow><SettingRow title="换一处风景的频率" description="暂停或关闭应用后，计时停止。"><Select label="轮换间隔" value={String(preferences.interval)} onValueChange={v => updatePreferences({ interval: Number(v) })} options={[{ value: '1', label: '每 1 分钟' }, { value: '15', label: '每 15 分钟' }, { value: '30', label: '每 30 分钟' }, { value: '60', label: '每 1 小时' }, { value: '1440', label: '每 24 小时' }]} /></SettingRow><SettingRow title="仅轮换我的收藏" description={preferences.favoritesOnly && !favoriteWallpapers.length ? '还没有收藏，轮换会暂时等待。' : '把每一次切换，都留给喜欢的风景。'}><Toggle label="仅轮换收藏" checked={preferences.favoritesOnly} onCheckedChange={favoritesOnly => updatePreferences({ favoritesOnly })} /></SettingRow><SettingRow title="图片适配方式" description="预览与桌面使用同一适配方式。"><Select label="图片适配方式" value={preferences.fit} onValueChange={v => updatePreferences({ fit: v as Preferences['fit'] })} options={[{ value: 'fill', label: '填充屏幕' }, { value: 'fit', label: '完整适应' }]} /></SettingRow></section>
            <section className="settings-card"><h2><Sun size={18} /> 每日下载与精选</h2><SettingRow title="每日联网下载" description="启动时补做当天任务，运行期间每天更新；关闭程序后停止。"><Toggle label="每日联网下载" checked={preferences.autoDownload} onCheckedChange={autoDownload => updatePreferences({ autoDownload })} /></SettingRow><SettingRow title="每日下载与精选数量" description="当天已完成的数量会保留，重启后只补齐不足的部分。"><Select label="每日下载数量" value={String(preferences.dailyCount)} onValueChange={v => updatePreferences({ dailyCount: Number(v) })} options={[{ value: '12', label: '12 张' }, { value: '24', label: '24 张' }, { value: '48', label: '48 张' }]} /></SettingRow><SettingRow title="换一批今日推荐" description="只更新应用中的精选，不删除或下载图片。"><button className="button button-secondary button-small" onClick={() => { setRefreshSeed(v => v + 1); setFeaturedId(null); navigate('today'); notify('今日推荐已更新'); }}><Shuffle size={14} />换一批</button></SettingRow></section>
            <section className="settings-card"><h2><Sparkles size={18} /> 使用体验</h2><SettingRow title="减少动态效果" description="让过渡更安静，保留必要的状态反馈。"><Toggle label="减少动态效果" checked={preferences.reducedMotion} onCheckedChange={reducedMotion => updatePreferences({ reducedMotion })} /></SettingRow></section>
          </div><aside className="settings-side"><div className="storage-card"><span className="storage-icon"><HardDrive size={24} strokeWidth={1.4} /></span><h3>你的小小风景库</h3><p className="storage-number">{allWallpapers.length}<span>张壁纸</span></p><div className="storage-breakdown"><span>示例图片</span><strong>{formatBytes(sampleWallpapers.reduce((s, w) => s + w.bytes, 0))}</strong></div><div className="storage-breakdown"><span>本地导入</span><strong>{formatBytes(imports.reduce((s, w) => s + w.bytes, 0))}</strong></div><div className="storage-breakdown"><span>联网缓存</span><strong>{downloads.wallpapers.length} 张</strong></div><div className="storage-breakdown"><span>我的收藏</span><strong>{favoriteWallpapers.length} 张</strong></div><p className="storage-note"><ShieldCheck size={15} /> 图片不会被自动清理。收藏与图片均保存在当前设备。</p></div><div className="settings-tip"><Sprout size={22} strokeWidth={1.4} /><h3>慢慢来，好风景会积攒。</h3><p>当前支持每日联网下载与系统壁纸设置。任务仅在程序运行期间执行；托盘、开机启动及多屏独立设置将在后续版本接入。</p><button className="text-button" onClick={() => setHelpOpen(true)}>了解当前版本 <ArrowUpRight size={14} /></button></div></aside></div>
        </>}
      </main>
    </div>

    <Dialog open={selected !== null} onOpenChange={open => { if (!open) { setSelected(null); setDesktopPreview(false); } }} title={selected?.title ?? '壁纸预览'} description="查看壁纸、作者、许可及桌面效果" className={desktopPreview ? 'preview-dialog desktop-preview-dialog' : 'preview-dialog'}>
      {selected && <><div className={`preview-image-area ${desktopPreview ? 'desktop-mock' : ''}`}><img src={selected.src} alt={selected.title} style={{ objectFit: preferences.fit === 'fill' ? 'cover' : 'contain' }} />{desktopPreview && <><div className="mock-desktop-label"><Monitor size={14} /> 桌面效果预览</div><div className="mock-clock"><span>09:41</span><small>让美好，在此刻发生</small></div><div className="mock-taskbar"><span className="mock-start"><i /><i /><i /><i /></span><Search size={16} /><Images size={18} /><span className="mock-taskbar-leaf"><Leaf size={18} /></span></div></>}</div><div className="preview-info"><div className="preview-title-row"><div><span className="detail-category">{selected.category} · {selected.kind === 'sample' ? '本地示例' : selected.kind === 'download' ? '联网缓存' : '本地导入'}</span><h2>{selected.title}</h2></div><button className={`icon-button detail-heart ${favorites.includes(selected.id) ? 'is-favorite' : ''}`} aria-label={`${favorites.includes(selected.id) ? '取消收藏' : '收藏'} ${selected.title}`} aria-pressed={favorites.includes(selected.id)} onClick={() => toggleFavorite(selected)}><Heart size={21} fill={favorites.includes(selected.id) ? 'currentColor' : 'none'} /></button></div><div className="detail-facts"><span>{selected.width} × {selected.height}</span><span>{formatBytes(selected.bytes)}</span><span>{selected.kind === 'import' ? '原始图片' : '缓存副本'}</span></div><p className="author-line">摄影 / {selected.author}</p><div className="license-line">{selected.licenseUrl ? <button onClick={() => openSource(selected.licenseUrl!)}>{selected.license}<ArrowUpRight size={12} /></button> : <span>{selected.license}</span>}{selected.source && <button onClick={() => openSource(selected.source!)}>查看来源<ArrowUpRight size={12} /></button>}</div>{selected.kind !== 'import' && <p className="detail-note">原作 {selected.originalWidth} × {selected.originalHeight}；当前为适合浏览与桌面的缓存副本，原图见来源页面。</p>}<div className="preview-actions"><button className="button button-primary" disabled={applying} onClick={() => apply(selected)}><Monitor size={16} />{applying ? '正在设置…' : '设为桌面壁纸'}</button><button className="button button-secondary" onClick={() => setDesktopPreview(!desktopPreview)}><Monitor size={16} />{desktopPreview ? '图片详情' : '桌面效果'}</button><button className="button button-secondary" onClick={() => download(selected)}><ArrowDownToLine size={16} />导出图片</button></div></div></>}
    </Dialog>
    <Dialog open={helpOpen} onOpenChange={setHelpOpen} title="关于青野" description="当前版本说明" className="about-dialog"><span className="about-logo"><Sprout size={32} /></span><p className="eyebrow">QINGYE WALLPAPER</p><h2>每一天，自然一点。</h2><p>青野 v{version} · Windows 桌面版</p><div className="about-features"><p><Check size={16} /> 本地壁纸库、搜索筛选、收藏与导入</p><p><Check size={16} /> 偏好保存、日期精选与应用内轮换</p><p><Clock3 size={16} /> 托盘、开机启动、多显示器支持待接入</p></div><p className="about-license">示例摄影来自 Wikimedia Commons，各图片保留作者、来源及许可链接。随包示例可离线使用；开启每日下载后，程序运行时会从来源获取新图。</p><button className="button button-primary" onClick={() => setHelpOpen(false)}>开始遇见好风景<ArrowRight size={15} /></button></Dialog>
    {toast && <div className="toast" role="status"><span><Check size={16} /></span>{toast}<button aria-label="关闭通知" onClick={() => setToast('')}><X size={14} /></button></div>}
  </div>;
}

function SettingRow({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="setting-row"><div><h3>{title}</h3><p>{description}</p></div><div className="setting-control">{children}</div></div>;
}

function CollectionPagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const numbers = Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i);
  const pageButton = (value: number) => <button key={value} className={value === page ? 'current-page' : ''} aria-label={`第 ${value} 页`} aria-current={value === page ? 'page' : undefined} onClick={() => onChange(value)}>{value}</button>;
  return <nav className="collection-pagination" aria-label="壁纸分页">
    <span className="pagination-summary">第 {page} / {totalPages} 页</span>
    <div className="pagination-buttons">
      <button disabled={page === 1} onClick={() => onChange(page - 1)} aria-label="上一页"><ChevronLeft size={15} /><span>上一页</span></button>
      {start > 1 && <>{pageButton(1)}{start > 2 && <span className="pagination-gap">…</span>}</>}
      {numbers.map(pageButton)}
      {numbers.at(-1)! < totalPages && <>{numbers.at(-1)! < totalPages - 1 && <span className="pagination-gap">…</span>}{pageButton(totalPages)}</>}
      <button disabled={page === totalPages} onClick={() => onChange(page + 1)} aria-label="下一页"><span>下一页</span><ChevronRight size={15} /></button>
    </div>
  </nav>;
}
