/**
 * constellation renderer — the personal sky (non-HD synthesis map).
 *
 * The complement to the bodygraph: bodygraph = the body (microcosm, inner,
 * fixed); constellation = the sky (macrocosm, outer, living). "As above, so
 * below." Each of the six life-themes is a named constellation around a central
 * "you" star. Tapping a constellation loads POST /api/profile/focus and renders
 * its three layers as light:
 *   • convergence → anchor stars connect into a lit figure
 *   • voices      → distinct stars, each its tradition's colour
 *   • tensions    → an opposition line drawn across two poles
 *
 * Pure SVG-string renderer (no DOM deps) so it shares the bodygraph's lineage
 * and can be rasterised for film/web/PDF. Deterministic from a seed → every
 * person's sky is unique but stable.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** One of the six forge atmospheres (shared identity with the video engine). */
export type ForgeKey = 'chronos' | 'eros' | 'aether' | 'lux' | 'phoenix' | 'self';

/** One of the six life-theme slots. */
export type ThemeKey = 'purpose' | 'decisions' | 'relationships' | 'timing' | 'shadow_gift' | 'work';

/** Stellar spectral class (temperature palette). */
export type SpectralClass = 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M';

/** A star's visual role inside a constellation. */
export type StarRole = 'anchor' | 'voice' | 'tension' | 'dormant';

/** A single star in a focus-node star list. */
export interface StarData {
  role?: StarRole;
  magnitude?: number;
  system?: string;
  color?: string;
  spectral?: SpectralClass;
  fixed?: boolean;
  showLabel?: boolean;
  label?: string;
  name?: string;
  /** True if this entry should render as a celestial body (glyph disc). */
  body?: boolean;
  glyph?: string;
}

/** A resolved focus node for one life-theme. */
export interface FocusNode {
  stars: StarData[];
}

/** Input to renderConstellation. */
export interface ConstellationInput {
  /** Forge atmosphere key — controls the sky's colour palette. */
  forge?: ForgeKey;
  /** Stable seed (user id) — ensures the same person always sees the same sky. */
  seed?: string | number;
  /** Per-theme focus nodes, keyed by ThemeKey. */
  themes?: Partial<Record<ThemeKey, FocusNode>>;
  /** Centre label (defaults to 'YOU'). */
  name?: string;
  /**
   * Whether to emit SMIL twinkle animations. Web: true (default).
   * Pass false for Remotion video (frame-driven) or static exports (PDF/OG).
   */
  animate?: boolean;
  /** Themes lit by a live transit, from pulseThemes(). */
  pulse?: Partial<Record<ThemeKey, boolean>>;
}

// ── Forge atmospheres ─────────────────────────────────────────────────────────

interface Forge {
  bg: string;
  accent: string;
  halo: string;
  label: string;
}

const FORGE: Record<ForgeKey, Forge> = {
  chronos: { bg: '#07091f', accent: '#c9a84c', halo: '#c9a84c', label: 'Initiation' },
  eros:    { bg: '#120806', accent: '#e8923a', halo: '#ff8a4d', label: 'Mastery' },
  aether:  { bg: '#050d1a', accent: '#b8d4e8', halo: '#9fd0ff', label: 'Guidance' },
  lux:     { bg: '#070a1c', accent: '#fff3cf', halo: '#fff3cf', label: 'Perception' },
  phoenix: { bg: '#0a0608', accent: '#ff7a4d', halo: '#ff5a3c', label: 'Transformation' },
  self:    { bg: '#05091a', accent: '#c9a84c', halo: '#cdb36a', label: 'Self' },
};

const SYSTEM_COLOR: Record<string, string> = {
  astrology: '#c9a84c', transits: '#7aa2ff', numerology: '#b8d4e8',
  geneKeys: '#d4a8e8', vedic: '#f0a44c', mayan: '#6bda9b', bazi: '#e86b6b',
  sabian: '#fff5d6', chiron: '#9bb8e8', lilith: '#c77dff',
  behavioral: '#7af0b0', psychometrics: '#7af0b0', diary: '#7af0b0',
  blueprint: '#cdb36a', _default: '#dfe6ff',
};

const SPECTRAL: Record<SpectralClass, string> = {
  O: '#9bb0ff', B: '#aabfff', A: '#cad8ff', F: '#f6f4ff',
  G: '#fff4e8', K: '#ffd6a5', M: '#ffb188',
};

const BG_TINTS = ['#ffffff', '#ffffff', '#ffffff', '#cad8ff', '#ffd6a5', '#aabfff', '#fff4e8'];

