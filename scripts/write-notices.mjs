import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
const samples = JSON.parse(await readFile('src/data/wallpapers.json', 'utf8'));
const notices = '# 青野壁纸：示例图片来源与许可\n\n这些图片来自 Wikimedia Commons。图片版权和许可由原作者保留。随应用分发的是缩小副本，仅做尺寸调整；未改变作品内容。CC BY-SA 作品的该副本继续遵循对应 CC BY-SA 许可。\n\n' + samples.map(w => `## ${w.title}\n\n- 原作品：${w.originalTitle}\n- 作者：${w.author}\n- 来源：${w.source}\n- 许可：[${w.license}](${w.licenseUrl})\n- 本地副本：${w.src}\n- 修改：缩小至 ${w.width} × ${w.height}（Wikimedia 提供的缩略图）\n`).join('\n') + '\n## 软件组件\n\n本项目使用 Tauri、React、Radix UI、Lucide、image 和 windows-rs 等开源组件。软件组件的许可全文见 THIRD_PARTY_LICENSES.txt。完整依赖版本见 package-lock.json 和 src-tauri/Cargo.lock。\n';
await writeFile('THIRD_PARTY_NOTICES.md', notices);
const licenses = ['Qingye Wallpaper - Third-party software licenses\nIncludes development tools and all locally downloaded Rust dependencies conservatively.\n'];
async function appendLicenses(folder, label, trimTrailingSpace = false) {
  const files = await readdir(folder, { withFileTypes: true }).catch(() => []);
  for (const entry of files) {
    if (!entry.isFile() || !/^(licen[sc]e|copying|copyright|notice)([._-]|$)/i.test(entry.name)) continue;
    const original = await readFile(join(folder, entry.name), 'utf8');
    const text = trimTrailingSpace ? original.replace(/[ \t]+(?=\r?$)/gm, '') : original;
    licenses.push(`\n${'='.repeat(78)}\n${label} / ${entry.name}\n${'='.repeat(78)}\n${text}\n`);
  }
}
for (const entry of await readdir('node_modules', { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
  if (entry.name.startsWith('@')) {
    for (const nested of await readdir(join('node_modules', entry.name), { withFileTypes: true })) {
      if (nested.isDirectory()) await appendLicenses(join('node_modules', entry.name, nested.name), `${entry.name}/${nested.name}`);
    }
  } else await appendLicenses(join('node_modules', entry.name), entry.name);
}
const buildTools = JSON.parse(await readFile('build-tools.json', 'utf8'));
await appendLicenses(dirname(buildTools.compiler.directory), `${buildTools.compiler.name} ${buildTools.compiler.version}`, true);
for (const registry of await readdir('.tools/cargo/registry/src').catch(() => [])) {
  const folder = join('.tools/cargo/registry/src', registry);
  for (const crate of await readdir(folder)) await appendLicenses(join(folder, crate), crate);
}
await writeFile('THIRD_PARTY_LICENSES.txt', licenses.join('\n'));
console.log(`Prepared notices for ${samples.length} sample images and ${licenses.length - 1} software license files.`);
