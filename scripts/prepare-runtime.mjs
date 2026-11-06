import { readdir, readFile, mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
const lock = await readFile('src-tauri/Cargo.lock', 'utf8');
const record = lock.split('[[package]]').find(p => /^name = "webview2-com-sys"$/m.test(p));
const version = record?.match(/^version = "([^"]+)"$/m)?.[1];
if (!version) throw new Error('WebView2 runtime dependency missing from lockfile');
let copied = false;
for (const registry of await readdir('.tools/cargo/registry/src')) {
  const path = join('.tools/cargo/registry/src', registry, 'webview2-com-sys-' + version, 'x64', 'WebView2Loader.dll');
  try {
    await mkdir('src-tauri/runtime', { recursive: true });
    await copyFile(path, 'src-tauri/runtime/WebView2Loader.dll');
    console.log('Prepared Microsoft WebView2 loader from locked dependency ' + version);
    copied = true; break;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (!copied) throw new Error('Run cargo fetch before preparing the runtime');
