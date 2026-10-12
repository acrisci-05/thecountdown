// Pipeline completa dello spot 9:16 di The Countdown.
//   node build.mjs            → render completo
//   node build.mjs --audio    → solo audio (veloce, per provare il mix)
// Uscite in ad/out/: Ad_9x16.mp4, contact_sheet.jpg, stems/*.flac, loudness_report.txt, timeline.json
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import { synthVoice } from './lib/voice.mjs';
import { music, sfx, voiceTrack, writeWav, SR } from './lib/audio.mjs';
import { renderVideo, run } from './lib/render.mjs';

const ROOT = import.meta.dirname;
const OUT = join(ROOT, 'out'), WORK = join(OUT, 'work'), STEMS = join(OUT, 'stems');
const onlyAudio = process.argv.includes('--audio');
const t0 = Date.now();
const log = msg => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s] ${msg}`);

await mkdir(WORK, { recursive: true });
await mkdir(STEMS, { recursive: true });
const timeline = JSON.parse(await readFile(join(ROOT, 'timeline.json'), 'utf8'));
const D = timeline.format.duration;

/* 1 · Voce: durate reali → sottotitoli e timeline */
log('Voce narrante (sintesi Windows, it-IT)…');
const clips = await synthVoice(timeline, WORK);
for (const v of timeline.voiceover) log(`  ${v.id}: ${v.duration}s (velocità ${v.speechRate}) “${v.text}”`);

/* 2 · Musica, effetti, voce → WAV */
log('Sintesi musica (4 stem, 120 BPM) ed effetti…');
const stems = music(D);
for (const [name, tr] of Object.entries(stems)) await writeWav(join(WORK, `${name}.wav`), tr);
await writeWav(join(WORK, 'sfx.wav'), sfx(timeline));
await writeWav(join(WORK, 'voice.wav'), voiceTrack(timeline, clips));
log(`  ${timeline.sfx.length} effetti sonori posizionati dalla timeline`);

/* 3 · Mix: bus musica → ducking sotto la voce → somma → loudness */
log('Mix con ducking e normalizzazione a −14 LUFS / −1 dBTP…');
const w = n => join(WORK, n);
await run(['-y', '-hide_banner', '-i', w('drums.wav'), '-i', w('bass.wav'), '-i', w('pad.wav'), '-i', w('melody.wav'), '-i', w('voice.wav'), '-i', w('sfx.wav'),
  '-filter_complex',
  '[0][1][2][3]amix=inputs=4:normalize=0,volume=0.9,aformat=channel_layouts=stereo[music];' +
  '[4]asplit=2[vo][vokey];' +
  '[music][vokey]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350:makeup=1[ducked];' +
  '[ducked]asplit=2[duck_out][duck_mix];' +
  // Limiter prima della normalizzazione: toglie i picchi così il guadagno lineare arriva a −14 LUFS senza superare il true peak
  '[duck_mix][vo][5]amix=inputs=3:normalize=0,aformat=channel_layouts=stereo,alimiter=limit=0.6:attack=4:release=80:level=false[mix]',
  '-map', '[duck_out]', '-c:a', 'pcm_f32le', w('music_ducked.wav'),
  '-map', '[mix]', '-c:a', 'pcm_f32le', w('mix_raw.wav')]);
const loud = { I: -14, TP: -1.5, LRA: 11 }; // TP con 0,5 dB di margine sul requisito di −1 dBTP
const LIMIT_TP = -1;
const measure = async file => {
  const err = await run(['-hide_banner', '-i', file, '-af', `loudnorm=I=${loud.I}:TP=${loud.TP}:LRA=${loud.LRA}:print_format=json`, '-f', 'null', '-']);
  return JSON.parse(err.slice(err.lastIndexOf('{'), err.lastIndexOf('}') + 1));
};
const m1 = await measure(w('mix_raw.wav'));
await run(['-y', '-hide_banner', '-i', w('mix_raw.wav'), '-af',
  `loudnorm=I=${loud.I}:TP=${loud.TP}:LRA=${loud.LRA}:measured_I=${m1.input_i}:measured_TP=${m1.input_tp}:measured_LRA=${m1.input_lra}:measured_thresh=${m1.input_thresh}:offset=${m1.target_offset}:linear=true,aresample=${SR},aformat=sample_rates=${SR}:channel_layouts=stereo`,
  '-c:a', 'pcm_s24le', w('master.wav')]);
const m2 = await measure(w('master.wav'));
// True peak finale indipendente (ebur128 con oversampling)
const eb = await run(['-hide_banner', '-i', w('master.wav'), '-af', 'ebur128=peak=true', '-f', 'null', '-']);
const tail = eb.slice(eb.lastIndexOf('Summary:'));
const ebI = Number((tail.match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]);
const ebTP = Number((tail.match(/Peak:\s+(-?[\d.]+) dBFS/) || [])[1]);
const ebLRA = Number((tail.match(/LRA:\s+(-?[\d.]+) LU/) || [])[1]);

/* 4 · Stem in FLAC */
log('Esporto gli stem in FLAC…');
const stemList = [['drums', 'drums.wav'], ['bass', 'bass.wav'], ['pad', 'pad.wav'], ['melody', 'melody.wav'], ['music_ducked', 'music_ducked.wav'], ['sfx', 'sfx.wav'], ['voiceover', 'voice.wav'], ['master', 'master.wav']];
for (const [name, file] of stemList) await run(['-y', '-hide_banner', '-i', w(file), '-af', 'aformat=channel_layouts=stereo', '-c:a', 'flac', '-sample_fmt', 's32', '-ar', String(SR), join(STEMS, `${name}.flac`)]);

/* 5 · Report loudness */
const report = [
  'THE COUNTDOWN · Spot 9:16 · Report loudness',
  `Generato: ${new Date().toISOString()}`,
  '',
  `Obiettivo: ${loud.I} LUFS integrati, true peak massimo ${LIMIT_TP} dBTP (target interno ${loud.TP} dBTP)`,
  '',
  'Prima della normalizzazione (mix grezzo):',
  `  Loudness integrata: ${m1.input_i} LUFS`,
  `  True peak:          ${m1.input_tp} dBTP`,
  `  Loudness range:     ${m1.input_lra} LU`,
  '',
  'Master finale (misura loudnorm):',
  `  Loudness integrata: ${m2.input_i} LUFS`,
  `  True peak:          ${m2.input_tp} dBTP`,
  `  Loudness range:     ${m2.input_lra} LU`,
  '',
  'Master finale (verifica indipendente EBU R128, ebur128 con true peak):',
  `  Loudness integrata: ${ebI} LUFS`,
  `  True peak:          ${ebTP} dBTP`,
  `  Loudness range:     ${ebLRA} LU`,
  '',
  `Esito: ${Math.abs(ebI - loud.I) <= 0.5 && ebTP <= LIMIT_TP ? 'CONFORME' : 'DA CONTROLLARE'} (tolleranza ±0,5 LU sulla loudness integrata)`,
  '',
  'Catena: 4 stem musicali → bus musica → sidechain compressor (chiave: voce, soglia 0,03, rapporto 6:1, attacco 15 ms, rilascio 350 ms)',
  '        + voce + effetti → loudnorm a due passaggi (lineare) → 48 kHz / 24 bit → AAC 320 kb/s nel video',
].join('\n');
await writeFile(join(OUT, 'loudness_report.txt'), report + '\n');
log(`Loudness master: ${ebI} LUFS, true peak ${ebTP} dBTP`);

/* 6 · Timeline risolta (con durate reali della voce) */
await writeFile(join(OUT, 'timeline.json'), JSON.stringify({ ...timeline, generatedAt: new Date().toISOString() }, null, 2));
if (onlyAudio) { log('Solo audio: fatto.'); process.exit(0); }

/* 7 · Video: render 2.5D con motion blur 8× (otturatore 180°) */
const workers = Math.max(2, Math.min(6, Math.floor(os.cpus().length / 3)));
log(`Render video 1080×1920 @ ${timeline.format.fps} fps, ${timeline.format.subframes} sotto-fotogrammi, ${workers} processi in parallelo…`);
const video = join(WORK, 'video.mp4');
const r = await renderVideo(timeline, video, WORK, { workers });
log(`  ${r.frames} fotogrammi in ${r.seconds.toFixed(0)} s`);

/* 8 · Montaggio finale */
log('Unisco video e audio…');
await run(['-y', '-hide_banner', '-i', video, '-i', w('master.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', String(SR), '-shortest', '-movflags', '+faststart', join(OUT, 'Ad_9x16.mp4')]);

/* 9 · Contact sheet dei fotogrammi chiave */
log('Contact sheet…');
const keys = [0.6, 1.8, 2.95, 3.8, 5.6, 7.4, 9.3, 10.9, 12.5, 13.7, 14.7, 15.4, 16.2, 16.9, 17.7];
const sel = keys.map(k => `eq(n\\,${Math.round(k * timeline.format.fps)})`).join('+');
await run(['-y', '-hide_banner', '-i', join(OUT, 'Ad_9x16.mp4'), '-vf', `select='${sel}',scale=360:640,drawtext=text='%{pts\\:hms}':x=12:y=12:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6,tile=5x3:padding=8:margin=8:color=0x07080c`, '-frames:v', '1', '-vsync', 'vfr', join(OUT, 'contact_sheet.jpg')]).catch(async () => {
  // Alcune build di FFmpeg non hanno drawtext: contact sheet senza orario
  await run(['-y', '-hide_banner', '-i', join(OUT, 'Ad_9x16.mp4'), '-vf', `select='${sel}',scale=360:640,tile=5x3:padding=8:margin=8:color=0x07080c`, '-frames:v', '1', '-vsync', 'vfr', join(OUT, 'contact_sheet.jpg')]);
});

await rm(join(WORK, 'video.mp4'), { force: true });
log('Fatto. File in ad/out/');
