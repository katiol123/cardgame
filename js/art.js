/* Векторная графика: значки блоков, шлемы гонщиков, оружие, клетки трассы. */
(function (G) {
  'use strict';

  // Значки блоков (viewBox 0 0 100 100, белые с тенью)
  const GEM_ICON = [
    // Топливо — пламя
    '<path d="M50 10c6 16 24 26 24 48a24 24 0 0 1-48 0c0-12 6-20 12-26 0 10 4 16 10 18-4-14 0-28 2-40z" fill="#fff"/><path d="M50 52c4 6 10 10 10 18a10 10 0 0 1-20 0c0-6 4-10 10-18z" fill="rgba(0,0,0,.25)"/>',
    // Нитро — молния
    '<path d="M58 6 22 56h22l-8 38 40-54H52z" fill="#fff"/>',
    // Боезапас — прицел
    '<circle cx="50" cy="50" r="28" fill="none" stroke="#fff" stroke-width="9"/><circle cx="50" cy="50" r="8" fill="#fff"/><path d="M50 6v22M50 72v22M6 50h22M72 50h22" stroke="#fff" stroke-width="9" stroke-linecap="round"/>',
    // Броня — щит
    '<path d="M50 6 84 18v26c0 24-14 40-34 50C30 84 16 68 16 44V18z" fill="#fff"/><path d="M50 20v62c-12-8-22-20-22-38V27z" fill="rgba(0,0,0,.2)"/>',
    // Ремкомплект — гаечный ключ
    '<path d="M70 8a22 22 0 0 0-26 28L10 70a9 9 0 0 0 0 13l7 7a9 9 0 0 0 13 0l34-34A22 22 0 0 0 92 30L78 44 64 40 60 26l14-14z" fill="#fff"/>',
    // Сцепление — покрышка
    '<circle cx="50" cy="50" r="38" fill="#fff"/><circle cx="50" cy="50" r="16" fill="rgba(0,0,0,.35)"/><g stroke="rgba(0,0,0,.3)" stroke-width="6">' +
      [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<path d="M50 14v10" transform="rotate(${a} 50 50)"/>`).join('') + '</g>'
  ];
  const NOVA_ICON = '<path d="M50 4l10 30 32 2-25 19 9 31-26-18-26 18 9-31L8 36l32-2z" fill="#fff"/>';

  function gemIcon(type) {
    return `<svg viewBox="0 0 100 100" class="gi">${type === 6 ? NOVA_ICON : GEM_ICON[type]}</svg>`;
  }

  // Шлем гонщика
  function helmet(r, size) {
    const id = 'h' + r.id + '_' + Math.random().toString(36).slice(2, 7);
    const c = r.color, p = r.id % 4;
    const stripe = [
      `<path d="M30 9c3 0 5 1 6 2l-2 20h-8L24 11c1-1 3-2 6-2z" fill="rgba(255,255,255,.85)"/>`,
      `<path d="M22 12l4 18h3L26 10zM38 12l-4 18h-3l3-20z" fill="rgba(0,0,0,.45)"/>`,
      `<path d="M14 26c6-4 10-14 18-14-4 4-4 8-2 12-4-2-8 0-10 4-2-2-4-2-6-2z" fill="rgba(255,220,80,.9)"/>`,
      `<circle cx="30" cy="18" r="5" fill="rgba(0,0,0,.4)"/><circle cx="30" cy="18" r="2.5" fill="#fff"/>`
    ][p];
    return `<svg viewBox="0 0 60 60" width="${size || 40}" height="${size || 40}" class="helmet">
      <defs>
        <radialGradient id="${id}b" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".25" stop-color="${c}"/><stop offset="1" stop-color="#000" stop-opacity=".9"/></radialGradient>
        <linearGradient id="${id}v" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a4a6b"/><stop offset=".5" stop-color="#0b1020"/><stop offset="1" stop-color="#1e2a44"/></linearGradient>
        <clipPath id="${id}c"><path d="M30 6C16 6 8 17 8 31c0 9 3 16 7 21h30c4-5 7-12 7-21C52 17 44 6 30 6z"/></clipPath>
      </defs>
      <path d="M30 6C16 6 8 17 8 31c0 9 3 16 7 21h30c4-5 7-12 7-21C52 17 44 6 30 6z" fill="${c}"/>
      <g clip-path="url(#${id}c)"><rect width="60" height="60" fill="url(#${id}b)"/>${stripe}</g>
      <path d="M11 32c0-3 3-6 8-6h26c4 0 6 3 5 7l-2 8c-1 2-3 3-5 3H18c-4 0-7-4-7-12z" fill="url(#${id}v)" stroke="rgba(0,0,0,.6)" stroke-width="1.2"/>
      <path d="M16 30h18c-6 1-12 4-16 8-1-2-2-5-2-8z" fill="rgba(255,255,255,.35)"/>
      <path d="M15 52h30l-2 4H17z" fill="#111"/>
      <text x="44" y="22" font-family="Russo One, sans-serif" font-size="11" fill="#fff" stroke="#000" stroke-width="2.4" paint-order="stroke" text-anchor="middle">${r.num}</text>
    </svg>`;
  }

  const WEAPON_ICON = {
    mg: '<path d="M8 40h52l6-6h18v10H70l-4 4H30l-4 14H16l4-14H8z" fill="currentColor"/><path d="M84 36h10M84 42h10" stroke="currentColor" stroke-width="3"/>',
    shotgun: '<path d="M6 42h60l10-6h18v8H72l-6 4H34l-10 16H12l8-16H6z" fill="currentColor"/><rect x="40" y="34" width="16" height="6" fill="currentColor"/>',
    rocket: '<path d="M10 50 60 30l26 6-16 20-52 6z" fill="currentColor"/><path d="M86 36l8 4-8 4" fill="currentColor"/><path d="M10 50l-6-8M10 58l-6 6" stroke="currentColor" stroke-width="4"/>',
    emp: '<circle cx="40" cy="50" r="18" fill="none" stroke="currentColor" stroke-width="6"/><path d="M58 50h30M74 36l-6 14h10l-6 14" stroke="currentColor" stroke-width="5" fill="none"/>',
    oil: '<path d="M40 14c10 16 20 26 20 40a20 20 0 0 1-40 0c0-14 10-24 20-40z" fill="currentColor"/><ellipse cx="66" cy="82" rx="26" ry="7" fill="currentColor" opacity=".6"/>',
    flame: '<path d="M8 50h34l8-6h8v12h-8l-8-6" fill="currentColor"/><path d="M60 50c10-12 20-10 32-16-6 8-4 12 2 16-8 0-12 6-14 12-2-6-10-8-20-12z" fill="currentColor"/>',
    hook: '<path d="M10 50h50" stroke="currentColor" stroke-width="5" stroke-dasharray="6 4"/><path d="M60 50h14c8 0 12 6 12 12s-4 12-12 12m0-24c8-6 8-18 0-24" stroke="currentColor" stroke-width="6" fill="none"/>',
    mines: '<circle cx="36" cy="56" r="14" fill="currentColor"/><circle cx="70" cy="44" r="12" fill="currentColor"/><g stroke="currentColor" stroke-width="4"><path d="M36 36v-6M36 76v6M16 56h-6M56 56h6M70 26v-6M70 62v6M52 44h-6M88 44h6"/></g>',
    rail: '<path d="M6 44h70v12H6z" fill="currentColor"/><path d="M14 40h54M14 60h54" stroke="currentColor" stroke-width="3"/><path d="M78 50h18" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>',
    chain: '<g fill="none" stroke="currentColor" stroke-width="6"><ellipse cx="22" cy="50" rx="12" ry="8"/><ellipse cx="44" cy="50" rx="12" ry="8"/><ellipse cx="66" cy="50" rx="12" ry="8"/></g><circle cx="86" cy="50" r="10" fill="currentColor"/>'
  };
  function weaponIcon(w, size) {
    return `<svg viewBox="0 0 100 100" width="${size || 24}" height="${size || 24}" class="wicon" style="color:${w.color}">${WEAPON_ICON[w.id]}</svg>`;
  }

  // Значки спецклеток трассы (viewBox -10..10)
  const CELL_ICON = {
    boost: '<path d="M-6-6 0 0-6 6M0-6 6 0 0 6" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    ammo: '<rect x="-6" y="-4.5" width="12" height="9" rx="1.5" fill="#fff"/><path d="M-6-1h12" stroke="#7a1020" stroke-width="1.5"/>',
    repair: '<path d="M-2-7h4v5h5v4H2v5h-4V2h-5v-4h5z" fill="#fff"/>',
    nitro: '<path d="M2-8-5 1h4l-1 7 7-9H1z" fill="#fff"/>',
    shield: '<path d="M0-7 6-4.5v4C6 3 3 6 0 7.5-3 6-6 3-6-.5v-4z" fill="#fff"/>',
    hazard: '<path d="M0-7 7 6H-7z" fill="#fff"/><path d="M0-3v4" stroke="#8a1b00" stroke-width="2"/><circle cy="3.6" r="1.1" fill="#8a1b00"/>'
  };
  const CELL_COLOR = { boost: '#18c3ff', ammo: '#ff3355', repair: '#2fdc74', nitro: '#22e3ff', shield: '#4f7dff', hazard: '#ff7a00' };

  G.Art = { gemIcon, helmet, weaponIcon, CELL_ICON, CELL_COLOR };
})(window);
