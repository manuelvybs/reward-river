// node tools/process-audio.mjs   art-src/audio/raw/*.mp3 -> assets/audio/*.mp3
// Measures integrated loudness + true peak (ffmpeg ebur128), then applies ONE linear gain per file (loops stay
// seamless: no dynamic normalizer), trims leading silence on one-shots, and encodes small mp3s.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RAW = 'art-src/audio/raw', OUT = 'assets/audio';
const LOOPS = new Set(['rope_creak', 'waterfall', 'canyon', 'river', 'rapids', 'raft_creak']);
const kind = n => n.startsWith('music_') ? 'music' : LOOPS.has(n) ? 'loop' : 'oneshot';
const TARGET = { oneshot: -16, loop: -22, music: -16 };

function measure(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr.toString();
  return { I: parseFloat(r.match(/I:\s+(-?[\d.]+) LUFS/g).pop().split(/\s+/)[1]), peak: parseFloat(r.match(/Peak:\s+(-?[\d.inf]+) dBFS/g).pop().split(/\s+/)[1]) };
}
fs.mkdirSync(OUT, { recursive: true });
const rows = [];
for (const f of fs.readdirSync(RAW).filter(f => f.endsWith('.mp3')).sort()) {
  const name = path.basename(f, '.mp3'), k = kind(name), src = path.join(RAW, f), dst = path.join(OUT, f);
  const m = measure(src);
  const gain = Math.min(TARGET[k] - m.I, -1 - m.peak);
  const af = [k === 'oneshot' ? 'silenceremove=start_periods=1:start_threshold=-55dB' : null, `volume=${gain.toFixed(2)}dB`].filter(Boolean).join(',');
  const enc = k === 'oneshot' ? ['-ac', '1', '-b:a', '96k'] : k === 'loop' ? ['-ac', '2', '-b:a', '96k'] : ['-ac', '2', '-b:a', '128k'];
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-af', af, '-ar', '44100', ...enc, dst]);
  const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst]).toString());
  rows.push(`${name.padEnd(13)} ${k.padEnd(7)} ${dur.toFixed(2).padStart(6)}s  in ${m.I.toFixed(1)} LUFS / ${m.peak.toFixed(1)} dB  gain ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB  ${(fs.statSync(dst).size / 1024).toFixed(0)} KB`);
}
console.log(rows.join('\n'));
