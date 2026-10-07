/* Звук: всё синтезируется на лету через Web Audio — никаких файлов.
 * Snd.play(name, opts) — проиграть эффект; Snd.toggle() — вкл/выкл; громкость хранится в браузере. */
(function (G) {
  'use strict';
  const KEY = 'yarost-sound-v1';
  let ctx = null, master = null, comp = null, noiseBuf = null;
  const st = { on: true, vol: 0.6 };
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* без настроек */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* приватный режим */ } };

  // AudioContext можно создать только после жеста пользователя
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = G.AudioContext || G.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 6;
    master = ctx.createGain(); master.gain.value = st.on ? st.vol : 0;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  ['pointerdown', 'keydown'].forEach(ev => G.addEventListener && G.addEventListener(ev, init, { capture: true }));

  // ---------- примитивы ----------
  // огибающая: быстрая атака, экспоненциальное затухание
  function env(g, t, vol, att, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function tone(o) {
    const t = ctx.currentTime + (o.at || 0), dur = o.dur || 0.15;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.slide || dur));
    if (o.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = o.vib; lg.gain.value = o.vibDepth || 12; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.05); }
    env(g, t, o.vol || 0.3, o.att || 0.005, dur);
    let node = osc;
    if (o.filter) { const f = ctx.createBiquadFilter(); f.type = o.filter; f.frequency.value = o.ff || 1000; f.Q.value = o.q || 1; osc.connect(f); node = f; }
    node.connect(g); g.connect(o.out || master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  function noise(o) {
    const t = ctx.currentTime + (o.at || 0), dur = o.dur || 0.2;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    f.type = o.filter || 'lowpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f || 1200, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + (o.slide || dur));
    env(g, t, o.vol || 0.3, o.att || 0.004, dur);
    src.connect(f); f.connect(g); g.connect(o.out || master);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }
  const semi = (base, n) => base * Math.pow(2, n / 12);
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

  // ---------- библиотека звуков ----------
  const S = {
    click: () => tone({ f: 1800, to: 1200, dur: 0.04, type: 'square', vol: 0.05 }),
    swap: () => { tone({ f: 420, to: 640, dur: 0.09, type: 'sine', vol: 0.16 }); noise({ f: 3000, filter: 'highpass', dur: 0.05, vol: 0.04 }); },
    bad: () => { tone({ f: 220, to: 160, dur: 0.16, type: 'square', vol: 0.08, filter: 'lowpass', ff: 900 }); },
    // сгорание блоков: высота растёт с каскадом
    match: o => {
      const k = Math.min(SCALE.length - 1, (o.combo || 1) - 1), base = 523;
      tone({ f: semi(base, SCALE[k]), dur: 0.22, type: 'triangle', vol: 0.18 });
      tone({ f: semi(base, SCALE[k] + 7), dur: 0.18, type: 'sine', vol: 0.08, at: 0.03 });
      if ((o.n || 0) >= 5) tone({ f: semi(base, SCALE[k] + 12), dur: 0.3, type: 'sine', vol: 0.07, at: 0.06 });
      noise({ f: 6000, filter: 'highpass', dur: 0.08, vol: 0.05 });
    },
    born: () => { [0, 4, 7, 12].forEach((n, i) => tone({ f: semi(880, n), dur: 0.12, type: 'sine', vol: 0.07, at: i * 0.04 })); },
    line: () => { tone({ f: 1600, to: 260, dur: 0.32, type: 'sawtooth', vol: 0.09, filter: 'lowpass', ff: 3000 }); noise({ f: 4000, to: 600, filter: 'bandpass', dur: 0.3, vol: 0.08 }); },
    bomb: () => { noise({ f: 1800, to: 80, dur: 0.7, vol: 0.45 }); tone({ f: 110, to: 35, dur: 0.6, type: 'sine', vol: 0.45 }); },
    nova: () => { [0, 4, 7, 11, 14, 19].forEach((n, i) => tone({ f: semi(660, n), dur: 0.5, type: 'triangle', vol: 0.08, at: i * 0.05 })); noise({ f: 8000, filter: 'highpass', dur: 0.6, vol: 0.06, att: 0.1 }); },
    // выстрелы — по типу эффекта оружия
    shot: o => {
      switch (o.fx) {
        case 'bullets': for (let i = 0; i < 4; i++) { noise({ f: 2400, filter: 'bandpass', q: 2, dur: 0.05, vol: 0.22, at: i * 0.07 }); tone({ f: 180, to: 90, dur: 0.04, type: 'square', vol: 0.06, at: i * 0.07 }); } break;
        case 'pellets': noise({ f: 1400, to: 300, dur: 0.25, vol: 0.4 }); tone({ f: 140, to: 50, dur: 0.18, vol: 0.3 }); break;
        case 'rocket': noise({ f: 400, to: 3000, filter: 'bandpass', q: 1.5, dur: 0.45, vol: 0.25, att: 0.05 }); tone({ f: 200, to: 600, dur: 0.4, type: 'sawtooth', vol: 0.05, filter: 'lowpass', ff: 1200 }); break;
        case 'pulse': tone({ f: 180, to: 900, dur: 0.35, type: 'sine', vol: 0.2, vib: 30, vibDepth: 60 }); tone({ f: 90, to: 450, dur: 0.35, type: 'square', vol: 0.04, filter: 'lowpass', ff: 1500 }); break;
        case 'oil': for (let i = 0; i < 3; i++) tone({ f: 260 - i * 40, to: 120, dur: 0.12, type: 'sine', vol: 0.18, at: i * 0.08 }); noise({ f: 500, dur: 0.3, vol: 0.08 }); break;
        case 'flame': noise({ f: 700, filter: 'bandpass', q: 0.7, dur: 0.5, vol: 0.32, att: 0.04 }); noise({ f: 200, dur: 0.45, vol: 0.18 }); break;
        case 'hook': tone({ f: 1400, to: 500, dur: 0.18, type: 'square', vol: 0.06, filter: 'bandpass', ff: 1800, q: 4 }); noise({ f: 3500, filter: 'highpass', dur: 0.25, vol: 0.06 }); tone({ f: 2200, dur: 0.12, type: 'triangle', vol: 0.06, at: 0.2 }); break;
        case 'mines': tone({ f: 300, to: 200, dur: 0.06, type: 'square', vol: 0.06 }); tone({ f: 260, to: 180, dur: 0.06, type: 'square', vol: 0.06, at: 0.1 }); break;
        case 'beam': tone({ f: 2400, to: 160, dur: 0.5, type: 'sawtooth', vol: 0.12, filter: 'lowpass', ff: 4000 }); tone({ f: 60, dur: 0.5, type: 'sine', vol: 0.25 }); noise({ f: 5000, to: 800, filter: 'bandpass', dur: 0.4, vol: 0.08 }); break;
        case 'chain': noise({ f: 800, to: 2600, filter: 'bandpass', q: 3, dur: 0.3, vol: 0.18 }); tone({ f: 900, dur: 0.06, type: 'square', vol: 0.05, at: 0.25 }); break;
        default: noise({ f: 2000, dur: 0.12, vol: 0.2 });
      }
    },
    hit: o => { noise({ f: 1600, to: 200, dur: 0.18, vol: 0.32 }); tone({ f: 170, to: 55, dur: 0.18, type: 'sine', vol: 0.4 }); if (o && o.big) noise({ f: 600, to: 80, dur: 0.4, vol: 0.2, at: 0.05 }); },
    shield: () => { tone({ f: 1200, to: 900, dur: 0.18, type: 'triangle', vol: 0.12 }); tone({ f: 1800, dur: 0.1, type: 'sine', vol: 0.06 }); },
    miss: () => noise({ f: 2500, to: 5000, filter: 'highpass', dur: 0.18, vol: 0.08 }),
    crash: () => {
      noise({ f: 2400, to: 60, dur: 1.3, vol: 0.6 });
      tone({ f: 90, to: 28, dur: 1, type: 'sine', vol: 0.55 });
      for (let i = 0; i < 4; i++) tone({ f: 900 + Math.random() * 1500, dur: 0.07, type: 'square', vol: 0.04, at: 0.15 + i * 0.09 }); // обломки
    },
    nitro: () => { noise({ f: 300, to: 4000, filter: 'bandpass', q: 1.2, dur: 0.6, vol: 0.3, att: 0.04 }); tone({ f: 110, to: 330, dur: 0.55, type: 'sawtooth', vol: 0.07, filter: 'lowpass', ff: 900 }); },
    skid: () => { tone({ f: 900, to: 700, dur: 0.45, type: 'sawtooth', vol: 0.07, vib: 40, vibDepth: 80, filter: 'bandpass', ff: 1500, q: 3 }); noise({ f: 2500, filter: 'bandpass', q: 2, dur: 0.45, vol: 0.12 }); },
    brake: () => noise({ f: 3200, filter: 'bandpass', q: 6, dur: 0.18, vol: 0.05 }),
    jump: () => { tone({ f: 260, to: 720, dur: 0.3, type: 'sine', vol: 0.18 }); noise({ f: 900, to: 300, dur: 0.25, vol: 0.12, at: 0.45 }); tone({ f: 120, to: 60, dur: 0.15, vol: 0.2, at: 0.45 }); },
    pickup: o => {
      const k = o && o.kind;
      if (k === 'hazard') { noise({ f: 1200, to: 200, dur: 0.25, vol: 0.3 }); tone({ f: 200, to: 90, dur: 0.15, type: 'square', vol: 0.06 }); return; }
      const base = { boost: 660, nitro: 740, ammo: 520, repair: 440, shield: 590 }[k] || 600;
      tone({ f: base, dur: 0.08, type: 'square', vol: 0.06, filter: 'lowpass', ff: 3000 });
      tone({ f: base * 1.5, dur: 0.14, type: 'square', vol: 0.06, at: 0.07, filter: 'lowpass', ff: 3000 });
    },
    burn: () => { for (let i = 0; i < 5; i++) noise({ f: 3000 + Math.random() * 3000, filter: 'bandpass', q: 5, dur: 0.03, vol: 0.12, at: i * 0.05 + Math.random() * 0.03 }); noise({ f: 400, dur: 0.35, vol: 0.08 }); },
    ram: () => { tone({ f: 120, to: 50, dur: 0.25, type: 'square', vol: 0.12, filter: 'lowpass', ff: 600 }); noise({ f: 900, to: 150, dur: 0.3, vol: 0.35 }); tone({ f: 1300, dur: 0.12, type: 'triangle', vol: 0.05, at: 0.03 }); },
    nerve: () => tone({ f: 300, to: 180, dur: 0.4, type: 'triangle', vol: 0.1, vib: 9, vibDepth: 20 }),
    perk: () => { tone({ f: 1320, dur: 0.1, type: 'sine', vol: 0.06 }); tone({ f: 1760, dur: 0.14, type: 'sine', vol: 0.05, at: 0.06 }); },
    // нежить: призрачный вой; изгнание — светлый аккорд
    undead: o => {
      tone({ f: 520, to: 260, dur: 0.7, type: 'sine', vol: 0.14, vib: 6, vibDepth: 25, att: 0.08 });
      tone({ f: 780, to: 390, dur: 0.7, type: 'triangle', vol: 0.05, vib: 7, vibDepth: 30, att: 0.1 });
      if (o && o.hit) { noise({ f: 900, to: 150, dur: 0.25, vol: 0.25, at: 0.25 }); tone({ f: 150, to: 50, dur: 0.2, vol: 0.3, at: 0.25 }); }
    },
    banish: () => { [0, 4, 7, 12, 16].forEach((n, i) => tone({ f: semi(523, n), dur: 1.1, type: 'sine', vol: 0.09, at: i * 0.06, att: 0.02 })); noise({ f: 7000, filter: 'highpass', dur: 0.8, vol: 0.05, att: 0.2 }); },
    // старт и финиш
    beep: () => tone({ f: 440, dur: 0.22, type: 'square', vol: 0.12, filter: 'lowpass', ff: 2000 }),
    go: () => { tone({ f: 880, dur: 0.5, type: 'square', vol: 0.14, filter: 'lowpass', ff: 2500 }); noise({ f: 200, to: 1500, filter: 'bandpass', dur: 0.9, vol: 0.2, att: 0.1, at: 0.1 }); tone({ f: 70, to: 140, dur: 0.9, type: 'sawtooth', vol: 0.08, filter: 'lowpass', ff: 500, at: 0.1 }); },
    lastLap: () => { [0, 0.28].forEach(at => { tone({ f: 1046, dur: 0.6, type: 'sine', vol: 0.12, at }); tone({ f: 2093, dur: 0.4, type: 'sine', vol: 0.04, at }); }); },
    finish: o => {
      const win = o && o.place === 1;
      const notes = win ? [0, 4, 7, 12, 7, 12, 16] : [0, 4, 7];
      notes.forEach((n, i) => tone({ f: semi(win ? 523 : 659, n), dur: win && i === notes.length - 1 ? 0.6 : 0.16, type: 'square', vol: win ? 0.09 : 0.05, at: i * 0.11, filter: 'lowpass', ff: 3000 }));
      if (win) noise({ f: 1500, filter: 'bandpass', dur: 1.4, vol: 0.12, att: 0.3, at: 0.2 }); // трибуны
    },
    fanfare: () => { [[0, 4, 7], [5, 9, 12], [7, 11, 14], [12, 16, 19]].forEach((ch, i) => ch.forEach(n => tone({ f: semi(392, n), dur: i === 3 ? 1.2 : 0.3, type: 'sawtooth', vol: 0.045, at: i * 0.28, filter: 'lowpass', ff: 2200 }))); noise({ f: 1200, filter: 'bandpass', dur: 2, vol: 0.12, att: 0.4, at: 0.6 }); },
    coin: () => { tone({ f: 988, dur: 0.08, type: 'square', vol: 0.08, filter: 'lowpass', ff: 4000 }); tone({ f: 1319, dur: 0.25, type: 'square', vol: 0.08, at: 0.08, filter: 'lowpass', ff: 4000 }); },
    whoosh: () => noise({ f: 400, to: 2500, filter: 'bandpass', q: 1, dur: 0.35, vol: 0.12, att: 0.08 })
  };

  // ограничения, чтобы на скорости 10× не было каши: не чаще раза в N мс и не больше голосов за кадр
  const GAP = { match: 70, hit: 60, shot: 60, pickup: 80, miss: 80, swap: 60, click: 30, brake: 150, skid: 120, burn: 150, perk: 120, undead: 150, crash: 120, nerve: 200 };
  const last = {};
  let budget = 0, budgetAt = 0;
  function play(name, opts) {
    if (!st.on || !S[name]) return;
    init();
    if (!ctx || ctx.state !== 'running' && ctx.state !== 'suspended') return;
    const now = performance.now();
    if (now - (last[name] || 0) < (GAP[name] || 40)) return;
    if (now - budgetAt > 100) { budget = 0; budgetAt = now; }
    if (++budget > 6) return;
    last[name] = now;
    try { S[name](opts || {}); } catch (e) { if (G.__sndDebug) console.error('snd', name, e); } // звук не должен ломать игру
  }
  function set(on, vol) {
    if (typeof on === 'boolean') st.on = on;
    if (typeof vol === 'number') st.vol = Math.max(0, Math.min(1, vol));
    save();
    if (master) master.gain.setTargetAtTime(st.on ? st.vol : 0, ctx.currentTime, 0.03);
  }
  G.Snd = { play, set, toggle: () => set(!st.on), get on() { return st.on; }, get vol() { return st.vol; }, get state() { return ctx ? ctx.state : 'none'; }, NAMES: Object.keys(S) };
})(window);
