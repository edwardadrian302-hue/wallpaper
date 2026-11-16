export type Category = '全部' | '山野' | '森林' | '海岸' | '湖泊' | '花卉' | '人物写真' | '宇宙' | '本地';
export const IMAGE_SOURCES = [
  { id: 'wikimedia', name: 'Wikimedia Commons' },
  { id: 'openverse', name: 'Openverse' },
  { id: 'nasa', name: 'NASA' },
] as const;
export type ImageSource = typeof IMAGE_SOURCES[number]['id'];
export function validateSources(value: unknown): ImageSource[] {
  const selected = IMAGE_SOURCES.filter(s => Array.isArray(value) && value.includes(s.id)).map(s => s.id);
  return selected.length ? selected : ['wikimedia'];
}
export function sourceQuotas(total: number, sources: ImageSource[]) {
  const selected = validateSources(sources);
  return selected.map((id, index) => ({ id, target: Math.floor(total / selected.length) + (index < total % selected.length ? 1 : 0) }));
}
export function wallpaperSource(w: Wallpaper): string {
  if (w.kind === 'import') return '本地导入';
  return IMAGE_SOURCES.find(s => s.id === w.provider)?.name ?? (w.id.startsWith('openverse-') ? 'Openverse' : w.id.startsWith('nasa-') ? 'NASA' : 'Wikimedia Commons');
}
export const DOWNLOAD_TYPES = ['人物写真', '山野', '森林', '海岸', '湖泊', '花卉', '宇宙'] as const;
export type DownloadType = typeof DOWNLOAD_TYPES[number];
export function validateDownloadTypes(value: unknown): DownloadType[] {
  const types = DOWNLOAD_TYPES.filter(t => Array.isArray(value) && value.includes(t));
  return types.length ? types : [...DOWNLOAD_TYPES];
}
export function effectiveSources(sources: ImageSource[], types: DownloadType[]) {
  return validateSources(sources).filter(s => s !== 'nasa' || types.includes('宇宙'));
}
export function downloadQuotas(total: number, sources: ImageSource[], types: DownloadType[]) {
  const active = effectiveSources(sources, types);
  return active.length ? sourceQuotas(total, active) : [];
}
export type Page = 'today' | 'library' | 'favorites' | 'settings' | 'online';
export interface Wallpaper {
  id: string; title: string; category: string; src: string;
  width: number; height: number; originalWidth?: number; originalHeight?: number;
  author: string; license: string; licenseUrl?: string; source?: string;
  provider?: ImageSource; originalTitle?: string; bytes: number; addedAt: string; kind: 'sample' | 'import' | 'download';
}
export interface Preferences {
  rotation: boolean; interval: number; favoritesOnly: boolean; fit: 'fill' | 'fit';
  dailyCount: number; reducedMotion: boolean; autoDownload: boolean; sources: ImageSource[]; downloadTypes: DownloadType[];
}
export const DEFAULT_PREFERENCES: Preferences = {
  rotation: false, interval: 60, favoritesOnly: false, fit: 'fill', dailyCount: 24, reducedMotion: false, autoDownload: true, sources: ['wikimedia'], downloadTypes: [...DOWNLOAD_TYPES],
};
export const CATEGORIES: Category[] = ['全部', '山野', '森林', '海岸', '湖泊', '花卉', '人物写真', '宇宙', '本地'];
export function dateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function dailySelection(items: Wallpaper[], day: string, count = 24): Wallpaper[] {
  const score = (id: string) => {
    let hash = 2166136261;
    for (const c of day + ':' + id) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    return hash >>> 0;
  };
  return [...items].sort((a, b) => score(a.id) - score(b.id) || a.id.localeCompare(b.id)).slice(0, count);
}
export function filterWallpapers(items: Wallpaper[], category: string, search: string): Wallpaper[] {
  const term = search.trim().toLocaleLowerCase();
  return items.filter(w => (category === '全部' || (category === '本地' ? w.kind === 'import' : w.category === category)) &&
    [w.title, w.category, w.author, w.originalTitle ?? ''].some(s => s.toLocaleLowerCase().includes(term)));
}
export function nextWallpaper(items: Wallpaper[], current: string | null, recent: string[]): Wallpaper | undefined {
  const other = items.filter(w => w.id !== current);
  return other.find(w => !recent.includes(w.id)) ?? other[0] ?? items[0];
}
export function formatBytes(bytes: number): string {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
export function validatePreferences(value: unknown): Preferences {
  const p = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    rotation: typeof p.rotation === 'boolean' ? p.rotation : false,
    interval: [1, 15, 30, 60, 1440].includes(Number(p.interval)) ? Number(p.interval) : 60,
    favoritesOnly: typeof p.favoritesOnly === 'boolean' ? p.favoritesOnly : false,
    fit: p.fit === 'fit' ? 'fit' : 'fill',
    // Legacy values, including the previous 10-image default, migrate to 24.
    dailyCount: [12, 24, 48].includes(Number(p.dailyCount)) ? Number(p.dailyCount) : 24,
    reducedMotion: typeof p.reducedMotion === 'boolean' ? p.reducedMotion : false,
    autoDownload: typeof p.autoDownload === 'boolean' ? p.autoDownload : true,
    sources: validateSources(p.sources),
    downloadTypes: validateDownloadTypes(p.downloadTypes),
  };
}
export const LIBRARY_PAGE_SIZE = 12;
export function paginate<T>(items: T[], requestedPage: number, pageSize = LIBRARY_PAGE_SIZE) {
  const safeSize = Number.isFinite(pageSize) && pageSize >= 1 ? Math.floor(pageSize) : LIBRARY_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(items.length / safeSize));
  const page = Math.min(totalPages, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  const offset = (page - 1) * safeSize;
  return { items: items.slice(offset, offset + safeSize), page, totalPages, start: items.length ? offset + 1 : 0, end: Math.min(offset + safeSize, items.length) };
}
