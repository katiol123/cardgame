/* Генератор лиц гонщиков. Каждое лицо строится из «зерна» (seed) и рисуется в трёх настроениях:
 * happy (высокая мораль), neutral (средняя), sad (низкая). Все детали — SVG, viewBox 0 0 100 100. */
(function (G) {
  'use strict';

  function rng(seed) {
    let a = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ 0x27d4eb2f; // перемешиваем похожие зёрна
    a = Math.imul(a ^ (a >>> 13), 0xc2b2ae35);
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const chance = (r, p) => r() < p;
  // затемнить/осветлить цвет #rrggbb
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let R = n >> 16, Gc = (n >> 8) & 255, B = n & 255;
    const k = v => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
    R = k(R); Gc = k(Gc); B = k(B);
    return '#' + ((1 << 24) + (R << 16) + (Gc << 8) + B).toString(16).slice(1);
  }

  const SKIN = ['#f6dcc3', '#f1c7a3', '#e0ac7e', '#c68a5c', '#9c6644', '#6f4630'];
  const SKIN_PSY = ['#7ee081', '#5ce1e6', '#b388ff', '#ff7eb6', '#c0c8d8', '#ffb347', '#9dff57', '#ff5e5e'];
  const HAIR = ['#1a120c', '#3b2416', '#6b3f22', '#a0522d', '#d9a441', '#e8e8e8', '#0d0d0d', '#7a1f1f'];
  const HAIR_PSY = ['#ff3df2', '#3dfcff', '#7dff3d', '#ff8a1f', '#8a5cff', '#ffe23d', '#ff3d6e'];
  const IRIS = ['#3b6fd6', '#2e8b57', '#6b3f22', '#1a1a1a', '#8a5cff', '#00b3b3', '#d4a017', '#c0392b'];

  const SKULLS = ['oval', 'round', 'long', 'square', 'heart', 'pear', 'hex', 'bulb', 'diamond', 'blob'];
  const EYES = ['dot', 'round', 'almond', 'cat', 'spiral', 'star', 'hetero', 'visor', 'cyclops', 'three', 'button'];
  const BROWS = ['thin', 'thick', 'bushy', 'angular', 'uni', 'bolt', 'dots', 'none'];
  const NOSES = ['button', 'long', 'hook', 'wide', 'triangle', 'snout', 'dots', 'clown', 'cyber', 'ski'];
  const MOUTHS = ['line', 'lips', 'grin', 'tiny', 'wide', 'fangs', 'zigzag', 'grille', 'tongue', 'mustache'];
  const HAIRS = ['bald', 'buzz', 'mohawk', 'spikes', 'afro', 'side', 'long', 'flame', 'tentacles', 'crystal', 'pompadour', 'bun'];
  const EARS = ['normal', 'big', 'elf', 'none', 'antenna'];
  const BEARDS = ['none', 'none', 'none', 'stubble', 'full', 'goatee', 'chops'];

  const cache = new Map();
  function genome(seed) {
    if (cache.has(seed)) return cache.get(seed);
    const r = rng(seed);
    const psySkin = chance(r, 0.32), psyHair = chance(r, 0.4);
    const skin = psySkin ? pick(r, SKIN_PSY) : pick(r, SKIN);
    const g = {
      seed,
      skull: pick(r, SKULLS),
      skin, skin2: psySkin && chance(r, 0.4) ? pick(r, SKIN_PSY) : null,
      eyes: pick(r, EYES), iris: pick(r, IRIS), iris2: pick(r, IRIS),
      brows: pick(r, BROWS),
      nose: pick(r, NOSES),
      mouth: pick(r, MOUTHS),
      hair: pick(r, HAIRS), hairColor: psyHair ? pick(r, HAIR_PSY) : pick(r, HAIR), hairRainbow: psyHair && chance(r, 0.25),
      ears: pick(r, EARS),
      beard: pick(r, BEARDS),
      eyeGap: 8.5 + r() * 3.5, eyeY: 46 + r() * 6, mouthW: 7 + r() * 5, noseY: 60 + r() * 3,
      scar: chance(r, 0.18), paint: chance(r, 0.2) ? pick(r, ['#ff3355', '#22e3ff', '#ffd23f', '#111', '#ffffff', '#7dff3d']) : null,
      freckles: chance(r, 0.22), goggles: chance(r, 0.16), earring: chance(r, 0.25), circuit: chance(r, 0.14),
      monocle: chance(r, 0.08), wobble: r() * 10
    };
    if (g.eyes === 'visor' || g.eyes === 'cyclops') g.monocle = false;
    cache.set(seed, g);
    return g;
  }

  // ---------- форма черепа ----------
  function skullPath(g) {
    switch (g.skull) {
      case 'oval': return 'M50 20 C68 20 76 36 76 54 C76 74 64 88 50 88 C36 88 24 74 24 54 C24 36 32 20 50 20Z';
      case 'round': return 'M50 24 C68 24 79 38 79 56 C79 74 66 86 50 86 C34 86 21 74 21 56 C21 38 32 24 50 24Z';
      case 'long': return 'M50 16 C64 16 72 30 72 50 C72 74 62 92 50 92 C38 92 28 74 28 50 C28 30 36 16 50 16Z';
      case 'square': return 'M26 32 Q26 18 50 18 Q74 18 74 32 L75 68 Q74 88 50 89 Q26 88 25 68Z';
      case 'heart': return 'M23 38 Q22 17 50 19 Q78 17 77 38 Q75 66 50 90 Q25 66 23 38Z';
      case 'pear': return 'M31 32 Q30 18 50 18 Q70 18 69 32 L79 68 Q78 90 50 90 Q22 90 21 68Z';
      case 'hex': return 'M35 18 L65 18 L79 50 L66 88 L34 88 L21 50Z';
      case 'bulb': return 'M50 11 Q85 11 82 45 Q80 64 66 78 Q60 90 50 90 Q40 90 34 78 Q20 64 18 45 Q15 11 50 11Z';
      case 'diamond': return 'M50 14 Q55 14 78 48 Q81 53 78 58 Q57 90 50 92 Q43 90 22 58 Q19 53 22 48 Q45 14 50 14Z';
      default: { // клякса: волнистый контур
        let d = '';
        for (let i = 0; i <= 36; i++) {
          const a = i / 36 * Math.PI * 2, rr = 30 + Math.sin(a * 5 + g.wobble) * 3 + Math.cos(a * 3 + g.wobble * 2) * 2;
          d += (i ? 'L' : 'M') + (50 + Math.cos(a) * rr * 0.92).toFixed(1) + ' ' + (55 + Math.sin(a) * rr).toFixed(1);
        }
        return d + 'Z';
      }
    }
  }

  // ---------- причёска (сзади и спереди) ----------
  function hairParts(g, uid) {
    const c = g.hairRainbow ? `url(#hr${uid})` : g.hairColor, dk = g.hairRainbow ? '#000' : shade(g.hairColor, -0.35);
    let back = '', front = '';
    switch (g.hair) {
      case 'buzz': front = `<path d="M27 38 Q30 18 50 17 Q70 18 73 38 Q62 28 50 28 Q38 28 27 38Z" fill="${c}" opacity=".9"/>`; break;
      case 'mohawk': front = `<path d="M44 30 L41 6 L48 14 L50 2 L53 14 L59 6 L56 30Z" fill="${c}" stroke="${dk}" stroke-width="1"/>`; break;
      case 'spikes': front = `<path d="M24 38 L20 18 L31 26 L32 8 L41 22 L48 4 L54 21 L63 7 L66 24 L79 15 L76 38 Q64 26 50 26 Q36 26 24 38Z" fill="${c}" stroke="${dk}" stroke-width="1"/>`; break;
      case 'afro': back = [[50, 22, 26], [28, 30, 15], [72, 30, 15], [22, 46, 12], [78, 46, 12], [36, 14, 13], [64, 14, 13]].map(([x, y, rr]) => `<circle cx="${x}" cy="${y}" r="${rr}" fill="${c}"/>`).join('');
        front = `<path d="M26 40 Q30 22 50 22 Q70 22 74 40 Q62 31 50 31 Q38 31 26 40Z" fill="${c}"/>`; break;
      case 'side': front = `<path d="M25 42 Q22 18 50 16 Q78 17 76 36 Q66 24 48 30 Q36 34 25 42Z" fill="${c}" stroke="${dk}" stroke-width="1"/>`; break;
      case 'long': back = `<path d="M22 50 Q18 16 50 14 Q82 16 78 50 L82 92 L66 92 L70 52 Q50 36 30 52 L34 92 L18 92Z" fill="${c}"/>`;
        front = `<path d="M26 40 Q30 18 50 18 Q70 18 74 40 Q60 28 50 34 Q40 28 26 40Z" fill="${c}"/>`; break;
      case 'flame': front = `<g class="fx-flame"><path d="M26 38 Q22 22 30 14 Q30 24 36 22 Q34 10 44 2 Q44 14 50 14 Q52 4 60 0 Q58 14 64 16 Q70 10 74 14 Q70 22 76 30 Q74 36 74 38 Q62 28 50 28 Q38 28 26 38Z" fill="${c === g.hairColor ? '#ff7b00' : c}"/><path d="M34 32 Q34 22 40 18 Q42 26 46 24 Q48 14 54 10 Q54 20 58 22 Q62 18 66 20 Q64 28 66 32 Q58 27 50 27 Q42 27 34 32Z" fill="#ffd23f"/></g>`; break;
      case 'tentacles': for (let i = 0; i < 6; i++) { const x = 28 + i * 9, s = i % 2 ? 1 : -1; front += `<path d="M${x} 30 Q${x + s * 8} 18 ${x} 10 Q${x - s * 6} 4 ${x + s * 2} 0" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/><circle cx="${x + s * 2}" cy="1" r="2.4" fill="${shade(g.hairColor, 0.4)}"/>`; } break;
      case 'crystal': front = `<path d="M28 36 L30 14 L38 30Z M36 30 L42 4 L48 28Z M46 28 L54 2 L58 28Z M56 28 L66 8 L66 32Z M64 32 L76 16 L74 38Z" fill="${c}" stroke="#fff" stroke-width=".8" opacity=".92"/>`; break;
      case 'pompadour': front = `<path d="M26 38 Q22 14 46 10 Q74 4 78 24 Q70 18 60 22 Q74 28 74 38 Q62 28 50 28 Q38 28 26 38Z" fill="${c}" stroke="${dk}" stroke-width="1"/>`; break;
      case 'bun': back = `<circle cx="50" cy="10" r="9" fill="${c}"/>`; front = `<path d="M26 40 Q28 18 50 18 Q72 18 74 40 Q62 26 50 26 Q38 26 26 40Z" fill="${c}"/>`; break;
      default: break; // лысый
    }
    return { back, front };
  }

  // ---------- уши ----------
  function earsSvg(g, skin, dk) {
    const yy = g.eyeY + 4;
    switch (g.ears) {
      case 'normal': return `<ellipse cx="22" cy="${yy}" rx="5" ry="8" fill="${skin}" stroke="${dk}"/><ellipse cx="78" cy="${yy}" rx="5" ry="8" fill="${skin}" stroke="${dk}"/>`;
      case 'big': return `<ellipse cx="18" cy="${yy}" rx="9" ry="12" fill="${skin}" stroke="${dk}"/><ellipse cx="82" cy="${yy}" rx="9" ry="12" fill="${skin}" stroke="${dk}"/><ellipse cx="19" cy="${yy}" rx="4" ry="7" fill="${dk}" opacity=".3"/><ellipse cx="81" cy="${yy}" rx="4" ry="7" fill="${dk}" opacity=".3"/>`;
      case 'elf': return `<path d="M25 ${yy - 6} L6 ${yy - 18} L23 ${yy + 8}Z" fill="${skin}" stroke="${dk}"/><path d="M75 ${yy - 6} L94 ${yy - 18} L77 ${yy + 8}Z" fill="${skin}" stroke="${dk}"/>`;
      case 'antenna': return `<path d="M40 22 L32 4 M60 22 L68 4" stroke="${dk}" stroke-width="2"/><circle cx="32" cy="4" r="3.5" fill="#ff3df2" class="fx-blink"/><circle cx="68" cy="4" r="3.5" fill="#3dfcff" class="fx-blink"/>`;
      default: return '';
    }
  }

  // ---------- глаза + веки по настроению ----------
  function eyesSvg(g, mood, skin) {
    const L = 50 - g.eyeGap, R = 50 + g.eyeGap, y = g.eyeY;
    let out = '';
    const lid = (x, side) => {
      if (mood === 'happy') return `<path d="M${x - 6} ${y + 6} Q${x} ${y + 1} ${x + 6} ${y + 6} L${x + 6} ${y + 8} L${x - 6} ${y + 8}Z" fill="${skin}"/>`;
      if (mood === 'sad') { const o = side < 0 ? -1 : 1; return `<path d="M${x - 6} ${y - 7} L${x + 6} ${y - 7} L${x + 6 * o} ${y - 0.5} L${x - 6 * o} ${y - 4.5}Z" fill="${skin}"/><path d="M${x + 6 * o} ${y - 0.5} L${x - 6 * o} ${y - 4.5}" stroke="${shade(skin, -0.5)}" stroke-width="1"/>`; }
      return `<path d="M${x - 5.5} ${y - 3.5} Q${x} ${y - 6.5} ${x + 5.5} ${y - 3.5}" fill="none" stroke="${shade(skin, -0.5)}" stroke-width="1"/>`;
    };
    const ball = (x, iris, kind) => {
      let s = `<ellipse cx="${x}" cy="${y}" rx="5.2" ry="${kind === 'almond' || kind === 'cat' ? 3.6 : 4.8}" fill="#fff" stroke="#222" stroke-width=".8"/>`;
      if (kind === 'cat') s += `<ellipse cx="${x}" cy="${y}" rx="3.4" ry="3.4" fill="#c6f432"/><ellipse cx="${x}" cy="${y}" rx="0.9" ry="3.2" fill="#111"/>`;
      else if (kind === 'spiral') s += `<path d="M${x} ${y} m0 -.8 a.8 .8 0 1 1 -.1 0 m.1 -1.4 a2.2 2.2 0 1 1 -.2 0 m.2 -1.4 a3.6 3.6 0 1 1 -.3 0" fill="none" stroke="${iris}" stroke-width=".9" class="fx-spin" style="transform-origin:${x}px ${y}px"/>`;
      else if (kind === 'star') s += `<path d="M${x} ${y - 3.4} L${x + 1} ${y - 1} L${x + 3.4} ${y - 1} L${x + 1.4} ${y + .6} L${x + 2.2} ${y + 3.2} L${x} ${y + 1.6} L${x - 2.2} ${y + 3.2} L${x - 1.4} ${y + .6} L${x - 3.4} ${y - 1} L${x - 1} ${y - 1}Z" fill="${iris}"/>`;
      else s += `<circle cx="${x}" cy="${y}" r="3" fill="${iris}"/><circle cx="${x}" cy="${y}" r="1.5" fill="#111"/>`;
      return s + `<circle cx="${x - 1.4}" cy="${y - 1.6}" r="1" fill="#fff" opacity=".9"/>`;
    };
    switch (g.eyes) {
      case 'dot': out = `<circle cx="${L}" cy="${y}" r="2.6" fill="#111"/><circle cx="${R}" cy="${y}" r="2.6" fill="#111"/><circle cx="${L - .8}" cy="${y - .9}" r=".7" fill="#fff"/><circle cx="${R - .8}" cy="${y - .9}" r=".7" fill="#fff"/>`;
        if (mood === 'happy') out = `<path d="M${L - 4} ${y + 1} Q${L} ${y - 4} ${L + 4} ${y + 1}" stroke="#111" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M${R - 4} ${y + 1} Q${R} ${y - 4} ${R + 4} ${y + 1}" stroke="#111" stroke-width="2" fill="none" stroke-linecap="round"/>`;
        return out;
      case 'visor': {
        const bend = mood === 'happy' ? -3 : mood === 'sad' ? 3 : 0, col = mood === 'happy' ? '#3dff9a' : mood === 'sad' ? '#ff3d6e' : '#3dfcff';
        return `<path d="M${L - 8} ${y - 3} Q50 ${y - 3 + bend * 2} ${R + 8} ${y - 3} L${R + 8} ${y + 4} Q50 ${y + 4 + bend * 2} ${L - 8} ${y + 4}Z" fill="#111" stroke="#555"/><path d="M${L - 6} ${y} Q50 ${y + bend * 2} ${R + 6} ${y}" stroke="${col}" stroke-width="2.5" fill="none" class="fx-glow"/>`;
      }
      case 'cyclops': {
        let s = `<ellipse cx="50" cy="${y}" rx="9" ry="8" fill="#fff" stroke="#222"/><circle cx="50" cy="${y}" r="5" fill="${g.iris}"/><circle cx="50" cy="${y}" r="2.4" fill="#111"/><circle cx="48" cy="${y - 2.5}" r="1.4" fill="#fff"/>`;
        if (mood === 'happy') s += `<path d="M40 ${y + 8} Q50 ${y} 60 ${y + 8} L60 ${y + 10} L40 ${y + 10}Z" fill="${skin}"/>`;
        if (mood === 'sad') s += `<path d="M40 ${y - 10} L60 ${y - 10} L60 ${y - 3} L40 ${y - 5}Z" fill="${skin}"/>`;
        return s;
      }
      case 'button': return `<g stroke="#111" stroke-width="1.8" stroke-linecap="round"><path d="M${L - 3} ${y - 3} L${L + 3} ${y + 3} M${L + 3} ${y - 3} L${L - 3} ${y + 3} M${R - 3} ${y - 3} L${R + 3} ${y + 3} M${R + 3} ${y - 3} L${R - 3} ${y + 3}"/></g>${mood === 'sad' ? `<path d="M${L + 4} ${y - 6} L${L - 4} ${y - 4} M${R - 4} ${y - 6} L${R + 4} ${y - 4}" stroke="#111" stroke-width="1"/>` : ''}`;
      default: {
        const kind = g.eyes === 'three' || g.eyes === 'hetero' ? 'round' : g.eyes;
        out = ball(L, g.iris, kind) + ball(R, g.eyes === 'hetero' ? g.iris2 : g.iris, kind) + lid(L, -1) + lid(R, 1);
        if (g.eyes === 'three') out += `<ellipse cx="50" cy="${y - 15}" rx="3.6" ry="4.4" fill="#fff" stroke="#222" stroke-width=".8"/><circle cx="50" cy="${y - 15}" r="2.2" fill="#8a5cff" class="fx-glow"/><circle cx="50" cy="${y - 15}" r="1" fill="#111"/>`;
        return out;
      }
    }
  }

  // ---------- брови: наклон по настроению ----------
  function browsSvg(g, mood) {
    if (g.brows === 'none') return '';
    const L = 50 - g.eyeGap, R = 50 + g.eyeGap, y = g.eyeY - 9 - (mood === 'happy' ? 2.5 : 0) + (mood === 'sad' ? 0.5 : 0);
    const col = g.brows === 'bolt' ? '#ffd23f' : (g.hair === 'bald' || g.hair === 'crystal' || g.hair === 'tentacles') ? '#2a1a10' : g.hairRainbow ? '#222' : shade(g.hairColor, -0.2);
    const angL = mood === 'happy' ? 8 : mood === 'sad' ? -16 : 0;
    const shape = {
      thin: `<path d="M-6 0 Q0 -2 6 0" stroke="${col}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
      thick: `<path d="M-6 0 Q0 -2.5 6 0" stroke="${col}" stroke-width="3.6" fill="none" stroke-linecap="round"/>`,
      bushy: `<g stroke="${col}" stroke-width="1.4" stroke-linecap="round"><path d="M-6 1 L-4 -2 M-3 1 L-1 -2.6 M0 1 L2 -2.6 M3 1 L5 -2 M5 1 L7 -1"/></g>`,
      angular: `<path d="M-6 1 L2 -2.5 L6 1" stroke="${col}" stroke-width="2.4" fill="none" stroke-linejoin="round"/>`,
      bolt: `<path d="M-7 0 L-2 -2 L-1 0.5 L4 -2.5 L7 0" stroke="${col}" stroke-width="1.8" fill="none" class="fx-glow"/>`,
      dots: `<ellipse cx="0" cy="-1" rx="2.4" ry="1.6" fill="${col}"/>`,
      uni: `<path d="M-6 0 Q0 -2 6 0" stroke="${col}" stroke-width="3" fill="none" stroke-linecap="round"/>`
    }[g.brows];
    let s = `<g transform="translate(${L} ${y}) rotate(${angL})">${shape}</g><g transform="translate(${R} ${y}) rotate(${-angL}) scale(-1 1)">${shape}</g>`;
    if (g.brows === 'uni') s += `<path d="M${L + 5} ${y + (mood === 'sad' ? -1.5 : 0)} L${R - 5} ${y + (mood === 'sad' ? -1.5 : 0)}" stroke="${col}" stroke-width="3"/>`;
    return s;
  }

  // ---------- нос ----------
  function noseSvg(g, skin) {
    const y = g.noseY, dk = shade(skin, -0.4);
    switch (g.nose) {
      case 'button': return `<path d="M47 ${y} Q50 ${y + 3.5} 53 ${y}" stroke="${dk}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
      case 'long': return `<path d="M50 ${y - 12} L52 ${y + 1} Q50 ${y + 4} 47 ${y + 1}" stroke="${dk}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
      case 'hook': return `<path d="M49 ${y - 11} Q57 ${y - 3} 54 ${y + 2} Q51 ${y + 4} 48 ${y + 1}" stroke="${dk}" stroke-width="1.8" fill="${shade(skin, -0.08)}"/>`;
      case 'wide': return `<path d="M44 ${y + 1} Q44 ${y - 4} 50 ${y - 3} Q56 ${y - 4} 56 ${y + 1} Q50 ${y + 4} 44 ${y + 1}Z" fill="${shade(skin, -0.12)}" stroke="${dk}"/><circle cx="47" cy="${y}" r="1" fill="${dk}"/><circle cx="53" cy="${y}" r="1" fill="${dk}"/>`;
      case 'triangle': return `<path d="M50 ${y - 10} L55 ${y + 2} L45 ${y + 2}Z" fill="${shade(skin, -0.1)}" stroke="${dk}"/>`;
      case 'snout': return `<ellipse cx="50" cy="${y}" rx="6" ry="4.4" fill="${shade(skin, 0.15)}" stroke="${dk}"/><ellipse cx="48" cy="${y}" rx="1.2" ry="1.8" fill="${dk}"/><ellipse cx="52" cy="${y}" rx="1.2" ry="1.8" fill="${dk}"/>`;
      case 'dots': return `<circle cx="48" cy="${y}" r="1.1" fill="${dk}"/><circle cx="52" cy="${y}" r="1.1" fill="${dk}"/>`;
      case 'clown': return `<circle cx="50" cy="${y - 1}" r="4.6" fill="#ff2d3d"/><circle cx="48.5" cy="${y - 2.6}" r="1.4" fill="#fff" opacity=".7"/>`;
      case 'cyber': return `<rect x="46" y="${y - 7}" width="8" height="9" rx="2" fill="#9aa5b1" stroke="#444"/><circle cx="48" cy="${y - 5}" r=".8" fill="#444"/><circle cx="52" cy="${y - 5}" r=".8" fill="#444"/><rect x="47.5" y="${y - 1}" width="5" height="1.6" fill="#3dfcff" class="fx-glow"/>`;
      default: return `<path d="M49 ${y - 8} Q51 ${y} 54 ${y - 1} Q52 ${y + 2} 48 ${y + 1}" stroke="${dk}" stroke-width="1.5" fill="none"/>`; // курносый
    }
  }

  // ---------- рот: каждая форма в трёх настроениях ----------
  function mouthSvg(g, mood, skin) {
    const y = Math.max(g.noseY + 10, 72), w = g.mouthW, c = mood === 'happy' ? 6 : mood === 'sad' ? -5 : 0, dk = shade(skin, -0.55);
    const arc = (ww, cc, extra) => `M${50 - ww} ${y - cc * 0.4} Q50 ${y + cc} ${50 + ww} ${y - cc * 0.4}${extra || ''}`;
    switch (g.mouth) {
      case 'line': return `<path d="${arc(w, c)}" stroke="#2a1515" stroke-width="2" fill="none" stroke-linecap="round"/>`;
      case 'lips': {
        const lip = '#c2185b';
        if (mood === 'happy') return `<path d="M${50 - w} ${y - 2} Q50 ${y + 9} ${50 + w} ${y - 2} Q50 ${y + 3} ${50 - w} ${y - 2}Z" fill="${lip}"/><path d="M${50 - w + 2} ${y - 1} Q50 ${y + 4} ${50 + w - 2} ${y - 1}" stroke="#fff" stroke-width="1.6" fill="none"/>`;
        if (mood === 'sad') return `<path d="M${50 - w} ${y + 3} Q50 ${y - 4} ${50 + w} ${y + 3} Q50 ${y + 1} ${50 - w} ${y + 3}Z" fill="${lip}"/><path d="M${50 - w + 2} ${y + 3.5} Q50 ${y + 5} ${50 + w - 2} ${y + 3.5}" stroke="${lip}" stroke-width="2.4" fill="none"/>`;
        return `<path d="M${50 - w} ${y} Q${50 - w / 2} ${y - 3} 50 ${y - 1} Q${50 + w / 2} ${y - 3} ${50 + w} ${y} Q50 ${y + 4} ${50 - w} ${y}Z" fill="${lip}"/><path d="M${50 - w} ${y} L${50 + w} ${y}" stroke="${shade(lip, -0.4)}" stroke-width=".8"/>`;
      }
      case 'grin': {
        if (mood === 'happy') return `<path d="M${50 - w - 1} ${y - 3} Q50 ${y + 12} ${50 + w + 1} ${y - 3}Z" fill="#3a0d0d"/><path d="M${50 - w} ${y - 2.6} L${50 + w} ${y - 2.6} L${50 + w - 1.5} ${y + 0.8} L${50 - w + 1.5} ${y + 0.8}Z" fill="#fff"/><path d="M${50 - w / 2} ${y - 2.6} V${y + 0.8} M50 ${y - 2.6} V${y + 0.8} M${50 + w / 2} ${y - 2.6} V${y + 0.8}" stroke="#bbb" stroke-width=".5"/>`;
        if (mood === 'sad') return `<path d="M${50 - w} ${y + 3} Q50 ${y - 5} ${50 + w} ${y + 3} L${50 + w - 1} ${y + 5} Q50 ${y - 1} ${50 - w + 1} ${y + 5}Z" fill="#fff" stroke="#3a0d0d" stroke-width="1"/>`;
        return `<rect x="${50 - w}" y="${y - 2.5}" width="${w * 2}" height="5" rx="1.5" fill="#fff" stroke="#3a0d0d" stroke-width="1"/><path d="M${50 - w} ${y} H${50 + w} M${50 - w / 2} ${y - 2.5} V${y + 2.5} M50 ${y - 2.5} V${y + 2.5} M${50 + w / 2} ${y - 2.5} V${y + 2.5}" stroke="#999" stroke-width=".5"/>`;
      }
      case 'tiny': return mood === 'neutral' ? `<ellipse cx="50" cy="${y}" rx="2" ry="2.4" fill="#3a0d0d"/>` : `<path d="${arc(3.5, c * 0.6)}" stroke="#2a1515" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
      case 'wide': return `<path d="${arc(w + 6, c * 1.2)}" stroke="#2a1515" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M${44 - w} ${y - c * 0.5 - 1} L${44 - w} ${y - c * 0.5 + 2} M${56 + w} ${y - c * 0.5 - 1} L${56 + w} ${y - c * 0.5 + 2}" stroke="#2a1515" stroke-width="1.2"/>`;
      case 'fangs': {
        const yy = y - c * 0.4;
        return `<path d="${arc(w, c)}" stroke="#2a1515" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M${50 - w / 2} ${yy + c * 0.55} l1.6 4 l1.6 -4 M${50 + w / 2 - 3.2} ${yy + c * 0.55} l1.6 4 l1.6 -4" fill="#fff" stroke="#999" stroke-width=".5"/>`;
      }
      case 'zigzag': {
        const a = mood === 'happy' ? -5 : mood === 'sad' ? 5 : 0;
        let d = `M${50 - w - 2} ${y + a}`;
        for (let i = 1; i <= 6; i++) { const x = 50 - w - 2 + i * (w * 2 + 4) / 6, mid = Math.abs(i - 3) / 3; d += ` L${x.toFixed(1)} ${(y + (i % 2 ? 2.4 : -2.4) + a * mid).toFixed(1)}`; }
        return `<path d="${d}" stroke="#ff3df2" stroke-width="1.8" fill="none" stroke-linejoin="round" class="fx-glow"/>`;
      }
      case 'grille': {
        const b = c * 0.5;
        let s = `<path d="M${50 - w} ${y - 3 - b} Q50 ${y - 3 + b} ${50 + w} ${y - 3 - b} L${50 + w} ${y + 3 - b} Q50 ${y + 3 + b} ${50 - w} ${y + 3 - b}Z" fill="#2c303a" stroke="#9aa5b1"/>`;
        for (let i = 1; i < 5; i++) { const x = 50 - w + i * w / 2.5; s += `<path d="M${x.toFixed(1)} ${y - 3} V${y + 3}" stroke="#9aa5b1" stroke-width=".8"/>`; }
        return s;
      }
      case 'tongue': {
        if (mood === 'happy') return `<path d="M${50 - w} ${y - 2} Q50 ${y + 9} ${50 + w} ${y - 2}Z" fill="#3a0d0d"/><path d="M46 ${y + 1} Q46 ${y + 9} 50 ${y + 9} Q54 ${y + 9} 54 ${y + 1}Z" fill="#ff6b9d"/><path d="M50 ${y + 2} V${y + 7}" stroke="#d84a7a" stroke-width=".7"/>`;
        if (mood === 'sad') return `<path d="M${50 - w} ${y + 3} Q${50 - w / 2} ${y - 1} 50 ${y + 2} Q${50 + w / 2} ${y - 1} ${50 + w} ${y + 3}" stroke="#2a1515" stroke-width="2" fill="none" stroke-linecap="round"/>`;
        return `<path d="M${50 - w} ${y} L${50 + w} ${y}" stroke="#2a1515" stroke-width="2" stroke-linecap="round"/><path d="M47 ${y} Q47 ${y + 4} 50 ${y + 4} Q53 ${y + 4} 53 ${y}" fill="#ff6b9d"/>`;
      }
      case 'mustache': {
        const col = g.hairRainbow ? '#222' : (g.hair === 'bald' ? '#3b2416' : shade(g.hairColor, -0.1)), droop = mood === 'sad' ? 4 : mood === 'happy' ? -3 : 0;
        return `<path d="${arc(w * 0.7, c * 0.8)}" stroke="#2a1515" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M50 ${y - 5} Q${50 - w} ${y - 9} ${50 - w - 4} ${y - 3 + droop} Q${50 - w} ${y - 4} 50 ${y - 3} Q${50 + w} ${y - 4} ${50 + w + 4} ${y - 3 + droop} Q${50 + w} ${y - 9} 50 ${y - 5}Z" fill="${col}"/>`;
      }
    }
    return '';
  }

  function beardSvg(g, skin) {
    const col = g.hairRainbow ? '#333' : (g.hair === 'bald' || g.hair === 'crystal' || g.hair === 'tentacles') ? '#3b2416' : g.hairColor;
    switch (g.beard) {
      case 'stubble': { let s = ''; for (let i = 0; i < 26; i++) { const a = Math.PI * (0.15 + i / 26 * 0.7), x = 50 + Math.cos(a) * 20, y = 66 + Math.sin(a) * 18; s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r=".6" fill="${shade(skin, -0.5)}"/>`; } return s; }
      case 'full': return `<path d="M27 62 Q30 90 50 92 Q70 90 73 62 Q66 80 50 82 Q34 80 27 62Z" fill="${col}"/>`;
      case 'goatee': return `<path d="M44 82 Q50 94 56 82 Q50 86 44 82Z" fill="${col}"/>`;
      case 'chops': return `<path d="M25 52 Q26 74 36 78 L34 64 Z M75 52 Q74 74 64 78 L66 64Z" fill="${col}"/>`;
      default: return '';
    }
  }

  function extrasSvg(g, mood, skin) {
    let s = '';
    const L = 50 - g.eyeGap, R = 50 + g.eyeGap, y = g.eyeY;
    if (g.paint) s += `<path d="M${R - 2} ${y + 6} L${R + 10} ${y + 8} M${R - 1} ${y + 10} L${R + 10} ${y + 12}" stroke="${g.paint}" stroke-width="2" stroke-linecap="round" opacity=".9"/><path d="M${L + 2} ${y + 6} L${L - 10} ${y + 8} M${L + 1} ${y + 10} L${L - 10} ${y + 12}" stroke="${g.paint}" stroke-width="2" stroke-linecap="round" opacity=".9"/>`;
    if (g.freckles) [[L - 3, y + 8], [L + 1, y + 9], [L - 1, y + 11], [R + 3, y + 8], [R - 1, y + 9], [R + 1, y + 11]].forEach(([x, yy]) => { s += `<circle cx="${x}" cy="${yy}" r=".7" fill="${shade(skin, -0.35)}"/>`; });
    if (g.scar) s += `<path d="M${R + 2} ${y - 9} L${R - 4} ${y + 12}" stroke="${shade(skin, -0.45)}" stroke-width="1.4"/><path d="M${R + 1} ${y - 4} l-3 -1 M${R - 0.5} ${y + 1} l-3 -1 M${R - 2} ${y + 6} l-3 -1" stroke="${shade(skin, -0.45)}" stroke-width=".9"/>`;
    if (g.circuit) s += `<path d="M28 ${y + 4} H34 L37 ${y + 8} H40 M72 ${y - 12} H66 L63 ${y - 16}" stroke="#3dfcff" stroke-width="1" fill="none" class="fx-glow"/><circle cx="40" cy="${y + 8}" r="1.1" fill="#3dfcff"/><circle cx="63" cy="${y - 16}" r="1.1" fill="#3dfcff"/>`;
    if (g.earring && g.ears !== 'none' && g.ears !== 'antenna') s += `<circle cx="${g.ears === 'big' ? 14 : g.ears === 'elf' ? 22 : 21}" cy="${y + 13}" r="2" fill="none" stroke="#ffd23f" stroke-width="1.4"/>`;
    if (g.monocle) s += `<circle cx="${R}" cy="${y}" r="7" fill="rgba(180,220,255,.15)" stroke="#d4a017" stroke-width="1.4"/><path d="M${R + 7} ${y + 1} Q${R + 10} ${y + 14} ${R + 6} ${y + 24}" stroke="#d4a017" stroke-width=".7" fill="none"/>`;
    if (g.goggles) s += `<g transform="translate(0 -14)"><rect x="${L - 8}" y="${y - 6}" width="${(R - L) + 16}" height="3" fill="#3b2a1a"/><circle cx="${L}" cy="${y - 4.5}" r="5.5" fill="#22e3ff" fill-opacity=".55" stroke="#555" stroke-width="1.6"/><circle cx="${R}" cy="${y - 4.5}" r="5.5" fill="#22e3ff" fill-opacity=".55" stroke="#555" stroke-width="1.6"/><circle cx="${L - 2}" cy="${y - 6.5}" r="1.4" fill="#fff" opacity=".8"/></g>`;
    // настроение: румянец и искры при радости, пот и слёзы при грусти
    if (mood === 'happy') s += `<ellipse cx="${L - 4}" cy="${y + 11}" rx="4" ry="2.2" fill="#ff6b8a" opacity=".45"/><ellipse cx="${R + 4}" cy="${y + 11}" rx="4" ry="2.2" fill="#ff6b8a" opacity=".45"/>`;
    return s;
  }

  // ---------- эксклюзивные детали перков ----------
  // Этих деталей нет в случайном генераторе: они появляются ТОЛЬКО у носителя своего перка.
  // back — за головой, over — на лице, top — поверх причёски.
  const star = (cx, cy, r, n) => {
    n = n || 5; let d = '';
    for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r * 0.45 : r; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1); }
    return d + 'Z';
  };
  const MIRROR = 'transform="matrix(-1 0 0 1 100 0)"';
  const PERK_LOOK = {
    // капюшон, зелёное пламя в глазницах, призрачный дымок
    necro: g => ({
      back: `<path d="M8 100 Q6 38 50 6 Q94 38 92 100Z" fill="#121614" stroke="#2c3a2f" stroke-width="1.5"/>`,
      over: [50 - g.eyeGap, 50 + g.eyeGap].map(x => `<ellipse cx="${x}" cy="${g.eyeY}" rx="7" ry="6.5" fill="#0a0d0b"/><circle cx="${x}" cy="${g.eyeY}" r="4.5" fill="#7dff9a" opacity=".35"/><path d="M${x - 2.4} ${g.eyeY + 2} Q${x} ${g.eyeY - 6} ${x + 2.4} ${g.eyeY + 2}Z" fill="#b6ffc9" class="fx-glow"/>`).join('') +
        `<path d="M${50 - g.eyeGap - 6} ${g.eyeY + 9} q4 3 8 0 M${50 + g.eyeGap - 2} ${g.eyeY + 9} q4 3 8 0" stroke="#d8e8dc" stroke-width="1.2" fill="none" opacity=".7"/>`,
      top: `<path d="M12 100 Q14 48 30 28 Q50 4 70 28 Q86 48 88 100 L81 100 Q79 54 68 37 Q50 16 32 37 Q21 54 19 100Z" fill="#1b221e"/>` +
        `<path class="fx-flame" d="M44 12 Q46 4 50 0 Q49 6 53 8 Q55 4 58 6 Q54 10 56 14 Q50 10 44 12Z" fill="#7dff9a" opacity=".55"/>`
    }),
    // нимб и латный нагрудник с лилией
    paladin: () => ({
      top: `<path d="M6 100 Q8 80 30 80 Q37 89 35 100Z" fill="#d5dae3" stroke="#7d8594" stroke-width="1.4"/><path d="M12 92 Q20 84 31 85" stroke="#fff" stroke-width="1.2" fill="none" opacity=".6"/>` +
        `<g ${MIRROR}><path d="M6 100 Q8 80 30 80 Q37 89 35 100Z" fill="#d5dae3" stroke="#7d8594" stroke-width="1.4"/><path d="M12 92 Q20 84 31 85" stroke="#fff" stroke-width="1.2" fill="none" opacity=".6"/></g>` +
        `<path d="M50 89 q-3.5 4 0 9 q3.5 -5 0 -9z" fill="#ffd23f" stroke="#a87b00" stroke-width=".6"/><path d="M45 98 q-4 -5 2.5 -5 M55 98 q4 -5 -2.5 -5" stroke="#ffd23f" stroke-width="1.8" fill="none"/>` +
        `<ellipse cx="50" cy="12" rx="22" ry="5.5" fill="none" stroke="#fff6c8" stroke-width="5" opacity=".35"/><ellipse cx="50" cy="12" rx="22" ry="5.5" fill="none" stroke="#ffe066" stroke-width="2.4" class="fx-glow"/>`
    }),
    // звёздные очки кинозвезды
    press: g => ({ over: `<path d="${star(50 - g.eyeGap, g.eyeY, 8)}" fill="#ff3df2" fill-opacity=".8" stroke="#fff" stroke-width=".8"/><path d="${star(50 + g.eyeGap, g.eyeY, 8)}" fill="#ff3df2" fill-opacity=".8" stroke="#fff" stroke-width=".8"/><path d="M${50 - g.eyeGap + 6} ${g.eyeY - 2} H${50 + g.eyeGap - 6}" stroke="#fff" stroke-width="1.4"/>` }),
    // рожки и пар из ушей
    aggro: () => ({ top: `<path d="M31 27 Q21 13 25 3 Q30 16 39 20Z" fill="#d7263d" stroke="#7a0f1f" stroke-width="1"/><path d="M31 27 Q21 13 25 3 Q30 16 39 20Z" fill="#d7263d" stroke="#7a0f1f" stroke-width="1" ${MIRROR}/>` +
      `<g class="fx-blink" fill="#e8e8e8" opacity=".75"><circle cx="13" cy="40" r="3"/><circle cx="9" cy="34" r="2.2"/><circle cx="87" cy="40" r="3"/><circle cx="91" cy="34" r="2.2"/></g>` }),
    // бинт на голове и пластырь на щеке
    stunt: g => ({
      over: `<g transform="translate(${50 + g.eyeGap + 6} ${g.eyeY + 13}) rotate(35)"><rect x="-6" y="-2" width="12" height="4" rx="1.5" fill="#f2c9a0"/><rect x="-2" y="-6" width="4" height="12" rx="1.5" fill="#f2c9a0"/></g>`,
      top: `<path d="M23 33 Q50 23 77 33 L77 40 Q50 30 23 40Z" fill="#f5f0e6" stroke="#cfc6b4" stroke-width="1"/><path d="M68 31 l6 -6 M70 33 l7 -3" stroke="#f5f0e6" stroke-width="3" stroke-linecap="round"/><circle cx="36" cy="33" r="2.2" fill="#d7263d" opacity=".8"/>`
    }),
    // клевер за ухом
    lucky: () => ({ top: `<g transform="translate(75 27)"><path d="M0 0 Q4 8 2 14" stroke="#1f7a2e" stroke-width="1.6" fill="none"/>${[[0, -4], [4, 0], [0, 4], [-4, 0]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6" fill="#2fdc74" stroke="#1f7a2e" stroke-width=".8"/>`).join('')}<circle r="1.4" fill="#ffd23f"/></g>` }),
    // магнит на ободке
    magnet: () => ({ top: `<path d="M24 36 Q50 22 76 36" stroke="#333" stroke-width="2.5" fill="none"/><path d="M40 17 V7 A10 10 0 0 1 60 7 V17 H54 V8 A4 4 0 0 0 46 8 V17Z" fill="#e53935" stroke="#7a1414" stroke-width=".8"/><rect x="40" y="13" width="6" height="4" fill="#ddd"/><rect x="54" y="13" width="6" height="4" fill="#ddd"/><path d="M38 22 l-3 2 M62 22 l3 2" stroke="#9fe8ff" stroke-width="1.2"/>` }),
    // огонь на плечах
    pyro: () => ({ top: `<g class="fx-flame"><path d="M14 100 Q10 88 18 80 Q18 88 22 86 Q22 78 28 74 Q28 84 32 86 Q34 82 36 84 Q34 92 36 100Z" fill="#ff7b00"/><path d="M18 100 Q16 92 22 88 Q24 94 28 92 Q30 96 30 100Z" fill="#ffd23f"/></g>` +
      `<g class="fx-flame" ${MIRROR}><path d="M14 100 Q10 88 18 80 Q18 88 22 86 Q22 78 28 74 Q28 84 32 86 Q34 82 36 84 Q34 92 36 100Z" fill="#ff7b00"/><path d="M18 100 Q16 92 22 88 Q24 94 28 92 Q30 96 30 100Z" fill="#ffd23f"/></g>` }),
    // иней на щеках, сосульки и снежинка
    cold: g => ({
      over: `<ellipse cx="${50 - g.eyeGap - 3}" cy="${g.eyeY + 12}" rx="6" ry="3.4" fill="#bfefff" opacity=".45"/><ellipse cx="${50 + g.eyeGap + 3}" cy="${g.eyeY + 12}" rx="6" ry="3.4" fill="#bfefff" opacity=".45"/>` +
        `<path d="M41 83 L43 91 L45 83Z M48 85 L50 95 L52 85Z M55 83 L57 90 L59 83Z" fill="#dff7ff" stroke="#7fd4ff" stroke-width=".6"/>`,
      top: `<g transform="translate(82 20)" stroke="#bfefff" stroke-width="1.6" stroke-linecap="round" class="fx-glow"><path d="M0 -7 V7 M-6 -3.5 L6 3.5 M-6 3.5 L6 -3.5"/><path d="M-2 -5 L0 -3 L2 -5 M-2 5 L0 3 L2 5" fill="none"/></g>`
    }),
    // рог носорога и цепь на шее
    heavy: g => ({
      back: `<g fill="none" stroke="#b8b8b8" stroke-width="2.2">${[30, 37, 44, 51, 58, 65].map((x, i) => `<ellipse cx="${x + 2}" cy="${86 + Math.abs(i - 2.5) * -0.8}" rx="3.6" ry="2.4"/>`).join('')}</g>`,
      over: `<path d="M46 ${g.noseY - 2} Q48 ${g.noseY - 20} 57 ${g.noseY - 27} Q53 ${g.noseY - 14} 54 ${g.noseY - 2}Z" fill="#d8cfc0" stroke="#8a7f6c" stroke-width="1"/>`
    }),
    // гарнитура с микрофоном
    tactic: () => ({ top: `<path d="M23 46 Q23 13 50 13 Q77 13 77 46" fill="none" stroke="#222" stroke-width="3.5"/><rect x="17" y="38" width="9" height="15" rx="3" fill="#333" stroke="#111"/><rect x="74" y="38" width="9" height="15" rx="3" fill="#333" stroke="#111"/><path d="M22 53 Q26 74 41 75" stroke="#222" stroke-width="2" fill="none"/><circle cx="42" cy="75" r="2.6" fill="#e53935"/><path d="M78 42 l3 0" stroke="#3dfcff" stroke-width="1.5" class="fx-blink"/>` }),
    // козырёк крупье и серьга-кубик
    gambler: g => ({
      over: `<g transform="translate(${g.ears === 'big' ? 12 : 19} ${g.eyeY + 13})"><path d="M0 -4 V0" stroke="#ffd23f" stroke-width="1"/><rect x="-3" y="0" width="6" height="6" rx="1" fill="#fff" stroke="#333" stroke-width=".6"/><circle cx="-1.2" cy="1.8" r=".7" fill="#d7263d"/><circle cx="1.2" cy="4.2" r=".7" fill="#d7263d"/></g>`,
      top: `<path d="M24 33 Q50 24 76 33" stroke="#14532d" stroke-width="2.5" fill="none"/><path d="M21 35 Q50 24 79 35 L85 44 Q50 31 15 44Z" fill="#2e8b57" fill-opacity=".85" stroke="#14532d" stroke-width="1"/>`
    }),
    // встречный поток воздуха
    drafter: () => ({ back: `<g stroke="#9fe8ff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".75"><path d="M98 26 Q80 24 70 30"/><path d="M100 40 Q86 38 78 44"/><path d="M98 56 Q86 54 80 60"/><path d="M96 70 Q86 68 78 74"/></g>`,
      top: `<path d="M84 74 a4 4 0 1 1 4 4 a7 7 0 1 1 -7 -7" fill="none" stroke="#9fe8ff" stroke-width="1.8" class="fx-glow"/>` }),
    // повязка на глаз и знак злости
    avenger: g => ({ over: `<path d="M22 ${g.eyeY - 9} L78 ${g.eyeY - 17}" stroke="#111" stroke-width="1.6"/><ellipse cx="${50 - g.eyeGap}" cy="${g.eyeY}" rx="7.5" ry="6.5" fill="#111"/><path d="M${50 - g.eyeGap - 3} ${g.eyeY - 2} l6 4 M${50 - g.eyeGap + 3} ${g.eyeY - 2} l-6 4" stroke="#d7263d" stroke-width="1.2"/>` +
      `<g transform="translate(64 27)" stroke="#ff2d55" stroke-width="2" fill="none" stroke-linecap="round" class="fx-blink"><path d="M-4 -1 q3 0 3 -3 M4 -1 q-3 0 -3 -3 M-4 1 q3 0 3 3 M4 1 q-3 0 -3 3"/></g>` }),
    // прицел-монокуляр
    hunter: g => ({ over: `<path d="M${50 + g.eyeGap + 8} ${g.eyeY} L80 ${g.eyeY - 4}" stroke="#222" stroke-width="2"/><circle cx="${50 + g.eyeGap}" cy="${g.eyeY}" r="8" fill="rgba(255,60,60,.15)" stroke="#222" stroke-width="3"/><path d="M${50 + g.eyeGap - 6} ${g.eyeY} H${50 + g.eyeGap + 6} M${50 + g.eyeGap} ${g.eyeY - 6} V${g.eyeY + 6}" stroke="#ff2d55" stroke-width=".9"/><circle cx="${50 + g.eyeGap}" cy="${g.eyeY}" r="2.5" fill="none" stroke="#ff2d55" stroke-width=".8"/>` }),
    // шлем-панцирь черепахи
    careful: () => ({ top: `<path d="M23 38 Q25 9 50 9 Q75 9 77 38Z" fill="#3c8d40" stroke="#1f4f22" stroke-width="1.5"/><path d="M39 22 L44 15 H56 L61 22 L56 30 H44Z M44 15 L39 9 M56 15 L61 9 M61 22 H75 M39 22 H25 M44 30 L40 38 M56 30 L60 38" fill="none" stroke="#a8d08d" stroke-width="1.2"/><path d="M19 38 H81" stroke="#1f4f22" stroke-width="3.5" stroke-linecap="round"/>` }),
    // орбита звёздочек над головой
    impulsive: () => ({ top: `<ellipse cx="50" cy="14" rx="27" ry="6" fill="none" stroke="#ffd23f" stroke-width="1" stroke-dasharray="2 3" opacity=".7"/><g class="fx-twinkle" fill="#ffd23f"><path d="${star(24, 15, 4)}"/><path d="${star(72, 10, 3.4)}"/><path d="${star(52, 20, 3)}"/></g><text x="80" y="24" font-size="9" fill="#ff7eb6">?</text>` }),
    // закрученные бараньи рога
    ram: () => ({ top: `<path d="M30 30 Q11 24 10 43 Q10 59 25 57 Q17 52 19 45 Q21 37 31 40Z" fill="#c9b18a" stroke="#7a6545" stroke-width="1.2"/><path d="M14 44 Q16 50 22 52 M16 36 Q20 33 26 34" stroke="#7a6545" stroke-width=".8" fill="none"/>` +
      `<g ${MIRROR}><path d="M30 30 Q11 24 10 43 Q10 59 25 57 Q17 52 19 45 Q21 37 31 40Z" fill="#c9b18a" stroke="#7a6545" stroke-width="1.2"/><path d="M14 44 Q16 50 22 52 M16 36 Q20 33 26 34" stroke="#7a6545" stroke-width=".8" fill="none"/></g>` })
  };
  function perkLook(g, perks) {
    const out = { back: '', over: '', top: '' };
    (perks || []).forEach(p => { const f = PERK_LOOK[p]; if (!f) return; const l = f(g); out.back += l.back || ''; out.over += l.over || ''; out.top += l.top || ''; });
    return out;
  }

  let uidCounter = 0;
  /* Отрисовка: seed — зерно лица, morale — 0..100, size — px, color — цвет гонщика (фон), perks — перки (эксклюзивные детали) */
  function svg(seed, morale, size, color, perks) {
    const g = genome(seed), uid = 'f' + (++uidCounter), pl = perkLook(g, perks);
    const mood = morale >= 62 ? 'happy' : morale <= 38 ? 'sad' : 'neutral';
    const skin = g.skin, dk = shade(skin, -0.35);
    const fill = g.skin2 ? `url(#sk${uid})` : skin;
    const hair = hairParts(g, uid);
    let defs = `<radialGradient id="bg${uid}" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="${color || '#445'}" stop-opacity=".55"/><stop offset="1" stop-color="#05070c" stop-opacity=".95"/></radialGradient>
      <clipPath id="cl${uid}"><circle cx="50" cy="50" r="49"/></clipPath>`;
    if (g.skin2) defs += `<linearGradient id="sk${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${skin}"/><stop offset="1" stop-color="${g.skin2}"/></linearGradient>`;
    if (g.hairRainbow) defs += `<linearGradient id="hr${uid}" x1="0" x2="1"><stop offset="0" stop-color="#ff3d6e"/><stop offset=".25" stop-color="#ffe23d"/><stop offset=".5" stop-color="#3dff9a"/><stop offset=".75" stop-color="#3dfcff"/><stop offset="1" stop-color="#b03dff"/></linearGradient>`;
    let extraMood = '';
    if (mood === 'happy' && morale >= 80) extraMood += `<g class="fx-twinkle" fill="#ffd23f"><path d="M14 22 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5z"/><path d="M84 30 l1 3 3 1 -3 1 -1 3 -1 -3 -3 -1 3 -1z"/></g>`;
    if (mood === 'sad') extraMood += `<path d="M78 34 q3 5 0 7 q-3 -2 0 -7z" fill="#7fd4ff" opacity=".9"/>`;
    if (mood === 'sad' && morale <= 20) extraMood += `<path d="M${50 - g.eyeGap - 2} ${g.eyeY + 5} q-2 6 0 10 q3 -2 0 -10z" fill="#7fd4ff" class="fx-tear"/>`;
    return `<svg class="face" viewBox="0 0 100 100" width="${size}" height="${size}" data-mood="${mood}">
      <defs>${defs}</defs>
      <g clip-path="url(#cl${uid})">
        <rect width="100" height="100" fill="url(#bg${uid})"/>
        <path d="M22 100 Q24 84 50 82 Q76 84 78 100Z" fill="${shade(color || '#555', -0.3)}"/>
        ${pl.back}
        ${hair.back}
        ${earsSvg(g, fill, dk)}
        <path d="${skullPath(g)}" fill="${fill}" stroke="${dk}" stroke-width="1.4"/>
        <path d="${skullPath(g)}" fill="#000" opacity=".08" transform="translate(3 2)" style="mix-blend-mode:multiply"/>
        ${beardSvg(g, skin)}
        ${extrasSvg(g, mood, skin)}
        ${eyesSvg(g, mood, skin)}
        ${browsSvg(g, mood)}
        ${noseSvg(g, skin)}
        ${mouthSvg(g, mood, skin)}
        ${pl.over}
        ${hair.front}
        ${pl.top}
        ${extraMood}
      </g>
      <circle cx="50" cy="50" r="48.5" fill="none" stroke="${color || '#888'}" stroke-width="2.5"/>
    </svg>`;
  }

  const moodOf = m => (m >= 62 ? 'happy' : m <= 38 ? 'sad' : 'neutral');
  const newSeed = rand => Math.floor((rand || Math.random)() * 2147483647);

  G.Faces = { svg, genome, moodOf, newSeed, PERK_LOOK, PARTS: { SKULLS, EYES, BROWS, NOSES, MOUTHS, HAIRS, EARS } };
})(typeof window !== 'undefined' ? window : globalThis);
