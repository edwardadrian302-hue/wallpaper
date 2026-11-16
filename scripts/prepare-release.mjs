import { mkdir, readdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import './write-notices.mjs';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const dir = 'src-tauri/target/x86_64-pc-windows-gnu/release';
const releaseDir = `release/${version}`;
await mkdir(releaseDir, { recursive: true });
for (const name of ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.txt']) await copyFile(name, `${releaseDir}/${name}`);
await copyFile(`${dir}/chaoxi-wallpaper.exe`, `${releaseDir}/Chaoxi.exe`);
await copyFile('src-tauri/runtime/WebView2Loader.dll', `${releaseDir}/WebView2Loader.dll`);
const installerName = `Chaoxi-${version}-x64-Setup.exe`;
const installers = (await readdir(`${dir}/bundle/nsis`)).filter(name => name.endsWith('.exe') && name.includes(`_${version}_`));
if (installers.length !== 1) throw new Error('Expected exactly one installer for ' + version);
await copyFile(`${dir}/bundle/nsis/${installers[0]}`, `${releaseDir}/${installerName}`);
await writeFile(`${releaseDir}/使用说明.txt`, [
  `潮汐壁纸 ${version} 版本`, '',
  'Chaoxi.exe：双击运行便携版，请放在可写目录，保留同目录的 WebView2Loader.dll。',
  `${installerName}：中文安装程序。`,
  '需要 Windows 10/11 x64 和 Microsoft Edge WebView2 运行环境。',
  '收藏和导入图片保存在程序旁的 data 目录，移动程序时请一并保留。',
  '可勾选 Wikimedia Commons、Openverse、NASA，默认只选 Wikimedia。多个来源平均分配每日总量，设置自动保存。',
  '下载题材包含人物写真和自然风景；NASA 提供宇宙题材。具体结果取决于来源收录及横屏、许可筛选。',
  '每日联网下载默认 24 张。启动时补做当天任务，程序运行期间按日期补齐，关闭程序后停止。',
  '点击「再下载」按当前勾选来源追加一批新壁纸，不占每日自动下载额度；下载时按钮置灰，已入库图片自动去重。',
  '可在偏好设置暂停自动下载；来源暂时限流或不可达时显示原因并稍后重试。',
  '已下载图片保存在 data/library/images，来源和作者等信息记录在 data/library/catalog.json。',
  '侧栏「在线搜索」可输入任意关键词，从当前已选来源按每页最多 12 张查看、翻页和下载图片，下载不占每日自动额度。',
  '壁纸库与收藏页可进入管理模式，多选、选择当前页或全部筛选结果后批量删除。下载与导入副本永久删除；示例仅隐藏，可在偏好设置恢复。',
  '偏好设置可选择下载类型，用于每日与追加下载；NASA 仅在勾选宇宙时参与。在线关键词搜索不受类型配置限制。',
  '壁纸库显示总数，每页 12 张。附带 24 张离线示例。',
  '托盘、开机启动及多屏独立设置尚未实现。当前为未签名版本。',
  '示例图片作者与许可详见 THIRD_PARTY_NOTICES.md。', '',
].join('\r\n'));
const hashes = [];
for (const name of ['Chaoxi.exe', installerName]) {
  const bytes = await readFile(`${releaseDir}/${name}`);
  hashes.push(createHash('sha256').update(bytes).digest('hex') + '  ' + name);
  console.log(`${releaseDir}/${name}`, (bytes.length / 1024 / 1024).toFixed(1) + ' MiB');
}
await writeFile(`${releaseDir}/SHA256SUMS.txt`, hashes.join('\n') + '\n');
