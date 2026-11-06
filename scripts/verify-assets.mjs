import { readFile, writeFile } from 'node:fs/promises';
const rows = JSON.parse(await readFile('src/data/wallpapers.json', 'utf8'));
function dimensions(bytes) {
  if (bytes.readUInt32BE(0) === 0x89504e47) return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  if (bytes.readUInt16BE(0) !== 0xffd8) throw new Error('Unsupported sample image format');
  let offset = 2;
  while (offset < bytes.length) {
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    const length = bytes.readUInt16BE(offset);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
    offset += length;
  }
  throw new Error('Image dimensions not found');
}
let corrections = 0;
for (const row of rows) {
  const bytes = await readFile('public' + row.src);
  const [width, height] = dimensions(bytes);
  if (width !== row.width || height !== row.height || bytes.length !== row.bytes) {
    console.log('Corrected', row.title, `${row.width}x${row.height} -> ${width}x${height}`);
    Object.assign(row, { width, height, bytes: bytes.length }); corrections++;
  }
  if (!row.author || !row.license || !row.source?.startsWith('https://commons.wikimedia.org/') || !row.licenseUrl) throw new Error('Missing image attribution: ' + row.id);
}
if (corrections && process.argv.includes('--fix')) await writeFile('src/data/wallpapers.json', JSON.stringify(rows, null, 2) + '\n');
else if (corrections) throw new Error('Sample metadata differs from local files. Run with --fix.');
console.log(`Verified ${rows.length} local sample images and attribution records.`);
