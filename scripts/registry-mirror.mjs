// Local build-only transport for Cargo on hosts with unavailable Schannel revocation services.
// Upstream TLS verification stays enabled. Cargo still verifies every crate checksum.
import http from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const port = 19420;
const root = new URL('../.tools/registry-mirror/', import.meta.url);
await mkdir(root, { recursive: true });
const pending = new Map();
async function upstream(url) {
  const path = new URL(createHash('sha256').update(url).digest('hex'), root);
  try { return await readFile(path); } catch {}
  if (pending.has(url)) return pending.get(url);
  const task = (async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(45000), headers: { 'User-Agent': 'Qingye-Cargo-Local-Transport/0.1' } });
        if (response.status === 404) { const error = new Error('not found'); error.status = 404; throw error; }
        if (!response.ok) throw new Error('Upstream HTTP ' + response.status);
        const bytes = Buffer.from(await response.arrayBuffer());
        await writeFile(path, bytes);
        return bytes;
      } catch (error) {
        if (error.status === 404 || attempt === 3) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  })();
  pending.set(url, task);
  try { return await task; } finally { pending.delete(url); }
}
http.createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://127.0.0.1:' + port).pathname;
    if (path === '/config.json') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ dl: `http://127.0.0.1:${port}/crates/{crate}/{version}/download`, api: 'https://crates.io' })); return; }
    if (path === '/health') { response.setHeader('Content-Type', 'text/plain; charset=utf-8'); response.end('qingye-cargo-transport'); return; }
    const crate = path.match(/^\/crates\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9.+_-]+)\/download$/);
    let url;
    if (crate) url = `https://static.crates.io/crates/${crate[1]}/${crate[1]}-${crate[2]}.crate`;
    else if (/^\/[a-zA-Z0-9_\/-]+$/.test(path) && !path.includes('..')) url = 'https://raw.githubusercontent.com/rust-lang/crates.io-index/master' + path;
    else { response.writeHead(400); response.end('Bad request'); return; }
    const bytes = await upstream(url);
    response.setHeader('Content-Length', bytes.length);
    response.end(bytes);
    console.log('OK', path, bytes.length);
  } catch (error) {
    console.error('ERROR', request.url, error.message);
    response.writeHead(error.status ?? 502); response.end('Dependency transport unavailable');
  }
}).listen(port, '127.0.0.1', () => console.log('Cargo transport listening on 127.0.0.1:' + port));
