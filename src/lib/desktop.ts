import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Wallpaper } from './model';
export const isDesktop = () => isTauri();
export async function applyWallpaper(wallpaper: Wallpaper, fit: 'fill' | 'fit') {
  if (!isDesktop()) throw new Error('请通过青野壁纸桌面程序使用此功能');
  const response = await fetch(wallpaper.src);
  if (!response.ok) throw new Error('无法读取图片');
  const bytes = await nativeImageBytes(await response.blob());
  return invoke<string>('set_wallpaper', { id: wallpaper.id, bytes, fit });
}
export async function openSource(url: string) {
  if (!/^https:\/\/(commons\.wikimedia\.org|creativecommons\.org)\//.test(url)) return;
  await invoke('open_source', { url });
}
export async function nativeImageBytes(blob: Blob): Promise<number[]> {
  if (blob.type === 'image/avif') {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) { bitmap.close(); throw new Error('无法转换此图片'); }
    context.drawImage(bitmap, 0, 0); bitmap.close();
    blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('图片转换失败')), 'image/png'));
  }
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}
export async function exportWallpaper(blob: Blob, id: string) {
  return invoke<string>('export_wallpaper', { id, bytes: await nativeImageBytes(blob) });
}
