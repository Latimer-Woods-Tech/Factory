// hero-circuitry.js — signal-driven PCB visual for latwoodtech.com hero.
// Vanilla ES module. No frameworks, no external deps.
//
// Pulls /data/circuit-topology.json + /data/pulse.json, paints topology to
// a canvas, then animates brand pulses whose tempo + color reflect the live
// /pulse.json surfaceHealth array (green=alive, red=down/degraded).

const TOPOLOGY_URL = 'data/circuit-topology.json';
const PULSE_URL = 'data/pulse.json';

const BRAND_BY_URL = {
  'https://selfprime.net': 'selfprime',
  'https://capricast.com': 'capricast',
  'https://cypherofhealing.com': 'cypher-healing',
  'https://apunlimited.com': 'ap-unlimited',
};

const BRAND_COLORS = {
  selfprime: { live: '#49a56d', dim: 'rgba(73,165,109,0.22)' },
  capricast: { live: '#49a56d', dim: 'rgba(73,165,109,0.22)' },
  'cypher-healing': { live: '#49a56d', dim: 'rgba(73,165,109,0.22)' },
  'ap-unlimited': { live: '#49a56d', dim: 'rgba(73,165,109,0.22)' },
};

const NEUTRAL_DIM = 'rgba(215,169,75,0.18)';
const NEUTRAL_LIVE = '#d7a94b';
const ALERT_LIVE = '#d95a43';
const ALERT_DIM = 'rgba(217,90,67,0.30)';
const PULSE_SPEED = 120; // px/sec, in topology-space pixels
const BRAND_PULSE_INTERVAL = 1000; // ms between brand pulses per trace
const NEUTRAL_PULSE_CHANCE = 0.05; // per frame chance for neutral trace pulse

// --- Path parsing ---------------------------------------------------------

/**
 * Parse an "M x,y L x,y L x,y ..." SVG path into [{x,y}] vertices.
 * Tolerates whitespace, commas, and absolute moveTo+lineTo only (matches
 * topology generator output).
 */
function parsePath(d) {
  const tokens = d.match(/[ML]\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/g) || [];
  const pts = [];
  for (const tok of tokens) {
    const m = tok.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (m) pts.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
  }
  // Pre-compute cumulative length so pulses can interpolate evenly.
  let total = 0;
  const segments = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segments.push({ a, b, len, start: total });
    total += len;
  }
  return { pts, segments, total };
}

function pointAt(parsed, dist) {
  if (!parsed.segments.length) return { x: 0, y: 0 };
  const { segments, total } = parsed;
  const d = Math.max(0, Math.min(dist, total));
  for (const s of segments) {
    if (d <= s.start + s.len) {
      const t = s.len === 0 ? 0 : (d - s.start) / s.len;
      return {
        x: s.a.x + (s.b.x - s.a.x) * t,
        y: s.a.y + (s.b.y - s.a.y) * t,
      };
    }
  }
  const last = segments[segments.length - 1];
  return { x: last.b.x, y: last.b.y };
}

// --- Health map -----------------------------------------------------------

function buildHealthMap(pulseJson) {
  const map = {};
  for (const key of Object.values(BRAND_BY_URL)) map[key] = 'unknown';
  const list = pulseJson?.pulse?.surfaceHealth;
  if (Array.isArray(list)) {
    for (const s of list) {
      const brand = BRAND_BY_URL[s.url];
      if (!brand) continue;
      map[brand] = s.alive ? 'alive' : 'degraded';
    }
  }
  return map;
}

// --- Main ---------------------------------------------------------------

