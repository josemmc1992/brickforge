import {readFile, writeFile} from 'node:fs/promises';
import {Resvg} from '@resvg/resvg-js';

const folder = new URL('../desktop/assets/', import.meta.url);
const svg = await readFile(new URL('icon.svg', folder), 'utf8');
const render = size => new Resvg(svg, {fitTo: {mode: 'width', value: size}}).render().asPng();
await writeFile(new URL('icon.png', folder), render(512));
// ICO supports PNG-encoded frames. Keep small frames crisp at Windows display scales.
const sizes = [16, 24, 32, 48, 64, 128, 256];
const frames = sizes.map(render);
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (let i = 0; i < sizes.length; i++) {
  const entry = 6 + 16 * i;
  header[entry] = sizes[i] === 256 ? 0 : sizes[i];
  header[entry + 1] = header[entry];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frames[i].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frames[i].length;
}
await writeFile(new URL('icon.ico', folder), Buffer.concat([header, ...frames]));
console.log('Iconos de Brickforge generados: PNG 512 px e ICO multirresolución.');
