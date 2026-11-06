import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Only used to prepare the bundled sample collection, never at application startup.
const queries = [
  ['山湖来信', '山野', 'Lago di Braies lake mountains landscape'],
  ['绿意漫游', '森林', 'forest sunlight landscape -painting -drawing'],
  ['海风经过', '海岸', 'Seychelles beach landscape -painting'],
  ['远山有回声', '山野', 'Dolomites mountain landscape meadow -painting'],
  ['花开有时', '花卉', 'cosmos flowers field landscape -painting'],
  ['静谧之境', '湖泊', 'Lake Bled reflection landscape -painting'],
  ['落日慢慢', '海岸', 'ocean sunset landscape -painting'],
  ['雪山与诗', '山野', 'Swiss alps mountain panorama -painting'],
  ['森间呼吸', '森林', 'moss forest stream landscape -painting'],
  ['春日序曲', '花卉', 'tulip field landscape -painting'],
  ['沙丘的曲线', '山野', 'Namib desert dunes landscape -painting'],
  ['樱花如约', '花卉', 'Japan cherry blossom lake landscape -painting'],
  ['茶山清晨', '山野', 'tea plantation landscape hills -painting'],
  ['秋日私语', '森林', 'autumn forest landscape trees -painting'],
  ['海角灯塔', '海岸', 'lighthouse coast landscape -painting'],
  ['北方来风', '海岸', 'Lofoten coast landscape mountains -painting'],
  ['紫色夏天', '花卉', 'Provence lavender field landscape -painting'],
  ['听见山泉', '森林', 'forest waterfall landscape -painting'],
  ['湖畔微光', '湖泊', 'Lake Louise turquoise landscape -painting'],
  ['草原长信', '山野', 'grassland meadow landscape mountain -painting'],
  ['山间星河', '山野', 'milky way landscape mountains night -painting'],
  ['晨雾中的湖', '湖泊', 'mist lake sunrise landscape -painting'],
  ['蔚蓝假日', '海岸', 'Mediterranean turquoise coast landscape -painting'],
  ['竹影清风', '森林', 'bamboo forest landscape path -painting'],
];
const headers = { 'User-Agent': 'QingyeWallpaperAssetPreparation/0.1 (local sample preparation; Wikimedia attribution preserved)' };
async function commonsRequest(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(45000) });
    if (response.status !== 429 || attempt === 2) return response;
    const retry = response.headers.get('retry-after');
    const wait = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : Math.max(60000, Date.parse(retry ?? '') - Date.now() || 60000);
    console.log(`Commons rate limit: respecting retry delay of ${Math.ceil(wait / 1000)} seconds.`);
    await response.body?.cancel();
    for (let remaining = wait; remaining > 0; remaining -= 30000) await new Promise(resolve => setTimeout(resolve, Math.min(remaining, 30000)));
  }
}
const strip = value => String(value ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#0*39;/g, "'").replace(/&quot;/g, '"').trim();
await mkdir('public/wallpapers', { recursive: true });
await mkdir('src/data', { recursive: true });
const results = process.argv.includes('--extend') ? JSON.parse(await readFile('src/data/wallpapers.json', 'utf8')) : [];
for (const [title, category, search] of queries) {
  if (results.some(r => r.title === title)) continue;
  if (results.length >= 24) break;
  try {
    const params = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: search + ' filetype:bitmap', gsrnamespace: '6', gsrlimit: '14', prop: 'imageinfo', iiprop: 'url|extmetadata|size', iiurlwidth: '1600', format: 'json' });
    const response = await commonsRequest('https://commons.wikimedia.org/w/api.php?' + params);
    if (!response.ok) throw new Error('API HTTP ' + response.status);
    const data = await response.json();
    const candidates = Object.values(data.query?.pages ?? {}).sort((a,b) => a.index-b.index);
    const page = candidates.find(p => {
      const i = p.imageinfo?.[0];
      return i && i.width / i.height > 1.4 && i.width / i.height < 2.5 && i.width >= 1800 && /^(CC BY|CC0|Public domain)/.test(i.extmetadata.LicenseShortName?.value ?? '') && !results.some(r => r.id === 'commons-' + p.pageid);
    });
    if (!page) throw new Error('No suitable openly licensed landscape');
    const i = page.imageinfo[0];
    const url = i.thumburl ?? i.url;
    const image = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
    if (!image.ok || !image.headers.get('content-type')?.startsWith('image/')) throw new Error('Image HTTP ' + image.status);
    const bytes = Buffer.from(await image.arrayBuffer());
    const extension = /png/i.test(image.headers.get('content-type')) ? 'png' : 'jpg';
    const id = 'commons-' + page.pageid;
    const local = `/wallpapers/${id}.${extension}`;
    await writeFile('public' + local, bytes);
    results.push({ id, title, category, src: local, width: i.thumbwidth ?? i.width, height: i.thumbheight ?? i.height, originalWidth: i.width, originalHeight: i.height, author: strip(i.extmetadata.Artist?.value ?? 'Wikimedia contributor'), license: strip(i.extmetadata.LicenseShortName?.value), licenseUrl: i.extmetadata.LicenseUrl?.value ?? 'https://creativecommons.org/publicdomain/mark/1.0/', source: i.descriptionurl, originalTitle: page.title.replace(/^File:/,''), bytes: bytes.length, addedAt: '2026-11-06T04:00:00.000Z', kind: 'sample' });
    console.log(title, id, results.at(-1).license, Math.round(bytes.length/1024) + 'KB');
  } catch(e) { console.error(title + ': ' + e.message); }
  // Persist partial results so a network interruption does not lose completed work.
  await writeFile('src/data/wallpapers.json', JSON.stringify(results, null, 2) + '\n');
  await new Promise(resolve => setTimeout(resolve, 2500));
}
if (results.length < 24) process.exitCode = 1;
