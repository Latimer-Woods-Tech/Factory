// narrate-screencast.mjs — ElevenLabs VO (with word-level timestamps) for the
// TrainingScreencast track. Writes the MP3 to public/ and prints word cues so
// beats (zoom + lower-third) can be locked to the spoken word.
//
// Env: ELEVENLABS_API_KEY. Args: --text "<vo>" --out <public/file.mp3> [--voice <id>] [--cues word1,word2,...]
import fs from 'node:fs';
import path from 'node:path';

const VOICE_DEFAULT = 'z7U1SjrEq4fDDDriOQEN'; // Vivie (pipeline narrator)
const args = process.argv.slice(2);
const get = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const TEXT = get('--text');
const OUT = path.resolve(get('--out', 'public/training-vo.mp3'));
const VOICE = get('--voice', VOICE_DEFAULT);
const CUE_WORDS = (get('--cues', '') || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error('ELEVENLABS_API_KEY not set'); process.exit(1); }
if (!TEXT) { console.error('--text required'); process.exit(1); }

const res = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps?output_format=mp3_44100_128`,
  {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: TEXT,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
    }),
  },
).catch((e) => { console.error('fetch failed', e.message); process.exit(1); });

if (!res.ok) { console.error('TTS HTTP', res.status, await res.text().catch(() => '')); process.exit(1); }
const data = await res.json();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.from(data.audio_base64, 'base64'));

// Build per-character timeline → word start times.
const a = data.alignment || data.normalized_alignment;
const chars = a.characters;
const starts = a.character_start_times_seconds;
const ends = a.character_end_times_seconds;
const total = ends[ends.length - 1];

const words = [];
let cur = '', curStart = null;
for (let i = 0; i < chars.length; i++) {
  const c = chars[i];
  if (/\s/.test(c)) {
    if (cur) { words.push({ word: cur, start: curStart }); cur = ''; curStart = null; }
  } else {
    if (!cur) curStart = starts[i];
    cur += c;
  }
}
if (cur) words.push({ word: cur, start: curStart });

const norm = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, '');
const cuePoints = CUE_WORDS.map((cw) => {
  const hit = words.find((w) => norm(w.word) === cw);
  return { cue: cw, at: hit ? Number(hit.start.toFixed(2)) : null };
});

console.log(JSON.stringify({ out: OUT, durationSeconds: Number(total.toFixed(2)), words: words.length, cuePoints }, null, 2));
