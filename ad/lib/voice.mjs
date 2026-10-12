// Voce narrante con la sintesi vocale di Windows (voce italiana "Elsa").
// Ogni battuta viene accelerata solo quanto basta per stare nel suo spazio della timeline.
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const PS = `
param([string]$Text, [string]$Out, [int]$Rate)
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'it-IT' } | Select-Object -First 1
if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }
$s.Rate = $Rate
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(48000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s.SetOutputToWaveFile($Out, $fmt)
$s.Speak($Text)
$s.Dispose()
`;

function powershell(script, args) {
  return new Promise((resolve, reject) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => (err += d));
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(err || 'powershell ' + code))));
  });
}

// Legge un WAV PCM 16 bit e restituisce i campioni come Float32 (-1..1) e la frequenza.
export async function readWav(file) {
  const b = await readFile(file);
  let off = 12, rate = 48000, channels = 1, data = null;
  while (off < b.length - 8) {
    const id = b.toString('ascii', off, off + 4), size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') { channels = b.readUInt16LE(off + 10); rate = b.readUInt32LE(off + 12); }
    if (id === 'data') { data = b.subarray(off + 8, off + 8 + size); break; }
    off += 8 + size + (size % 2);
  }
  const n = Math.floor(data.length / 2 / channels), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = data.readInt16LE(i * 2 * channels) / 32768;
  return { rate, samples: out };
}

// Toglie il silenzio iniziale e finale prodotto dalla sintesi.
function trim(samples, rate) {
  const th = 0.004;
  let a = 0, b = samples.length - 1;
  while (a < b && Math.abs(samples[a]) < th) a++;
  while (b > a && Math.abs(samples[b]) < th) b--;
  return samples.subarray(Math.max(0, a - Math.round(rate * .02)), Math.min(samples.length, b + Math.round(rate * .08)));
}

export async function synthVoice(timeline, workDir) {
  const script = join(workDir, 'tts.ps1');
  await writeFile(script, PS, 'utf8');
  const clips = [];
  for (const line of timeline.voiceover) {
    const slot = line.slotEnd - line.start;
    let rate = 0, clip = null;
    for (; rate <= 6; rate++) {
      const file = join(workDir, `${line.id}_r${rate}.wav`);
      await powershell(script, ['-Text', line.text, '-Out', file, '-Rate', String(rate)]);
      const { rate: sr, samples } = await readWav(file);
      clip = { id: line.id, rate: sr, samples: trim(samples, sr), speechRate: rate };
      if (clip.samples.length / sr <= slot) break;
    }
    line.duration = +(clip.samples.length / clip.rate).toFixed(3);
    line.speechRate = clip.speechRate;
    clips.push(clip);
  }
  return clips;
}
