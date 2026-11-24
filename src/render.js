// Draws the cross-section as a self-contained, animated SVG.
import { rng, hashString, mix, esc, monthShort, monthLong, dayLong, num } from './util.js';

export const THEMES = {
  dark: {
    bg: '#0d1117', border: '#21262d', fg: '#e6edf3', muted: '#7d8590', faint: '#30363d',
    stone: '#3a414a', bedrock: '#161b22', tint: '#0d1117', tintAmt: 0.3, shade: '#000000', shadeAmt: 0.12,
    grain: '#ffffff', grainOp: 0.06, seam: '#0d1117', seamOp: 0.4, depth: '#010409', depthOp: 0.5,
    grass: '#3fb950', fossil: '#ffffff', fossilOp: 0.4, surfaceMix: '#ffffff',
  },
  light: {
    bg: '#ffffff', border: '#d0d7de', fg: '#1f2328', muted: '#656d76', faint: '#d8dee4',
    stone: '#d0d7de', bedrock: '#eaeef2', tint: '#ffffff', tintAmt: 0.12, shade: '#000000', shadeAmt: 0.07,
    grain: '#000000', grainOp: 0.05, seam: '#ffffff', seamOp: 0.55, depth: '#1f2328', depthOp: 0.16,
    grass: '#1a7f37', fossil: '#000000', fossilOp: 0.3, surfaceMix: '#000000',
  },
};

// Layout
const W = 840, H = 460, PAD = 32;
const X0 = 88, X1 = 598;          // the slab
const ERA_X = 630;                // era column
const SURFACE = 140, FLOOR = 390, BOTTOM = 408;
const STEP = 5;

const f = (v) => +v.toFixed(1);

