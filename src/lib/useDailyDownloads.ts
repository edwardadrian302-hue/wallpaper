import { useCallback, useEffect, useRef, useState } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { isDesktop } from './desktop';
import type { Wallpaper } from './model';
export interface DownloadStatus {
  running: boolean; cancelRequested: boolean; day: string; target: number;
  completed: number; failed: number; lastError: string | null; retryAfterMs: number | null;
}
interface Snapshot { status: DownloadStatus; wallpapers: (Omit<Wallpaper, 'src'> & { filePath: string })[]; }
export function useDailyDownloads(target: number, automatic: boolean, excludeIds: string[]) {
  const [wallpapers, setWallpapers] = useState<Wallpaper[]>([]);
  const [status, setStatus] = useState<DownloadStatus>({ running: false, cancelRequested: false, day: '', target, completed: 0, failed: 0, lastError: null, retryAfterMs: null });
  const [error, setError] = useState('');
  const params = useRef({ target, automatic, excludeIds });
  params.current = { target, automatic, excludeIds };
  const refresh = useRef<() => Promise<void>>(async () => {});
  const previousTarget = useRef(target);
  useEffect(() => {
    if (!isDesktop()) return;
    let disposed = false, busy = false, timer = 0, catalogJson = '', lastAttempt = 0;
    const poll = async () => {
      if (disposed || busy) return;
      clearTimeout(timer); busy = true;
      let running = false;
      try {
        const p = params.current;
        const snapshot = await invoke<Snapshot>('get_download_state', { target: p.target });
        if (disposed) return;
        setError('');
        running = snapshot.status.running;
        setStatus(previous => JSON.stringify(previous) === JSON.stringify(snapshot.status) ? previous : snapshot.status);
        const serialized = JSON.stringify(snapshot.wallpapers);
        if (serialized !== catalogJson) {
          catalogJson = serialized;
          setWallpapers(snapshot.wallpapers.map(w => ({ ...w, src: convertFileSrc(w.filePath) })));
        }
        const latest = params.current;
        if (latest.automatic && !running && snapshot.status.completed < latest.target && Date.now() - lastAttempt >= 60_000 && (snapshot.status.retryAfterMs ?? 0) <= Date.now()) {
          lastAttempt = Date.now();
          await invoke('start_daily_downloads', { target: latest.target, excludeIds: latest.excludeIds });
          running = true;
        }
      } catch (e) { if (!disposed) setError(String(e)); }
      finally { busy = false; if (!disposed) timer = window.setTimeout(poll, running ? 1500 : 30000); }
    };
    refresh.current = poll;
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, []);
  useEffect(() => {
    if (!isDesktop()) return;
    if (!automatic || previousTarget.current !== target) void invoke('cancel_daily_downloads').catch(e => setError(String(e)));
    previousTarget.current = target;
    void refresh.current();
  }, [automatic, target]);
  const start = useCallback(async () => {
    if (!isDesktop()) return;
    try {
      await invoke('start_daily_downloads', { target: params.current.target, excludeIds: params.current.excludeIds });
      await refresh.current();
    } catch (e) { setError(String(e)); }
  }, []);
  const cancel = useCallback(async () => {
    if (!isDesktop()) return;
    try { await invoke('cancel_daily_downloads'); await refresh.current(); }
    catch (e) { setError(String(e)); }
  }, []);
  return { wallpapers, status, error, start, cancel };
}