/** The six theme nodes, placed clockwise from the top. */
const THEMES: Array<{ key: ThemeKey; label: string; angle: number }> = [
  { key: 'purpose',       label: 'Purpose',        angle: -90 },
  { key: 'decisions',     label: 'Decisions',      angle: -30 },
  { key: 'relationships', label: 'Relationships',  angle: 30 },
  { key: 'timing',        label: 'Timing',         angle: 90 },
  { key: 'shadow_gift',   label: 'Shadow & Gift',  angle: 150 },
  { key: 'work',          label: 'Work',           angle: 210 },
];

const VB = 1000;
const CX = 500, CY = 500;
const RING = 330;

// ── PRNG (mulberry32) ─────────────────────────────────────────────────────────

function hashSeed(str: string | number): number {
  const s = String(str);
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return function () {
    let n = a | 0;
    n = (n + 0x6D2B79F5) | 0;
    let t = Math.imul(n ^ (n >>> 15), 1 | n);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    a = n;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function esc(s: string | number | null | undefined): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c),
  );
}

// ── Rendering helpers ─────────────────────────────────────────────────────────

function backdrop(rand: () => number, accent: string, animate: boolean): string {
  let s = '';
  s += `<ellipse cx="${CX}" cy="${CY}" rx="${VB * 0.66}" ry="${VB * 0.17}" fill="url(#band)" opacity="0.55" transform="rotate(-28 ${CX} ${CY})"/>`;
  for (const rr of [205, 360]) {
    s += `<circle cx="${CX}" cy="${CY}" r="${rr}" fill="none" stroke="${accent}" stroke-width="0.5" opacity="0.06"/>`;
  }
  s += `<path d="M 40 ${CY + 120} Q ${CX} ${CY - 180} ${VB - 40} ${CY + 120}" fill="none" stroke="${accent}" stroke-width="0.8" stroke-dasharray="1 7" opacity="0.18"/>`;
  for (let i = 0; i < 150; i++) {
    const x = rand() * VB, y = rand() * VB;
    const r = 0.35 + rand() * (rand() < 0.06 ? 2.0 : 1.0);
    const o = 0.08 + rand() * 0.5;
    const tint = BG_TINTS[Math.floor(rand() * BG_TINTS.length)] ?? '#ffffff';
    const dur = (2.5 + rand() * 4).toFixed(2);
    const delay = (rand() * 4).toFixed(2);
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="${tint}" opacity="${o.toFixed(2)}">${
      animate
        ? `<animate attributeName="opacity" values="${o.toFixed(2)};${(o * 0.25).toFixed(2)};${o.toFixed(2)}" dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/>`
        : ''
    }</circle>`;
  }
  return s;
}

function starEl(x: number, y: number, color: string, magnitude: number, role: string, label?: string): string {
  const m = Math.max(1, Math.min(5, magnitude || 1));
  const r = 1.1 + m * 0.82;
  const core = role === 'tension' ? '#ffe7e0' : '#ffffff';
  const X = x.toFixed(1), Y = y.toFixed(1);
  let g = `<g class="cn-star" data-role="${role || 'voice'}">`;
  if (m >= 3 || role === 'anchor' || role === 'tension' || label) {
    g += `<circle cx="${X}" cy="${Y}" r="${(r * 4.4).toFixed(1)}" fill="${color}" opacity="${(0.05 + m * 0.025).toFixed(2)}" filter="url(#soft)"/>`;
    const L = r * (3.8 + m * 0.8);
    g += `<g stroke="${color}" stroke-width="${(0.4 + m * 0.1).toFixed(2)}" opacity="0.7" stroke-linecap="round">`
      + `<line x1="${(x - L).toFixed(1)}" y1="${Y}" x2="${(x + L).toFixed(1)}" y2="${Y}"/>`
      + `<line x1="${X}" y1="${(y - L).toFixed(1)}" x2="${X}" y2="${(y + L).toFixed(1)}"/></g>`;
  }
  g += `<circle cx="${X}" cy="${Y}" r="${(r * 1.85).toFixed(1)}" fill="${color}" opacity="0.38" filter="url(#soft)"/>`
    + `<circle cx="${X}" cy="${Y}" r="${(r + 0.6).toFixed(1)}" fill="${color}"/>`
    + `<circle cx="${X}" cy="${Y}" r="${(r * 0.5).toFixed(1)}" fill="${core}"/>`;
  if (label) {
    g += `<text x="${(x + r + 6).toFixed(1)}" y="${(y + 3.5).toFixed(1)}" font-family="Inter, system-ui, sans-serif" font-size="13" font-style="italic" fill="${color}" opacity="0.92" class="cn-fixed-label">${esc(label)}</text>`;
  }
  g += '</g>';
  return g;
}

function bodyMark(x: number, y: number, color: string, magnitude: number, glyph: string, label: string): string {
  const m = Math.max(1, Math.min(5, magnitude || 1));
  const R = 6 + m * 2.1;
  const X = x.toFixed(1), Y = y.toFixed(1);
  let g = '<g class="cn-body">';
  g += `<circle cx="${X}" cy="${Y}" r="${(R * 2.5).toFixed(1)}" fill="${color}" opacity="0.16" filter="url(#soft)"/>`;
  g += `<circle cx="${X}" cy="${Y}" r="${R.toFixed(1)}" fill="${color}" opacity="0.95"/>`;
  g += `<circle cx="${X}" cy="${Y}" r="${R.toFixed(1)}" fill="none" stroke="#fff" stroke-width="0.8" opacity="0.5"/>`;
  if (glyph) {
    g += `<text x="${X}" y="${(y + R * 0.42).toFixed(1)}" text-anchor="middle" font-size="${(R * 1.2).toFixed(1)}" font-family="serif" fill="#10131f" opacity="0.9">${esc(glyph)}</text>`;
  }
  if (label) {
    g += `<text x="${(x + R + 6).toFixed(1)}" y="${(y + 4.5).toFixed(1)}" font-family="Inter, system-ui, sans-serif" font-size="13.5" font-weight="600" fill="${color}" opacity="0.95">${esc(label)}</text>`;
  }
  g += '</g>';
  return g;
}

function renderTheme(
  theme: typeof THEMES[number],
  node: FocusNode | undefined,
  rand: () => number,
  F: Forge,
  pulsing: boolean,
  animate: boolean,
): string {
  const ax = CX + RING * Math.cos(theme.angle * Math.PI / 180);
  const ay = CY + RING * Math.sin(theme.angle * Math.PI / 180);
  const explored = node && Array.isArray(node.stars) && node.stars.length > 0;
  const stars: StarData[] = explored
    ? node!.stars
    : Array.from({ length: 5 }, () => ({ role: 'dormant' as StarRole, magnitude: 1, system: '_default' }));

  const spineAng = rand() * Math.PI * 2;
  const sx = Math.cos(spineAng), sy = Math.sin(spineAng) * 0.85;
  const px = -sy, py = sx;
  const anchorIdx = stars
    .map((s, i) => ({ s, i }))
    .filter((o) => o.s.role === 'anchor')
    .map((o) => o.i);
  let aStep = -1;
  const pts = stars.map((s) => {
    if (s.role === 'anchor') {
      aStep++;
      const t = anchorIdx.length > 1 ? (aStep / (anchorIdx.length - 1) - 0.5) : 0;
      const along = t * 150;
      const off = (rand() - 0.5) * 30;
      return { x: ax + sx * along + px * off, y: ay + sy * along + py * off };
    }
    const along = (rand() - 0.5) * 150;
    const off = (rand() < 0.5 ? -1 : 1) * (34 + rand() * 60);
    return { x: ax + sx * along + px * off, y: ay + sy * along + py * off };
  });

  let g = `<g class="cn-theme${pulsing ? ' cn-theme--pulsing' : ''}" data-theme="${theme.key}" role="button" tabindex="0" aria-label="${esc(theme.label)} constellation${pulsing ? ', lit by a transit today' : ''}${explored ? '' : ' — tap to reveal'}">`;
  g += `<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="135" fill="transparent"/>`;

  if (pulsing) {
    g += `<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="92" fill="none" stroke="${F.accent}" stroke-width="1.4" opacity="0.55">${
      animate
        ? '<animate attributeName="r" values="80;120;80" dur="3.2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.55;0.05;0.55" dur="3.2s" repeatCount="indefinite"/>'
        : ''
    }</circle>`;
    g += `<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="105" fill="none" stroke="${F.accent}" stroke-width="0.8" opacity="0.25" filter="url(#soft)"/>`;
  }

  const labelY = (ay + 132).toFixed(1);
  const labelFont = 'font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="600" letter-spacing="2"';

  if (!explored) {
    pts.forEach((p) => { g += starEl(p.x, p.y, 'rgba(214,224,255,0.5)', 1, 'dormant'); });
    g += `<text x="${ax.toFixed(1)}" y="${labelY}" text-anchor="middle" ${labelFont} fill="${F.accent}" opacity="0.5">${esc(theme.label.toUpperCase())}</text>`;
    g += '</g>';
    return g;
  }

  if (anchorIdx.length >= 2) {
    let d = '';
    anchorIdx.forEach((i, k) => {
      const p = pts[i]!;
      d += `${k === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
    });
    g += `<path d="${d.trim()}" fill="none" stroke="${F.accent}" stroke-width="2.6" opacity="0.16" filter="url(#soft)"/>`;
    g += `<path d="${d.trim()}" fill="none" stroke="${F.accent}" stroke-width="1" opacity="0.62" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  const tens = stars.map((s, i) => ({ s, i })).filter((o) => o.s.role === 'tension').map((o) => o.i);
  for (let k = 0; k + 1 < tens.length; k += 2) {
    const a = pts[tens[k]!]!, b = pts[tens[k + 1]!]!;
    g += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="#ff8d7a" stroke-width="2.6" opacity="0.25" filter="url(#soft)"/>`;
    g += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="#ff9d8a" stroke-width="1.2" stroke-dasharray="1.5 6" opacity="0.9"/>`;
  }

  stars.forEach((s, i) => {
    const p = pts[i]!;
    if (s.body) {
      g += bodyMark(p.x, p.y, s.color ?? '#ffd24a', s.magnitude ?? 1, s.glyph ?? '', s.label ?? s.name ?? '');
      return;
    }
    const color = s.color
      ?? (s.spectral ? SPECTRAL[s.spectral] : undefined)
      ?? SYSTEM_COLOR[s.system ?? '']
      ?? SYSTEM_COLOR['_default']
      ?? '#dfe6ff';
    const label = (s.fixed || s.showLabel) ? (s.label ?? s.name ?? '') : '';
    g += starEl(p.x, p.y, color, s.magnitude ?? 1, s.role ?? 'voice', label);
  });

  g += `<text x="${ax.toFixed(1)}" y="${labelY}" text-anchor="middle" ${labelFont} fill="#fff">${esc(theme.label.toUpperCase())}</text>`;
  g += '</g>';
  return g;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Render the constellation SVG string. Pure function — no DOM, no side effects.
 * Safe in Cloudflare Workers, Node.js, and Remotion (pass animate:false there).
 */
export function renderConstellation(data: ConstellationInput = {}): string {
  const F = FORGE[data.forge ?? 'self'] ?? FORGE.self;
  const rand = mulberry32(hashSeed(data.seed ?? 'prime-self'));
  const themes = data.themes ?? {};
  const animate = data.animate !== false;

  let leys = '';
  for (const th of THEMES) {
    const ax = CX + RING * Math.cos(th.angle * Math.PI / 180);
    const ay = CY + RING * Math.sin(th.angle * Math.PI / 180);
    const node = themes[th.key];
    const lit = node && Array.isArray(node.stars) && node.stars.length > 0;
    leys += `<line x1="${CX}" y1="${CY}" x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}" stroke="${F.accent}" stroke-width="${lit ? 0.9 : 0.5}" opacity="${lit ? 0.28 : 0.12}"/>`;
  }

  const pulse = data.pulse ?? {};
  const constellations = THEMES
    .map((th) => renderTheme(th, themes[th.key], rand, F, !!pulse[th.key], animate))
    .join('');

  const you = '<g class="cn-you">'
    + `<circle cx="${CX}" cy="${CY}" r="74" fill="${F.halo}" opacity="0.10" filter="url(#soft)"/>`
    + `<circle cx="${CX}" cy="${CY}" r="46" fill="${F.halo}" opacity="0.16" filter="url(#soft)"/>`
    + `<circle cx="${CX}" cy="${CY}" r="13" fill="${F.accent}" opacity="0.9"/>`
    + `<circle cx="${CX}" cy="${CY}" r="6.5" fill="#fff"/>`
    + `<circle cx="${CX}" cy="${CY}" r="30" fill="none" stroke="${F.accent}" stroke-width="0.6" opacity="0.4"/>`
    + `<text x="${CX}" y="${CY + 100}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="20" font-weight="700" letter-spacing="5" fill="${F.accent}">${esc(data.name ?? 'YOU')}</text>`
    + '</g>';

  return `<svg viewBox="0 0 ${VB} ${VB}" xmlns="http://www.w3.org/2000/svg" class="constellation" role="img" aria-label="Your personal sky — six life themes as constellations">
  <defs>
    <radialGradient id="space" cx="50%" cy="46%" r="72%">
      <stop offset="0%" stop-color="${F.bg}" stop-opacity="0"/>
      <stop offset="55%" stop-color="${F.bg}"/>
      <stop offset="100%" stop-color="#01020a"/>
    </radialGradient>
    <radialGradient id="band" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${F.halo}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${F.halo}" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3.2"/></filter>
  </defs>
  <rect x="0" y="0" width="${VB}" height="${VB}" fill="${F.bg}"/>
  <rect x="0" y="0" width="${VB}" height="${VB}" fill="url(#space)"/>
  ${backdrop(rand, F.accent, animate)}
  ${leys}
  ${constellations}
  ${you}
</svg>`;
}

/** Internal constants exposed for testing and video-studio parameterisation. */
export const __constellationInternals = { FORGE, SYSTEM_COLOR, THEMES } as const;
