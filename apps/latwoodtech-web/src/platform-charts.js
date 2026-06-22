// platform-charts.js — cohesion visualizations for the pulse section.
// Vanilla ES module. No external deps. Matches hero-circuitry.js aesthetic.
//
// Renders two canvas charts into elements placed inside the pulse section:
//   data-chart="cohesion-gauge"  — horizontal fill bar: platform overall % vs 70 GA target
//   data-chart="app-bars"        — horizontal bars per app, descending by score
//
// Animations start on IntersectionObserver entry (respects scroll position).
// Reduced-motion: skips animation, paints final state immediately.

const PLATFORM_URL = 'data/platform.json';
const GA = 70;

const APP_DISPLAY = {
  'admin-studio': 'AP Unlimited',
  selfprime: 'Self Prime',
  'xico-city': 'Xico City',
  coh: 'Cypher',
  capricast: 'Capricast',
};

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function scoreColor(score) {
  if (score >= GA) return cssVar('--vital');
  if (score >= 40) return cssVar('--accent');
  return cssVar('--alert');
}

function setSize(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return dpr;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  return dpr;
}

// Rounded rect path compatible with older canvas implementations.
function rrect(ctx, x, y, w, h, r) {
  const mr = Math.min(r, w / 2, h / 2);
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, mr);
    return;
  }
  ctx.moveTo(x + mr, y);
  ctx.arcTo(x + w, y, x + w, y + h, mr);
  ctx.arcTo(x + w, y + h, x, y + h, mr);
  ctx.arcTo(x, y + h, x, y, mr);
  ctx.arcTo(x, y, x + w, y, mr);
  ctx.closePath();
}

// ——— Cohesion gauge ——————————————————————————————————————————————————

function paintGauge(canvas, ctx, dpr, value, progress) {
  const W = canvas.width / dpr;
  const H = canvas.height / dpr;
  const BAR_H = 12;
  const BAR_Y = H / 2 - BAR_H / 2;
  const R = BAR_H / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(dpr, dpr);

  const accent = cssVar('--accent');

  // Track
  ctx.beginPath();
  rrect(ctx, 0, BAR_Y, W, BAR_H, R);
  ctx.fillStyle = 'rgba(230,184,77,0.09)';
  ctx.fill();

  // Animated fill
  const fillW = Math.max(R * 2, (value * progress / 100) * W);
  ctx.save();
  ctx.beginPath();
  rrect(ctx, 0, BAR_Y, fillW, BAR_H, R);
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.restore();

  // GA threshold marker
  const gaX = (GA / 100) * W;
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgba(230,184,77,0.50)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(gaX, BAR_Y - 10);
  ctx.lineTo(gaX, BAR_Y + BAR_H + 10);
  ctx.stroke();

  ctx.font = '9px "Syncopate", monospace';
  ctx.fillStyle = 'rgba(230,184,77,0.55)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('GA', gaX, BAR_Y - 13);
  ctx.restore();

  ctx.restore();
}

// ——— Per-app bar chart ——————————————————————————————————————————————

function paintAppBars(canvas, ctx, dpr, apps, progress) {
  const W = canvas.width / dpr;
  const H = canvas.height / dpr;
  const LABEL_W = 96;
  const VALUE_W = 28;
  const GAP = 10;
  const BAR_X = LABEL_W + GAP;
  const BAR_AREA = W - BAR_X - VALUE_W - 4;
  const ROW_H = H / apps.length;
  const BAR_H = 10;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(dpr, dpr);

  // GA threshold line (rendered behind bars)
  const gaX = BAR_X + (GA / 100) * BAR_AREA;
  ctx.save();
  ctx.setLineDash([2, 4]);
  ctx.strokeStyle = 'rgba(230,184,77,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(gaX, 6);
  ctx.lineTo(gaX, H - 6);
  ctx.stroke();
  ctx.restore();

  apps.forEach(({ name, score }, i) => {
    const cy = i * ROW_H + ROW_H / 2;
    const barY = cy - BAR_H / 2;
    const color = scoreColor(score);
    const fillW = Math.max(BAR_H, (score * progress / 100) * BAR_AREA);

    // Track
    ctx.fillStyle = 'rgba(230,184,77,0.06)';
    ctx.fillRect(BAR_X, barY, BAR_AREA, BAR_H);

    // Fill with glow
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 7;
    ctx.fillRect(BAR_X, barY, fillW, BAR_H);
    ctx.restore();

    // App label
    ctx.save();
    ctx.font = '11px "Space Grotesk", sans-serif';
    ctx.fillStyle = cssVar('--text-muted');
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, LABEL_W, cy);
    ctx.restore();

    // Score value
    ctx.save();
    ctx.font = '500 11px "Space Grotesk", sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(score), W - VALUE_W + 4, cy);
    ctx.restore();
  });

  ctx.restore();
}

