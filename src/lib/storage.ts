import type { Wallpaper } from './model';
interface StoredWallpaper { wallpaper: Wallpaper; blob: Blob; }
let database: Promise<IDBDatabase> | undefined;
function db() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('qingye-wallpaper', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('imports', { keyPath: 'wallpaper.id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error('数据库被另一个窗口占用，请关闭旧窗口后重试')); };
  });
  return database;
}
export async function loadImports(): Promise<Wallpaper[]> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('imports', 'readonly');
    const request = transaction.objectStore('imports').getAll();
    transaction.oncomplete = () => resolve((request.result as StoredWallpaper[]).map(({ wallpaper, blob }) => ({ ...wallpaper, src: URL.createObjectURL(blob) })));
    transaction.onerror = () => reject(transaction.error);
  });
}
export async function saveImport(wallpaper: Wallpaper, blob: Blob): Promise<void> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('imports', 'readwrite');
    transaction.objectStore('imports').put({ wallpaper: { ...wallpaper, src: '' }, blob });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('图片保存中断'));
  });
}
export async function importImage(file: File): Promise<Wallpaper | null> {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error(`${file.name}：请选择 JPG、PNG、WebP 或 AVIF 图片`);
  if (file.size > 40 * 1024 ** 2) throw new Error(`${file.name}：单张图片请小于 40 MB`);
  const buffer = await file.arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))).map(v => v.toString(16).padStart(2, '0')).join('');
  const database = await db();
  const exists = await new Promise<boolean>((resolve, reject) => {
    const request = database.transaction('imports', 'readonly').objectStore('imports').getKey('local-' + hash);
    request.onsuccess = () => resolve(request.result !== undefined);
    request.onerror = () => reject(request.error);
  });
  if (exists) return null;
  const bitmap = await createImageBitmap(file);
  const width = bitmap.width, height = bitmap.height;
  bitmap.close();
  const wallpaper: Wallpaper = { id: 'local-' + hash, title: file.name.replace(/\.[^.]+$/, ''), category: '本地', src: '', width, height, author: '本地导入', license: '个人图片 · 权利由原作者保留', bytes: file.size, addedAt: new Date().toISOString(), kind: 'import' };
  await saveImport(wallpaper, file);
  return { ...wallpaper, src: URL.createObjectURL(file) };
}
export function readLocal<T>(key: string, fallback: T, validate: (v: unknown) => T): T {
  try { const raw = localStorage.getItem(key); return raw === null ? fallback : validate(JSON.parse(raw)); } catch { return fallback; }
}
export function writeLocal(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
