import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(join(root, 'build-tools.json'), 'utf8'));
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Windows x64 is required.');
const compiler = config.compiler;
const bin = join(root, compiler.directory);
const run = (name, args) => execFileSync(join(bin, name), args, { encoding: 'utf8', windowsHide: true });
function verify() {
  if (run('gcc.exe', ['-dumpfullversion']).trim() !== compiler.gcc) throw new Error('GCC version does not match build-tools.json');
  if (run('g++.exe', ['-dumpfullversion']).trim() !== compiler.gcc) throw new Error('G++ version does not match build-tools.json');
  if (run('gcc.exe', ['-dumpmachine']).trim() !== 'x86_64-w64-mingw32') throw new Error('Expected an x64 MinGW compiler');
  if (!run('windres.exe', ['--version']).split('\n')[0].includes(compiler.binutils)) throw new Error('Unexpected resource compiler version');
}
if (existsSync(join(bin, 'gcc.exe'))) {
  verify(); console.log(`Using project compiler: ${compiler.name} ${compiler.version}, GCC ${compiler.gcc}`);
} else {
  const downloads = join(root, '.tools/downloads');
  await mkdir(downloads, { recursive: true });
  const archive = join(downloads, compiler.archive);
  let bytes = existsSync(archive) ? await readFile(archive) : undefined;
  if (!bytes || createHash('sha256').update(bytes).digest('hex') !== compiler.sha256) {
    console.log('Downloading pinned compiler from the official release...');
    const response = await fetch(compiler.url, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`Compiler download HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== compiler.sha256) throw new Error('Compiler SHA-256 mismatch. Nothing was executed.');
    await writeFile(archive + '.part', bytes); await rename(archive + '.part', archive);
  }
  const destination = resolve(bin, '../..');
  if (!destination.startsWith(join(root, '.tools') + '\\')) throw new Error('Compiler destination is outside project tools');
  await mkdir(destination, { recursive: true });
  execFileSync(archive, ['-y', '-o' + destination], { windowsHide: true, stdio: 'pipe' });
  verify(); console.log(`Installed ${compiler.name} ${compiler.version} / GCC ${compiler.gcc} under .tools`);
}