export function render(model, themeName = 'dark') {
  const t = THEMES[themeName];
  const R = rng(hashString(model.login));
  const phase = [R() * 6.283, R() * 6.283];

  const layers = [...model.months].reverse(); // newest on top, like real rock
  const n = layers.length;
  const avail = FLOOR - SURFACE;
  const minT = 3;

  // Thickness grows with activity (sqrt keeps one huge month from swallowing the rest).
  const weights = layers.map((m) => Math.sqrt(m.total));
  const sumW = weights.reduce((a, b) => a + b, 0);
  const thick = sumW > 0 ? weights.map((w) => minT + ((avail - minT * n) * w) / sumW) : layers.map(() => avail / n);
  const base = [SURFACE];
  thick.forEach((th, i) => base.push(base[i] + th));

  // Gently folded boundaries: deeper rock is more deformed, like the real thing.
  const xs = [];
  for (let x = X0 - 6; x < X1 + 6; x += STEP) xs.push(x);
  xs.push(X1 + 6);
  const boundary = base.map((b, k) => {
    const depth = (b - SURFACE) / avail;
    const near = Math.min(thick[k - 1] ?? 8, thick[k] ?? 8);
    const jitter = Math.min(1, near / 6) * 0.9;
    const jp = R() * 6.283;
    return xs.map((x) => {
      const u = x - X0;
      return (
        b +
        (2.4 + depth * 6) * Math.sin(u / 96 + phase[0] + depth * 1.4) +
        (1 + depth * 2.2) * Math.sin(u / 43 + phase[1] + depth) +
        jitter * Math.sin(u / 19 + jp)
      );
    });
  });
  const line = (arr) => xs.map((x, i) => `${f(x)},${f(arr[i])}`);
  const yAt = (arr, x) => {
    const p = Math.max(0, Math.min(xs.length - 1.001, (x - xs[0]) / STEP));
    const i = Math.floor(p);
    return arr[i] + (arr[i + 1] - arr[i]) * (p - i);
  };

  const fill = (m, k) => {
    let c = m.color ? mix(m.color, t.tint, t.tintAmt) : t.stone;
    return k % 2 ? mix(c, t.shade, t.shadeAmt) : c;
  };

  // --- timing (oldest layer settles first) ---
  const delayOf = (k) => 0.15 + (n - 1 - k) * 0.045;
  const settled = delayOf(0) + 0.6;

  // --- layers ---
  const layerSvg = layers
    .map((m, k) => {
      const top = boundary[k];
      const bottom = boundary[k + 1];
      const d = `M${line(top).join('L')}L${line(bottom).reverse().join('L')}Z`;
      const seam = k > 0 ? `<path d="M${line(top).join('L')}" fill="none" stroke="${t.seam}" stroke-opacity="${t.seamOp}" stroke-width=".7"/>` : '';
      const fossils = fossilsFor(m, k, top, bottom, R, t, yAt);
      const lang = m.quiet ? 'quiet' : m.lang ?? 'other';
      return `<g class="l" style="animation-delay:${f(delayOf(k))}s"><title>${monthLong(m.date)} · ${num(m.total)} contributions · ${esc(lang)}</title><path d="${d}" fill="${fill(m, k)}"/>${seam}${fossils}</g>`;
    })
    .join('');

  const bedrock = `<path class="l" style="animation-delay:.05s" d="M${line(boundary[n]).join('L')}L${X1 + 6},${BOTTOM + 30}L${X0 - 6},${BOTTOM + 30}Z" fill="${t.bedrock}"/>`;

  const ground = `M${line(boundary[0]).join('L')}L${X1 + 6},${BOTTOM + 30}L${X0 - 6},${BOTTOM + 30}Z`;
  const overlays = `<g class="fade" style="animation-delay:${f(settled - 0.3)}s"><path d="${ground}" fill="url(#depth)"/><path d="${ground}" fill="url(#grain)"/></g>`;

  // --- the living surface ---
  const newest = layers.find((m) => m.color);
  const surfaceColor = newest ? mix(newest.color, t.surfaceMix, 0.15) : t.grass;
  const surfacePath = `M${line(boundary[0]).join('L')}`;
  const surface = `<g class="fade" style="animation-delay:${f(settled)}s">
    <path d="${surfacePath}" fill="none" stroke="${surfaceColor}" stroke-width="4" stroke-opacity=".35" filter="url(#glow)"/>
    <path d="${surfacePath}" fill="none" stroke="${surfaceColor}" stroke-width="1.4" stroke-linecap="round"/>
  </g>`;

  const blades = [];
  const bladeCount = Math.min(model.streak, 60);
  const vigor = 0.45 + Math.min(model.streak, 30) / 30;
  for (let i = 0; i < bladeCount; i++) {
    const x = X0 + 10 + R() * (X1 - X0 - 44);
    const y = yAt(boundary[0], x) - 0.5;
    const h = (3 + R() * 5) * vigor;
    const lean = (R() - 0.5) * 3;
    blades.push(
      `<path class="blade" style="animation-delay:${f(settled + 0.2 + R() * 0.6)}s" d="M${f(x)},${f(y)}Q${f(x + lean * 0.2)},${f(y - h * 0.6)} ${f(x + lean)},${f(y - h)}" stroke="${t.grass}" stroke-width="1.1" stroke-linecap="round" fill="none"/>`,
    );
  }

  const nowX = X1 - 16;
  const nowY = yAt(boundary[0], nowX);
  const now = `<g class="fade" style="animation-delay:${f(settled + 0.3)}s">
    <circle class="pulse" cx="${nowX}" cy="${f(nowY)}" r="3.2" fill="none" stroke="${surfaceColor}" stroke-width="1.2"/>
    <circle cx="${nowX}" cy="${f(nowY)}" r="3.2" fill="${surfaceColor}"/>
  </g>`;

  // --- era column ---
  const today = `<g class="fade" style="animation-delay:${f(settled + 0.3)}s">
    <text x="${ERA_X}" y="${SURFACE - 30}" class="cap">TODAY</text>
    <text x="${ERA_X}" y="${SURFACE - 13}" class="era">${model.streak > 0 ? `${model.streak}-day streak` : 'Resting'}</text>
  </g>`;

  const eraSvg = [...model.eras]
    .reverse()
    .map((era, i) => {
      const a = n - 1 - era.end;
      const b = n - 1 - era.start;
      const y0 = base[a];
      const y1 = base[b + 1];
      const h = y1 - y0;
      const mid = (y0 + y1) / 2;
      const color = era.color ?? t.stone;
      const span = `${era.lang ? esc(era.lang) + ' · ' : ''}${monthShort(model.months[era.start].date)} – ${era.end === model.months.length - 1 ? 'now' : monthShort(model.months[era.end].date)}`;
      let label = '';
      if (h >= 30) label = `<text x="${ERA_X + 12}" y="${f(mid - 2)}" class="era">${esc(era.name)}</text><text x="${ERA_X + 12}" y="${f(mid + 13)}" class="sub">${span}</text>`;
      else if (h >= 14) label = `<text x="${ERA_X + 12}" y="${f(mid + 4)}" class="era">${esc(era.name)}</text>`;
      const guide = i > 0 ? `<line x1="${X1 + 8}" x2="${ERA_X - 8}" y1="${f(y0)}" y2="${f(y0)}" stroke="${t.faint}" stroke-dasharray="2 3"/>` : '';
      return `<g class="fade" style="animation-delay:${f(settled + 0.1 + i * 0.12)}s">${guide}<line x1="${ERA_X}" x2="${ERA_X}" y1="${f(y0 + 2)}" y2="${f(y1 - 2)}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>${label}</g>`;
    })
    .join('');

  // --- year ticks on the left ---
  const ticks = [];
  let lastY = -100;
  const tick = (y, label) => {
    if (Math.abs(y - lastY) < 14) return;
    lastY = y;
    ticks.push(`<line x1="${X0 - 10}" x2="${X0 - 4}" y1="${f(y)}" y2="${f(y)}" stroke="${t.faint}"/><text x="${X0 - 14}" y="${f(y + 3.5)}" class="tick" text-anchor="end">${label}</text>`);
  };
  layers.forEach((m, k) => {
    if (m.date.getUTCMonth() === 0) tick(base[k + 1], m.date.getUTCFullYear());
  });
  tick(base[n], monthShort(layers[n - 1].date));

  // --- header & footer ---
  const header = `
    <text x="${PAD}" y="50" class="title">@${esc(model.login)}</text>
    <text x="${PAD}" y="70" class="sub">${n} months of code, layer by layer</text>
    <text x="${W - PAD}" y="50" class="stat" text-anchor="end">${num(model.total)}</text>
    <text x="${W - PAD}" y="70" class="sub" text-anchor="end">contributions</text>
    <text x="${W - PAD - 120}" y="50" class="stat" text-anchor="end">${model.eras.length}</text>
    <text x="${W - PAD - 120}" y="70" class="sub" text-anchor="end">${model.eras.length === 1 ? 'era' : 'eras'}</text>`;

  let lx = X0;
  const legend = model.topLanguages
    .map((l) => {
      const s = `<circle cx="${lx + 4}" cy="${H - 31}" r="4" fill="${l.color}"/><text x="${lx + 13}" y="${H - 27}" class="sub">${esc(l.name)}</text>`;
      lx += 26 + l.name.length * 6.3;
      return s;
    })
    .join('');
  const footer = `${legend}<text x="${W - PAD}" y="${H - 27}" class="tick" text-anchor="end">strata · ${dayLong(model.generatedAt)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="strata-title">
<title id="strata-title">Strata for @${esc(model.login)}: ${num(model.total)} contributions over ${n} months</title>
<style>
  text{font-family:ui-sans-serif,-apple-system,'Segoe UI',Inter,Helvetica,Arial,sans-serif;fill:${t.fg}}
  .title{font-size:19px;font-weight:600;letter-spacing:-.2px}
  .stat{font-size:20px;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
  .sub{font-size:11.5px;fill:${t.muted}}
  .era{font-size:13px;font-weight:600}
  .cap{font-size:9.5px;letter-spacing:1.6px;fill:${t.muted};font-weight:600}
  .tick{font-size:10.5px;fill:${t.muted};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
  .l{opacity:0;animation:settle .9s cubic-bezier(.16,1,.3,1) forwards}
  .fade{opacity:0;animation:fade .9s ease forwards}
  .blade{transform-box:fill-box;transform-origin:50% 100%;transform:scaleY(0);animation:grow .7s cubic-bezier(.16,1,.3,1) forwards}
  .pulse{transform-box:fill-box;transform-origin:center;animation:pulse 2.6s ease-out 3s infinite}
  @keyframes settle{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fade{to{opacity:1}}
  @keyframes grow{to{transform:scaleY(1)}}
  @keyframes pulse{0%{transform:scale(1);opacity:.8}100%{transform:scale(3.4);opacity:0}}
  @media (prefers-reduced-motion:reduce){.l,.fade,.blade{animation:none;opacity:1;transform:none}.pulse{display:none}}
</style>
<defs>
  <clipPath id="slab"><rect x="${X0}" y="${SURFACE - 60}" width="${X1 - X0}" height="${BOTTOM - SURFACE + 60}" rx="12"/></clipPath>
  <pattern id="grain" width="7" height="7" patternUnits="userSpaceOnUse"><g fill="${t.grain}" fill-opacity="${t.grainOp}"><circle cx="1.5" cy="2" r=".75"/><circle cx="5" cy="5.5" r=".55"/></g></pattern>
  <linearGradient id="depth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.depth}" stop-opacity="0"/><stop offset="1" stop-color="${t.depth}" stop-opacity="${t.depthOp}"/></linearGradient>
  <filter id="glow" x="-10%" y="-300%" width="120%" height="700%"><feGaussianBlur stdDeviation="3"/></filter>
</defs>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="14" fill="${t.bg}" stroke="${t.border}"/>
${header}
<g clip-path="url(#slab)">${bedrock}${layerSvg}${overlays}</g>
${surface}
<g>${blades.join('')}</g>
${now}
${today}
${eraSvg}
<g class="fade" style="animation-delay:${f(settled)}s">${ticks.join('')}</g>
${footer}
</svg>
`;
}

// A tiny ammonite for each repository started that month.
function fossilsFor(m, k, top, bottom, R, t, yAt) {
  if (!m.newRepos) return '';
  const out = [];
  for (let i = 0; i < Math.min(m.newRepos, 3); i++) {
    const x = X0 + 30 + R() * (X1 - X0 - 80);
    const y0 = yAt(top, x);
    const y1 = yAt(bottom, x);
    const size = Math.min((y1 - y0) * 0.36, 5.5);
    if (size < 2.2) continue;
    const cy = (y0 + y1) / 2;
    const turns = 3.2 * Math.PI;
    const pts = [];
    for (let a = 0; a <= turns; a += 0.25) {
      const r = (size * a) / turns;
      pts.push(`${f(x + r * Math.cos(a))},${f(cy + r * Math.sin(a))}`);
    }
    out.push(`<path d="M${pts.join('L')}" fill="none" stroke="${t.fossil}" stroke-opacity="${t.fossilOp}" stroke-width=".8" stroke-linecap="round"/>`);
  }
  return out.join('');
}
