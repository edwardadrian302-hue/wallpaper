import type { Wallpaper } from './model';
interface StoredWallpaper { wallpaper: Wallpaper; blob: Blob; }
let database: Promise<IDBDatabase> | undefined;
async function migrateImports(target: IDBDatabase) {
  const marker = 'chaoxi.imports.migrated.v1';
  try { if (localStorage.getItem(marker) === 'true') return; } catch { /* Import storage can work even when preferences are unavailable. */ }
  const names = await indexedDB.databases();
  for (const { name } of names) {
    if (!name || name === target.name || !name.endsWith('-wallpaper')) continue;
    const source = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      if (!source.objectStoreNames.contains('imports')) continue;
      const rows = await new Promise<StoredWallpaper[]>((resolve, reject) => {
        const tx = source.transaction('imports', 'readonly');
        const request = tx.objectStore('imports').getAll();
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      if (rows.length) await new Promise<void>((resolve, reject) => {
        const tx = target.transaction('imports', 'readwrite');
        const store = tx.objectStore('imports');
        for (const row of rows) {
          const request = store.getKey(row.wallpaper.id);
          request.onsuccess = () => { if (request.result === undefined) store.put(row); };
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally { source.close(); }
  }
  try { localStorage.setItem(marker, 'true'); } catch { /* Existing records are retained; a later migration may safely retry. */ }
}
function db() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('chaoxi-wallpaper', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('imports', { keyPath: 'wallpaper.id' });
    request.onsuccess = () => {
      const result = request.result;
      void migrateImports(result).then(() => resolve(result)).catch(error => { result.close(); database = undefined; reject(error); });
    };
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
  try {
    let raw = localStorage.getItem(key);
    if (raw === null && /^chaoxi\.(favorites|preferences)\.v1$/.test(key)) {
      const suffix = key.slice('chaoxi'.length);
      const previous = Object.keys(localStorage).find(name => name !== key && name.endsWith(suffix));
      if (previous) {
        raw = localStorage.getItem(previous);
        if (raw !== null) {
          const migrated = validate(JSON.parse(raw));
          localStorage.setItem(key, JSON.stringify(migrated));
          return migrated;
        }
      }
    }
    return raw === null ? fallback : validate(JSON.parse(raw));
  } catch { return fallback; }
}
export function writeLocal(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export async function deleteImports(ids: string[]): Promise<void> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('imports', 'readwrite');
    for (const id of ids) tx.objectStore('imports').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('删除图片中断'));
  });
}