// ——— Animation driver ———————————————————————————————————————————————

function runAnimation(drawFn, duration, reducedMotion) {
  if (reducedMotion) {
    drawFn(1);
    return;
  }
  const start = performance.now();
  function frame(now) {
    const t = Math.min((now - start) / duration, 1);
    drawFn(easeOut(t));
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

let resizeTimer;
function debounce(fn, ms) {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(fn, ms);
}

// ——— Init ————————————————————————————————————————————————————————————

async function init() {
  const gaugeCanvas = document.querySelector('canvas[data-chart="cohesion-gauge"]');
  const barsCanvas = document.querySelector('canvas[data-chart="app-bars"]');
  if (!gaugeCanvas && !barsCanvas) return;

  let data;
  try {
    const res = await fetch(PLATFORM_URL).catch(() => null);
    if (!res || !res.ok) return;
    data = await res.json();
  } catch {
    return;
  }

  const overall = data?.kpis?.current?.overallCohesion ?? 0;
  const movers = data?.kpis?.movers?.cohesion ?? [];
  const trend = data?.kpis?.trends?.cohesion;

  // Live-update text nodes so the captions reflect actual data, not hardcoded HTML.
  const overallEl = document.querySelector('[data-live="overall-cohesion"]');
  if (overallEl) overallEl.textContent = overall.toFixed(1);

  const trendEl = document.querySelector('[data-live="cohesion-trend"]');
  if (trendEl && trend) {
    const sign = trend.delta >= 0 ? '+' : '';
    trendEl.textContent = `${sign}${trend.delta} pts since ${trend.priorDate}`;
  }

  const apps = movers
    .filter((m) => APP_DISPLAY[m.app])
    .sort((a, b) => b.current - a.current)
    .map((m) => ({ name: APP_DISPLAY[m.app], score: m.current }));

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Delay rendering until the section scrolls into view.
  const anchor = gaugeCanvas || barsCanvas;
  const section = anchor.closest('section') ?? anchor.parentElement;

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();

      const gaugeCtx = gaugeCanvas ? gaugeCanvas.getContext('2d') : null;
      const barsCtx = barsCanvas ? barsCanvas.getContext('2d') : null;

      let gaugeDpr = gaugeCanvas ? setSize(gaugeCanvas) : 1;
      let barsDpr = barsCanvas ? setSize(barsCanvas) : 1;

      if (gaugeCtx) {
        runAnimation(
          (p) => paintGauge(gaugeCanvas, gaugeCtx, gaugeDpr, overall, p),
          800,
          reducedMotion,
        );
      }
      if (barsCtx) {
        runAnimation(
          (p) => paintAppBars(barsCanvas, barsCtx, barsDpr, apps, p),
          900,
          reducedMotion,
        );
      }

      // Repaint on resize (debounced, 120ms).
      window.addEventListener('resize', () => {
        debounce(() => {
          if (gaugeCtx) {
            gaugeDpr = setSize(gaugeCanvas);
            paintGauge(gaugeCanvas, gaugeCtx, gaugeDpr, overall, 1);
          }
          if (barsCtx) {
            barsDpr = setSize(barsCanvas);
            paintAppBars(barsCanvas, barsCtx, barsDpr, apps, 1);
          }
        }, 120);
      });
    },
    { threshold: 0.15 },
  );

  observer.observe(section);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
