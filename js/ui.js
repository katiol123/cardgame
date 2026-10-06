/* Интерфейс: трасса, поле «три в ряд», панели, анимации и игровой цикл зрителя. */
(function () {
  'use strict';
  const { GEMS, CFG, WEAPONS, Art, RaceF: F, CELL_FX, SPECIALS } = window;
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
  const DIR = { front: 'вперёд', rear: 'назад', both: 'круговой' };

  const state = { race: null, track: null, selected: 0, speed: 2, paused: false, epoch: 0, raceId: 0, acting: -1 };

  // ---------- время ----------
  function untilUnpaused() {
    return new Promise(res => { const t = () => (state.paused ? setTimeout(t, 80) : res()); t(); });
  }
  async function wait(ms) {
    await untilUnpaused();
    return new Promise(r => setTimeout(r, ms / state.speed));
  }
  function setSpeed(s) {
    state.speed = s;
    document.documentElement.style.setProperty('--ts', (1 / Math.min(s, 6)).toFixed(3));
    document.querySelectorAll('#speedGroup .seg').forEach(b => b.classList.toggle('active', +b.dataset.speed === s));
  }

  // =====================================================================
  //                               ТРАССА
  // =====================================================================
  const TV = {
    tokens: {},
    build(track, racers) {
      const svg = $('#trackSvg');
      const N = track.N, step = track.step;
      let h = `<defs>
        <pattern id="grass" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="#0d1a14"/>
          <path d="M0 40L40 0M-10 10L10-10M30 50L50 30" stroke="#122a1d" stroke-width="6"/>
        </pattern>
        <pattern id="checker" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#fff"/><rect width="4" height="4" fill="#111"/><rect x="4" y="4" width="4" height="4" fill="#111"/>
        </pattern>
        <radialGradient id="vign" cx="50%" cy="50%" r="70%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></radialGradient>
        <filter id="blur8"><feGaussianBlur stdDeviation="8"/></filter>
        <filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <rect x="-50" y="-50" width="1150" height="850" fill="url(#grass)"/>
      <g opacity=".5">${TV.scenery()}</g>
      <path d="${track.path}" fill="none" stroke="#000" stroke-width="86" opacity=".55" filter="url(#blur8)"/>
      <path d="${track.path}" fill="none" stroke="#e8e8e8" stroke-width="70"/>
      <path d="${track.path}" fill="none" stroke="#e0262f" stroke-width="70" stroke-dasharray="14 14"/>
      <path d="${track.path}" fill="none" stroke="#24272f" stroke-width="60"/>
      <path d="${track.path}" fill="none" stroke="#2c303a" stroke-width="44"/>
      <path class="track-flow" d="${track.path}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="56" stroke-dasharray="2 38"/>`;
      // клетки
      h += '<g class="cells">';
      track.cells.forEach(c => {
        const deg = c.a * 180 / Math.PI;
        let cls = 'cell';
        if (c.corner === 2) cls += ' c-hair'; else if (c.corner) cls += ' c-turn';
        if (c.kind !== 'plain') cls += ' k-' + c.kind;
        const w = step - 4;
        h += `<g class="${cls}" transform="translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) rotate(${deg.toFixed(1)})">
          <rect x="${-w / 2}" y="-23" width="${w}" height="46" rx="6"/>`;
        if (c.corner) {
          const s = c.turn > 0 ? 1 : -1;
          h += `<path class="chev" d="M-6 ${-14 * s} 3 ${-14 * s + 0} M-6 ${-14 * s} 0 ${-8 * s}" />`;
          h += `<path class="chev-line" d="M${-w / 2 + 2} ${s * 21}h${w - 4}"/>`;
        }
        if (c.kind !== 'plain') {
          h += `<g transform="rotate(${(-deg).toFixed(1)})"><circle r="11" fill="${Art.CELL_COLOR[c.kind]}" opacity=".9"/><g transform="scale(.9)">${Art.CELL_ICON[c.kind]}</g></g>`;
        } else if (c.i % 6 === 0) {
          h += `<text class="cnum" transform="rotate(${(-deg).toFixed(1)})" y="4">${c.i}</text>`;
        }
        h += '</g>';
      });
      h += '</g>';
      // старт/финиш
      const sp = track.pointAt(-0.5);
      h += `<g transform="translate(${sp.x} ${sp.y}) rotate(${sp.a * 180 / Math.PI})">
        <rect x="-5" y="-31" width="10" height="62" fill="url(#checker)"/>
        <rect x="-5" y="-31" width="10" height="62" fill="none" stroke="#000" stroke-width="1"/></g>
        <g transform="translate(${sp.x} ${sp.y + 54})"><text class="start-label">СТАРТ · ФИНИШ</text></g>`;
      // подписи поворотов
      track.zones.forEach(z => {
        const mid = track.cells[Math.floor((z.from + z.to) / 2)];
        const n = (mid.turn > 0 ? 1 : -1);
        const x = mid.x + Math.cos(mid.a + n * Math.PI / 2) * 52, y = mid.y + Math.sin(mid.a + n * Math.PI / 2) * 52;
        h += `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)})"><text class="zone-label ${z.sev === 2 ? 'hair' : ''}">${z.sev === 2 ? '⚠ СЕРПАНТИН' : 'ПОВОРОТ'}</text></g>`;
      });
      h += '<g id="tokens"></g><rect x="-50" y="-50" width="1150" height="850" fill="url(#vign)" pointer-events="none"/>';
      svg.innerHTML = h;
      // фишки
      const layer = svg.querySelector('#tokens');
      TV.tokens = {};
      racers.forEach(r => {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'token');
        g.innerHTML = `<circle class="t-aura" r="22" fill="${r.color}"/><circle class="t-shadow" r="15" cy="3" fill="#000" opacity=".5"/>
          <circle class="t-base" r="15" fill="#11141c" stroke="${r.color}" stroke-width="3"/>
          <g transform="translate(-14 -15)">${Art.helmet(r, 28)}</g>`;
        g.addEventListener('click', () => selectRacer(r.id));
        layer.appendChild(g);
        TV.tokens[r.id] = { el: g, pos: r.pos, lat: 0, along: 0, tLat: 0, tAlong: 0, hop: null, scale: 1, shake: 0 };
      });
      TV.relayout(true);
      if (!TV.raf) TV.raf = requestAnimationFrame(TV.frame);
    },
    scenery() {
      // деревья/камни/трибуны вокруг трассы — декоративно
      let s = '';
      const rnd = window.mulberry32(7);
      for (let i = 0; i < 70; i++) {
        const x = rnd() * 1020, y = 30 + rnd() * 690;
        const t = rnd();
        if (t < 0.6) s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(6 + rnd() * 10).toFixed(0)}" fill="#163524"/>`;
        else s += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${(8 + rnd() * 14).toFixed(0)}" height="${(6 + rnd() * 8).toFixed(0)}" rx="2" fill="#1c2620" transform="rotate(${(rnd() * 90).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
      }
      // трибуны
      s += '<g fill="#1a1f2b" stroke="#2c3446"><rect x="380" y="672" width="300" height="34" rx="4"/><rect x="760" y="250" width="70" height="20" rx="3" transform="rotate(-20 760 250)"/></g>';
      s += '<g fill="#3a4258">' + Array.from({ length: 28 }, (_, i) => `<circle cx="${392 + i * 10.4}" cy="${682 + (i % 2) * 10}" r="3" fill="hsl(${(i * 47) % 360} 70% 60%)"/>`).join('') + '</g>';
      return s;
    },
    // распределяет фишки на одной клетке по «полосам»
    relayout(snap) {
      const race = state.race, groups = {};
      race.racers.forEach(r => {
        const t = TV.tokens[r.id];
        const key = Math.round(t.hop ? t.hop.to : r.pos);
        (groups[key] = groups[key] || []).push(r);
      });
      const LAT = [-12, 12, 0, -12, 12, 0, -12, 12];
      const ALONG = [6, 6, -8, -10, -10, 14, 14, -16];
      Object.values(groups).forEach(list => {
        list.sort((a, b) => a.id - b.id);
        list.forEach((r, k) => {
          const t = TV.tokens[r.id];
          if (list.length === 1) { t.tLat = 0; t.tAlong = 0; }
          else { t.tLat = LAT[k % 8]; t.tAlong = ALONG[k % 8] * (list.length > 2 ? 1 : 0); }
          if (snap) { t.lat = t.tLat; t.along = t.tAlong; t.pos = r.pos; }
        });
      });
    },
    hop(id, from, to, dur) {
      const t = TV.tokens[id];
      if (t.hop) { t.hop.resolve(); }
      return new Promise(res => {
        t.hop = { from, to, start: performance.now(), dur: Math.max(60, dur), resolve: res };
        TV.relayout(false);
      });
    },
    xy(id) {
      const t = TV.tokens[id];
      const p = state.track.pointAt(t.pos + t.along / state.track.step);
      return { x: p.x - Math.sin(p.a) * t.lat, y: p.y + Math.cos(p.a) * t.lat };
    },
    frame(now) {
      const track = state.track;
      if (track) {
        for (const id in TV.tokens) {
          const t = TV.tokens[id];
          let lift = 0;
          if (t.hop) {
            const k = (now - t.hop.start) / t.hop.dur;
            if (k >= 1) { t.pos = t.hop.to; const r = t.hop.resolve; t.hop = null; r(); }
            else {
              const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
              t.pos = t.hop.from + (t.hop.to - t.hop.from) * e;
              const fr = Math.abs(t.pos - t.hop.from);
              lift = Math.abs(Math.sin(Math.PI * (fr % 1 || (fr > 0 ? 1 : 0))));
              if (Math.abs(t.hop.to - t.hop.from) < 1) lift = Math.sin(Math.PI * k);
            }
          }
          t.lat += (t.tLat - t.lat) * 0.15;
          t.along += (t.tAlong - t.along) * 0.15;
          const p = track.pointAt(t.pos + t.along / track.step);
          let x = p.x - Math.sin(p.a) * t.lat, y = p.y + Math.cos(p.a) * t.lat - lift * 10;
          if (t.shake > 0) { x += (Math.random() - 0.5) * t.shake; y += (Math.random() - 0.5) * t.shake; t.shake *= 0.9; if (t.shake < 0.3) t.shake = 0; }
          const sc = 1 + lift * 0.28;
          t.el.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${sc.toFixed(3)})`);
        }
      }
      TV.raf = requestAnimationFrame(TV.frame);
    },
    updateClasses() {
      const race = state.race;
      race.racers.forEach(r => {
        const t = TV.tokens[r.id];
        t.el.classList.toggle('selected', r.id === state.selected);
        t.el.classList.toggle('acting', r.id === state.acting);
        t.el.classList.toggle('wrecked', r.skip > 0);
        t.el.classList.toggle('done', r.finished);
      });
      // выбранный и ходящий — сверху
      const layer = $('#tokens');
      [state.acting, state.selected].forEach(id => { if (id >= 0 && TV.tokens[id]) layer.appendChild(TV.tokens[id].el); });
    }
  };

  // ---------- эффекты на трассе ----------
  let trackFx, boardFx;
  function trackMapper() {
    let sc = 1, ox = 0, oy = 0;
    const upd = () => {
      const w = trackFx.w, h = trackFx.h;
      sc = Math.min(w / 1020, h / 700); ox = (w - 1020 * sc) / 2; oy = (h - 700 * sc) / 2;
    };
    return { map: (x, y) => ({ x: ox + x * sc, y: oy + (y - 20) * sc, s: sc }), upd };
  }

  const FXS = {
    // полёт снаряда: path(t) -> точка; на каждом кадре вызывается emit
    fly(a, b, dur, arc, emit) {
      const nx = -(b.y - a.y), ny = b.x - a.x, L = Math.hypot(nx, ny) || 1;
      const P = t => ({ x: a.x + (b.x - a.x) * t + nx / L * Math.sin(Math.PI * t) * arc, y: a.y + (b.y - a.y) * t + ny / L * Math.sin(Math.PI * t) * arc });
      return trackFx.task(dur, (t, dt) => emit(P(t), t, dt, P));
    },
    async shot(att, hit, a, b) {
      const w = att.weapon, fx = trackFx, col = w.color, D = 0.55 / Math.min(state.speed, 4);
      switch (w.fx) {
        case 'bullets':
          await fx.task(D, t => {
            for (let i = 0; i < 5; i++) {
              const ti = t * 1.8 - i * 0.18; if (ti < 0 || ti > 1) continue;
              const j = (i % 2 ? 1 : -1) * 3;
              fx.add({ x: a.x + (b.x - a.x) * ti + j, y: a.y + (b.y - a.y) * ti + j, vx: 0, vy: 0, size: 2.6, color: col, max: 0.12, shape: 'dot' });
            }
            if (Math.random() < 0.5) fx.burst(a.x, a.y, '#fff3b0', 1, { speed: 120, life: 0.15, g: 0 });
          });
          break;
        case 'pellets':
          fx.flash(a.x, a.y, col, 26);
          await fx.task(D * 0.7, t => {
            for (let i = 0; i < 8; i++) {
              const sp = (i - 3.5) * 4 * t;
              const nx = -(b.y - a.y), ny = b.x - a.x, L = Math.hypot(nx, ny) || 1;
              fx.add({ x: a.x + (b.x - a.x) * t + nx / L * sp, y: a.y + (b.y - a.y) * t + ny / L * sp, vx: 0, vy: 0, size: 2, color: col, max: 0.1, shape: 'dot' });
            }
          });
          break;
        case 'rocket':
          await FXS.fly(a, b, D * 1.5, 70, p => {
            fx.add({ x: p.x, y: p.y, vx: 0, vy: 0, size: 5, color: '#fff', max: 0.08, shape: 'dot' });
            fx.burst(p.x, p.y, col, 2, { speed: 60, life: 0.35, g: 0, size: 4 });
            fx.smoke(p.x, p.y, 1, { size: 6, life: 0.9 });
          });
          break;
        case 'pulse':
          await FXS.fly(a, b, D * 1.2, 0, (p, t) => {
            if (Math.random() < 0.35) fx.ring(p.x, p.y, col, 18, { life: 0.35, width: 3 });
            fx.add({ x: p.x, y: p.y, vx: 0, vy: 0, size: 7, color: col, max: 0.1, shape: 'dot' });
          });
          if (hit) for (let i = 0; i < 3; i++) fx.beam(b.x + (Math.random() - 0.5) * 50, b.y - 40, b.x, b.y, col, { width: 2, jitter: 14, life: 0.4 });
          break;
        case 'oil':
          await FXS.fly(a, b, D * 1.1, 40, p => fx.add({ x: p.x, y: p.y, vx: 0, vy: 0, size: 7, color: '#6c5cff', max: 0.12, shape: 'dot' }));
          fx.smoke(b.x, b.y, 14, { color: 'rgba(40,30,90,', size: 12, life: 1.6, vy: 10 });
          break;
        case 'flame':
          await fx.task(D * 1.3, () => {
            for (let i = 0; i < 6; i++) {
              const ang = Math.atan2(b.y - a.y, b.x - a.x) + (Math.random() - 0.5) * 0.35, v = Math.hypot(b.x - a.x, b.y - a.y) * (2 + Math.random());
              fx.add({ x: a.x, y: a.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, size: 5 + Math.random() * 4, color: Math.random() < 0.5 ? '#ffb000' : '#ff4a00', max: 0.35, shape: 'dot', drag: 0.9, g: -60 });
            }
          });
          break;
        case 'hook': {
          let head = a;
          await FXS.fly(a, b, D, 0, p => { head = p; fx.beam(a.x, a.y, p.x, p.y, '#9aa3b5', { width: 2, life: 0.06 }); });
          fx.burst(b.x, b.y, '#fff', 8, { speed: 140, life: 0.3, g: 0 });
          await fx.task(D * 0.6, t => fx.beam(a.x, a.y, b.x + (a.x - b.x) * t, b.y + (a.y - b.y) * t, '#c0c8d8', { width: 2.5, life: 0.06 }));
          void head;
          break;
        }
        case 'mines':
          await FXS.fly(a, b, D, 45, p => fx.add({ x: p.x, y: p.y, vx: 0, vy: 0, size: 4, color: col, max: 0.15, shape: 'dot' }));
          break;
        case 'beam':
          fx.flash(a.x, a.y, col, 40, 0.4);
          await fx.task(D * 0.5, t => { if (Math.random() < 0.6) fx.burst(a.x, a.y, col, 2, { speed: 80, life: 0.3, g: 0 }); });
          fx.beam(a.x, a.y, b.x, b.y, col, { width: 8, life: 0.6 });
          fx.beam(a.x, a.y, b.x, b.y, '#fff', { width: 3, life: 0.4, jitter: 6 });
          break;
        case 'chain':
          await fx.task(D * 0.7, t => {
            const ang = Math.atan2(b.y - a.y, b.x - a.x) - 1.4 + t * 2.8, R = Math.max(26, Math.hypot(b.x - a.x, b.y - a.y));
            fx.beam(a.x, a.y, a.x + Math.cos(ang) * R, a.y + Math.sin(ang) * R, '#d6d3d1', { width: 2, life: 0.08 });
          });
          break;
      }
    },
    impact(b, w, hit) {
      const fx = trackFx;
      if (hit.hit) {
        fx.flash(b.x, b.y, w.color, 44, 0.35);
        fx.ring(b.x, b.y, w.color, 46, { life: 0.5, width: 5 });
        fx.burst(b.x, b.y, w.color, 26, { speed: 260, life: 0.6, g: 120 });
        fx.burst(b.x, b.y, '#fff', 8, { speed: 320, life: 0.3, g: 0 });
        fx.smoke(b.x, b.y, 6, { size: 10 });
        if (hit.dmg > 0) fx.text(b.x, b.y - 26, '−' + hit.dmg, '#ff3d5a', { size: 22 });
        if (hit.absorbed > 0) fx.text(b.x + 26, b.y - 6, '🛡' + hit.absorbed, '#7fa6ff', { size: 15, life: 1.1 });
        if (hit.effects.length) fx.text(b.x, b.y + 26, hit.effects[0], '#ffe08a', { size: 12, life: 1.4, rise: 25 });
        TV.tokens[hit.target.id].shake = 10;
        if (hit.target.burn) FXS.fire(hit.target.id, 0.8);
      } else {
        fx.text(b.x, b.y - 24, 'ПРОМАХ', '#aab4c8', { size: 14 });
        fx.burst(b.x + 20, b.y + 10, '#aab4c8', 6, { speed: 120, life: 0.3, g: 0 });
      }
      if (hit.crashed) FXS.crash(hit.target.id);
    },
    crash(id) {
      const p = TV.xy(id), fx = trackFx;
      fx.flash(p.x, p.y, '#ff7a00', 80, 0.6);
      fx.ring(p.x, p.y, '#ffb000', 90, { life: 0.8, width: 8 });
      fx.burst(p.x, p.y, '#ff7a00', 50, { speed: 380, life: 1, g: 200, size: 6 });
      fx.burst(p.x, p.y, '#ffe08a', 20, { speed: 200, life: 0.7, g: 0 });
      fx.smoke(p.x, p.y, 24, { size: 16, life: 2.2 });
      fx.text(p.x, p.y - 40, 'АВАРИЯ!', '#ff7a00', { size: 26, life: 1.8 });
      TV.tokens[id].shake = 22;
    },
    fire(id, dur) {
      return trackFx.task(dur / Math.min(state.speed, 4), () => {
        const p = TV.xy(id);
        trackFx.add({ x: p.x + (Math.random() - 0.5) * 18, y: p.y + (Math.random() - 0.5) * 10, vx: 0, vy: -60 - Math.random() * 40, size: 4 + Math.random() * 4, color: Math.random() < 0.5 ? '#ff9a00' : '#ff3d00', max: 0.5, shape: 'dot', drag: 0.95 });
      });
    },
    trail(id, color, dur) {
      return trackFx.task(dur, () => {
        const p = TV.xy(id);
        trackFx.add({ x: p.x + (Math.random() - 0.5) * 8, y: p.y + (Math.random() - 0.5) * 8, vx: 0, vy: 0, size: 5, color, max: 0.45, shape: 'dot' });
      });
    },
    confetti(id) {
      const p = TV.xy(id);
      ['#ffd23f', '#ff3355', '#22e3ff', '#2fdc74', '#b75cff', '#fff'].forEach(c => trackFx.burst(p.x, p.y, c, 14, { speed: 320, life: 1.6, g: 260, shape: 'dot', size: 4, up: 160 }));
      trackFx.ring(p.x, p.y, '#ffd23f', 100, { life: 1, width: 6 });
    }
  };

  // =====================================================================
  //                            ПОЛЕ «ТРИ В РЯД»
  // =====================================================================
  const BV = {
    els: new Map(), n: 8,
    gemEl(g) {
      const e = el('div', 'gem');
      e.innerHTML = `<div class="gem-in">${Art.gemIcon(g.type)}</div><div class="lock"><svg viewBox="0 0 100 100"><path d="M10 30 90 70M10 70 90 30M50 0v100" stroke="rgba(200,240,255,.8)" stroke-width="5"/></svg><b></b></div>`;
      BV.style(e, g);
      return e;
    },
    style(e, g) {
      e.className = `gem t${g.type}` + (g.special ? ' sp-' + g.special : '') + (g.lock ? ' locked' : '');
      e.dataset.type = g.type;
      const b = e.querySelector('.lock b'); if (b) b.textContent = g.lock || '';
      if (+e.dataset.t !== g.type) { e.querySelector('.gem-in').innerHTML = Art.gemIcon(g.type); e.dataset.t = g.type; }
    },
    place(e, i, fall) {
      const r = (i / BV.n) | 0, c = i % BV.n;
      if (fall !== undefined) e.style.setProperty('--fall', fall);
      e.style.transform = `translate(${c * 100}%, ${r * 100}%)`;
    },
    sync(snap, deal) {
      const board = $('#board');
      const seen = new Set();
      snap.forEach((g, i) => {
        if (!g) return;
        seen.add(g.id);
        let e = BV.els.get(g.id);
        if (!e) {
          e = BV.gemEl(g); BV.els.set(g.id, e);
          if (deal) {
            e.style.transition = 'none';
            const c = i % BV.n, r = (i / BV.n) | 0;
            e.style.transform = `translate(${c * 100}%, ${(r - 9) * 100}%)`;
            board.appendChild(e);
            void e.offsetWidth;
            e.style.transition = '';
            e.style.transitionDelay = `${(c * 25 + (7 - r) * 35) * (+getComputedStyle(document.documentElement).getPropertyValue('--ts') || 0.5)}ms`;
            setTimeout(() => { e.style.transitionDelay = ''; }, 900);
          } else board.appendChild(e);
        }
        BV.style(e, g);
        BV.place(e, i, deal ? 1.4 : undefined);
      });
      for (const [id, e] of BV.els) if (!seen.has(id)) { e.remove(); BV.els.delete(id); }
    },
    reset(snap) {
      $('#board').innerHTML = '';
      BV.els.clear();
      BV.sync(snap, true);
    },
    cellPx() { return $('#board').getBoundingClientRect().width / BV.n; },
    center(i) { const s = BV.cellPx(); return { x: (i % BV.n + 0.5) * s, y: (((i / BV.n) | 0) + 0.5) * s }; },
    async animate(match, racer) {
      const ep = state.epoch;
      const alive = () => ep === state.epoch;
      const [a, b] = match.swap;
      const ea = BV.els.get(match.before[a].id), eb = BV.els.get(match.before[b].id);
      // если DOM рассинхронизирован — просто показываем результат
      if (!ea || !eb) { BV.sync(match.final); return; }
      ea.classList.add('picked'); eb.classList.add('picked');
      BV.cursor(a, b);
      await wait(260); if (!alive()) return;
      BV.place(ea, b); BV.place(eb, a);
      await wait(260); if (!alive()) return;
      ea.classList.remove('picked'); eb.classList.remove('picked');
      $('#boardOverlay').querySelectorAll('.cursor').forEach(c => c.remove());
      let wi = 0;
      for (const wave of match.waves) {
        if (!alive()) return;
        const s = BV.cellPx();
        // спецэффекты активаций
        wave.activations.forEach(act => BV.activation(act, s));
        // сгорание блоков
        const flyCount = {};
        wave.cleared.forEach(c => {
          const e = BV.els.get(c.id);
          const p = BV.center(c.i);
          const col = c.type < 6 ? GEMS[c.type].color : '#fff';
          boardFx.burst(p.x, p.y, col, 9, { speed: 160, life: 0.55, g: 260, size: 3.5 });
          boardFx.flash(p.x, p.y, col, s * 0.7, 0.25);
          if (e) { e.classList.add('pop'); }
          if (c.type < 6) {
            flyCount[c.type] = (flyCount[c.type] || 0) + 1;
            if (flyCount[c.type] <= 3) Flyers.send(e, c.type);
          }
        });
        wave.created.forEach(cr => {
          const e = BV.els.get(cr.id);
          if (e) { BV.style(e, cr); e.classList.add('born'); setTimeout(() => e.classList.remove('born'), 700); }
          const p = BV.center(cr.i);
          boardFx.ring(p.x, p.y, '#fff', s * 0.9, { life: 0.5, width: 4 });
          BV.toast(SPECIALS[cr.special].name + '!', p, '#fff');
        });
        if (wi > 0) BV.combo(wi + 1, wave.mult);
        await wait(300);
        wave.cleared.forEach(c => { const e = BV.els.get(c.id); if (e) { e.remove(); BV.els.delete(c.id); } });
        if (!alive()) return;
        // падение
        const board = $('#board');
        wave.after.forEach((g, i) => {
          if (!g) return;
          let e = BV.els.get(g.id);
          const r = (i / BV.n) | 0, c = i % BV.n;
          if (!e) {
            e = BV.gemEl(g); BV.els.set(g.id, e);
            const start = wave.spawn[g.id] !== undefined ? wave.spawn[g.id] : r - 8;
            e.style.transition = 'none';
            e.style.transform = `translate(${c * 100}%, ${start * 100}%)`;
            board.appendChild(e);
            void e.offsetWidth;
            e.style.transition = '';
            BV.place(e, i, 0.6 + (r - start) * 0.12);
          } else {
            BV.style(e, g);
            BV.place(e, i, 0.8);
          }
        });
        await wait(340);
        wi++;
      }
      if (!alive()) return;
      if (match.shuffled) {
        BV.toast('ПЕРЕМЕШИВАНИЕ', { x: BV.cellPx() * 4, y: BV.cellPx() * 4 }, '#ffd23f');
        $('#board').classList.add('shuffling');
        await wait(300);
        BV.reset(match.final);
        $('#board').classList.remove('shuffling');
      } else BV.sync(match.final);
    },
    cursor(a, b) {
      const ov = $('#boardOverlay');
      [a, b].forEach(i => {
        const c = el('div', 'cursor');
        c.style.left = (i % BV.n) * 12.5 + '%'; c.style.top = ((i / BV.n) | 0) * 12.5 + '%';
        ov.appendChild(c);
      });
    },
    activation(act, s) {
      const fx = boardFx, p = { x: (act.c + 0.5) * s, y: (act.r + 0.5) * s }, W = s * BV.n;
      const col = act.type < 6 ? GEMS[act.type].color : '#fff';
      if (act.special === 'row') { fx.beam(0, p.y, W, p.y, col, { width: s * 0.25, life: 0.5 }); fx.beam(0, p.y, W, p.y, '#fff', { width: s * 0.08, life: 0.4, jitter: 6 }); }
      else if (act.special === 'col') { fx.beam(p.x, 0, p.x, W, col, { width: s * 0.25, life: 0.5 }); fx.beam(p.x, 0, p.x, W, '#fff', { width: s * 0.08, life: 0.4, jitter: 6 }); }
      else if (act.special === 'bomb') { fx.flash(p.x, p.y, col, s * 2.6, 0.45); fx.ring(p.x, p.y, col, s * 2.6, { life: 0.55, width: 8 }); fx.burst(p.x, p.y, col, 30, { speed: 420, life: 0.6, g: 0 }); $('#boardPanel').classList.add('quake'); setTimeout(() => $('#boardPanel').classList.remove('quake'), 400); }
      else {
        fx.flash(p.x, p.y, '#fff', s * 3, 0.5);
        act.area.slice(0, 24).forEach(i => { const q = BV.center(i); fx.beam(p.x, p.y, q.x, q.y, i % 2 ? '#b75cff' : '#22e3ff', { width: 3, jitter: s * 0.3, life: 0.5 }); });
      }
    },
    toast(text, p, color) {
      const t = el('div', 'btoast', text);
      t.style.left = p.x + 'px'; t.style.top = p.y + 'px'; t.style.color = color;
      $('#boardOverlay').appendChild(t);
      setTimeout(() => t.remove(), 1200);
    },
    combo(n, mult) {
      const t = el('div', 'combo', `КОМБО ×${n}<small>бонус ×${fmt(mult)}</small>`);
      $('#boardOverlay').appendChild(t);
      setTimeout(() => t.remove(), 1100);
    },
    lockFx(cells) {
      const s = BV.cellPx();
      cells.forEach(i => { const p = BV.center(i); boardFx.burst(p.x, p.y, '#bff4ff', 10, { speed: 120, life: 0.6, g: 0 }); boardFx.ring(p.x, p.y, '#5ef2ff', s * 0.7, { life: 0.5 }); });
    }
  };

  // Полёт «энергии» от сгоревших блоков к показателям гонщика
  const Flyers = {
    target(type) { return document.querySelector(['#m-speed', '#m-nitro', '#m-charge', '#m-shield', '#m-hp', '#m-grip'][type]); },
    send(src, type) {
      const tg = Flyers.target(type);
      if (!src || !tg) return;
      const a = src.getBoundingClientRect(), b = tg.getBoundingClientRect();
      if (!a.width || !b.width) return;
      const f = el('div', 'flyer');
      f.style.setProperty('--c', GEMS[type].color);
      $('#flyers').appendChild(f);
      const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
      const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * 160, my = Math.min(y0, y1) - 60 - Math.random() * 80;
      const dur = (650 + Math.random() * 250) / Math.min(state.speed, 4);
      const anim = f.animate([
        { transform: `translate(${x0}px,${y0}px) scale(1.2)`, opacity: 1 },
        { transform: `translate(${mx}px,${my}px) scale(.9)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${x1}px,${y1}px) scale(.4)`, opacity: 0.8 }
      ], { duration: dur, easing: 'cubic-bezier(.4,0,.7,1)' });
      anim.onfinish = () => { f.remove(); tg.classList.remove('bump'); void tg.offsetWidth; tg.classList.add('bump'); };
    }
  };

  // =====================================================================
  //                       КАРТОЧКА ГОНЩИКА / ТАБЛИЦА
  // =====================================================================
  function statBar(label, v, hint, cls) {
    let segs = '';
    for (let i = 1; i <= 20; i++) segs += `<i class="${i <= v ? 'on' : ''}"></i>`;
    return `<div class="stat ${cls}"><div class="stat-l">${label}<span>${hint}</span></div><div class="segs">${segs}</div><b>${v}</b></div>`;
  }

  function placeOf(r) { return state.race.standings().indexOf(r) + 1; }

  const Card = {
    render(r) {
      const w = r.weapon;
      const eff = [];
      if (w.effect.slow) eff.push(`замедление −${w.effect.slow}`);
      if (w.effect.burn) eff.push(`поджог ${w.effect.burn.dmg}×${w.effect.burn.turns}`);
      if (w.effect.lock) eff.push(`заморозка ${w.effect.lock} блоков`);
      if (w.effect.pull) eff.push(`кража скорости ${w.effect.pull}`);
      if (w.effect.aoe) eff.push('по площади');
      if (w.effect.pierce) eff.push('пробивает щит');
      if (w.effect.knock) eff.push(`отброс на ${w.effect.knock}`);
      if (w.effect.strip) eff.push('срыв сцепления');
      $('#racerCard').innerHTML = `
        <div class="rc-id" style="--rc:${r.color}">
          <div class="rc-ava">${Art.helmet(r, 74)}</div>
          <div class="rc-name"><small>№${r.num}</small>${r.name}</div>
          <div class="rc-tags"><span class="tag place" id="c-place"></span><span class="tag" id="c-lap"></span><span class="tag status" id="c-status"></span></div>
        </div>
        <div class="rc-stats">
          ${statBar('Разгон', r.stats.accel, `+${fmt(F.accel(r))} скор./ход`, 's-acc')}
          ${statBar('Макс. скорость', r.stats.top, `до ${fmt(F.vmaxRaw(r))} кл.`, 's-top')}
          ${statBar('Маневренность', r.stats.handling, `поворот ≤${fmt(F.corner(r, 1, 0))} · уворот ${Math.round(CFG.dodgePer * r.stats.handling * 100)}%`, 's-han')}
        </div>
        <div class="rc-gauges">
          <div class="speedo" id="m-speed">${Card.speedo()}</div>
          <div class="meters">
            <div class="meter hp" id="m-hp"><label>Прочность <b id="c-hp"></b></label><div class="bar"><i class="fill" id="c-hpbar"></i><i class="shield" id="m-shield"></i></div></div>
            <div class="meter sh"><label>Щит <b id="c-sh"></b></label><div class="bar thin"><i class="fill" id="c-shbar"></i></div></div>
            <div class="meter ni" id="m-nitro"><label>Нитро <b id="c-ni"></b></label><div class="pips" id="c-nipips">${'<i></i>'.repeat(CFG.nitroMax)}</div></div>
            <div class="meter gr" id="m-grip"><label>Сцепление <b id="c-gr"></b></label><div class="pips" id="c-grpips">${'<i></i>'.repeat(CFG.gripMax)}</div></div>
          </div>
        </div>
        <div class="rc-weapon" id="m-charge" style="--wc:${w.color}">
          <div class="w-head">${Art.weaponIcon(w, 40)}<div><b>${w.name}</b><small>${w.desc}</small></div></div>
          <div class="w-stats">
            <span><em>Урон</em>${Math.round(w.dmg * CFG.dmgMul)}</span>
            <span><em>Дальность</em>${w.range} · ${DIR[w.dir]}</span>
            <span><em>Точность</em>${Math.round(w.acc * 100)}%</span>
            <span><em>Заряд</em>${w.charge}</span>
          </div>
          <div class="w-eff">${eff.map(e => `<i>${e}</i>`).join('') || '<i>без эффекта</i>'}</div>
          <div class="w-charge"><i id="c-charge"></i><span id="c-chargetxt"></span></div>
        </div>`;
      Card.update(r);
    },
    speedo() {
      return `<svg viewBox="0 0 120 100">
        <defs><linearGradient id="spg" x1="0" x2="1"><stop offset="0" stop-color="#22e3ff"/><stop offset=".6" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff3355"/></linearGradient></defs>
        <path d="M18 82 A48 48 0 1 1 102 82" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="10" stroke-linecap="round"/>
        <path id="sp-arc" d="M18 82 A48 48 0 1 1 102 82" fill="none" stroke="url(#spg)" stroke-width="10" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/>
        <g id="sp-max"><path d="M60 8v10" stroke="#fff" stroke-width="3"/></g>
        <g id="sp-corner"><path d="M60 8v10" stroke="#b75cff" stroke-width="3"/></g>
        <g id="sp-needle"><path d="M60 58 L57 56 60 18 63 56z" fill="#fff"/></g>
        <circle cx="60" cy="58" r="6" fill="#1b1f2b" stroke="#fff" stroke-width="2"/>
        <text x="60" y="86" text-anchor="middle" class="sp-val" id="sp-val">0</text>
        <text x="60" y="97" text-anchor="middle" class="sp-unit">кл./ход</text>
      </svg>`;
    },
    update(r) {
      if (!$('#c-place')) return;
      const race = state.race, VMAX = 10.5;
      const ang = v => -125 + clamp(v / VMAX, 0, 1) * 250;
      $('#sp-arc').setAttribute('stroke-dasharray', `${clamp(r.speed / VMAX, 0, 1) * 100} 100`);
      $('#sp-needle').setAttribute('transform', `rotate(${ang(r.speed)} 60 58)`);
      $('#sp-max').setAttribute('transform', `rotate(${ang(F.vmax(r))} 60 58)`);
      $('#sp-corner').setAttribute('transform', `rotate(${ang(F.corner(r, 1))} 60 58)`);
      $('#sp-val').textContent = fmt(r.speed);
      const place = placeOf(r);
      $('#c-place').textContent = r.finished && !r.dnf ? `🏁 ${r.place} место` : `${place} / 16`;
      $('#c-lap').textContent = `Круг ${race.lapOf(r)}/${race.track.laps} · клетка ${((Math.floor(r.pos) % race.track.N) + race.track.N) % race.track.N}`;
      let st = 'в гонке', sc = '';
      if (r.finished) { st = r.dnf ? 'не финишировал' : 'финишировал'; sc = 'ok'; }
      else if (r.skip) { st = `🔧 ремонт: ${r.skip} х.`; sc = 'bad'; }
      else if (r.burn) { st = `🔥 горит: ${r.burn.turns} х.`; sc = 'warn'; }
      else if (r.id === state.acting) { st = 'ходит'; sc = 'go'; }
      const s = $('#c-status'); s.textContent = st; s.className = 'tag status ' + sc;
      $('#c-hp').textContent = Math.round(r.hp);
      $('#c-hpbar').style.width = r.hp + '%';
      $('#c-hpbar').classList.toggle('low', r.hp < 35);
      $('#m-shield').style.width = clamp(r.shield, 0, 100) + '%';
      $('#c-sh').textContent = Math.round(r.shield);
      $('#c-shbar').style.width = r.shield / CFG.shieldMax * 100 + '%';
      $('#c-ni').textContent = `${Math.floor(r.nitro)}/${CFG.nitroMax}`;
      document.querySelectorAll('#c-nipips i').forEach((p, i) => p.classList.toggle('on', i < Math.floor(r.nitro)));
      $('#m-nitro').classList.toggle('full', r.nitro >= CFG.nitroMax);
      $('#c-gr').textContent = `${Math.floor(r.grip)} (≤${fmt(F.corner(r, 1))})`;
      document.querySelectorAll('#c-grpips i').forEach((p, i) => p.classList.toggle('on', i < Math.floor(r.grip)));
      const ch = r.charge / r.weapon.charge;
      $('#c-charge').style.width = ch * 100 + '%';
      $('#c-chargetxt').textContent = ch >= 1 ? 'ЗАРЯЖЕНО — ищет цель' : `заряд ${Math.floor(r.charge)}/${r.weapon.charge}`;
      $('#m-charge').classList.toggle('ready', ch >= 1);
    }
  };

  const Stand = {
    rows: {}, H: 46,
    build(race) {
      const list = $('#standList');
      list.innerHTML = '';
      Stand.rows = {};
      race.racers.forEach(r => {
        const row = el('div', 'srow');
        row.style.setProperty('--rc', r.color);
        row.innerHTML = `<div class="s-place"></div><div class="s-ava">${Art.helmet(r, 34)}</div>
          <div class="s-main"><div class="s-name">${r.name} ${Art.weaponIcon(r.weapon, 16)}</div>
          <div class="s-bars"><i class="s-hp"></i><i class="s-ch"></i></div></div>
          <div class="s-side"><span class="s-lap"></span><span class="s-st"></span></div>`;
        row.addEventListener('click', () => selectRacer(r.id));
        list.appendChild(row);
        Stand.rows[r.id] = row;
      });
      list.style.height = race.racers.length * Stand.H + 'px';
      Stand.update();
    },
    update() {
      const race = state.race;
      race.standings().forEach((r, i) => {
        const row = Stand.rows[r.id];
        row.style.transform = `translateY(${i * Stand.H}px)`;
        row.querySelector('.s-place').textContent = i + 1;
        row.querySelector('.s-hp').style.width = r.hp + '%';
        row.querySelector('.s-ch').style.width = (r.charge / r.weapon.charge * 100) + '%';
        row.querySelector('.s-lap').textContent = r.finished ? (r.dnf ? 'DNF' : '🏁') : `К${race.lapOf(r)}`;
        row.querySelector('.s-st').textContent = r.skip ? '🔧' : r.burn ? '🔥' : r.nitro >= CFG.nitroMax ? '⚡' : '';
        row.classList.toggle('selected', r.id === state.selected);
        row.classList.toggle('acting', r.id === state.acting);
        row.classList.toggle('wrecked', r.skip > 0);
        row.classList.toggle('done', r.finished);
        row.classList.toggle('top3', i < 3);
      });
    },
    flash(id, cls) {
      const row = Stand.rows[id]; if (!row) return;
      row.classList.remove(cls); void row.offsetWidth; row.classList.add(cls);
    }
  };

  function log(html, cls) {
    const box = $('#log');
    const e = el('div', 'le ' + (cls || ''), `<span class="lr">${state.race.round}</span>${html}`);
    box.prepend(e);
    while (box.children.length > 40) box.lastChild.remove();
  }
  const nm = r => `<b style="color:${r.color}">${r.name}</b>`;

  function boardHead() {
    const race = state.race, r = race.racers[state.selected];
    const acting = state.acting === r.id;
    let wait = 0;
    if (!acting && !r.finished) {
      const n = race.order.length;
      for (let k = 1; k <= n; k++) { const idx = (race.turn + k - 1) % n; if (race.order[idx] === r.id) { wait = k - 1; break; } const o = race.racers[race.order[idx]]; if (o.finished) continue; }
    }
    const locks = race.racers[state.selected].board.grid.filter(g => g && g.lock).length;
    $('#boardHead').innerHTML = `<div class="bh-ava">${Art.helmet(r, 30)}</div><div class="bh-t"><b>Поле: ${r.name}</b>
      <small>${r.finished ? 'гонка окончена' : r.skip ? 'мотоцикл в ремонте' : acting ? 'делает ход…' : wait === 0 ? 'следующий ход' : 'ход через ' + wait}${locks ? ` · ❄ заморожено: ${locks}` : ''}</small></div>
      <div class="bh-turn ${acting ? 'on' : ''}">${acting ? 'ХОД' : ''}</div>`;
    $('#boardPanel').classList.toggle('active-turn', acting);
  }

  function header() {
    const race = state.race;
    $('#roundNo').textContent = race.round;
    const cur = race.racers[state.acting] || race.current;
    $('#turnName').innerHTML = cur ? nm(cur) : '—';
    const lead = race.standings()[0];
    $('#leaderName').innerHTML = nm(lead);
  }

  function showGains(res) {
    const g = res.gains, box = $('#gains');
    if (!g) { box.innerHTML = ''; return; }
    const items = [
      [g.speed, 'скорость', GEMS[0].color], [g.nitro, 'нитро', GEMS[1].color], [g.charge, 'заряд', GEMS[2].color],
      [g.shield, 'щит', GEMS[3].color], [g.hp, 'прочность', GEMS[4].color], [g.grip, 'сцепление', GEMS[5].color]
    ].filter(x => Math.abs(x[0]) > 0.05);
    box.innerHTML = `<span class="g-l">Итог хода${res.match.combo > 1 ? ` · комбо ×${res.match.combo}` : ''}:</span>` +
      items.map(x => `<span class="gchip" style="--c:${x[2]}">${x[0] > 0 ? '+' : ''}${fmt(x[0])} ${x[1]}</span>`).join('');
  }

  function banner(text, color) {
    const b = $('#banner');
    b.innerHTML = `<span style="--c:${color || '#ffd23f'}">${text}</span>`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }

  // =====================================================================
  //                         ВЫБОР И ИГРОВОЙ ЦИКЛ
  // =====================================================================
  function selectRacer(id) {
    if (!state.race) return;
    state.selected = id;
    state.epoch++;
    const r = state.race.racers[id];
    const card = $('#racerCard');
    card.classList.remove('swap-in'); void card.offsetWidth; card.classList.add('swap-in');
    Card.render(r);
    $('#boardOverlay').innerHTML = '';
    BV.reset(r.board.snapshot());
    $('#gains').innerHTML = '';
    const bp = $('#boardPanel');
    bp.style.setProperty('--rc', r.color);
    bp.classList.remove('swap-in'); void bp.offsetWidth; bp.classList.add('swap-in');
    boardHead();
    Stand.update();
    TV.updateClasses();
    const p = TV.xy(id);
    trackFx.ring(p.x, p.y, r.color, 40, { life: 0.6, width: 4 });
  }

  async function present(res, rid) {
    const race = state.race, r = res.racer, obs = () => r.id === state.selected;
    const alive = () => rid === state.raceId;
    state.acting = r.id;
    header(); Stand.update(); TV.updateClasses(); boardHead();
    if (obs()) Card.update(r);
    if (res.burn) {
      FXS.fire(r.id, 0.7);
      const p = TV.xy(r.id);
      trackFx.text(p.x, p.y - 24, '🔥 −' + res.burn.dmg, '#ff9a00', { size: 16 });
      if (res.burn.crashed) { FXS.crash(r.id); log(`${nm(r)} сгорает дотла — авария!`, 'bad'); }
    }
    if (res.skipped) {
      const p = TV.xy(r.id);
      trackFx.smoke(p.x, p.y, 6, { size: 8 });
      trackFx.burst(p.x, p.y, '#ffd23f', 6, { speed: 90, life: 0.4, g: 0 });
      if (res.repaired) { trackFx.text(p.x, p.y - 22, 'СНОВА В СТРОЮ', '#2fdc74', { size: 14 }); log(`${nm(r)} починил мотоцикл и возвращается в гонку`, 'good'); }
      await wait(obs() ? 700 : 160);
      return;
    }
    // --- ход на поле ---
    if (obs()) {
      await BV.animate(res.match, r);
      if (!alive()) return;
      showGains(res);
      Card.update(r);
    } else {
      Stand.flash(r.id, 'think');
      await wait(140);
    }
    if (res.match.combo >= 3 || res.match.specials >= 2) log(`${nm(r)}: каскад ×${res.match.combo}, сожжено блоков: ${res.match.totalCleared}`, 'cmb');
    // --- атака ---
    if (res.attack) {
      const att = res.attack;
      const a = TV.xy(r.id);
      for (const hit of att.hits) {
        if (!alive()) return;
        const b = TV.xy(hit.target.id);
        await FXS.shot(att, hit.hit, a, b);
        FXS.impact(b, att.weapon, hit);
        if (hit.target.id === state.selected) {
          const card = $('#racerCard');
          card.classList.remove('hit'); void card.offsetWidth; if (hit.hit) card.classList.add('hit');
          if (hit.locked && hit.locked.length) { BV.sync(hit.target.board.snapshot()); BV.lockFx(hit.locked); }
          Card.update(hit.target);
        }
        if (hit.knockTo !== undefined) TV.hop(hit.target.id, hit.knockFrom, hit.knockTo, 400 / state.speed);
        Stand.flash(hit.target.id, hit.hit ? 'hurt' : 'think');
        log(hit.hit
          ? `${Art.weaponIcon(att.weapon, 14)} ${nm(r)} → ${nm(hit.target)}: <span class="dmg">−${hit.dmg}</span>${hit.absorbed ? ` <span class="abs">(щит ${hit.absorbed})</span>` : ''}${hit.effects.length ? ' · ' + hit.effects.join(', ') : ''}${hit.crashed ? ' · <b class="bad">АВАРИЯ!</b>' : ''}`
          : `${Art.weaponIcon(att.weapon, 14)} ${nm(r)} промахивается по ${nm(hit.target)}`, hit.crashed ? 'bad' : 'atk');
        if (hit.crashed && hit.target.id === state.selected) banner(`${hit.target.name} разбит!`, '#ff7a00');
      }
      await wait(180);
    }
    if (!alive()) return;
    // --- движение ---
    const mv = res.move;
    const cells = mv.to - mv.from;
    const dur = clamp(110 * Math.abs(cells), 260, 1100) / state.speed;
    const p0 = TV.xy(r.id);
    if (mv.boost) {
      trackFx.flash(p0.x, p0.y, '#22e3ff', 40, 0.4);
      trackFx.text(p0.x, p0.y - 26, 'НИТРО!', '#22e3ff', { size: 16 });
      FXS.trail(r.id, '#22e3ff', dur / 1000);
    } else if (r.speed > F.vmax(r) * 0.85) FXS.trail(r.id, r.color, dur / 1000 * 0.8);
    if (mv.brake > 0.3) trackFx.text(p0.x, p0.y + 22, 'ТОРМОЗ', '#ffb3b3', { size: 11, life: 0.9, rise: 10 });
    const hop = TV.hop(r.id, mv.from, mv.to, dur);
    if (obs()) await hop; else await wait(Math.min(dur * state.speed, 230));
    if (!alive()) return;
    TV.relayout(false);
    const p1 = TV.xy(r.id);
    if (mv.skid) {
      trackFx.smoke(p1.x, p1.y, 14, { size: 10, life: 1.4 });
      trackFx.burst(p1.x, p1.y, '#ffd23f', 14, { speed: 200, life: 0.5, g: 0 });
      trackFx.text(p1.x, p1.y - 26, `ЗАНОС! −${mv.skid.dmg}`, '#ffb000', { size: 15 });
      TV.tokens[r.id].shake = 8;
      log(`${nm(r)} влетает в поворот на ${fmt(mv.skid.over + mv.skid.lim)} при пределе ${fmt(mv.skid.lim)} — занос, −${mv.skid.dmg}`, 'warn');
      if (mv.skid.crashed) FXS.crash(r.id);
    }
    if (mv.cellFx) {
      const k = mv.cellFx.kind;
      trackFx.ring(p1.x, p1.y, Art.CELL_COLOR[k], 30, { life: 0.5 });
      trackFx.text(p1.x, p1.y + 24, CELL_FX[k].text, Art.CELL_COLOR[k], { size: 12, life: 1.1, rise: 20 });
      if (mv.cellFx.crashed) FXS.crash(r.id);
    }
    if (mv.finished) {
      FXS.confetti(r.id);
      banner(`${r.name} финиширует ${r.place}-м!`, r.place === 1 ? '#ffd23f' : '#fff');
      log(`🏁 ${nm(r)} финиширует <b>${r.place}-м</b>`, 'good');
    } else {
      const lapBefore = Math.floor(mv.from / race.track.N), lapAfter = Math.floor(mv.to / race.track.N);
      if (lapAfter > lapBefore && lapAfter === race.track.laps - 1 && race.standings()[0] === r && !race._lastLapShown) {
        race._lastLapShown = true;
        banner('ПОСЛЕДНИЙ КРУГ!', '#ff3355');
      }
    }
    if (obs()) Card.update(r);
    const sel = race.racers[state.selected];
    if (sel !== r) Card.update(sel);
  }

  async function runRace() {
    const rid = state.raceId, race = state.race;
    while (!race.over && rid === state.raceId) {
      await untilUnpaused();
      if (rid !== state.raceId) return;
      const res = race.playTurn();
      if (!res) break;
      await present(res, rid);
      if (rid !== state.raceId) return;
      state.acting = -1;
      Stand.update(); TV.updateClasses(); header(); boardHead();
    }
    if (rid === state.raceId) setTimeout(showResults, 900);
  }

  function newRace(start) {
    state.raceId++;
    state.epoch++;
    state.acting = -1;
    state.track = state.track || window.buildTrack();
    state.race = new window.Race({ track: state.track });
    state.selected = 0;
    TV.build(state.track, state.race.racers);
    Stand.build(state.race);
    $('#log').innerHTML = '';
    selectRacer(0);
    header();
    $('#results').classList.remove('show');
    if (start) countdown().then(() => { log('Гонка началась! Дистанция — ' + state.track.laps + ' круга', 'good'); runRace(); });
  }

  async function countdown() {
    const cd = $('#countdown');
    cd.classList.add('show');
    for (const [t, c] of [['3', '#ff3355'], ['2', '#ff3355'], ['1', '#ffd23f'], ['СТАРТ!', '#2fdc74']]) {
      cd.innerHTML = `<div class="lights">${[0, 1, 2].map(i => `<i class="${(t === '3' && i < 1) || (t === '2' && i < 2) || (t === '1') ? 'red' : t === 'СТАРТ!' ? 'green' : ''}"></i>`).join('')}</div><div class="cd-num" style="--c:${c}">${t}</div>`;
      await new Promise(r => setTimeout(r, 650));
    }
    cd.classList.remove('show');
    state.race.racers.forEach(r => { const p = TV.xy(r.id); trackFx.smoke(p.x, p.y, 4, { size: 8, vx: -30 }); });
  }

  function showResults() {
    const race = state.race;
    const st = race.racers.slice().sort((a, b) => a.place - b.place);
    $('#podium').innerHTML = [st[1], st[0], st[2]].map((r, i) => `<div class="pod p${[2, 1, 3][i]}" style="--rc:${r.color}">
      <div class="pod-ava">${Art.helmet(r, i === 1 ? 90 : 70)}</div><b>${r.name}</b><div class="pod-col">${[2, 1, 3][i]}</div></div>`).join('');
    $('#resultsTable').innerHTML = `<table><thead><tr><th>#</th><th>Гонщик</th><th>Р/С/М</th><th>Оружие</th><th>Попадания</th><th>Урон</th><th>Аварии</th><th>Финиш</th></tr></thead><tbody>` +
      st.map(r => `<tr><td>${r.place}</td><td>${nm(r)}</td><td>${r.stats.accel}/${r.stats.top}/${r.stats.handling}</td><td>${Art.weaponIcon(r.weapon, 16)} ${r.weapon.name.split(' ')[0]}</td><td>${r.hits}/${r.shots}</td><td>${Math.round(r.dmgDealt)}</td><td>${r.crashes}</td><td>${r.dnf ? 'не успел' : 'раунд ' + r.finishRound}</td></tr>`).join('') +
      '</tbody></table>';
    $('#results').classList.add('show');
    FXS.confetti(st[0].id);
  }

  // ---------- правила ----------
  function rules() {
    const gems = GEMS.map((g, i) => `<div class="rg"><div class="gem t${i} static"><div class="gem-in">${Art.gemIcon(i)}</div></div><div><b style="color:${g.color}">${g.name}</b><p>${g.desc}</p></div></div>`).join('');
    const sp = Object.entries(SPECIALS).map(([k, s]) => `<div class="rg"><div class="gem t${k === 'nova' ? 6 : 2} sp-${k} static"><div class="gem-in">${Art.gemIcon(k === 'nova' ? 6 : 2)}</div></div><div><b>${s.name}</b><p>${s.desc}</p></div></div>`).join('');
    const cells = Object.entries(CELL_FX).map(([k, c]) => `<div class="rc"><svg viewBox="-12 -12 24 24" width="26" height="26"><circle r="11" fill="${Art.CELL_COLOR[k]}"/>${Art.CELL_ICON[k]}</svg><b>${c.name}</b> ${c.text}</div>`).join('');
    const weap = `<table class="wt"><thead><tr><th></th><th>Оружие</th><th>Урон</th><th>Дальн.</th><th>Сектор</th><th>Заряд</th><th>Точн.</th><th>Эффект</th></tr></thead><tbody>` +
      WEAPONS.map(w => `<tr><td>${Art.weaponIcon(w, 22)}</td><td>${w.name}</td><td>${Math.round(w.dmg * CFG.dmgMul)}</td><td>${w.range}</td><td>${DIR[w.dir]}</td><td>${w.charge}</td><td>${Math.round(w.acc * 100)}%</td><td>${w.desc}</td></tr>`).join('') + '</tbody></table>';
    $('#rulesBody').innerHTML = `
      <section><h3>Очерёдность</h3><p>16 гонщиков-ИИ ходят строго по очереди (№1 → №16, затем новый раунд). За ход гонщик: <b>1)</b> делает один обмен на своём поле «три в ряд»; <b>2)</b> получает бонусы от сгоревших блоков (каскады дают множитель ×1,5, ×2…); <b>3)</b> стреляет, если оружие заряжено и цель в секторе; <b>4)</b> передвигает фишку по трассе на число клеток, равное скорости.</p></section>
      <section><h3>Характеристики (1–20, у всех одинаковая сумма — ${CFG.STAT_TOTAL})</h3>
        <ul>
          <li><b class="c-acc">Разгон</b> — прирост скорости за ход: ${CFG.accBase} + ${CFG.accPer}×Разгон, и каждый блок «Топлива» усиливает его на ${Math.round(CFG.fuelPer * 100)}%. Сопротивление воздуха съедает ${Math.round(CFG.drag * 100)}% скорости каждый ход — без хорошего разгона не удержать темп, не восстановиться после поворота, удара или аварии.</li>
          <li><b class="c-top">Макс. скорость</b> — потолок на прямых: ${CFG.vmaxBase} + ${CFG.vmaxPer}×Скорость клеток за ход и сила нитро-рывка (${CFG.nitroBase} + ${CFG.nitroPer}×Скорость). Повреждённый мотоцикл теряет до ${Math.round(CFG.hpSpeedFactor * 100)}% потолка.</li>
          <li><b class="c-han">Маневренность</b> — допустимая скорость в повороте: ${CFG.cornerBase} + ${CFG.cornerPer}×Маневр + ${CFG.gripPer}×Сцепление (на серпантине −${CFG.hairpinPenalty}), и шанс уворота от атак ${CFG.dodgePer * 100}% за единицу.</li>
          <li><b>Прочность</b> — 100 у всех. На нуле — авария: ${CFG.crashSkip} хода ремонта, скорость 0, затем возврат с ${CFG.crashHp} прочности.</li>
        </ul>
        <p>Перед поворотом гонщик тормозит (не более ${CFG.brakePower} скорости за ход). Не успел сбросить — <b>занос</b>: урон ${CFG.skidDamage} за каждую единицу превышения и потеря скорости. Коэффициенты подобраны симуляцией тысяч гонок так, чтобы вклад каждой характеристики в итоговое место был одинаковым.</p></section>
      <section><h3>Шесть блоков</h3><div class="rgrid">${gems}</div></section>
      <section><h3>Спецблоки</h3><div class="rgrid">${sp}</div></section>
      <section><h3>Трасса</h3><p>Трасса из ${state.track.N} клеток, ${state.track.laps} круга. Жёлтые клетки — повороты, красные — крутой серпантин. Спецклетки срабатывают, если закончить на них ход:</p><div class="rcells">${cells}</div></section>
      <section><h3>Оружие</h3><p>«Боезапас» заряжает оружие. Полный заряд — выстрел по лучшей цели в секторе (вперёд / назад / вокруг на дальность в клетках). Шанс попадания = точность × (1 − уворот цели). Щит поглощает урон первым.</p>${weap}</section>`;
  }

  // ---------- легенда блоков ----------
  function gemLegend() {
    $('#gemLegend').innerHTML = GEMS.map((g, i) => `<div class="gl" title="${g.desc}"><div class="gem t${i} static mini"><div class="gem-in">${Art.gemIcon(i)}</div></div><span><b style="color:${g.color}">${g.name}</b><small>${g.short}</small></span></div>`).join('');
    $('#trackLegend').innerHTML = `<span><i class="lg turn"></i>поворот</span><span><i class="lg hair"></i>серпантин</span>` +
      Object.entries(CELL_FX).map(([k, c]) => `<span><svg viewBox="-12 -12 24 24" width="16" height="16"><circle r="11" fill="${Art.CELL_COLOR[k]}"/>${Art.CELL_ICON[k]}</svg>${c.name}</span>`).join('');
  }

  function introGrid() {
    const tmp = new window.Race({ track: state.track });
    $('#introGrid').innerHTML = tmp.racers.map(r => `<div class="ig" style="--rc:${r.color}">${Art.helmet(r, 44)}<span>${r.name}</span></div>`).join('');
  }

  // =====================================================================
  //                                 СТАРТ
  // =====================================================================
  function init() {
    state.track = window.buildTrack();
    const tm = trackMapper();
    trackFx = new window.FX($('#trackFx'));
    trackFx.map = tm.map; trackFx.onResize = tm.upd; tm.upd();
    boardFx = new window.FX($('#boardFx'));
    window.addEventListener('resize', () => { trackFx.resize(); boardFx.resize(); });
    new ResizeObserver(() => { trackFx.resize(); boardFx.resize(); }).observe($('#trackWrap'));
    new ResizeObserver(() => boardFx.resize()).observe($('#board'));
    setSpeed(2);
    gemLegend();
    introGrid();
    newRace(false);
    rules();

    $('#btnStart').onclick = () => { $('#intro').classList.remove('show'); newRace(true); };
    $('#btnAgain').onclick = () => newRace(true);
    $('#btnRestart').onclick = () => newRace(true);
    const openRules = () => $('#rules').classList.add('show');
    $('#btnRules').onclick = openRules; $('#btnRules2').onclick = openRules;
    document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => $('#' + b.dataset.close).classList.remove('show'); });
    $('#rules').addEventListener('click', e => { if (e.target.id === 'rules') e.target.classList.remove('show'); });
    const pause = () => {
      state.paused = !state.paused;
      $('#btnPause').textContent = state.paused ? '▶' : '❚❚';
      $('#btnPause').classList.toggle('active', state.paused);
      document.body.classList.toggle('paused', state.paused);
    };
    $('#btnPause').onclick = pause;
    document.querySelectorAll('#speedGroup .seg').forEach(b => { b.onclick = () => setSpeed(+b.dataset.speed); });
    document.addEventListener('keydown', e => {
      if (e.code === 'Space') { e.preventDefault(); pause(); }
      else if (e.key >= '1' && e.key <= '4') setSpeed([1, 2, 4, 10][+e.key - 1]);
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const st = state.race.standings(), i = st.findIndex(r => r.id === state.selected);
        const j = clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, st.length - 1);
        selectRacer(st[j].id); e.preventDefault();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