async function init() {
  const canvas = document.querySelector('canvas[data-circuitry]');
  if (!canvas) return;

  let topology = null;
  let health = {};
  try {
    const [tRes, pRes] = await Promise.all([
      fetch(TOPOLOGY_URL, { cache: 'no-cache' }),
      fetch(PULSE_URL, { cache: 'no-cache' }).catch(() => null),
    ]);
    if (!tRes || !tRes.ok) return;
    topology = await tRes.json();
    if (pRes && pRes.ok) {
      try {
        health = buildHealthMap(await pRes.json());
      } catch (_) { /* pulse degraded — fall through with unknowns */ }
    }
  } catch (_) {
    return;
  }

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  // Pre-parse all paths.
  const traces = topology.traces.map((t) => ({
    id: t.id,
    brand: t.brand || null,
    parsed: parsePath(t.path),
  }));

  // Per-trace pulse scheduling state.
  const traceState = new Map();
  for (const t of traces) {
    traceState.set(t.id, { lastPulseAt: 0, pulses: [] });
  }

  const [vbX, vbY, vbW, vbH] = topology.viewBox;
  let scale = 1;
  let dpr = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    // Fit viewBox into canvas while preserving aspect.
    const sx = rect.width / vbW;
    const sy = rect.height / vbH;
    scale = Math.min(sx, sy) * dpr;
    offsetX = (canvas.width - vbW * scale) / 2;
    offsetY = (canvas.height - vbH * scale) / 2;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let prefersStatic = reducedMotion.matches;
  reducedMotion.addEventListener?.('change', (e) => {
    prefersStatic = e.matches;
  });

  // Draw the static trace layer once per resize and cache colors.
  function drawStaticTraces() {
    ctx.lineWidth = Math.max(1, dpr);
    ctx.lineCap = 'round';
    for (const t of traces) {
      let color = NEUTRAL_DIM;
      if (t.brand) {
        const state = health[t.brand];
        if (state === 'degraded') color = ALERT_DIM;
        else color = BRAND_COLORS[t.brand]?.dim || NEUTRAL_DIM;
      }
      ctx.strokeStyle = color;
      ctx.beginPath();
      const pts = t.parsed.pts;
      for (let i = 0; i < pts.length; i++) {
        const x = offsetX + pts[i].x * scale;
        const y = offsetY + pts[i].y * scale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Origin node halos.
    for (const n of topology.nodes) {
      if (n.role !== 'origin') continue;
      const state = health[n.brand];
      const color = state === 'degraded' ? ALERT_LIVE
        : state === 'alive' ? BRAND_COLORS[n.brand]?.live
        : NEUTRAL_LIVE;
      const cx = offsetX + n.x * scale;
      const cy = offsetY + n.y * scale;
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(cx, cy, 3 * (scale / dpr), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  let lastTs = 0;
  let running = false;
  let rafId = 0;

  function spawnPulse(t, now) {
    const state = traceState.get(t.id);
    if (!state) return;
    state.pulses.push({ start: now, distance: 0 });
  }

  function frame(ts) {
    if (!running) return;
    if (!lastTs) lastTs = ts;
    const dt = Math.min((ts - lastTs) / 1000, 0.1);
    lastTs = ts;
    const nowMs = ts;

    // Clear + redraw static layer (single pass; cheap enough at this size).
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawStaticTraces();

    if (prefersStatic) {
      // Static only — no further animation work.
      rafId = requestAnimationFrame(frame);
      return;
    }

    // Schedule + advance pulses per trace.
    for (const t of traces) {
      const state = traceState.get(t.id);
      const brand = t.brand;
      const brandState = brand ? health[brand] : null;

      if (brand) {
        let interval = BRAND_PULSE_INTERVAL;
        if (brandState === 'degraded') {
          // Flickering: variable 250-900ms gaps for unease.
          interval = 250 + Math.random() * 650;
        } else if (brandState === 'unknown') {
          interval = 2400;
        }
        if (nowMs - state.lastPulseAt > interval) {
          spawnPulse(t, nowMs);
          state.lastPulseAt = nowMs;
        }
      } else if (Math.random() < NEUTRAL_PULSE_CHANCE * dt) {
        // Sparse gold pulses on neutral traces.
        spawnPulse(t, nowMs);
      }

      // Advance + render pulses.
      const remaining = [];
      const color = brand
        ? (brandState === 'degraded' ? ALERT_LIVE : BRAND_COLORS[brand]?.live || NEUTRAL_LIVE)
        : NEUTRAL_LIVE;
      for (const p of state.pulses) {
        p.distance += PULSE_SPEED * dt;
        if (p.distance > t.parsed.total + 12) continue;
        const pt = pointAt(t.parsed, p.distance);
        const tailFade = p.distance > t.parsed.total
          ? Math.max(0, 1 - (p.distance - t.parsed.total) / 12)
          : 1;
        const cx = offsetX + pt.x * scale;
        const cy = offsetY + pt.y * scale;
        const r = 3.4 * (scale / dpr);
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12 * tailFade;
        ctx.globalAlpha = tailFade;
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        remaining.push(p);
      }
      state.pulses = remaining;
    }

    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    lastTs = 0;
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
    }, 100);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') start();
    else stop();
  });

  resize();
  start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
