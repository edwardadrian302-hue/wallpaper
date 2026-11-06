import { mkdir, readdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import './write-notices.mjs';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const dir = 'src-tauri/target/x86_64-pc-windows-gnu/release';
const releaseDir = `release/${version}`;
await mkdir(releaseDir, { recursive: true });
for (const name of ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.txt']) await copyFile(name, `${releaseDir}/${name}`);
await copyFile(`${dir}/qingye-wallpaper.exe`, `${releaseDir}/Qingye.exe`);
await copyFile('src-tauri/runtime/WebView2Loader.dll', `${releaseDir}/WebView2Loader.dll`);
const installerName = `Qingye-${version}-x64-Setup.exe`;
const installers = (await readdir(`${dir}/bundle/nsis`)).filter(name => name.endsWith('.exe') && name.includes(`_${version}_`));
if (installers.length !== 1) throw new Error('Expected exactly one installer for ' + version);
await copyFile(`${dir}/bundle/nsis/${installers[0]}`, `${releaseDir}/${installerName}`);
await writeFile(`${releaseDir}/使用说明.txt`, [
  `青野壁纸 ${version} 开发预览版`, '',
  'Qingye.exe：双击运行便携版，请放在可写目录，保留同目录的 WebView2Loader.dll。',
  `${installerName}：中文安装程序。`,
  '需要 Windows 10/11 x64 和 Microsoft Edge WebView2 运行环境。',
  '收藏和导入图片保存在程序旁的 data 目录，移动程序时请一并保留。',
  '每日联网下载默认 24 张。启动时补做当天任务，程序运行期间按日期补齐，关闭程序后停止。',
  '可在偏好设置暂停自动下载；来源暂时限流或不可达时显示原因并稍后重试。',
  '已下载图片保存在 data/library/images，来源和作者等信息记录在 data/library/catalog.json。',
  '壁纸库显示总数，每页 12 张。附带 24 张离线示例。',
  '托盘、开机启动及多屏独立设置尚未实现。当前为未签名开发预览版。',
  '示例图片作者与许可详见 THIRD_PARTY_NOTICES.md。', '',
].join('\r\n'));
const hashes = [];
for (const name of ['Qingye.exe', installerName]) {
  const bytes = await readFile(`${releaseDir}/${name}`);
  hashes.push(createHash('sha256').update(bytes).digest('hex') + '  ' + name);
  console.log(`${releaseDir}/${name}`, (bytes.length / 1024 / 1024).toFixed(1) + ' MiB');
}
await writeFile(`${releaseDir}/SHA256SUMS.txt`, hashes.join('\n') + '\n');
