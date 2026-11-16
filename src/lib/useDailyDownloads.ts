import { useCallback, useEffect, useRef, useState } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { isDesktop } from './desktop';
import { effectiveSources } from './model';
import type { DownloadType, ImageSource, Wallpaper } from './model';
export interface SourceProgress { id: ImageSource; name: string; target: number; completed: number; retryAfterMs: number | null; lastError: string | null; }
export interface DownloadStatus {
  manual: boolean; dailyCompleted: number;
  sources: SourceProgress[]; running: boolean; cancelRequested: boolean; day: string; target: number;
  completed: number; failed: number; lastError: string | null; retryAfterMs: number | null;
}
interface Snapshot { status: DownloadStatus; wallpapers: (Omit<Wallpaper, 'src'> & { filePath: string })[]; }
export function useDailyDownloads(target: number, automatic: boolean, sources: ImageSource[], excludeIds: string[], downloadTypes: DownloadType[], maintenance = false) {
  const [wallpapers, setWallpapers] = useState<Wallpaper[]>([]);
  const [status, setStatus] = useState<DownloadStatus>({ manual: false, dailyCompleted: 0, sources: [], running: false, cancelRequested: false, day: '', target, completed: 0, failed: 0, lastError: null, retryAfterMs: null });
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const [error, setError] = useState('');
  const params = useRef({ target, automatic, sources, excludeIds, downloadTypes, maintenance });
  params.current = { target, automatic, sources, excludeIds, downloadTypes, maintenance };
  const refresh = useRef<() => Promise<void>>(async () => {});
  const configKey = JSON.stringify([target, automatic, sources, downloadTypes]);
  const previousConfig = useRef(configKey);
  const changing = useRef(false);
  const manual = useRef(false);
  const lastAttempt = useRef(0);
  useEffect(() => {
    if (!isDesktop()) return;
    let disposed = false, busy = false, timer = 0, catalogJson = '';
    const poll = async () => {
      if (disposed || busy) return;
      clearTimeout(timer); busy = true;
      let running = false;
      try {
        const p = params.current;
        const snapshot = await invoke<Snapshot>('get_download_state', { target: p.target, sources: p.sources, downloadTypes: p.downloadTypes });
        if (disposed) return;
        setError(effectiveSources(p.sources, p.downloadTypes).length ? '' : 'NASA 仅提供宇宙类型，请勾选宇宙或启用其他来源');
        running = snapshot.status.running;
        setStatus(previous => JSON.stringify(previous) === JSON.stringify(snapshot.status) ? previous : snapshot.status);
        const serialized = JSON.stringify(snapshot.wallpapers);
        if (serialized !== catalogJson) {
          catalogJson = serialized;
          setWallpapers(snapshot.wallpapers.map(w => ({ ...w, src: convertFileSrc(w.filePath) })));
        }
        const latest = params.current;
        if (effectiveSources(latest.sources, latest.downloadTypes).length && !latest.maintenance && !startingRef.current && !changing.current && (latest.automatic || manual.current) && !running && snapshot.status.dailyCompleted < latest.target && Date.now() - lastAttempt.current >= 60_000 && (snapshot.status.manual || (snapshot.status.retryAfterMs ?? 0) <= Date.now())) {
          lastAttempt.current = Date.now();
          manual.current = false;
          await invoke('start_daily_downloads', { target: latest.target, sources: latest.sources, excludeIds: latest.excludeIds, downloadTypes: latest.downloadTypes });
          setStatus(previous => ({ ...previous, running: true, manual: false, cancelRequested: false }));
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
    let disposed = false;
    if (previousConfig.current !== configKey) {
      previousConfig.current = configKey;
      changing.current = true;
      manual.current = false;
      lastAttempt.current = 0;
      void invoke('cancel_daily_downloads').catch(e => { if (!disposed) setError(String(e)); }).finally(() => {
        if (!disposed) { changing.current = false; void refresh.current(); }
      });
    } else { void refresh.current(); }
    return () => { disposed = true; };
  }, [configKey]);
  const start = useCallback(async () => {
    manual.current = true;
    lastAttempt.current = 0;
    await refresh.current();
  }, []);
  const cancel = useCallback(async () => {
    if (!isDesktop()) return;
    try { await invoke('cancel_daily_downloads'); await refresh.current(); }
    catch (e) { setError(String(e)); }
  }, []);
  const startExtra = useCallback(async () => {
    if (!isDesktop() || startingRef.current || changing.current) return;
    startingRef.current = true;
    setStarting(true);
    try {
      const p = params.current;
      await invoke('start_extra_downloads', { target: p.target, sources: p.sources, excludeIds: p.excludeIds, downloadTypes: p.downloadTypes });
      setStatus(previous => ({ ...previous, running: true, manual: true, completed: 0, target: p.target, cancelRequested: false }));
      await refresh.current();
    } catch (e) { setError(String(e)); }
    finally { startingRef.current = false; setStarting(false); }
  }, []);
  return { wallpapers, status, error, start, startExtra, starting, cancel, reload: () => refresh.current() };
}
