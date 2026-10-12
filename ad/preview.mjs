// Anteprima rapida: cattura alcuni fotogrammi chiave senza fare il render completo.
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { renderStills } from './lib/render.mjs';

const timeline = JSON.parse(await readFile(join(import.meta.dirname, 'timeline.json'), 'utf8'));
for (const v of timeline.voiceover) v.duration ??= Math.min(v.slotEnd - v.start, v.text.length * .065);
const times = (process.argv[2] || '1.2,2.9,5.0,7.5,9.4,11.0,13.6,14.6,16.0,17.6').split(',').map(Number);
const out = join(import.meta.dirname, 'out', 'preview');
await mkdir(out, { recursive: true });
const files = await renderStills(timeline, times, out);
console.log(files.join('\n'));
