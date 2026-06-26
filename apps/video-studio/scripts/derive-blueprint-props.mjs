// ---------------------------------------------------------------------------
// derive-blueprint-props.mjs
//
// Turns a content brief into THEMATIC EnergyBlueprintVideo props so the body
// graph lights up the specific element the video is about — instead of the
// generic hero constellation. This is the derivation layer that was missing:
// the briefs encode the subject only in their key/topic (e.g. "gate-concept-20",
// "authority-concept-emotional", "type-welcome-projector"), and the canonical
// gate→center map lives in @latimer-woods-tech/bodygraph. We connect them.
//
//   gate-concept-N        → signatureGates=[N], light + spotlight GATE_TO_CENTER[N]
//   authority-concept-X   → light + spotlight that authority's center
//   type-welcome-X / type → hdType=X (colours the whole graph for that type)
//   definition-concept-*  → the hero constellation (no single focus)
//   everything else       → hero constellation
//
// Inputs (env): BRIEF_KEY TOPIC SCRIPT NARRATION_URL BRAND_COLOR BRAND_ACCENT
//   LOGO_URL FORGE_THEME MUSIC_URL [MUSIC_VOLUME] [APP_ID]
// Output: EnergyBlueprintVideo props JSON on stdout.
// ---------------------------------------------------------------------------
import { GATE_TO_CENTER, gatePosition, getAtom } from '@latimer-woods-tech/bodygraph';

const env = (k, d = '') => (process.env[k] ?? d);

const BRIEF_KEY = env('BRIEF_KEY');
const TOPIC = env('TOPIC', 'Your Energy Blueprint');
const SCRIPT = env('SCRIPT');
const NARRATION_URL = env('NARRATION_URL');
const BRAND_COLOR_OVERRIDE = env('BRAND_COLOR');
const BRAND_ACCENT_OVERRIDE = env('BRAND_ACCENT');
const LOGO_URL = env('LOGO_URL');
const FORGE_THEME_OVERRIDE = env('FORGE_THEME');
const MUSIC_URL = env('MUSIC_URL');
const MUSIC_VOLUME = Number(env('MUSIC_VOLUME', '0.16'));
const APP_ID = env('APP_ID', 'prime_self');

const HERO_CENTERS = ['Head', 'Ajna', 'Throat', 'G', 'Sacral', 'Spleen', 'Root'];

// Authority → the center that carries it.
const AUTHORITY_CENTER = {
  emotional: 'SolarPlexus',
  'solar-plexus': 'SolarPlexus',
  'solar': 'SolarPlexus',
  sacral: 'Sacral',
  splenic: 'Spleen',
  spleen: 'Spleen',
  ego: 'Heart',
  heart: 'Heart',
  'self-projected': 'G',
  'self': 'G',
  'mental-projected': 'Throat',
  mental: 'Throat',
  lunar: null, // reflector — no single defining center
};

const HD_TYPES = new Set(['generator', 'manifesting_generator', 'manifestor', 'projector', 'reflector']);

/** Derive the thematic focus for a brief key. */
function deriveFocus(key) {
  let m;
  if ((m = /^gate-concept-(\d+)/.exec(key))) {
    const gate = Number(m[1]);
    const atom = getAtom(gate);
    const center = atom.center;
    if (center) return { definedCenters: [center], spotlightCenter: center, signatureGates: [gate], hdType: null, atom };
  }
  if ((m = /^authority-concept-(.+)$/.exec(key))) {
    const center = AUTHORITY_CENTER[m[1]] ?? AUTHORITY_CENTER[m[1].replace(/-concept.*/, '')];
    if (center) return { definedCenters: [center], spotlightCenter: center, signatureGates: [], hdType: null, atom: null };
    return { definedCenters: HERO_CENTERS, spotlightCenter: null, signatureGates: [], hdType: 'reflector', atom: null };
  }
  if ((m = /^type-(?:welcome-)?(.+)$/.exec(key))) {
    const t = m[1].replace(/-/g, '_');
    if (HD_TYPES.has(t)) return { definedCenters: HERO_CENTERS, spotlightCenter: 'G', signatureGates: [], hdType: t, atom: null };
  }
  // definition / philosophy / synthesis / user-guide / temporal / utility → hero
  return { definedCenters: HERO_CENTERS, spotlightCenter: 'G', signatureGates: [], hdType: null, atom: null };
}

const focus = deriveFocus(BRIEF_KEY);
const BRAND_COLOR = BRAND_COLOR_OVERRIDE || focus.atom?.color || '#c9a84c';
const BRAND_ACCENT = BRAND_ACCENT_OVERRIDE || focus.atom?.color || '#c9a84c';
const FORGE_THEME = FORGE_THEME_OVERRIDE || focus.atom?.forgeTheme || 'self';

function buildSignatureGateData(gates) {
  return gates.flatMap((gate) => {
    const atom = getAtom(gate);
    const position = gatePosition(gate);
    if (!position) return [];
    const [gift, siddhi, shadow, archetype] = atom.kbKeys;
    return [{
      gate: atom.gate,
      name: atom.gateName,
      hex: atom.hexagram,
      center: atom.center,
      archetype,
      shadow,
      gift,
      siddhi,
      x: position.x,
      y: position.y,
    }];
  });
}

// Split the narration into a two-part concept arc.
const sentences = (SCRIPT || '').split(/(?<=[.!?])\s+/).filter(Boolean);
const mid = Math.floor(sentences.length / 2);
const part1 = sentences.slice(0, mid).join(' ') || TOPIC;
const part2 = sentences.slice(mid).join(' ') || '';
const first = sentences[0] ?? TOPIC;
const last = sentences[sentences.length - 1] ?? '';

const sceneTone = focus.atom ? { typeColor: focus.atom.color } : {};
const bg = {
  showBodyGraph: true,
  definedCenters: focus.definedCenters,
  signatureGates: focus.signatureGates,
  ...sceneTone,
};
const signatureGateData = buildSignatureGateData(focus.signatureGates);
const scenes = [
  { type: 'arrival', durationFrames: 150, showBodyGraph: false },
  { type: 'revelation', durationFrames: 300, text: first, showBodyGraph: false },
  { type: 'concept', durationFrames: 540, text: part1, ...bg },
  { type: 'breath', durationFrames: 90, ...bg, spotlightCenter: focus.spotlightCenter || undefined },
  { type: 'concept', durationFrames: 540, text: part2, ...bg, spotlightCenter: focus.spotlightCenter || undefined },
  { type: 'invitation', durationFrames: 630, text: last, showBodyGraph: false },
];

const props = {
  appId: APP_ID,
  topic: TOPIC,
  script: SCRIPT,
  narrationUrl: NARRATION_URL,
  brandColor: BRAND_COLOR,
  brandAccent: BRAND_ACCENT,
  logoUrl: LOGO_URL,
  forgeTheme: FORGE_THEME,
  ...(focus.hdType ? { hdType: focus.hdType } : {}),
  signatureGates: focus.signatureGates,
  ...(signatureGateData.length > 0 ? { signatureGateData } : {}),
  scenes,
  ...(MUSIC_URL ? { musicUrl: MUSIC_URL, musicVolume: MUSIC_VOLUME } : {}),
};

process.stdout.write(JSON.stringify(props));
