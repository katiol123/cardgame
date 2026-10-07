/* Интерфейс: трасса, поле «три в ряд», панели, анимации и игровой цикл зрителя. */
(function () {
  'use strict';
  const { GEMS, CFG, WEAPONS, Art, RaceF: F, CELL_FX, SPECIALS } = window;
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
  const DIR = { front: 'вперёд', rear: 'назад', both: 'круговой' };

  const state = { race: null, track: null, selected: 0, speed: 2, paused: false, epoch: 0, raceId: 0, acting: -1, skip: false, autopilot: false, rain: false, menuRoster: null };

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
      const step = track.step, th = (track.def && track.def.theme) || { ground: '#0d1a14', stripe: '#122a1d', deco: 'trees' };
      const road = (d, extra) => `<path d="${d}" fill="none" stroke="#000" stroke-width="86" opacity=".55" filter="url(#blur8)"/>
      <path d="${d}" fill="none" stroke="#e8e8e8" stroke-width="70"/>
      <path d="${d}" fill="none" stroke="#e0262f" stroke-width="70" stroke-dasharray="14 14"/>
      <path d="${d}" fill="none" stroke="#24272f" stroke-width="60"/>
      <path d="${d}" fill="none" stroke="#2c303a" stroke-width="44"/>${extra || ''}`;
      let h = `<defs>
        <pattern id="grass" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="${th.ground}"/>
          <path d="M0 40L40 0M-10 10L10-10M30 50L50 30" stroke="${th.stripe}" stroke-width="6"/>
        </pattern>
        <pattern id="checker" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#fff"/><rect width="4" height="4" fill="#111"/><rect x="4" y="4" width="4" height="4" fill="#111"/>
        </pattern>
        <pattern id="waves" width="60" height="20" patternUnits="userSpaceOnUse">
          <rect width="60" height="20" fill="#0b2a44"/><path d="M0 12q15-8 30 0t30 0" stroke="#1d5b86" stroke-width="2" fill="none"/>
        </pattern>
        <radialGradient id="vign" cx="50%" cy="50%" r="70%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></radialGradient>
        <filter id="blur8"><feGaussianBlur stdDeviation="8"/></filter>
      </defs>
      <rect x="-50" y="-50" width="1150" height="850" fill="url(#grass)"/>`;
      if (th.water === 'bottom') h += '<rect class="water" x="-50" y="684" width="1150" height="100" fill="url(#waves)"/>';
      if (th.water === 'right') h += '<rect class="water" x="972" y="-50" width="120" height="850" fill="url(#waves)"/>';
      h += `<g opacity=".6">${TV.scenery(track, th)}</g>`;
      h += road(track.path, `<path class="track-flow" d="${track.path}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="56" stroke-dasharray="2 38"/>`);
      const cellSvg = c => {
        const deg = c.a * 180 / Math.PI;
        let cls = 'cell';
        if (c.corner === 2) cls += ' c-hair'; else if (c.corner) cls += ' c-turn';
        if (c.kind !== 'plain') cls += ' k-' + c.kind;
        if (c.tunnel) cls += ' tun';
        const w = step - 4;
        let o = `<g class="${cls}" transform="translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) rotate(${deg.toFixed(1)})">
          <rect x="${-w / 2}" y="-23" width="${w}" height="46" rx="6"/>`;
        if (c.corner) { const s = c.turn > 0 ? 1 : -1; o += `<path class="chev-line" d="M${-w / 2 + 2} ${s * 21}h${w - 4}"/>`; }
        if (c.kind !== 'plain') o += `<g transform="rotate(${(-deg).toFixed(1)})"><circle r="11" fill="${Art.CELL_COLOR[c.kind]}" opacity=".9"/><g transform="scale(.9)">${Art.CELL_ICON[c.kind]}</g></g>`;
        else if (c.i % 6 === 0) o += `<text class="cnum" transform="rotate(${(-deg).toFixed(1)})" y="4">${c.i}</text>`;
        return o + '</g>';
      };
      // мост «восьмёрки»: второй проход по кругу рисуем поверх
      let bridge = [];
      if (track.crossing) {
        const P = track.def.cross || track.def.points[0], near = track.cells.map((c, k) => [Math.hypot(c.x - P[0], c.y - P[1]), k]).sort((a, b) => a[0] - b[0]);
        const c1 = near[0][1], c2 = near.find(x => Math.abs(x[1] - c1) > track.N / 4)[1];
        for (let k = -2; k <= 2; k++) bridge.push((c2 + k + track.N) % track.N);
      }
      h += '<g class="cells">' + track.cells.filter(c => !bridge.includes(c.i)).map(cellSvg).join('') + '</g>';
      if (bridge.length) {
        const pts = [];
        for (let f = -2.6; f <= 2.6; f += 0.2) { const p = track.pointAt(bridge[2] + f); pts.push(`${p.x.toFixed(1)} ${p.y.toFixed(1)}`); }
        const d = 'M' + pts.join(' L');
        h += `<path d="${d}" fill="none" stroke="#000" stroke-width="100" opacity=".6" filter="url(#blur8)"/>
          <path d="${d}" fill="none" stroke="#8a93a8" stroke-width="76"/><path d="${d}" fill="none" stroke="#24272f" stroke-width="64"/><path d="${d}" fill="none" stroke="#2c303a" stroke-width="44"/>`;
        h += '<g class="cells">' + bridge.map(k => cellSvg(track.cells[k])).join('') + '</g>';
        const bp = track.pointAt(bridge[2]);
        h += `<g transform="translate(${bp.x.toFixed(0)} ${(bp.y - 50).toFixed(0)})"><text class="zone-label bridge">МОСТ</text></g>`;
      }
      // тоннель
      const tun = track.cells.filter(c => c.tunnel);
      if (tun.length) {
        const pts = [];
        for (let f = tun[0].i - 0.5; f <= tun[tun.length - 1].i + 0.5; f += 0.25) { const p = track.pointAt(f); pts.push(`${p.x.toFixed(1)} ${p.y.toFixed(1)}`); }
        h += `<path d="M${pts.join(' L')}" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="74" stroke-linecap="butt"/>
          <path d="M${pts.join(' L')}" fill="none" stroke="rgba(255,210,120,.35)" stroke-width="74" stroke-dasharray="3 22"/>`;
        const m = tun[Math.floor(tun.length / 2)];
        h += `<g transform="translate(${m.x.toFixed(0)} ${(m.y - 48).toFixed(0)})"><text class="zone-label tunnel">ТОННЕЛЬ</text></g>`;
      }
      // старт/финиш
      const sp = track.pointAt(-0.5);
      const nx = -Math.sin(sp.a), ny = Math.cos(sp.a);
      h += `<g transform="translate(${sp.x} ${sp.y}) rotate(${sp.a * 180 / Math.PI})">
        <rect x="-5" y="-31" width="10" height="62" fill="url(#checker)"/>
        <rect x="-5" y="-31" width="10" height="62" fill="none" stroke="#000" stroke-width="1"/></g>
        <g transform="translate(${(sp.x + nx * 52).toFixed(0)} ${(sp.y + ny * 52 + 4).toFixed(0)})"><text class="start-label">СТАРТ · ФИНИШ</text></g>`;
      // подписи: реальные названия поворотов или общие
      const cx = 510, cy = 370;
      const label = (c, text, cls) => {
        let dx = c.x - cx, dy = c.y - cy; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        const x = clamp(c.x + dx * 50, 50, 970), y = clamp(c.y + dy * 46, 40, 705);
        return `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)})"><text class="zone-label ${cls}">${text}</text></g>`;
      };
      if (track.labels && track.labels.length) track.labels.forEach(l => { const c = track.cells[l.cell]; h += label(c, l.text, c.corner === 2 || c.zoneSev === 2 ? 'hair' : c.corner ? '' : 'calm'); });
      else track.zones.forEach(z => { const c = track.cells[Math.floor((z.from + z.to) / 2)]; h += label(c, z.sev === 2 ? '⚠ СЕРПАНТИН' : 'ПОВОРОТ', z.sev === 2 ? 'hair' : ''); });
      h += '<g id="tokens"></g><rect x="-50" y="-50" width="1150" height="850" fill="url(#vign)" pointer-events="none"/>';
      svg.innerHTML = h;
      // фишки
      const layer = svg.querySelector('#tokens');
      TV.tokens = {};
      racers.forEach(r => {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'token' + (r.human ? ' human' : ''));
        g.innerHTML = `<circle class="t-aura" r="22" fill="${r.color}"/><circle class="t-shadow" r="15" cy="3" fill="#000" opacity=".5"/>
          <circle class="t-base" r="15" fill="#11141c" stroke="${r.color}" stroke-width="3"/>
          <g transform="translate(-14 -15)">${Art.helmet(r, 28)}</g>${r.human ? '<text class="t-you" y="-21">ВЫ</text>' : ''}
          <g class="t-lap"><circle cx="13" cy="-12" r="7.5"/><text x="13" y="-8.6">2</text></g>`;
        g.addEventListener('click', () => selectRacer(r.id));
        layer.appendChild(g);
        TV.tokens[r.id] = { el: g, pos: r.pos, lat: 0, along: 0, tLat: 0, tAlong: 0, hop: null, scale: 1, shake: 0 };
      });
      TV.relayout(true);
      if (!TV.raf) TV.raf = requestAnimationFrame(TV.frame);
    },
    // нежить некроманта: призрачные черепа у обочины
    undead(race) {
      const svg = $('#trackSvg'), old = svg.querySelector('#undead');
      if (old) old.remove();
      if (!race.undead || !race.undead.length) return;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('id', 'undead');
      g.innerHTML = race.undead.map(u => {
        const p = race.track.pointAt(u.cell), o = race.racers[u.owner];
        const nx = -Math.sin(p.a), ny = Math.cos(p.a), x = p.x + nx * 30, y = p.y + ny * 30;
        return `<g class="undead${u.alive ? '' : ' gone'}" data-u="${u.id}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
          <title>Нежить некроманта ${o.name} — клетка ${u.cell}: бьёт тех, кто закончит здесь ход</title>
          <line x1="0" y1="0" x2="${(-nx * 30).toFixed(1)}" y2="${(-ny * 30).toFixed(1)}" class="ud-tether"/>
          <g class="ud-body"><circle r="15" class="ud-glow"/>
          <path class="ud-ghost" d="M-10 12 L-10 -2 A10 11 0 0 1 10 -2 L10 12 L6.5 8.5 L3.3 12 L0 8.5 L-3.3 12 L-6.5 8.5 Z" stroke="${o.color}"/>
          <circle cx="-4" cy="-2" r="2.6" class="ud-eye"/><circle cx="4" cy="-2" r="2.6" class="ud-eye"/>
          <path d="M-3 5 h6" class="ud-mouth"/></g></g>`;
      }).join('');
      svg.insertBefore(g, svg.querySelector('#tokens'));
    },
    undeadSync(race) {
      (race.undead || []).forEach(u => { const el = document.querySelector(`#undead [data-u="${u.id}"]`); if (el) el.classList.toggle('gone', !u.alive); });
    },
    scenery(track, th) {
      let s = '';
      const rnd = window.mulberry32(track.N * 31 + track.def.points.length);
      const free = (x, y, d) => track.cells.every(c => Math.hypot(c.x - x, c.y - y) > d);
      let placed = 0;
      for (let i = 0; i < 400 && placed < 90; i++) {
        const x = rnd() * 1020, y = 30 + rnd() * 690;
        if (!free(x, y, 62)) continue;
        if (th.water === 'bottom' && y > 676) continue;
        if (th.water === 'right' && x > 960) continue;
        placed++;
        const t = rnd(), X = x.toFixed(0), Y = y.toFixed(0);
        if (th.deco === 'city') {
          const w = 14 + rnd() * 26, hh = 12 + rnd() * 22;
          s += `<rect x="${X}" y="${Y}" width="${w.toFixed(0)}" height="${hh.toFixed(0)}" rx="2" fill="#1b2232" stroke="#28324a"/>`;
          if (t < 0.6) s += `<rect x="${(x + 3).toFixed(0)}" y="${(y + 3).toFixed(0)}" width="3" height="3" fill="#ffd27a" opacity=".7"/><rect x="${(x + 9).toFixed(0)}" y="${(y + 3).toFixed(0)}" width="3" height="3" fill="#ffd27a" opacity=".5"/>`;
        } else if (th.deco === 'desert') {
          if (t < 0.5) s += `<ellipse cx="${X}" cy="${Y}" rx="${(6 + rnd() * 12).toFixed(0)}" ry="${(4 + rnd() * 7).toFixed(0)}" fill="#3a3220"/>`;
          else s += `<circle cx="${X}" cy="${Y}" r="${(5 + rnd() * 8).toFixed(0)}" fill="#2a3318"/>`;
        } else if (th.deco === 'walls') {
          if (t < 0.45) s += `<rect x="${X}" y="${Y}" width="${(20 + rnd() * 30).toFixed(0)}" height="5" rx="2" fill="#4a4a48" transform="rotate(${(rnd() * 180).toFixed(0)} ${X} ${Y})"/>`;
          else if (t < 0.8) s += `<circle cx="${X}" cy="${Y}" r="${(6 + rnd() * 9).toFixed(0)}" fill="#18361f"/>`;
          else s += `<rect x="${X}" y="${Y}" width="14" height="11" fill="#2b2a2a" stroke="#555"/><path d="M${x - 1} ${Y}l8 -7 8 7" fill="#5a2a1f"/>`;
        } else {
          if (t < 0.75) s += `<circle cx="${X}" cy="${Y}" r="${(6 + rnd() * 11).toFixed(0)}" fill="#163524"/><circle cx="${(x - 2).toFixed(0)}" cy="${(y - 2).toFixed(0)}" r="${(3 + rnd() * 4).toFixed(0)}" fill="#1f4a30"/>`;
          else s += `<rect x="${X}" y="${Y}" width="${(8 + rnd() * 14).toFixed(0)}" height="${(6 + rnd() * 8).toFixed(0)}" rx="2" fill="#1c2620" transform="rotate(${(rnd() * 90).toFixed(0)} ${X} ${Y})"/>`;
        }
      }
      // трибуна у старта
      const sp = track.pointAt(-1.5), nx = -Math.sin(sp.a), ny = Math.cos(sp.a);
      const gx = sp.x - nx * 64, gy = sp.y - ny * 64;
      s += `<g transform="translate(${gx.toFixed(0)} ${gy.toFixed(0)}) rotate(${(sp.a * 180 / Math.PI).toFixed(1)})"><rect x="-130" y="-14" width="260" height="28" rx="4" fill="#1a1f2b" stroke="#2c3446"/>` +
        Array.from({ length: 24 }, (_, i) => `<circle cx="${-120 + i * 10.4}" cy="${-5 + (i % 2) * 10}" r="3" fill="hsl(${(i * 47) % 360} 70% 60%)"/>`).join('') + '</g>';
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
    hop(id, from, to, dur, big) {
      const t = TV.tokens[id];
      if (t.hop) { t.hop.resolve(); }
      return new Promise(res => {
        t.hop = { from, to, start: performance.now(), dur: Math.max(60, dur), resolve: res, big };
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
      if (track) try {
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
              if (t.hop.big) lift = Math.sin(Math.PI * k) * 3;
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
      } catch (e) { console.error(e); }
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
        // круг: значок на фишках 2-го круга и дальше; другой круг, чем у выбранного, — полупрозрачно
        const lap = race.lapOf(r), selLap = race.lapOf(race.racers[state.selected]);
        t.el.classList.toggle('lap2', lap === 2); t.el.classList.toggle('lap3', lap >= 3);
        if (lap >= 2) t.el.querySelector('.t-lap text').textContent = lap;
        t.el.classList.toggle('other-lap', !r.finished && r.id !== state.selected && lap !== selLap);
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
  // broken — сколько сегментов «выбито» поломкой (рисуются красными поверх базового значения)
  function statBar(label, v, hint, cls, broken) {
    let segs = '';
    const b = broken || 0;
    for (let i = 1; i <= 20; i++) segs += `<i class="${i <= v - b ? 'on' : i <= v ? 'broke' : ''}"></i>`;
    return `<div class="stat ${cls}"><div class="stat-l">${label}<span>${hint}</span></div><div class="segs">${segs}</div><b>${b ? `<s>${v}</s> ${v - b}` : v}</b></div>`;
  }
  const brokenOf = (ros, k) => (ros && ros.broken || []).filter(x => x.stat === k).reduce((a, x) => a + x.amount, 0);
  const PARTN = { accel: 'двигатель', top: 'трансмиссия', handling: 'подвеска' };
  const brokeTags = ros => (ros && ros.broken || []).map(b => `<span class="perk brk" title="Сломан ${PARTN[b.stat]}: ${window.Shop.STAT_NAME[b.stat]} −${b.amount}. Без ремонта через ${b.left} эт. спонсор поставит дешёвую запчасть (−${CFG.sponsorLoss} навсегда)">🔧 ${PARTN[b.stat]} −${b.amount}</span>`).join('');

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
      if (w.effect.rush) eff.push(`форсаж стрелку +${w.effect.rush}`);
      if (w.effect.heal) eff.push(`лечит себя +${w.effect.heal}`);
      if (w.effect.aegis) eff.push(`щит себе +${w.effect.aegis}`);
      if (w.effect.smite) eff.push(`по некромантам ×${w.effect.smite}`);
      if (w.effect.nitro) eff.push(`+${w.effect.nitro} нитро стрелку`);
      $('#racerCard').innerHTML = `
        <div class="rc-id" style="--rc:${r.color}">
          <div class="rc-ava">${faceR(r, 84)}</div>
          <div class="rc-name"><small>№${r.num}${r.human ? ' · ВЫ' : ''}</small>${r.name}</div>
          <div class="rc-tags">${tierBadge(r.tier)}${perkBadges(r.perks, true)}${brokeTags(r)}</div>
          <div class="rc-tags"><span class="tag place" id="c-place"></span><span class="tag" id="c-lap"></span><span class="tag status" id="c-status"></span><span class="tag champ" id="c-champ"></span></div>
        </div>
        <div class="rc-stats">
          ${statBar('Разгон', r.baseStats ? r.baseStats.accel : r.stats.accel, `+${fmt(F.accel(r))} скор./ход`, 's-acc', r.baseStats ? r.baseStats.accel - r.stats.accel : 0)}
          ${statBar('Макс. скорость', r.baseStats ? r.baseStats.top : r.stats.top, `до ${fmt(F.vmaxRaw(r))} кл.`, 's-top', r.baseStats ? r.baseStats.top - r.stats.top : 0)}
          ${statBar('Маневренность', r.baseStats ? r.baseStats.handling : r.stats.handling, `поворот ≤${fmt(F.corner(r, 1, 0))} · уворот ${Math.round(CFG.dodgePer * r.stats.handling * 100)}%`, 's-han', r.baseStats ? r.baseStats.handling - r.stats.handling : 0)}
        </div>
        <div class="rc-gauges">
          <div class="speedo" id="m-speed">${Card.speedo()}</div>
          <div class="meters">
            <div class="meter hp" id="m-hp"><label>Прочность <b id="c-hp"></b></label><div class="bar"><i class="fill" id="c-hpbar"></i><i class="shield" id="m-shield"></i></div></div>
            <div class="meter sh"><label>Щит <b id="c-sh"></b></label><div class="bar thin"><i class="fill" id="c-shbar"></i></div></div>
            <div class="meter ni" id="m-nitro"><label>Нитро <b id="c-ni"></b></label><div class="pips" id="c-nipips">${'<i></i>'.repeat(CFG.nitroMax)}</div></div>
            <div class="meter mo" id="m-morale" title="Мораль: спокойствие в давке и твёрдость руки при стрельбе (точность ±10%). Меняется после каждой гонки и плавно стремится к 50"><label>Мораль <b id="c-mo"></b></label><div class="bar thin"><i class="fill" id="c-mobar"></i></div></div>
            <div class="meter gr" id="m-grip"><label>Сцепление <b id="c-gr"></b></label><div class="pips" id="c-grpips">${'<i></i>'.repeat(CFG.gripMax)}</div></div>
          </div>
        </div>
        <div class="rc-weapon" id="m-charge" style="--wc:${w.color}">
          <div class="w-head">${Art.weaponIcon(w, 40)}<div><b>${w.name}</b><small><span style="color:${window.RARITY[w.rarity].color}">${window.RARITY[w.rarity].name}</span>${w.mods && (w.mods.cal + w.mods.mag + w.mods.aim) ? ` · тюнинг ${w.mods.cal}/${w.mods.mag}/${w.mods.aim}` : ''} · ${w.desc}</small></div></div>
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
      else if (r.stunned) { st = '😵 ступор: пропуск хода'; sc = 'warn'; }
      else if (r.burn) { st = `🔥 горит: ${r.burn.turns} х.`; sc = 'warn'; }
      else if (r.id === state.acting) { st = 'ходит'; sc = 'go'; }
      const s = $('#c-status'); s.textContent = st; s.className = 'tag status ' + sc;
      if (Champ.d && Champ.d.points) { const cs = Champ.standings(); $('#c-champ').textContent = `🏆 ${Champ.d.points[r.id]} оч. · ${cs.indexOf(r.id) + 1}-й · ★${(Champ.d.fame ? Champ.d.fame[r.id] : 0) + r.fame}`; }
      $('#c-hp').textContent = Math.round(r.hp);
      $('#c-hpbar').style.width = r.hp + '%';
      $('#c-hpbar').classList.toggle('low', r.hp < 35);
      $('#m-shield').style.width = clamp(r.shield, 0, 100) + '%';
      $('#c-sh').textContent = Math.round(r.shield);
      $('#c-shbar').style.width = r.shield / CFG.shieldMax * 100 + '%';
      $('#c-mo').textContent = `${moraleEmoji(r.morale)} ${r.morale}${window.hasPerk(r, 'cold') ? ' · 🧊 давка ×0,5' : ''}`;
      $('#c-mobar').style.width = r.morale + '%';
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
          <div class="s-main"><div class="s-name">${r.name} ${Art.weaponIcon(r.weapon, 16)}${perkBadges(r.perks)}</div>
          <div class="s-bars"><i class="s-hp"></i><i class="s-ch"></i></div></div>
          <div class="s-side"><span class="s-pts"></span><span><span class="s-st"></span> <span class="s-lap"></span></span></div>`;
        if (r.human) row.classList.add('human');
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
        row.querySelector('.s-pts').textContent = Champ.d && Champ.d.points ? Champ.d.points[r.id] + ' оч.' : '';
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
  const nm = r => `<b class="rn" data-rid="${r.id}" style="color:${r.color}">${r.name}</b>`;

  function boardHead() {
    const race = state.race, r = race.racers[state.selected];
    const acting = state.acting === r.id;
    let wait = 0;
    if (!acting && !r.finished) {
      const n = race.order.length;
      for (let k = 1; k <= n; k++) { const idx = (race.turn + k - 1) % n; if (race.order[idx] === r.id) { wait = k - 1; break; } const o = race.racers[race.order[idx]]; if (o.finished) continue; }
    }
    const locks = race.racers[state.selected].board.grid.filter(g => g && g.lock).length;
    $('#boardHead').innerHTML = `<div class="bh-ava">${Art.helmet(r, 30)}</div><div class="bh-t"><b>Поле: ${r.name}${r.human ? ' (вы)' : ''}</b>
      <small>${r.finished ? (acting && r.human && Input.resolve ? '🎉 шоу для фанатов — зарабатывайте славу!' : '🎉 шоу для фанатов: блоки = ★ слава') : r.skip ? 'мотоцикл в ремонте' : acting && r.human && Input.resolve ? 'поменяйте местами два соседних блока' : acting ? 'делает ход…' : wait === 0 ? 'следующий ход' : 'ход через ' + wait}${locks ? ` · ❄ заморожено: ${locks}` : ''}</small></div>
      <div class="bh-turn ${acting ? 'on' : ''} ${r.human ? 'you' : ''}">${acting ? (r.human && Input.resolve ? 'ВАШ ХОД' : 'ХОД') : ''}</div>`;
    $('#boardPanel').classList.toggle('active-turn', acting);
    $('#boardPanel').classList.toggle('crowded', !r.finished && race.round >= CFG.crowdFrom && race.crowdAround(r) >= 2);
  }

  function header() {
    const race = state.race;
    $('#roundNo').textContent = race.round;
    if (Champ.d && Champ.d.stage < window.TRACKS.length) $('#stageName').innerHTML = `${Champ.d.stage + 1}/${window.TRACKS.length} · ${Champ.def().name}${state.rain ? (Champ.def().wet === 'fog' ? ' 🌫' : ' 🌧') : ''}`;
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

  // всплывающие события перков (чудо, джекпот, месть, слипстрим)
  function showPerkFx(race) {
    race.fx.splice(0).forEach((f, i) => {
      const p = TV.xy(f.id);
      setTimeout(() => trackFx.text(p.x, p.y - 44 - i * 4, f.text, f.color, { size: 13, life: 1.4 }), i * 150);
      if (!/слипстрим/.test(f.text) && (!/ДРОГНУЛ|СРЫВ/.test(f.text) || f.id === state.selected)) log(`${nm(race.racers[f.id])}: ${f.text}`, 'cmb');
    });
  }

  async function present(res, rid) {
    const race = state.race, r = res.racer, obs = () => r.id === state.selected;
    const alive = () => rid === state.raceId;
    state.acting = r.id;
    header(); Stand.update(); TV.updateClasses(); boardHead();
    if (obs()) Card.update(r);
    showPerkFx(race);
    if (res.burn) {
      FXS.fire(r.id, 0.7);
      const p = TV.xy(r.id);
      trackFx.text(p.x, p.y - 24, '🔥 −' + res.burn.dmg, '#ff9a00', { size: 16 });
      if (res.burn.crashed) { FXS.crash(r.id); log(`${nm(r)} сгорает дотла — авария!`, 'bad'); }
    }
    if (res.show) {
      if (obs()) { await BV.animate(res.match, r); if (!alive()) return; }
      else { Stand.flash(r.id, 'think'); await wait(90); }
      const p = TV.xy(r.id);
      if (res.fame) trackFx.text(p.x, p.y - 26, '★+' + res.fame, '#ffd23f', { size: 14 });
      if (obs()) { $('#gains').innerHTML = `<span class="g-l">🎉 Шоу для фанатов:</span><span class="gchip" style="--c:#ffd23f">★+${res.fame} славы</span>${res.match.combo > 1 ? `<span class="gchip" style="--c:#ff9a3c">каскад ×${res.match.combo}</span>` : ''}`; Card.update(r); }
      return;
    }
    if (res.skipped) {
      const p = TV.xy(r.id);
      trackFx.smoke(p.x, p.y, 6, { size: 8 });
      trackFx.burst(p.x, p.y, '#ffd23f', 6, { speed: 90, life: 0.4, g: 0 });
      if (res.stunned) { trackFx.text(p.x, p.y - 22, '😵 СТУПОР', '#c9a6ff', { size: 14 }); if (obs()) log(`${nm(r)} в ступоре после нервного срыва — пропускает ход`, 'warn'); }
      if (res.repaired) { trackFx.text(p.x, p.y - 22, 'СНОВА В СТРОЮ', '#2fdc74', { size: 14 }); log(`${nm(r)} снова в гонке после ремонта`, 'good'); }
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
    if (mv.ram) {
      const pt = TV.xy(mv.ram.target.id);
      trackFx.flash(pt.x, pt.y, '#ff9a3c', 40, 0.35); trackFx.burst(pt.x, pt.y, '#ffd23f', 18, { speed: 220, life: 0.5, g: 100 });
      TV.tokens[mv.ram.target.id].shake = 12; TV.tokens[r.id].shake = 8;
      if (mv.ram.crashed) FXS.crash(mv.ram.target.id);
      if (mv.ram.selfCrashed) FXS.crash(r.id);
    }
    if (mv.undead) {
      const u = mv.undead, el = document.querySelector(`#undead [data-u="${u.u.id}"]`);
      if (el) { el.classList.remove('strike'); void el.getBBox(); el.classList.add('strike'); }
      if (u.banished) {
        trackFx.flash(p1.x, p1.y, '#ffe9a0', 60, 0.5); trackFx.ring(p1.x, p1.y, '#ffe9a0', 46, { life: 0.7 });
        trackFx.burst(p1.x, p1.y, '#fff6d0', 26, { speed: 160, life: 0.8, g: -60 });
        trackFx.text(p1.x, p1.y - 30, '⚜ НЕЖИТЬ ИЗГНАНА', '#ffe9a0', { size: 15 });
        TV.undeadSync(race);
        log(`⚜ ${nm(r)} изгоняет нежить некроманта ${nm(u.owner)} (+★${CFG.banishFame})`, 'good');
      } else {
        trackFx.beam && trackFx.beam(p1.x + 20, p1.y - 30, p1.x, p1.y, '#7dff9a', { life: 0.35, width: 4 });
        if (u.hit) {
          trackFx.flash(p1.x, p1.y, '#7dff9a', 44, 0.35); trackFx.burst(p1.x, p1.y, '#7dff9a', 20, { speed: 200, life: 0.6, g: 0 });
          trackFx.text(p1.x, p1.y - 28, `💀 НЕЖИТЬ −${u.dmg}`, '#7dff9a', { size: 15 });
          TV.tokens[r.id].shake = 10; Stand.flash(r.id, 'hurt');
          if (u.crashed) FXS.crash(r.id);
          if (r.id === state.selected) Card.update(r);
        } else trackFx.text(p1.x, p1.y - 28, '💀 мимо', '#a9ffbf', { size: 12, life: 0.9 });
        log(u.hit ? `💀 Нежить ${nm(u.owner)} бьёт ${nm(r)}: <span class="dmg">−${u.dmg}</span>${u.absorbed ? ` <span class="abs">(щит ${u.absorbed})</span>` : ''}${u.crashed ? ' · <b class="bad">АВАРИЯ!</b>' : ''}` : `💀 Нежить ${nm(u.owner)} промахивается по ${nm(r)}`, u.crashed ? 'bad' : 'atk');
      }
    }
    if (mv.cellFx) {
      const k = mv.cellFx.kind;
      trackFx.ring(p1.x, p1.y, Art.CELL_COLOR[k], 30, { life: 0.5 });
      const hz = k === 'hazard' && race.track.def.hazardName;
      trackFx.text(p1.x, p1.y + 24, hz ? `${hz}! −${mv.cellFx.dmg}` : k === 'hazard' ? `Обломки! −${mv.cellFx.dmg}` : CELL_FX[k].text, Art.CELL_COLOR[k], { size: 12, life: 1.1, rise: 20 });
      if (k === 'jump') {
        trackFx.text(p1.x, p1.y - 30, 'ПРЫЖОК!', '#ffd23f', { size: 18 });
        trackFx.smoke(p1.x, p1.y, 8, { size: 9 });
        const jh = TV.hop(r.id, mv.cellFx.from, mv.cellFx.to, 520 / Math.min(state.speed, 4), true);
        if (obs()) await jh;
        const p2 = TV.xy(r.id); trackFx.burst(p2.x, p2.y, '#ffd23f', 14, { speed: 180, life: 0.5, g: 200 }); trackFx.smoke(p2.x, p2.y, 6, { size: 8 });
      }
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
    showPerkFx(race);
    if (res.fame > 0 && !res.show) { const pf = TV.xy(r.id); trackFx.text(pf.x + 18, pf.y - 40, '★+' + res.fame, '#ffd23f', { size: 12, life: 1 }); }
    if (obs()) Card.update(r);
    const sel = race.racers[state.selected];
    if (sel !== r) Card.update(sel);
  }

  // =====================================================================
  //                         ЧЕМПИОНАТ (12 ЭТАПОВ)
  // =====================================================================
  const SAVE_KEY = 'yarost-trassy-champ-v1';
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const Champ = {
    d: null,
    rollRoster() {
      return window.Gen.rollRoster(Math.random);
    },
    create(roster, human) {
      const z = () => Array(16).fill(0);
      roster.forEach(r => { r.base = Object.assign({}, r.stats); r.morale0 = r.morale; r.buys = []; });
      Champ.d = { v: 1, roster, human, stage: 0, points: z(), wins: z(), podiums: z(), best: Array(16).fill(99), history: [], weather: null, fame: z(), news: null };
      Champ.save();
    },
    get done() { return Champ.d && Champ.d.stage >= window.TRACKS.length; },
    def() { return window.TRACKS[Champ.d.stage]; },
    standings() {
      const d = Champ.d;
      return window.RACERS.map((_, i) => i).sort((a, b) => d.points[b] - d.points[a] || d.wins[b] - d.wins[a] || d.podiums[b] - d.podiums[a] || d.best[a] - d.best[b] || a - b);
    },
    // первый этап — жеребьёвка, дальше лидер чемпионата стартует последним
    grid() { return Champ.d.stage === 0 ? shuffle(window.RACERS.map((_, i) => i)) : Champ.standings().reverse(); },
    weather() {
      const d = Champ.d, def = Champ.def();
      if (!d.weather || d.weather.stage !== d.stage) d.weather = { stage: d.stage, rain: Math.random() < (def.rain || 0) };
      return d.weather.rain;
    },
    award(race) {
      const d = Champ.d, row = {};
      const rankBefore = Champ.standings(); // позиции в таблице до этапа
      Champ.rankBefore = rankBefore;
      race.racers.forEach(r => {
        const pts = window.POINTS_TABLE[r.place - 1] || 0;
        d.points[r.id] += pts;
        if (r.place === 1) d.wins[r.id]++;
        if (r.place <= 3) d.podiums[r.id]++;
        d.best[r.id] = Math.min(d.best[r.id], r.place);
        const prize = window.ECON.prize[r.place - 1] || 0;
        const mult = r.perks.includes('press') ? 1.4 : 1;
        const earned = Math.round((prize + r.fame) * mult);
        d.fame[r.id] += earned;
        row[r.id] = { place: r.place, pts, prize, fame: r.fame, show: r.showFame, earned, press: mult > 1, dnf: !!r.dnf, hits: r.hits, shots: r.shots, dmg: Math.round(r.dmgDealt), crashes: r.crashes, nerves: r.nerves, rank: 0 };
      });
      // мораль: место, аварии и движение в таблице чемпионата (с 3-го этапа — до этого таблица слишком плотная)
      const rankAfter = Champ.standings();
      // слава за действия в гонке (без призовых за место): больше всех — кураж, меньше всех — уныние
      const acts = race.racers.map(r => r.fame), top = Math.max(...acts), bottom = Math.min(...acts);
      race.racers.forEach(r => {
        const shift = d.stage >= 2 ? rankBefore.indexOf(r.id) - rankAfter.indexOf(r.id) : 0;
        row[r.id].rankShift = shift;
        row[r.id].rank = rankAfter.indexOf(r.id) + 1;
        row[r.id].kills = r.kills;
        row[r.id].mo = window.Gen.moraleAfter(window.Shop.ensure(d.roster[r.id]), {
          crashes: r.crashes, kills: r.kills, rankShift: shift,
          fameTop: r.fame === top && top > bottom, fameBottom: r.fame === bottom && top > bottom
        });
        // поломки: новые, самопочинка механиком, дешёвые запчасти спонсора
        row[r.id].brk = window.Gen.afterRaceDamage(d.roster[r.id], r.breaks, Math.random);
        d.roster[r.id].champRank = row[r.id].rank;
      });
      d.history.push({ track: Champ.def().id, rain: d.weather && d.weather.rain, row });
      d.stage++;
      Champ.save();
      return row;
    },
    save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(Champ.d)); } catch (e) { /* хранилище недоступно */ } },
    load() {
      try {
        const s = JSON.parse(localStorage.getItem(SAVE_KEY));
        if (!s || s.v !== 1) return null;
        s.fame = s.fame || Array(16).fill(0); if (Array.isArray(s.news)) s.news = null;
        s.roster.forEach((r, i) => { window.Shop.ensure(r); if (!r.face) r.face = 1000003 * (i + 1) + 7; });
        return s;
      } catch (e) { return null; }
    },
    clear() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* */ } }
  };
  const RN = id => window.RACERS[id];
  const nmId = id => `<b class="rn" data-rid="${id}" style="color:${RN(id).color}">${RN(id).name}</b>`;
  // лицо гонщика (настроение — по морали); если лица нет (старое сохранение) — шлем
  const faceRos = (id, ros, size) => ros && ros.face ? window.Faces.svg(ros.face, ros.morale, size, RN(id).color) : helmetId(id, size);
  const faceId = (id, size) => faceRos(id, Champ.d && Champ.d.roster && Champ.d.roster[id], size);
  const faceR = (r, size) => r.face ? window.Faces.svg(r.face, r.morale, size, r.color) : Art.helmet(r, size);
  const helmetId = (id, size) => Art.helmet({ id, num: id + 1, color: RN(id).color }, size);

  // =====================================================================
  //                       ХОД ИГРОКА (ввод на поле)
  // =====================================================================
  const Input = {
    resolve: null, sel: -1, start: null, hintT: 0,
    get active() { return !!this.resolve && state.race && state.selected === state.race.current.id; },
    wait(race) {
      const r = race.current;
      const p = new Promise(res => { Input.resolve = res; });
      if (state.selected !== r.id) selectRacer(r.id);
      state.acting = r.id;
      header(); Stand.update(); TV.updateClasses(); boardHead(); Card.update(r);
      document.body.classList.add('your-turn');
      BV.toast('ВАШ ХОД!', { x: BV.cellPx() * 4, y: BV.cellPx() * 4 }, '#2fdc74');
      Input.advise(race, r);
      Input.armHint();
      return p;
    },
    finish(move) {
      const f = Input.resolve; if (!f) return;
      Input.resolve = null; Input.clearSel(); Input.clearHint();
      document.body.classList.remove('your-turn');
      f(move);
    },
    advise(race, r) {
      if (r.finished) { $('#gains').innerHTML = `<span class="g-l">🎉 Шоу для фанатов: каждый сожжённый блок — ★ слава. Каскады и спецблоки — ещё больше!</span>`; return; }
      const crowd = race.crowdAround(r);
      const nerv = crowd >= 2 && race.round >= CFG.crowdFrom;
      const W = window.RaceAI.weights(race, r);
      const top = W.map((w, i) => [w, i]).sort((a, b) => b[0] - a[0]).slice(0, 2).map(x => x[1]);
      $('#gains').innerHTML = (nerv ? `<span class="gchip crowd-warn" style="--c:#c9a6ff">😰 Вокруг толпа (${crowd}) — держи нервы! Мораль ${r.morale}</span>` : '') +
        `<span class="g-l">🔧 Механик: сейчас важнее всего —</span>` + top.map(i => `<span class="gchip" style="--c:${GEMS[i].color}">${GEMS[i].name}</span>`).join('');
    },
    gemAt(i) { const g = state.race.current.board.grid[i]; return g && BV.els.get(g.id); },
    cellAt(ev) {
      const b = $('#board').getBoundingClientRect(), s = b.width / BV.n;
      const c = Math.floor((ev.clientX - b.left) / s), r = Math.floor((ev.clientY - b.top) / s);
      return c < 0 || r < 0 || c >= BV.n || r >= BV.n ? -1 : r * BV.n + c;
    },
    down(ev) {
      if (!Input.active) return;
      const i = Input.cellAt(ev); if (i < 0) return;
      Input.start = { i, x: ev.clientX, y: ev.clientY };
      ev.preventDefault();
    },
    move(ev) {
      const st = Input.start; if (!st || !Input.active) return;
      const dx = ev.clientX - st.x, dy = ev.clientY - st.y, s = BV.cellPx();
      if (Math.max(Math.abs(dx), Math.abs(dy)) < s * 0.4) return;
      const r = (st.i / BV.n) | 0, c = st.i % BV.n;
      const [rr, cc] = Math.abs(dx) > Math.abs(dy) ? [r, c + Math.sign(dx)] : [r + Math.sign(dy), c];
      Input.start = null;
      if (rr < 0 || cc < 0 || rr >= BV.n || cc >= BV.n) return;
      Input.attempt(st.i, rr * BV.n + cc);
    },
    up(ev) {
      const st = Input.start; Input.start = null;
      if (!st || !Input.active) return;
      const i = Input.cellAt(ev); if (i < 0) return;
      const board = state.race.current.board;
      if (Input.sel >= 0 && Input.sel !== i && board.adjacent(Input.sel, i)) Input.attempt(Input.sel, i);
      else if (Input.sel === i) Input.clearSel();
      else { Input.clearSel(); Input.sel = i; const e = Input.gemAt(i); if (e) e.classList.add('picked'); }
    },
    clearSel() { if (Input.sel >= 0) { const e = Input.gemAt(Input.sel); if (e) e.classList.remove('picked'); } Input.sel = -1; },
    async attempt(a, b) {
      Input.clearSel(); Input.armHint();
      const board = state.race.current.board;
      if (board.swapValid(a, b)) { Input.finish([a, b]); return; }
      // неверный ход: качнуть блоки туда-обратно
      const ea = Input.gemAt(a), eb = Input.gemAt(b);
      if (!ea || !eb) return;
      const g = board.grid;
      if ((g[a] && g[a].lock) || (g[b] && g[b].lock)) BV.toast('ЗАМОРОЖЕНО', BV.center(a), '#9eeaff');
      BV.place(ea, b); BV.place(eb, a);
      await new Promise(r => setTimeout(r, 200));
      BV.place(ea, a); BV.place(eb, b);
      [ea, eb].forEach(e => { e.classList.remove('nope'); void e.offsetWidth; e.classList.add('nope'); });
    },
    armHint() {
      Input.clearHint();
      Input.hintT = setTimeout(() => Input.hint(), 9000);
    },
    hint() {
      if (!Input.active) return;
      const r = state.race.current, mv = window.RaceAI.choose(state.race, r);
      mv.forEach(i => { const e = Input.gemAt(i); if (e) e.classList.add('hint'); });
    },
    clearHint() { clearTimeout(Input.hintT); document.querySelectorAll('.gem.hint').forEach(e => e.classList.remove('hint')); }
  };

  // =====================================================================
  //                             ИГРОВОЙ ЦИКЛ
  // =====================================================================
  function syncAll() {
    const race = state.race;
    race.racers.forEach(r => { const t = TV.tokens[r.id]; if (t.hop) { const f = t.hop.resolve; t.hop = null; f(); } t.pos = r.pos; });
    TV.relayout(true);
    TV.undeadSync(race);
    state.acting = -1;
    selectRacer(state.selected);
    header();
  }

  async function runRace() {
    const rid = state.raceId, race = state.race;
    while (!race.over && rid === state.raceId) {
      await untilUnpaused();
      if (rid !== state.raceId) return;
      if (state.skip) { while (!race.over) race.playTurn(); syncAll(); break; }
      let move;
      if (race.needsInput() && !state.autopilot) {
        move = await Input.wait(race);
        if (rid !== state.raceId) return;
        if (state.skip) continue;
      }
      const res = race.playTurn(move || undefined);
      if (!res) break;
      await present(res, rid);
      if (rid !== state.raceId) return;
      state.acting = -1;
      Stand.update(); TV.updateClasses(); header(); boardHead();
    }
    if (rid === state.raceId) { state.skip = false; setTimeout(() => { if (rid === state.raceId) finishRace(); }, 1100); }
  }

  function setupRace() {
    state.raceId++; state.epoch++; state.acting = -1; state.skip = false;
    Input.finish(null); document.body.classList.remove('your-turn');
    const d = Champ.d, def = Champ.def();
    state.track = window.buildTrack(def);
    state.rain = Champ.weather();
    state.race = new window.Race({ track: state.track, roster: d.roster, human: d.human, grid: Champ.grid(), mods: { rain: state.rain } });
    TV.build(state.track, state.race.racers);
    TV.undead(state.race);
    Stand.build(state.race);
    $('#log').innerHTML = '';
    selectRacer(d.human >= 0 ? d.human : state.race.order[0]);
    header();
    gemLegend();
    rules();
    document.body.classList.toggle('player-mode', d.human >= 0);
    trackFx.pre = state.rain ? (def.wet === 'fog' ? Weather.fog : Weather.rain) : null;
  }

  async function startStage() {
    $('#trackIntro').classList.remove('show');
    await countdown();
    log(`Этап ${Champ.d.stage + 1}: ${Champ.def().name}. Дистанция — ${state.track.laps} ${state.track.laps === 1 ? 'круг' : state.track.laps < 5 ? 'круга' : 'кругов'}${state.rain ? ' · ' + (Champ.def().wet === 'fog' ? 'туман' : 'дождь') : ''}`, 'good');
    runRace();
  }

  // ---------- погода ----------
  const Weather = {
    drops: [],
    rain(ctx, dt, fx) {
      const W = fx.w, H = fx.h, D = Weather.drops;
      while (D.length < 140) D.push({ x: Math.random() * W, y: Math.random() * H, v: 500 + Math.random() * 400, l: 8 + Math.random() * 14 });
      ctx.strokeStyle = 'rgba(170,200,255,.35)'; ctx.lineWidth = 1;
      ctx.beginPath();
      D.forEach(d => {
        d.y += d.v * dt; d.x -= d.v * dt * 0.18;
        if (d.y > H) { d.y = -20; d.x = Math.random() * (W + 100); }
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.l * 0.18, d.y - d.l);
      });
      ctx.stroke();
      ctx.fillStyle = 'rgba(40,60,90,.12)'; ctx.fillRect(0, 0, W, H);
    },
    fog(ctx, dt, fx) {
      const t = performance.now() / 1000, W = fx.w, H = fx.h;
      for (let i = 0; i < 6; i++) {
        const x = ((i * 0.23 + t * 0.012 * (1 + i % 3)) % 1.4 - 0.2) * W, y = (0.15 + (i * 0.17) % 0.8) * H, r = W * 0.25;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(200,210,220,.16)'); g.addColorStop(1, 'rgba(200,210,220,0)');
        ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
  };

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

  // =====================================================================
  //                                ЭКРАНЫ
  // =====================================================================
  function flagSvg(id, w) {
    const h = Math.round(w * 2 / 3);
    const F = {
      monaco: '<rect width="30" height="10" fill="#ce1126"/><rect y="10" width="30" height="10" fill="#fff"/>',
      monza: '<rect width="10" height="20" fill="#009246"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ce2b37"/>',
      mugello: '<rect width="10" height="20" fill="#009246"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ce2b37"/>',
      spa: '<rect width="10" height="20" fill="#000"/><rect x="10" width="10" height="20" fill="#fdda24"/><rect x="20" width="10" height="20" fill="#ef3340"/>',
      suzuka: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>',
      nordschleife: '<rect width="30" height="7" fill="#000"/><rect y="6.6" width="30" height="7" fill="#dd0000"/><rect y="13.3" width="30" height="6.7" fill="#ffce00"/>',
      silverstone: '<rect width="30" height="20" fill="#012169"/><path d="M0 0 30 20M30 0 0 20" stroke="#fff" stroke-width="4"/><path d="M0 0 30 20M30 0 0 20" stroke="#c8102e" stroke-width="1.6"/><path d="M15 0v20M0 10h30" stroke="#fff" stroke-width="6"/><path d="M15 0v20M0 10h30" stroke="#c8102e" stroke-width="3.4"/>',
      interlagos: '<rect width="30" height="20" fill="#009c3b"/><path d="M15 2 28 10 15 18 2 10z" fill="#ffdf00"/><circle cx="15" cy="10" r="4.6" fill="#002776"/>',
      iom: '<rect width="30" height="20" fill="#cf142b"/><g transform="translate(15 10)" stroke="#fff" stroke-width="1.6" fill="none"><path d="M0 0 0-6 2-7M0 0 5.2 3 6 5M0 0-5.2 3-7 2.4"/></g>',
      laguna: '<rect width="30" height="20" fill="#fff"/>' + [0, 2, 4, 6, 8, 10, 12].map(i => `<rect y="${i * 20 / 13}" width="30" height="${20 / 13}" fill="#b22234"/>`).join('') + '<rect width="13" height="10.8" fill="#3c3b6e"/>',
      phillip: '<rect width="30" height="20" fill="#012169"/><g transform="scale(.5)"><path d="M0 0 30 20M30 0 0 20" stroke="#fff" stroke-width="4"/><path d="M15 0v20M0 10h30" stroke="#fff" stroke-width="6"/><path d="M15 0v20M0 10h30" stroke="#c8102e" stroke-width="3.4"/></g><g fill="#fff"><circle cx="8" cy="15.5" r="1.6"/><circle cx="23" cy="5" r="1"/><circle cx="20" cy="10" r="1"/><circle cx="26" cy="9" r="1"/><circle cx="23" cy="16" r="1.2"/></g>',
      assen: '<rect width="30" height="7" fill="#ae1c28"/><rect y="6.6" width="30" height="7" fill="#fff"/><rect y="13.3" width="30" height="6.7" fill="#21468b"/>'
    };
    return `<svg class="flag" viewBox="0 0 30 20" width="${w}" height="${h}">${F[id] || ''}</svg>`;
  }

  const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(Math.round(v));
  const moraleTip = mo => {
    const p = mo.parts, list = [];
    if (mo.rankShift) list.push(`${mo.rankShift > 0 ? 'поднялся' : 'опустился'} в таблице на ${Math.abs(mo.rankShift)} ${sgn(p.rank)}`);
    if (p.kill) list.push(`отправил соперников в аварию ${sgn(p.kill)}`);
    if (p.crash) list.push(`свои аварии ${sgn(p.crash)}`);
    if (p.fame > 0) list.push(`больше всех славы за гонку ${sgn(p.fame)}`);
    if (p.fame < 0) list.push(`меньше всех славы за гонку ${sgn(p.fame)}`);
    return `Мораль ${mo.before} → ${mo.after}: ${list.length ? list.join(', ') : 'без событий'}, затем плавно к 50`;
  };
  const moraleEmoji = m => m >= 80 ? '🤩' : m >= 60 ? '😀' : m >= 40 ? '😐' : m >= 20 ? '😟' : '😰';
  const tierBadge = t => t ? `<span class="tier t-${t}" title="Уровень мастерства: ${window.TIERS[t].name}">${window.TIERS[t].icon} ${window.TIERS[t].name}</span>` : '';
  const perkBadges = (perks, full) => (perks || []).map(p => `<span class="perk ${window.PERKS[p].behavior ? 'beh' : ''} ${window.PERKS[p].ambiguous ? 'amb' : ''}" title="${window.PERKS[p].name}: ${window.PERKS[p].desc}">${window.PERKS[p].icon}${full ? ' ' + window.PERKS[p].name : ''}${window.PERKS[p].ambiguous && full ? ' ⚖' : ''}</span>`).join('');
  function racerPill(id, ros) {
    const w = WEAPONS.find(x => x.id === ros.weapon);
    return `<div class="pick ${ros.perks.length > 1 ? 'double' : ''}" data-id="${id}" style="--rc:${RN(id).color}">${faceRos(id, ros, 54)}<div class="pk-main"><b>${RN(id).name} ${tierBadge(ros.tier)}</b>
      <div class="pk-stats"><span class="c-acc">Р ${ros.stats.accel}</span><span class="c-top">С ${ros.stats.top}</span><span class="c-han">М ${ros.stats.handling}</span><span class="c-mor" title="Мораль: чем выше, тем спокойнее в давке и точнее стрельба">${moraleEmoji(ros.morale)} ${ros.morale}</span></div>
      <div class="pk-w">${Art.weaponIcon(w, 16)} ${w.name}</div>${ros.perks.length ? `<div class="pk-perks">${perkBadges(ros.perks, true)}</div>` : ''}</div></div>`;
  }

  const Menu = {
    show() {
      state.menuRoster = state.menuRoster || Champ.rollRoster();
      const saved = Champ.load();
      $('#introBody').innerHTML = `
        <p class="intro-text">16 гонщиков, 12 легендарных трасс мира и чемпионат на очки. Каждый гонщик — ИИ, который по очереди делает ход на своём поле «три в ряд»: собранные блоки превращаются в скорость, нитро, патроны, броню, ремонт и сцепление.</p>
        <div class="modes">
          ${saved && saved.stage < window.TRACKS.length ? `<button class="mode cont" id="mContinue"><span class="m-ic">⏵</span><b>Продолжить чемпионат</b><small>Этап ${saved.stage + 1} из 12 · ${saved.human >= 0 ? 'вы — ' + RN(saved.human).name : 'режим зрителя'}</small></button>` : ''}
          <button class="mode" id="mWatch"><span class="m-ic">👁</span><b>Режим зрителя</b><small>Смотреть, как 16 ИИ бьются за титул. Переключайтесь между полями любых гонщиков.</small></button>
          <button class="mode hot" id="mPlay"><span class="m-ic">🎮</span><b>Играть за гонщика</b><small>Выберите пилота и сами делайте ходы на его поле. Остальные 15 — ИИ.</small></button>
        </div>
        <div class="points-row">Очки за этап: ${window.POINTS_TABLE.map((p, i) => `<span><em>${i + 1}</em>${p}</span>`).join('')}</div>`;
      $('#intro').classList.add('show');
      $('#mWatch').onclick = () => Menu.begin(-1);
      $('#mPlay').onclick = () => Menu.picker();
      const mc = $('#mContinue');
      if (mc) mc.onclick = () => { Champ.d = saved; $('#intro').classList.remove('show'); TrackIntro.show(); };
    },
    picker() {
      const roster = state.menuRoster;
      $('#introBody').innerHTML = `<p class="intro-text">Выберите своего гонщика. Характеристики: <span class="c-acc">Р</span> — разгон, <span class="c-top">С</span> — макс. скорость, <span class="c-han">М</span> — маневренность. Уровень мастерства: ◆◆◆ элита, ◆◆ профи, ◆ новичок. Значки — перки (наведите, чтобы прочитать), красная рамка — перк меняет поведение. Каждый чемпионат состав новый.</p>
        <div class="picker">${roster.map((ros, i) => racerPill(i, ros)).join('')}</div>
        <div class="intro-btns"><button class="btn" id="mBack">← Назад</button><button class="btn" id="mReroll">🎲 Новый состав</button></div>`;
      document.querySelectorAll('.picker .pick').forEach(p => { p.onclick = () => Menu.begin(+p.dataset.id); });
      $('#mBack').onclick = () => Menu.show();
      $('#mReroll').onclick = () => { state.menuRoster = Champ.rollRoster(); Menu.picker(); };
    },
    begin(human) {
      Champ.create(state.menuRoster, human);
      state.menuRoster = null;
      $('#intro').classList.remove('show');
      TrackIntro.show();
    }
  };

  const TrackIntro = {
    show() {
      setupRace();
      const def = Champ.def(), d = Champ.d, tr = state.track;
      const wet = state.rain ? (def.wet === 'fog' ? ['🌫', 'Туман'] : ['🌧', 'Дождь: предел в поворотах −0,8, точность −10%']) : ['☀', 'Сухая трасса'];
      const grid = state.race.order;
      const me = d.human >= 0 ? grid.indexOf(d.human) + 1 : 0;
      const leader = d.stage ? Champ.standings()[0] : -1;
      const el = $('#trackIntro');
      el.style.setProperty('--tc', def.theme.ground);
      el.innerHTML = `<div class="ti-bg"></div><div class="ti-lines">${Array.from({ length: 14 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
        <div class="ti-inner">
          <div class="ti-map"><svg viewBox="0 20 1020 700">
            <path d="${tr.path}" class="ti-glow"/><path d="${tr.path}" class="ti-road" pathLength="1000"/>
            ${tr.labels.map((l, i) => { const c = tr.cells[l.cell]; return `<g class="ti-lbl" style="--d:${1.2 + i * 0.12}s" transform="translate(${c.x.toFixed(0)} ${c.y.toFixed(0)})"><circle r="7"/><text y="-14">${l.text}</text></g>`; }).join('')}
            <circle r="10" class="ti-comet"><animateMotion dur="5s" repeatCount="indefinite" path="${tr.path}"/></circle>
          </svg>${newsHtml(d)}</div>
          <div class="ti-info">
            <div class="ti-stage">ЭТАП ${d.stage + 1} <span>/ ${window.TRACKS.length}</span></div>
            <div class="ti-country">${flagSvg(def.id, 42)}<span>${def.country}</span></div>
            <h1 class="ti-name">${(() => { let i = 0; return def.name.split(' ').map(w => `<span class="w">${w.split('').map(ch => `<span style="--i:${i++}">${ch}</span>`).join('')}</span>`).join(' '); })()}</h1>
            <div class="ti-full">${def.full}</div>
            <div class="ti-facts">${def.facts.map(f => `<span>${f}</span>`).join('')}<span>${tr.N} клеток × ${tr.laps} ${tr.laps < 5 ? 'круга' : 'кругов'}</span></div>
            <p class="ti-desc">${def.desc}</p>
            <div class="ti-feats">${def.features.map(([ic, t]) => `<div><i>${ic}</i>${t}</div>`).join('')}<div class="wx ${state.rain ? 'wet' : ''}"><i>${wet[0]}</i>${wet[1]}</div></div>
            <div class="ti-grid">${me ? `Ваша позиция на старте: <b>${me}</b> из 16` : `Поул-позиция: ${nmId(grid[0])}`}${leader >= 0 ? ` · лидер чемпионата ${nmId(leader)} стартует последним` : ' · стартовая решётка по жребию'}</div>
            <div class="ti-btns"><button class="btn big primary" id="tiGo">НА СТАРТ!</button>${d.stage ? '<button class="btn big" id="tiTable">🏆 Таблица</button><button class="btn big" id="tiPaddock">📰 Паддок</button>' : ''}</div>
          </div>
        </div>`;
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      $('#tiGo').onclick = () => startStage();
      const tb = $('#tiTable'); if (tb) tb.onclick = () => Table.open();
      const tp = $('#tiPaddock'); if (tp) tp.onclick = () => Paddock.show();
    }
  };

  function champTableHtml(highlight) {
    const d = Champ.d, st = Champ.standings(), max = Math.max(1, d.points[st[0]]);
    return `<div class="ctable">${st.map((id, i) => `<div class="crow ${id === d.human ? 'me' : ''}" style="--rc:${RN(id).color};--w:${d.points[id] / max * 100}%;--i:${i}">
      <span class="cr-p">${i + 1}</span>${helmetId(id, 26)}<span class="cr-n rn" data-rid="${id}">${RN(id).name}${id === d.human ? ' <small>ВЫ</small>' : ''}</span>
      <span class="cr-bar"><i></i></span><span class="cr-w">${d.wins[id] ? '🏆' + d.wins[id] : ''}</span>
      <b class="cr-pts">${d.points[id]}</b>${highlight && highlight[id] && highlight[id].pts ? `<em>+${highlight[id].pts}</em>` : '<em></em>'}${highlight && highlight[id] && highlight[id].rankShift ? `<i class="rk ${highlight[id].rankShift > 0 ? 'up' : 'down'}" title="${highlight[id].rankShift > 0 ? 'Поднялся' : 'Опустился'} в таблице: мораль ${sgn(highlight[id].mo.parts.rank)}">${highlight[id].rankShift > 0 ? '▲' : '▼'}${Math.abs(highlight[id].rankShift)}</i>` : ''}</div>`).join('')}</div>`;
  }

  const Table = {
    open() {
      $('#tableBody').innerHTML = `<div class="tb-sub">После ${Champ.d.stage} из ${window.TRACKS.length} этапов</div>` + champTableHtml() + Table.history();
      $('#tableModal').classList.add('show');
    },
    history() {
      const d = Champ.d;
      if (!d.history.length) return '';
      return `<h3>Этапы</h3><div class="hist">${d.history.map((h, i) => {
        const def = window.TRACKS.find(t => t.id === h.track);
        const win = +Object.keys(h.row).find(id => h.row[id].place === 1);
        const me = d.human >= 0 ? h.row[d.human].place : 0;
        return `<div class="hrow">${flagSvg(def.id, 24)}<span>${i + 1}. ${def.name}${h.rain ? ' 🌧' : ''}</span><span>🏆 ${nmId(win)}</span>${me ? `<span class="my">вы: ${me}-й</span>` : ''}</div>`;
      }).join('')}</div>`;
    }
  };

  function finishRace() {
    const race = state.race, def = Champ.def();
    const row = Champ.award(race);
    const st = race.racers.slice().sort((a, b) => a.place - b.place);
    $('#resTitle').innerHTML = `${flagSvg(def.id, 34)} Этап ${Champ.d.stage}: ${def.name}`;
    $('#podium').innerHTML = [st[1], st[0], st[2]].map((r, i) => `<div class="pod p${[2, 1, 3][i]}" style="--rc:${r.color}">
      <div class="pod-ava">${faceR(r, i === 1 ? 96 : 76)}</div><b>${r.name}</b><small>+${row[r.id].pts} очк.</small><div class="pod-col">${[2, 1, 3][i]}</div></div>`).join('');
    $('#resultsTable').innerHTML = `<div class="res-cols"><div><h3>Итоги гонки</h3><table><thead><tr><th>#</th><th>Гонщик</th><th>Очки</th><th title="призовые + зрелищность + шоу">Слава</th><th title="мораль после гонки (плавно стремится к 50)">Мораль</th><th>Попад.</th><th>Урон</th><th>Аварии</th></tr></thead><tbody>` +
      st.map(r => `<tr class="${r.human ? 'me' : ''}"><td>${r.place}</td><td>${nm(r)}${r.dnf ? ' <small class="dnf">не финишировал</small>' : ''}</td><td class="pts">${row[r.id].pts ? '+' + row[r.id].pts : '—'}</td><td class="fame" title="призовые ★${row[r.id].prize} · в гонке ★${row[r.id].fame - row[r.id].show} · шоу ★${row[r.id].show}${row[r.id].press ? ' · любимец прессы ×1,4' : ''}">★${row[r.id].earned}${row[r.id].press ? ' 📸' : ''}</td><td class="mo ${row[r.id].mo.delta > 0 ? 'up' : row[r.id].mo.delta < 0 ? 'down' : ''}" title="${moraleTip(row[r.id].mo)}">${moraleEmoji(row[r.id].mo.after)} ${row[r.id].mo.after} <small>${row[r.id].mo.delta > 0 ? '▲+' + row[r.id].mo.delta : row[r.id].mo.delta < 0 ? '▼' + row[r.id].mo.delta : ''}</small></td><td>${r.hits}/${r.shots}</td><td>${Math.round(r.dmgDealt)}</td><td>${r.crashes}</td></tr>`).join('') +
      `</tbody></table></div><div><h3>Чемпионат</h3>${champTableHtml(row)}</div></div>`;
    const last = Champ.done;
    makeNews(race, row, last ? [] : aiShopping());
    Champ.save();
    const me = Champ.d.human;
    $('#btnNext').textContent = last ? '🏆 Итоги чемпионата' : `Следующий этап → ${window.TRACKS[Champ.d.stage].name}`;
    if (!last && me >= 0) $('#btnNext').textContent = `🔧 В гараж (★${Champ.d.fame[me]})`;
    else if (!last) $('#btnNext').textContent = '📰 В паддок →';
    $('#btnNext').onclick = () => {
      $('#results').classList.remove('show');
      if (last) Final.show();
      else if (me >= 0) Garage.show(() => TrackIntro.show());
      else Paddock.show(() => TrackIntro.show());
    };
    $('#results').classList.add('show');
    FXS.confetti(st[0].id);
  }

  // =====================================================================
  //                       ГАРАЖ (покупки за «Славу»)
  // =====================================================================
  const Garage = {
    tab: 'bike', after: null,
    show(after) {
      Garage.after = after; Garage.tab = Garage.tab || 'bike';
      Garage.render();
      $('#garage').classList.add('show');
    },
    render() {
      const d = Champ.d, id = d.human, ros = window.Shop.ensure(d.roster[id]), fame = d.fame[id];
      const w = window.Shop.weaponOf(ros), opts = window.Shop.options(ros);
      const find = (type, key) => opts.find(o => o.type === type && o.key === key);
      const buyBtn = (o, txt) => !o ? '<button class="btn buy" disabled>МАКС.</button>' :
        `<button class="btn buy ${o.price <= fame ? '' : 'poor'}" data-type="${o.type}" data-key="${o.key}" ${o.price <= fame ? '' : 'disabled'}>${txt || 'Купить'} <b>★${o.price}</b></button>`;
      const pips = l => `<span class="lv">${[0, 1, 2].map(i => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</span>`;
      let body = '';
      if (Garage.tab === 'bike') {
        const ST = [['accel', 'Разгон', 'c-acc', 's-acc', `+${String(CFG.accPer).replace('.', ',')} к приросту скорости за ход`], ['top', 'Макс. скорость', 'c-top', 's-top', `+${fmt(CFG.vmaxPer)} клетки к потолку и сильнее нитро`], ['handling', 'Маневренность', 'c-han', 's-han', `+${fmt(CFG.cornerPer)} к пределу в поворотах и +${fmt(CFG.dodgePer * 100)}% уворота`]];
        const reps = opts.filter(o => o.type === 'repair');
        body = (reps.length ? `<h4>🔧 Ремонт</h4><p class="g-hint">Ремонт — дорогое удовольствие: чем выше сломанная характеристика, тем дороже деталь; лидерам дороже, аутсайдерам дешевле, механик даёт скидку. Если не чинить, через несколько этапов спонсор поставит дешёвую запчасть — характеристика упадёт на ${CFG.sponsorLoss} навсегда.</p>` +
          reps.map(o => { const b = ros.broken[o.key]; return `<div class="g-item brk-item"><div class="g-ic">🔧</div><div class="g-main"><b>${PARTN[o.stat]} <small>${window.Shop.STAT_NAME[o.stat]} −${o.amount}</small></b><small>Без ремонта через ${b.left} эт. — дешёвая запчасть от спонсора, −${CFG.sponsorLoss} навсегда</small></div>${buyBtn(o, 'Починить')}</div>`; }).join('') + '<h4>Прокачка</h4>' : '') +
          `<p class="g-hint">Каждая покупка добавляет +1 к характеристике (максимум 20). Цена растёт с уровнем.</p>` + ST.map(([k, n, c, sc, eff]) =>
          `<div class="g-item"><div class="g-main"><b class="${c}">${n}</b><small>${eff}</small>${statBar('', ros.stats[k], '', sc, brokenOf(ros, k)).replace('<div class="stat-l"><span></span></div>', '')}</div>${buyBtn(find('stat', k), '+1')}</div>`).join('');
      } else if (Garage.tab === 'weapon') {
        const R = window.RARITY;
        body = `<div class="g-cur" style="--wc:${w.color}">${Art.weaponIcon(w, 46)}<div><small>Текущее оружие · <span style="color:${R[w.rarity].color}">${R[w.rarity].name}</span></small><b>${w.name}</b><small>${w.desc}</small></div>${w.relic ? '<div class="g-sell">⚜ навсегда</div>' : `<div class="g-sell">продажа: ★${window.Shop.sellValue(ros)}</div>`}</div>
          <h4>Тюнинг текущего оружия</h4>` +
          Object.entries(window.ECON.wmods).map(([k, m]) => `<div class="g-item"><div class="g-main"><b><span class="g-nm">${m.icon} ${m.name}</span>${pips(ros.wmods[k])}</b><small>${m.desc} · оружейные апы приносят больше славы за попадания</small></div>${buyBtn(find('wmod', k))}</div>`).join('') +
          (ros.perks.includes('paladin') ? '<h4>Оружейный рынок</h4><p class="g-note">⚜ Паладин не расстаётся с реликвией: «Молот Света» нельзя продать или сменить. Тюнинг — пожалуйста.</p>' :
          `<h4>Оружейный рынок <small>тюнинг при смене пушки сбрасывается, старая продаётся за полцены</small></h4><div class="g-shop">` +
          WEAPONS.filter(x => !x.relic).sort((a, b) => a.price - b.price).map(x => {
            const o = find('weapon', x.id), r = R[x.rarity];
            return `<div class="g-w ${x.id === ros.weapon ? 'own' : ''}" style="--rr:${r.color};--wc:${x.color}">
              <div class="g-w-h">${Art.weaponIcon(x, 34)}<div><b>${x.name}</b><small style="color:${r.color}">${r.name}${x.shop ? ' · только в гараже' : ''}</small></div></div>
              <div class="g-w-s"><span>урон ${Math.round(x.dmg * CFG.dmgMul)}</span><span>дальн. ${x.range} ${DIR[x.dir]}</span><span>заряд ${x.charge}</span><span>точн. ${Math.round(x.acc * 100)}%</span></div>
              <small class="g-w-d">${x.desc}</small>
              ${x.id === ros.weapon ? '<button class="btn buy" disabled>Установлено</button>' : !o ? '<button class="btn buy" disabled>—</button>' : buyBtn(o, `★${x.price} − ★${o.sell} =`).replace(/<b>★\d+<\/b>/, `<b>★${o.price}</b>`)}</div>`;
          }).join('') + '</div>');
      } else {
        body = `<p class="g-hint">Специалисты работают на вас каждую гонку. Три уровня у каждого.</p>` +
          Object.entries(window.ECON.crew).map(([k, c]) => `<div class="g-item crew"><div class="g-ic">${c.icon}</div><div class="g-main"><b><span class="g-nm">${c.name}</span>${pips(ros.crew[k])}</b><small>${c.desc}</small></div>${buyBtn(find('crew', k), 'Нанять')}</div>`).join('');
      }

      $('#garageBody').innerHTML = `
        <div class="g-top" style="--rc:${RN(id).color}">${faceId(id, 64)}<div><small>Гараж команды</small><b>${RN(id).name}</b><div class="rc-tags">${tierBadge(ros.tier)}${perkBadges(ros.perks, true)}<span class="perk" title="Мораль">${moraleEmoji(ros.morale)} мораль ${ros.morale}</span></div></div>
          <div class="g-fame"><small>Слава</small><b id="gFame">★ ${fame}</b></div></div>
        <div class="g-tabs">${[['bike', '🏍 Байк'], ['weapon', '🔫 Оружие'], ['crew', '👥 Команда']].map(([k, t]) => `<button class="g-tab ${Garage.tab === k ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('')}</div>
        <div class="g-body">${body}</div>
        ${newsHtml(d, { skipId: id, open: true })}`;
      document.querySelectorAll('#garageBody .g-tab').forEach(b => { b.onclick = () => { Garage.tab = b.dataset.tab; Garage.render(); }; });
      document.querySelectorAll('#garageBody .buy[data-type]').forEach(b => { b.onclick = () => Garage.buy(b); });
    },
    buy(btn) {
      const d = Champ.d, id = d.human, ros = d.roster[id];
      const o = window.Shop.options(ros).find(x => x.type === btn.dataset.type && String(x.key) === btn.dataset.key);
      if (!o || o.price > d.fame[id]) return;
      window.Shop.apply(ros, o);
      (ros.buys = ros.buys || []).push({ stage: d.stage, label: window.Shop.label(o), price: o.price, type: o.type });
      d.fame[id] -= o.price;
      Champ.save();
      const r = btn.getBoundingClientRect();
      for (let i = 0; i < 10; i++) {
        const f = el('div', 'flyer'); f.style.setProperty('--c', '#ffd23f'); $('#flyers').appendChild(f);
        const a = f.animate([{ transform: `translate(${r.left + r.width / 2}px,${r.top}px) scale(1)`, opacity: 1 },
          { transform: `translate(${r.left + r.width / 2 + (Math.random() - 0.5) * 160}px,${r.top - 60 - Math.random() * 80}px) scale(.3)`, opacity: 0 }], { duration: 600 + Math.random() * 300, easing: 'ease-out' });
        a.onfinish = () => f.remove();
      }
      Garage.render();
      const fe = $('#gFame'); fe.classList.add('bump');
    },
    close() { $('#garage').classList.remove('show'); const f = Garage.after; Garage.after = null; if (f) f(); }
  };

  // покупки ИИ между этапами
  function aiShopping() {
    const d = Champ.d, rnd = Math.random, buys = [];
    d.roster.forEach((ros, id) => {
      if (id === d.human) return;
      const res = window.Shop.aiSpend(ros, d.fame[id], rnd);
      d.fame[id] = res.wallet;
      (ros.buys = ros.buys || []).push(...res.items.map(it => ({ stage: d.stage, label: it.label, price: it.price, type: it.type })));
      if (res.items.length) buys.push({ id, items: res.items, spent: res.items.reduce((a, b) => a + b.price, 0) });
    });
    buys.sort((a, b) => b.spent - a.spent);
    return buys;
  }

  // ---------- новости паддока ----------
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; };
  function makeNews(race, row, buys) {
    const d = Champ.d, H = [], def = Champ.def ? window.TRACKS[d.stage - 1] : null;
    const by = (f, dir) => race.racers.slice().sort((a, b) => dir * (f(b) - f(a)))[0];
    const winner = race.racers.find(r => r.place === 1);
    const w = d.wins[winner.id];
    H.push({ ic: '🏆', t: `${nmId(winner.id)} выигрывает этап «${def.name}»${w >= 2 ? ` — уже ${w}-я победа в сезоне!` : '!'}` });
    const st = Champ.standings(), lead = st[0], prev = Champ.rankBefore && Champ.rankBefore[0];
    const gap = d.points[lead] - d.points[st[1]];
    if (d.stage >= 2 && prev !== lead) H.push({ ic: '👑', t: `Смена лидера! ${nmId(lead)} возглавляет чемпионат (${d.points[lead]} оч.)` });
    else H.push({ ic: '👑', t: `${nmId(lead)} ${d.stage > 1 ? 'сохраняет' : 'захватывает'} лидерство: ${d.points[lead]} оч., отрыв ${gap}` });
    const up = by(r => row[r.id].rankShift, 1), down = by(r => row[r.id].rankShift, -1);
    if (row[up.id].rankShift >= 2) H.push({ ic: '📈', t: `${nmId(up.id)} взлетает в таблице на ${row[up.id].rankShift} ${plural(row[up.id].rankShift, 'позицию', 'позиции', 'позиций')} — мораль ${row[up.id].mo.after}` });
    if (row[down.id].rankShift <= -2) H.push({ ic: '📉', t: `${nmId(down.id)} теряет в таблице ${-row[down.id].rankShift} ${plural(-row[down.id].rankShift, 'позицию', 'позиции', 'позиций')}` });
    const dmg = by(r => r.dmgDealt, 1);
    if (dmg.dmgDealt > 0) H.push({ ic: '💥', t: `Главный разрушитель этапа — ${nmId(dmg.id)}: ${Math.round(dmg.dmgDealt)} урона, ${dmg.hits} ${plural(dmg.hits, 'попадание', 'попадания', 'попаданий')}` });
    const cr = by(r => r.crashes, 1);
    if (cr.crashes >= 2) H.push({ ic: '🚑', t: `${nmId(cr.id)} ${cr.crashes === 2 ? 'дважды' : cr.crashes + ' раза'} за этап разбивает мотоцикл` });
    else if (cr.crashes === 1) { const n = race.racers.filter(r => r.crashes).length; H.push({ ic: '🚑', t: `Аварий на этапе: ${n}. Среди пострадавших — ${nmId(cr.id)}` }); }
    const nv = by(r => r.nerves, 1);
    if (nv.nerves >= 2) H.push({ ic: '😱', t: `${nmId(nv.id)} не выдерживает давки: ${nv.nerves} ${plural(nv.nerves, 'срыв', 'срыва', 'срывов')} за этап` });
    const hi = by(r => row[r.id].mo.after, 1), lo = by(r => row[r.id].mo.after, -1);
    if (row[hi.id].mo.after >= 75) H.push({ ic: '🔥', t: `${nmId(hi.id)} на кураже — мораль ${row[hi.id].mo.after}` });
    if (row[lo.id].mo.after <= 30) H.push({ ic: '😞', t: `${nmId(lo.id)} падает духом — мораль ${row[lo.id].mo.after}` });
    race.racers.forEach(r => (row[r.id].brk || []).forEach(e => {
      if (e.type === 'broke') H.push({ ic: '🔧', t: `${nmId(r.id)} ломает ${PARTN[e.stat]} — ${window.Shop.STAT_NAME[e.stat].toLowerCase()} −${CFG.breakAmount}, пока не починят` });
      if (e.type === 'sponsor') H.push({ ic: '🪛', t: `Спонсор ставит ${nmId(r.id)} дешёвый ${PARTN[e.stat]}: ${window.Shop.STAT_NAME[e.stat].toLowerCase()} −${e.loss} навсегда` });
      if (e.type === 'mechfix') H.push({ ic: '🛠', t: `Механик ${nmId(r.id)} своими руками чинит ${PARTN[e.stat]}` });
    }));
    const show = by(r => r.showFame, 1);
    if (show.showFame >= 20) H.push({ ic: '🎉', t: `Шоу этапа: ${nmId(show.id)} зарабатывает ★${show.showFame} славы уже после финиша` });
    buys.forEach(b => b.items.filter(i => i.type === 'repair').forEach(i => H.push({ ic: '🛠', t: `${nmId(b.id)} оплачивает ${i.label.toLowerCase()} за ★${i.price}` })));
    buys.forEach(b => b.items.filter(i => i.type === 'weapon').forEach(i => {
      const wp = WEAPONS.find(x => x.id === i.key);
      if (window.Shop.RANK[wp.rarity] >= 1) H.push({ ic: '💰', t: `${nmId(b.id)} покупает ${window.RARITY[wp.rarity].name.toLowerCase()} оружие: ${wp.name}` });
    }));
    const next = window.TRACKS[d.stage];
    if (next) H.push({ ic: '🔮', t: `Впереди — ${next.name}. ${next.features[0][1]}` });
    d.news = { stage: d.stage, headlines: H, buys };
  }
  const newsOf = d => (d.news && !Array.isArray(d.news) ? d.news : { headlines: [], buys: [] });
  function newsHtml(d, opts) {
    const n = newsOf(d), skip = opts && opts.skipId;
    const heads = n.headlines.map((h, i) => `<div class="nh" style="--i:${i}"><i>${h.ic}</i><span>${h.t}</span></div>`).join('');
    const buys = n.buys.filter(b => b.id !== skip).map(b => `<div class="nb"><b>${nmId(b.id)}</b> <small>★${b.spent}</small><span>${b.items.map(i => i.label).join(' · ')}</span></div>`).join('');
    if (!heads && !buys) return '';
    return `<div class="news">${heads ? `<h4>📰 Новости паддока</h4><div class="nh-list">${heads}</div>` : ''}${buys ? `<details class="nb-wrap" ${opts && opts.open ? 'open' : ''}><summary>🛒 Покупки соперников (${n.buys.filter(b => b.id !== skip).length})</summary>${buys}</details>` : ''}</div>`;
  }

  // =====================================================================
  //              ПАДДОК: всё о командах между гонками (и для зрителя)
  // =====================================================================
  const Paddock = {
    tab: 'news', after: null,
    show(after) {
      Paddock.after = after || null;
      Paddock.tab = 'news';
      Paddock.render();
      $('#paddockBtns').innerHTML = after ? '<button class="btn big primary" id="pdGo">К трассе →</button>' : '';
      const go = $('#pdGo'); if (go) go.onclick = () => Paddock.close();
      $('#paddock').classList.add('show');
    },
    close() { $('#paddock').classList.remove('show'); const f = Paddock.after; Paddock.after = null; if (f) f(); },
    teamCard(id, i, last) {
      const d = Champ.d, ros = window.Shop.ensure(d.roster[id]), w = window.makeWeapon(ros.weapon, ros.wmods), R = window.RARITY[w.rarity];
      const lr = last && last.row[id];
      const mo = lr && lr.mo ? lr.mo.delta : 0, rk = lr && lr.rankShift ? lr.rankShift : 0;
      const st = (k, c, n) => { const bk = brokenOf(ros, k); return `<div class="pt-st"><span class="${c}">${n}</span><i><b class="${c}-bg" style="width:${(ros.stats[k] - bk) * 5}%"></b>${bk ? `<b class="brk-bg" style="width:${bk * 5}%"></b>` : ''}</i><em>${bk ? ros.stats[k] - bk : ros.stats[k]}</em></div>`; };
      const crew = Object.entries(window.ECON.crew).filter(([k]) => ros.crew[k]).map(([k, c]) => `<span title="${c.name}: ур. ${ros.crew[k]}">${c.icon}${ros.crew[k]}</span>`).join('') || '<small>команда не нанята</small>';
      const tune = ['cal', 'mag', 'aim'].filter(k => ros.wmods[k]).map(k => `${window.ECON.wmods[k].icon}${ros.wmods[k]}`).join(' ');
      return `<div class="pt ${id === d.human ? 'me' : ''}" style="--rc:${RN(id).color};--i:${i}">
        <div class="pt-h"><span class="pt-pos">${i + 1}</span>${faceId(id, 46)}<div class="pt-n"><b class="rn" data-rid="${id}">${RN(id).name}${id === d.human ? ' <small>ВЫ</small>' : ''}</b><div>${tierBadge(ros.tier)}${perkBadges(ros.perks)}${(ros.broken || []).map(b => `<span class="perk brk" title="Сломан ${PARTN[b.stat]} −${b.amount}">🔧</span>`).join('')}</div></div>
          <div class="pt-pts"><b>${d.points[id]}</b><small>оч.</small>${rk ? `<i class="rk2 ${rk > 0 ? 'up' : 'down'}">${rk > 0 ? '▲' : '▼'}${Math.abs(rk)}</i>` : ''}</div></div>
        <div class="pt-row"><span title="Мораль">${moraleEmoji(ros.morale)} ${ros.morale}${mo ? ` <small class="${mo > 0 ? 'up' : 'down'}">${mo > 0 ? '+' : ''}${mo}</small>` : ''}</span><span title="Слава в кошельке">★${d.fame[id]}</span><span title="Побед / подиумов">🏆${d.wins[id]} · 🥉${d.podiums[id]}</span></div>
        ${st('accel', 'c-acc', 'Р')}${st('top', 'c-top', 'С')}${st('handling', 'c-han', 'М')}
        <div class="pt-w" style="--rr:${R.color}">${Art.weaponIcon(w, 18)}<span>${w.name}</span><small style="color:${R.color}">${R.name}</small>${tune ? `<small>${tune}</small>` : ''}</div>
        <div class="pt-crew">${crew}</div></div>`;
    },
    render() {
      const d = Champ.d, last = d.history[d.history.length - 1];
      const tabs = [['news', '📰 Новости'], ['teams', '🏍 Команды'], ['buys', '🛒 Покупки']];
      let body = '';
      const n = newsOf(d);
      if (Paddock.tab === 'news') {
        body = n.headlines.length ? `<div class="nh-list big">${n.headlines.map((h, i) => `<div class="nh" style="--i:${i}"><i>${h.ic}</i><span>${h.t}</span></div>`).join('')}</div>` : '<p class="g-hint">Новости появятся после первого этапа.</p>';
      } else if (Paddock.tab === 'teams') {
        body = `<p class="g-hint">Команды в порядке таблицы чемпионата. Наведите на значки, чтобы прочитать подробности.</p><div class="pt-grid">${Champ.standings().map((id, i) => Paddock.teamCard(id, i, last)).join('')}</div>`;
      } else {
        body = n.buys.length ? `<div class="pb-list">${n.buys.map(b => `<div class="pb" style="--rc:${RN(b.id).color}">${helmetId(b.id, 30)}<div><b class="rn" data-rid="${b.id}">${RN(b.id).name}</b> <small>потрачено ★${b.spent}, осталось ★${d.fame[b.id]}</small><div class="pb-items">${b.items.map(it => `<span class="${it.type}">${it.label} <em>★${it.price}</em></span>`).join('')}</div></div></div>`).join('')}</div>` : '<p class="g-hint">В этот перерыв соперники ничего не покупали.</p>';
      }
      $('#paddockBody').innerHTML = `<h2>📰 Паддок <small>${d.stage ? `после этапа ${d.stage} из ${window.TRACKS.length}` : 'перед стартом сезона'}</small></h2>
        <div class="g-tabs">${tabs.map(([k, t]) => `<button class="g-tab ${Paddock.tab === k ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('')}</div>
        <div class="g-body">${body}</div>`;
      document.querySelectorAll('#paddockBody .g-tab').forEach(b => { b.onclick = () => { Paddock.tab = b.dataset.tab; Paddock.render(); }; });
    }
  };

  // =====================================================================
  //                  ДОСЬЕ ГОНЩИКА (клик по имени)
  // =====================================================================
  const Dossier = {
    open(id) {
      const d = Champ.d;
      if (!d || !d.roster || !d.points) return;
      const ros = window.Shop.ensure(d.roster[id]), w = window.makeWeapon(ros.weapon, ros.wmods), R = window.RARITY[w.rarity];
      const st = Champ.standings(), pos = st.indexOf(id) + 1;
      const hist = d.history.map((h, i) => ({ i, h, r: h.row[id], def: window.TRACKS.find(t => t.id === h.track) }));
      const tot = hist.reduce((a, x) => { a.hits += x.r.hits || 0; a.shots += x.r.shots || 0; a.dmg += x.r.dmg || 0; a.crashes += x.r.crashes || 0; a.nerves += x.r.nerves || 0; a.fame += x.r.earned || 0; return a; }, { hits: 0, shots: 0, dmg: 0, crashes: 0, nerves: 0, fame: 0 });
      const avgPlace = hist.length ? (hist.reduce((a, x) => a + x.r.place, 0) / hist.length).toFixed(1).replace('.', ',') : '—';
      const statRow = (k, n, c, sc) => {
        const base = ros.base ? ros.base[k] : ros.stats[k], up = ros.stats[k] - base;
        const lost = (ros.lost && ros.lost[k]) || 0, bought = up + lost;
        return `<div class="ds-stat"><b class="${c}">${n}</b>${statBar('', ros.stats[k], '', sc, brokenOf(ros, k)).replace('<div class="stat-l"><span></span></div>', '')}<small>${bought ? `<span class="up">+${bought} прокачано</span>` : 'без прокачки'}${lost ? ` · <span class="down">−${lost} дешёвые запчасти спонсора</span>` : ''}${brokenOf(ros, k) ? ` · <span class="down">🔧 сломан ${PARTN[k]} −${brokenOf(ros, k)}</span>` : ''}</small></div>`;
      };
      // график морали по этапам
      const pts = [ros.morale0 !== undefined ? ros.morale0 : (hist[0] && hist[0].r.mo ? hist[0].r.mo.before : ros.morale)].concat(hist.map(x => x.r.mo ? x.r.mo.after : ros.morale));
      const W = 300, Hh = 70, X = i => 10 + i * (W - 20) / Math.max(1, pts.length - 1), Y = v => Hh - 6 - v / 100 * (Hh - 12);
      const chart = `<svg class="ds-chart" viewBox="0 0 ${W} ${Hh}"><line x1="0" x2="${W}" y1="${Y(50)}" y2="${Y(50)}" class="mid"/><polyline points="${pts.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}"/>${pts.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="3"><title>${i ? 'после этапа ' + i : 'старт сезона'}: ${v}</title></circle>`).join('')}</svg>`;
      const effects = [];
      if (w.effect.slow) effects.push(`замедление −${w.effect.slow}`);
      if (w.effect.burn) effects.push(`поджог ${w.effect.burn.dmg}×${w.effect.burn.turns}`);
      if (w.effect.lock) effects.push(`заморозка ${w.effect.lock}`);
      if (w.effect.pull) effects.push(`кража скорости ${w.effect.pull}`);
      if (w.effect.aoe) effects.push('по площади');
      if (w.effect.chain) effects.push(`цепь на ${w.effect.chain}`);
      if (w.effect.pierce) effects.push('пробивает щит');
      if (w.effect.knock) effects.push(`отброс ${w.effect.knock}`);
      if (w.effect.strip) effects.push('срыв сцепления');
      if (w.effect.rush) effects.push(`форсаж +${w.effect.rush}`);
      if (w.effect.heal) effects.push(`лечит себя +${w.effect.heal}`);
      if (w.effect.aegis) effects.push(`щит себе +${w.effect.aegis}`);
      if (w.effect.smite) effects.push(`по некромантам ×${w.effect.smite}`);
      if (w.effect.nitro) effects.push(`+${w.effect.nitro} нитро`);
      const pips = l => `<span class="lv">${[0, 1, 2].map(i => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</span>`;
      $('#dossierBody').innerHTML = `
        <div class="ds-top" style="--rc:${RN(id).color}">${faceId(id, 104)}<div class="ds-name"><small>№${id + 1}${id === d.human ? ' · ВЫ' : ''}</small><b>${RN(id).name}</b><div class="rc-tags">${tierBadge(ros.tier)}</div></div>
          <div class="ds-kpi"><div><b>${pos}</b><small>место в таблице</small></div><div><b>${d.points[id]}</b><small>очков</small></div><div><b>${d.wins[id]}/${d.podiums[id]}</b><small>побед / подиумов</small></div><div><b>★${d.fame[id]}</b><small>слава</small></div></div></div>
        ${ros.perks.length ? `<div class="ds-perks">${ros.perks.map(p => { const P = window.PERKS[p]; return `<div class="ds-perk ${P.behavior ? 'beh' : ''}"><i>${P.icon}</i><div><b>${P.name}</b>${P.behavior ? ' <small class="beh-l">поведение</small>' : ''}${P.ambiguous ? ' <small class="amb-l">⚖ неоднозначный</small>' : ''}<p>${P.desc}</p></div></div>`; }).join('')}</div>` : ''}
        <div class="ds-grid">
          <section><h4>Байк</h4>${statRow('accel', 'Разгон', 'c-acc', 's-acc')}${statRow('top', 'Макс. скорость', 'c-top', 's-top')}${statRow('handling', 'Маневренность', 'c-han', 's-han')}
            <h4>Мораль ${moraleEmoji(ros.morale)} ${ros.morale}</h4>${chart}<small class="ds-note">точки — мораль после каждого этапа, линия — уровень 50</small></section>
          <section><h4>Оружие</h4><div class="ds-w" style="--wc:${w.color};--rr:${R.color}">${Art.weaponIcon(w, 40)}<div><b>${w.name}</b><small style="color:${R.color}">${R.name}</small><p>${w.desc}</p></div></div>
            <div class="w-stats"><span><em>Урон</em>${Math.round(w.dmg * CFG.dmgMul)}</span><span><em>Дальность</em>${w.range} · ${DIR[w.dir]}</span><span><em>Точность</em>${Math.round(w.acc * 100)}%</span><span><em>Заряд</em>${w.charge}</span></div>
            <div class="w-eff">${effects.map(e => `<i>${e}</i>`).join('') || '<i>без эффекта</i>'}</div>
            <div class="ds-tune">${Object.entries(window.ECON.wmods).map(([k, m]) => `<div><span>${m.icon}</span><span>${m.name}</span>${pips(ros.wmods[k])}</div>`).join('')}</div>
            <h4>Команда</h4><div class="ds-crew">${Object.entries(window.ECON.crew).map(([k, c]) => `<div title="${c.desc}" class="${ros.crew[k] ? '' : 'off'}"><span>${c.icon}</span><span>${c.name}</span>${pips(ros.crew[k])}</div>`).join('')}</div></section>
        </div>
        <section><h4>История сезона <small>среднее место ${avgPlace} · попаданий ${tot.hits}/${tot.shots} · урон ${tot.dmg} · аварий ${tot.crashes} · срывов в давке ${tot.nerves} · заработано ★${tot.fame}</small></h4>
          ${hist.length ? `<table class="ds-hist"><thead><tr><th>Этап</th><th>Место</th><th>Очки</th><th>В таблице</th><th>Слава</th><th>Мораль</th><th>Попад.</th><th>Урон</th><th>Аварии</th></tr></thead><tbody>${hist.map(x => `<tr><td>${flagSvg(x.def.id, 20)} ${x.i + 1}. ${x.def.name}${x.h.rain ? ' 🌧' : ''}</td><td><b>${x.r.place}</b>${x.r.dnf ? ' <small class="dnf">DNF</small>' : ''}</td><td class="pts">${x.r.pts ? '+' + x.r.pts : '—'}</td><td>${x.r.rank || '—'}${x.r.rankShift ? ` <small class="${x.r.rankShift > 0 ? 'up' : 'down'}">${x.r.rankShift > 0 ? '▲' : '▼'}${Math.abs(x.r.rankShift)}</small>` : ''}</td><td class="fame">★${x.r.earned || 0}</td><td>${x.r.mo ? `${x.r.mo.after} <small class="${x.r.mo.delta > 0 ? 'up' : x.r.mo.delta < 0 ? 'down' : ''}">${x.r.mo.delta > 0 ? '+' : ''}${x.r.mo.delta || ''}</small>` : '—'}</td><td>${x.r.hits !== undefined ? x.r.hits + '/' + x.r.shots : '—'}</td><td>${x.r.dmg !== undefined ? x.r.dmg : '—'}</td><td>${x.r.crashes !== undefined ? x.r.crashes : '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="g-hint">Сезон ещё не начался.</p>'}
        </section>
        <section><h4>Покупки</h4>${(ros.buys || []).length ? `<div class="pb-items">${ros.buys.map(b => `<span class="${b.type}">после этапа ${b.stage}: ${b.label} <em>★${b.price}</em></span>`).join('')}</div>` : '<p class="g-hint">Пока ничего не покупал.</p>'}</section>`;
      $('#dossier').classList.add('show');
    }
  };

  const Final = {
    show() {
      const d = Champ.d, st = Champ.standings(), ch = st[0];
      const me = d.human >= 0 ? st.indexOf(d.human) + 1 : 0;
      $('#finalBody').innerHTML = `
        <div class="trophy"><svg viewBox="0 0 120 140" width="130"><defs><linearGradient id="gold" x1="0" x2="1"><stop offset="0" stop-color="#b8860b"/><stop offset=".5" stop-color="#ffe680"/><stop offset="1" stop-color="#b8860b"/></linearGradient></defs>
          <path d="M30 10h60v30c0 22-14 38-30 40-16-2-30-18-30-40z" fill="url(#gold)"/><path d="M30 18H12c0 18 8 28 20 30M90 18h18c0 18-8 28-20 30" stroke="url(#gold)" stroke-width="6" fill="none"/>
          <rect x="54" y="80" width="12" height="22" fill="url(#gold)"/><rect x="34" y="102" width="52" height="12" rx="3" fill="url(#gold)"/><rect x="26" y="114" width="68" height="18" rx="3" fill="#3a2a10"/></svg>
          </div><div class="champ-face">${faceId(ch, 120)}</div>
        <div class="champ-name" style="--rc:${RN(ch).color}">${RN(ch).name}</div>
        <div class="champ-sub">Чемпион «Ярости трассы» · ${d.points[ch]} очков · побед: ${d.wins[ch]}</div>
        ${me ? `<div class="champ-me">Ваш итог: <b>${me}-е место</b>, ${d.points[d.human]} очков</div>` : ''}
        ${champTableHtml()}
        ${Table.history()}`;
      $('#final').classList.add('show');
      Champ.clear();
      const burst = () => { const r = state.race.racers[ch]; if (r) FXS.confetti(ch); };
      burst(); setTimeout(burst, 700); setTimeout(burst, 1400);
    }
  };

  // ---------- правила ----------
  function rules() {
    const gems = GEMS.map((g, i) => `<div class="rg"><div class="gem t${i} static"><div class="gem-in">${Art.gemIcon(i)}</div></div><div><b style="color:${g.color}">${g.name}</b><p>${g.desc}</p></div></div>`).join('');
    const sp = Object.entries(SPECIALS).map(([k, s]) => `<div class="rg"><div class="gem t${k === 'nova' ? 6 : 2} sp-${k} static"><div class="gem-in">${Art.gemIcon(k === 'nova' ? 6 : 2)}</div></div><div><b>${s.name}</b><p>${s.desc}</p></div></div>`).join('');
    const cells = Object.entries(CELL_FX).map(([k, c]) => `<div class="rc"><svg viewBox="-12 -12 24 24" width="26" height="26"><circle r="11" fill="${Art.CELL_COLOR[k]}"/>${Art.CELL_ICON[k]}</svg><b>${c.name}</b> ${c.text}</div>`).join('');
    const weap = `<table class="wt"><thead><tr><th></th><th>Оружие</th><th>Урон</th><th>Дальн.</th><th>Сектор</th><th>Заряд</th><th>Точн.</th><th>Эффект</th></tr></thead><tbody>` +
      WEAPONS.map(w => `<tr><td>${Art.weaponIcon(w, 22)}</td><td>${w.name}</td><td>${Math.round(w.dmg * CFG.dmgMul)}</td><td>${w.range}</td><td>${DIR[w.dir]}</td><td>${w.charge}</td><td>${Math.round(w.acc * 100)}%</td><td>${w.desc}</td></tr>`).join('') + '</tbody></table>';
    const tr = state.track;
    $('#rulesBody').innerHTML = `
      <section><h3>Чемпионат</h3><p>12 этапов на легендарных трассах мира. За место в гонке начисляются очки:</p>
        <div class="points-row">${window.POINTS_TABLE.map((p, i) => `<span><em>${i + 1}</em>${p}</span>`).join('')}<span><em>13–16</em>0</span></div>
        <p>На первом этапе стартовая решётка — по жребию, дальше в обратном порядке таблицы: лидер стартует последним. При равенстве очков выше тот, у кого больше побед, затем подиумов. Прогресс сохраняется в браузере.</p></section>
      <section><h3>Слава ★ и гараж</h3><p>Слава — валюта спонсоров. Её приносят: <b>призовые</b> за место (★${window.ECON.prize[0]} за победу … ★${window.ECON.prize[15]} за 16-е), <b>зрелищность</b> — попадание ★${window.ECON.fameHit}, отправить соперника в аварию ★${window.ECON.fameCrash}, каскад ×3 и больше ★${window.ECON.fameCombo} за каждую волну сверх двух, и <b>шоу для фанатов</b>: финишировавший продолжает ходить на поле, и каждый сожжённый блок даёт славу.</p>
        <p>Между этапами славу тратят в гараже: +1 к характеристикам байка, оружие разной редкости (обычное → редкое → эпическое → легендарное, 4 пушки только в гараже), тюнинг оружия (калибр, магазин, прицел) и команда — механик, оружейник, бронетехник, нитро-инженер. ИИ-соперники тоже зарабатывают и покупают — их покупки видны в «Новостях паддока».</p></section>
      <section><h3>Уровни мастерства и перки</h3><p>Каждый чемпионат состав генерируется заново. Уровень гонщика: ${Object.values(window.TIERS).map(t => `<b style="color:${t.color}">${t.icon} ${t.name}</b> (${Math.round(t.chance * 100)}%, сумма характеристик ${t.sum[0]}–${t.sum[1]})`).join(', ')}. С шансом ${Math.round(window.PERK_CHANCE * 100)}% гонщик получает перк, а один случайный обладатель перка — второй, другой. Перки разные по силе, некоторые меняют поведение ИИ (отмечены рамкой):</p>
        <div class="rgrid">${Object.values(window.PERKS).map(p => `<div class="rg"><span class="perk-big">${p.icon}</span><div><b>${p.name}</b>${p.behavior ? ' <small class="beh-l">поведение</small>' : ''}${p.ambiguous ? ' <small class="amb-l">⚖ неоднозначный</small>' : ''}<p>${p.desc}</p></div></div>`).join('')}</div></section>
      <section><h3>Мораль и давка</h3><p>У каждого гонщика есть <b>мораль</b> от 0 до 100: у элиты в среднем выше, у новичков ниже. Мораль влияет на <b>твёрдость руки</b> — точность стрельбы от −10% (мораль 0) до +10% (мораль 100) — и на нервы в <b>давке</b>. С ${CFG.crowdFrom}-го раунда, если в соседних клетках (±1) двое и больше соперников, гонщик проверяет нервы. Чем больше толпа и ниже мораль, тем выше шанс «дрогнуть» (😰 −${String(CFG.crowdLoss[0]).replace('.', ',')}…${String(CFG.crowdLoss[1]).replace('.', ',')} к скорости) или, в ${Math.round(CFG.breakdownChance * 100)}% провалов, сорваться (😱 нервный срыв — <b>пропуск следующего хода</b>). Агрессор давит за двоих, Хладнокровный дрогнет вдвое реже.</p>
        <p>Место в гонке на мораль <b>не влияет</b>. После каждой гонки мораль меняется так: <b>±${CFG.moraleRank} за каждую позицию</b>, отыгранную или потерянную в таблице чемпионата (до ±${CFG.moraleRankCap}, начиная с 3-го этапа); −${CFG.moraleCrash} за каждую свою аварию; +${CFG.moraleKill} за каждого соперника, отправленного в аварию своим выстрелом; +${CFG.moraleFameTop} тому, кто заработал больше всех славы действиями в гонке (без призовых), и −${CFG.moraleFameBottom} тому, кто заработал меньше всех. Затем мораль плавно стремится к 50. <b>Спортивный психолог</b> в гараже замедляет спад после успехов и ускоряет восстановление после неудач.</p></section>
      <section><h3>Поломки и ремонт</h3><p>При аварии с шансом ${Math.round(CFG.breakChance * 100)}% ломается узел байка: двигатель (разгон), трансмиссия (макс. скорость) или подвеска (маневренность) — характеристика −${CFG.breakAmount} со следующего этапа. Ремонт в гараже — дорогое удовольствие: чем выше сломанная характеристика, тем дороже деталь; лидерам дороже, аутсайдерам дешевле; механик даёт скидку и может починить сам. Если не чинить ${CFG.breakRaces} этапа, спонсор поставит дешёвую запчасть: поломка уйдёт, но характеристика упадёт на ${CFG.sponsorLoss} навсегда.</p></section>
      <section><h3>Очерёдность</h3><p>Гонщики ходят строго по очереди, в порядке стартовой решётки. За ход гонщик: <b>1)</b> делает один обмен на своём поле «три в ряд»; <b>2)</b> получает бонусы от сгоревших блоков (каскады дают множитель ×1,5, ×2…); <b>3)</b> стреляет, если оружие заряжено и цель в секторе; <b>4)</b> передвигает фишку по трассе на число клеток, равное скорости. Если вы играете за гонщика, в свой ход поменяйте местами два соседних блока (перетаскиванием или двумя щелчками). Стрельба, нитро и торможение — автоматические.</p></section>
      <section><h3>Характеристики (1–20, у всех одинаковая сумма — ${CFG.STAT_TOTAL})</h3>
        <ul>
          <li><b class="c-acc">Разгон</b> — прирост скорости за ход: ${CFG.accBase} + ${CFG.accPer}×Разгон, и каждый блок «Топлива» усиливает его на ${Math.round(CFG.fuelPer * 100)}%. Сопротивление воздуха съедает ${Math.round(CFG.drag * 100)}% скорости каждый ход.</li>
          <li><b class="c-top">Макс. скорость</b> — потолок на прямых: ${CFG.vmaxBase} + ${CFG.vmaxPer}×Скорость клеток за ход и сила нитро-рывка (${CFG.nitroBase} + ${CFG.nitroPer}×Скорость). Повреждённый мотоцикл теряет до ${Math.round(CFG.hpSpeedFactor * 100)}% потолка.</li>
          <li><b class="c-han">Маневренность</b> — допустимая скорость в повороте: ${CFG.cornerBase} + ${CFG.cornerPer}×Маневр + ${CFG.gripPer}×Сцепление (на серпантине −${CFG.hairpinPenalty}), и шанс уворота ${CFG.dodgePer * 100}% за единицу.</li>
          <li><b>Прочность</b> — 100 у всех. На нуле — авария: ${CFG.crashSkip} хода ремонта, затем возврат с ${CFG.crashHp} прочности.</li>
        </ul>
        <p>Перед поворотом гонщик тормозит (не более ${CFG.brakePower} скорости за ход), не успел — <b>занос</b> с уроном. Коэффициенты подобраны симуляцией: на дистанции всего чемпионата каждая характеристика одинаково важна, хотя отдельные трассы любят своё — Монца скорость, Монако маневренность.</p></section>
      <section><h3>Шесть блоков</h3><div class="rgrid">${gems}</div></section>
      <section><h3>Спецблоки</h3><div class="rgrid">${sp}</div></section>
      <section><h3>Трасса</h3><p>${tr ? `Сейчас: ${tr.def.name || ''} — ${tr.N} клеток, ${tr.laps} ${tr.laps < 5 ? 'круга' : 'кругов'}. ` : ''}Числа на клетках — номер клетки на круге (подписан каждый 6-й), чтобы было видно, где гонщик. Жёлтые клетки — повороты, красные — крутые. Спецклетки срабатывают, если закончить на них ход:</p><div class="rcells">${cells}</div></section>
      <section><h3>Оружие</h3><p>«Боезапас» заряжает оружие. Полный заряд — выстрел по лучшей цели в секторе. Шанс попадания = точность × (1 − уворот цели). Щит поглощает урон первым.</p>${weap}</section>`;
  }

  // ---------- легенда ----------
  function gemLegend() {
    $('#gemLegend').innerHTML = GEMS.map((g, i) => `<div class="gl" title="${g.desc}"><div class="gem t${i} static mini"><div class="gem-in">${Art.gemIcon(i)}</div></div><span><b style="color:${g.color}">${g.name}</b><small>${g.short}</small></span></div>`).join('');
    const kinds = state.track ? [...new Set(state.track.cells.map(c => c.kind))].filter(k => k !== 'plain') : Object.keys(CELL_FX);
    const hz = state.track && state.track.def.hazardName;
    $('#trackLegend').innerHTML = `<span><i class="lg lapb">2</i>номер круга</span><span><i class="lg dim"></i>на другом круге, чем выбранный</span><span><i class="lg turn"></i>поворот</span><span><i class="lg hair"></i>крутой поворот</span>` +
      kinds.map(k => `<span><svg viewBox="-12 -12 24 24" width="16" height="16"><circle r="11" fill="${Art.CELL_COLOR[k]}"/>${Art.CELL_ICON[k]}</svg>${k === 'hazard' && hz ? hz : CELL_FX[k].name}</span>`).join('') +
      (state.race && state.race.undead && state.race.undead.length ? '<span><i class="lg undead-lg">💀</i>нежить некроманта: бьёт закончивших ход рядом</span>' : '');
  }

  // =====================================================================
  //                                 СТАРТ
  // =====================================================================
  function init() {
    const tm = trackMapper();
    trackFx = new window.FX($('#trackFx'));
    trackFx.map = tm.map; trackFx.onResize = tm.upd; tm.upd();
    boardFx = new window.FX($('#boardFx'));
    window.addEventListener('resize', () => { trackFx.resize(); boardFx.resize(); });
    new ResizeObserver(() => { trackFx.resize(); boardFx.resize(); }).observe($('#trackWrap'));
    new ResizeObserver(() => boardFx.resize()).observe($('#board'));
    setSpeed(2);
    // фон за меню — превью первой трассы
    Champ.d = { roster: Champ.rollRoster(), human: -1, stage: 0, points: Array(16).fill(0), wins: Array(16).fill(0), podiums: Array(16).fill(0), best: Array(16).fill(99), history: [] };
    setupRace();
    Champ.d = null;
    Menu.show();

    const board = $('#board');
    board.addEventListener('pointerdown', Input.down);
    window.addEventListener('pointermove', Input.move);
    window.addEventListener('pointerup', Input.up);

    $('#btnRestart').onclick = () => { if (confirm('Начать новый чемпионат? Текущий прогресс будет потерян.')) { state.raceId++; Input.finish(null); Champ.clear(); $('#results').classList.remove('show'); $('#trackIntro').classList.remove('show'); Menu.show(); } };
    $('#btnAgain').onclick = () => { $('#final').classList.remove('show'); Menu.show(); };
    $('#btnTable').onclick = () => { if (Champ.d) Table.open(); };
    // клик по имени гонщика где угодно — досье
    document.addEventListener('click', e => {
      const t = e.target.closest && e.target.closest('[data-rid]');
      if (t && Champ.d && Champ.d.points) { e.preventDefault(); Dossier.open(+t.dataset.rid); }
    });
    $('#btnPaddock').onclick = () => { if (Champ.d && Champ.d.points) Paddock.show(); };
    $('#gClose').onclick = () => Garage.close();
    $('#btnSkip').onclick = () => { if (!state.race || state.race.over || !Champ.d) return; state.skip = true; if (Input.resolve) Input.finish(null); };
    $('#btnAuto').onclick = () => {
      state.autopilot = !state.autopilot;
      $('#btnAuto').classList.toggle('active', state.autopilot);
      if (state.autopilot && Input.resolve) Input.finish(null);
    };
    const openRules = () => $('#rules').classList.add('show');
    $('#btnRules').onclick = openRules;
    document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => $('#' + b.dataset.close).classList.remove('show'); });
    ['rules', 'tableModal', 'paddock', 'dossier'].forEach(id => $('#' + id).addEventListener('click', e => { if (e.target.id === id) e.target.classList.remove('show'); }));
    const pause = () => {
      state.paused = !state.paused;
      $('#btnPause').textContent = state.paused ? '▶' : '❚❚';
      $('#btnPause').classList.toggle('active', state.paused);
      document.body.classList.toggle('paused', state.paused);
    };
    $('#btnPause').onclick = pause;
    const tb = () => document.documentElement.style.setProperty('--tb', $('.topbar').offsetHeight + 'px');
    new ResizeObserver(tb).observe($('.topbar')); tb();
    document.querySelectorAll('#speedGroup .seg').forEach(b => { b.onclick = () => setSpeed(+b.dataset.speed); });
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); pause(); }
      else if (e.key >= '1' && e.key <= '4') setSpeed([1, 2, 4, 10][+e.key - 1]);
      else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && state.race) {
        const st = state.race.standings(), i = st.findIndex(r => r.id === state.selected);
        const j = clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, st.length - 1);
        selectRacer(st[j].id); e.preventDefault();
      }
    });
  }

  window.__yarost = { state, Champ }; // для отладки и автотестов
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
