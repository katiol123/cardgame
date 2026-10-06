/* Правила гонки: характеристики, движение по трассе, атаки, ИИ гонщиков. */
(function (G) {
  'use strict';
  const CFG = G.CFG;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rollStats(rand) {
    const s = [CFG.STAT_MIN, CFG.STAT_MIN, CFG.STAT_MIN];
    let left = CFG.STAT_TOTAL - 3 * CFG.STAT_MIN;
    const w = [rand() + 0.1, rand() + 0.1, rand() + 0.1];
    while (left > 0) {
      const tot = w.reduce((a, b, i) => a + (s[i] < CFG.STAT_MAX ? b : 0), 0);
      let x = rand() * tot, i = 0;
      for (; i < 3; i++) { if (s[i] >= CFG.STAT_MAX) continue; x -= w[i]; if (x <= 0) break; }
      if (i > 2) i = s.findIndex(v => v < CFG.STAT_MAX);
      s[i]++; left--;
    }
    return { accel: s[0], top: s[1], handling: s[2] };
  }

  // ---- производные характеристики ----
  const F = {
    vmax: r => (CFG.vmaxBase + CFG.vmaxPer * r.stats.top) * (1 - CFG.hpSpeedFactor * (1 - r.hp / CFG.MAX_HP)),
    vmaxRaw: r => CFG.vmaxBase + CFG.vmaxPer * r.stats.top,
    accel: r => CFG.accBase + CFG.accPer * r.stats.accel,
    corner: (r, sev, grip) => CFG.cornerBase + CFG.cornerPer * r.stats.handling +
      CFG.gripPer * (grip === undefined ? r.grip : grip) - (sev === 2 ? CFG.hairpinPenalty : 0),
    dodge: r => Math.min(0.45, CFG.dodgePer * r.stats.handling + CFG.gripDodge * r.grip),
    nitroBoost: r => CFG.nitroBase + CFG.nitroPer * r.stats.top
  };

  const CELL_FX = {
    boost: { name: 'Ускоритель', text: '+2 скорости' },
    ammo: { name: 'Ящик патронов', text: '+3 заряда' },
    repair: { name: 'Пит-стоп', text: '+12 прочности' },
    nitro: { name: 'Канистра нитро', text: '+3 нитро' },
    shield: { name: 'Бронепластина', text: '+9 щита' },
    hazard: { name: 'Обломки', text: '−7 прочности' }
  };

  // ---------------- ИИ ----------------
  const AI = {
    cornerAhead(race, r, reach) {
      let sev = 0, dist = -1;
      for (let k = 1; k <= reach; k++) {
        const c = race.track.cell(r.pos + k);
        if (c.corner) { if (dist < 0) dist = k; sev = Math.max(sev, c.corner); }
      }
      return { sev, dist };
    },
    threats(race, r) {
      let n = 0;
      for (const o of race.racers) {
        if (o === r || o.finished || o.skip) continue;
        const d = r.pos - o.pos, w = o.weapon;
        if (inSector(w, d)) n += o.charge / w.charge;
      }
      return n;
    },
    preyNear(race, r) {
      const w = r.weapon;
      return race.racers.some(o => o !== r && !o.finished && !o.skip && inSector(w, o.pos - r.pos, 3));
    },
    weights(race, r) {
      const vm = F.vmax(r), w = r.weapon;
      const projected = Math.min(vm, r.speed + F.accel(r) * 1.6);
      const ca = AI.cornerAhead(race, r, Math.ceil(projected) + 1);
      const over = ca.sev ? projected - F.corner(r, ca.sev) : -1;
      const need = Math.max(0, vm - r.speed) / vm;
      const W = [0, 0, 0, 0, 0, 0];
      W[0] = over > 0 ? 0.15 : 0.45 + need * 2.6;
      W[1] = r.nitro >= CFG.nitroMax ? 0.05 : 0.75;
      W[2] = r.charge >= w.charge ? 0.05 : 0.7 + (AI.preyNear(race, r) ? 0.8 : 0);
      W[3] = r.shield >= CFG.shieldMax ? 0.05 : 0.45 + Math.min(1.2, AI.threats(race, r) * 0.4) - (r.shield / CFG.shieldMax) * 0.35;
      W[4] = r.hp >= CFG.MAX_HP ? 0.03 : (CFG.MAX_HP - r.hp) / CFG.MAX_HP * 2.8 + (r.hp < 35 ? 1.4 : 0);
      W[5] = over > 0 ? 1.3 + over * 0.9 : (r.grip < 2 ? 0.45 : r.grip >= CFG.gripMax ? 0.05 : 0.2);
      return W;
    },
    choose(race, r) {
      let moves = r.board.listMoves();
      if (!moves.length) { r.board.shuffle(); moves = r.board.listMoves(); }
      const W = AI.weights(race, r);
      let best = moves[0], bs = -1e9;
      for (const m of moves) {
        const e = r.board.evaluate(m[0], m[1]);
        let s = 0;
        for (let t = 0; t < 6; t++) s += e.tally[t] * W[t];
        s += e.created * 1.1 + e.activations * 0.8;
        s += Math.floor(Math.max(m[0], m[1]) / r.board.n) * 0.04; // ходы внизу дают каскады
        s += race.rand() * r.noise;
        if (s > bs) { bs = s; best = m; }
      }
      return best;
    },
    useNitro(race, r) {
      const v = r.speed + F.nitroBoost(r);
      const ca = AI.cornerAhead(race, r, Math.ceil(v) + 1);
      return !ca.sev || v <= F.corner(r, ca.sev);
    },
    pickTargets(race, r, list) {
      const w = r.weapon;
      if (w.effect.aoe) return list;
      const st = race.standings();
      let best = null, bs = -1e9;
      for (const t of list) {
        const place = st.indexOf(t);
        let s = (16 - place) * 1.2;
        if (!w.effect.pierce) s -= t.shield * 0.35;
        if (t.hp + (w.effect.pierce ? 0 : t.shield) <= w.dmg) s += 25;
        if (t.lastAttacker === r.id) s += 6; // месть
        s -= Math.abs(t.pos - r.pos) * 0.2;
        s += race.rand() * 2;
        if (s > bs) { bs = s; best = t; }
      }
      return best ? [best] : [];
    }
  };

  function inSector(w, d, extra) {
    const R = w.range + (extra || 0);
    if (w.dir === 'front') return d >= 0 && d <= R;
    if (w.dir === 'rear') return d <= 0 && d >= -R;
    return Math.abs(d) <= R;
  }

  // ---------------- Гонка ----------------
  class Race {
    constructor(opts) {
      opts = opts || {};
      this.seed = opts.seed || ((Math.random() * 1e9) | 0);
      this.rand = mulberry32(this.seed);
      this.track = opts.track || G.buildTrack();
      this.round = 1;
      this.turn = 0;
      this.over = false;
      this.finishOrder = [];
      this.firstFinishRound = 0;
      const weapons = G.WEAPONS.slice();
      const pool = [];
      while (pool.length < 16) {
        const w = weapons.slice();
        for (let i = w.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [w[i], w[j]] = [w[j], w[i]]; }
        pool.push(...w);
      }
      this.racers = G.RACERS.map((d, id) => {
        const stats = opts.stats ? opts.stats(id, this.rand) : rollStats(this.rand);
        const r = {
          id, num: id + 1, name: d.name, color: d.color, stats,
          weapon: opts.weapon ? opts.weapon(id) : pool[id],
          board: new G.Board(this.rand),
          hp: CFG.MAX_HP, shield: 0, speed: 0, frac: 0,
          pos: -Math.floor(id / 2), lane: id % 2,
          nitro: 0, grip: 0, charge: 0, burn: null, skip: 0,
          finished: false, place: 0, finishRound: 0,
          crashes: 0, hits: 0, shots: 0, dmgDealt: 0, dmgTaken: 0, skids: 0, lastAttacker: -1,
          noise: 0.5
        };
        return r;
      });
      this.order = this.racers.map(r => r.id);
    }

    get current() { return this.racers[this.order[this.turn]]; }

    standings() {
      return this.racers.slice().sort((a, b) => {
        if (a.finished && b.finished) return a.place - b.place;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return (b.pos + b.frac * 0.01) - (a.pos + a.frac * 0.01) || a.id - b.id;
      });
    }

    lapOf(r) { return Math.min(this.track.laps, Math.max(1, Math.floor(r.pos / this.track.N) + 1)); }

    applyDamage(t, dmg, pierce) {
      let absorbed = 0;
      if (!pierce) { absorbed = Math.min(t.shield, dmg); t.shield -= absorbed; }
      const real = dmg - absorbed;
      t.hp = Math.max(0, t.hp - real);
      t.speed = Math.max(0, t.speed - real * CFG.hitSlowPer);
      t.dmgTaken += real;
      let crashed = false;
      if (t.hp <= 0 && !t.skip) { this.crash(t); crashed = true; }
      return { absorbed, real, crashed };
    }

    crash(t) {
      t.skip = CFG.crashSkip; t.speed = 0; t.nitro = 0; t.shield = 0; t.burn = null; t.frac = 0;
      t.charge = Math.floor(t.charge / 2); t.crashes++;
    }

    applyGains(r, tally) {
      const w = r.weapon, before = { speed: r.speed, nitro: r.nitro, charge: r.charge, shield: r.shield, hp: r.hp, grip: r.grip };
      const vm = F.vmax(r);
      r.speed = Math.min(vm, r.speed * (1 - CFG.drag) + F.accel(r) * (1 + CFG.fuelPer * tally[0]));
      r.nitro = Math.min(CFG.nitroMax, r.nitro + tally[1]);
      r.charge = Math.min(w.charge, r.charge + tally[2] * CFG.ammoPer);
      r.shield = Math.min(CFG.shieldMax, r.shield + tally[3] * CFG.shieldPer);
      r.hp = Math.min(CFG.MAX_HP, r.hp + tally[4] * CFG.repairPer);
      r.grip = Math.min(CFG.gripMax, r.grip + tally[5]);
      return {
        speed: r.speed - before.speed, nitro: r.nitro - before.nitro, charge: r.charge - before.charge,
        shield: r.shield - before.shield, hp: r.hp - before.hp, grip: r.grip - before.grip
      };
    }

    targetsInRange(r) {
      return this.racers.filter(t => t !== r && !t.finished && !t.skip && inSector(r.weapon, t.pos - r.pos));
    }

    tryAttack(r) {
      const w = r.weapon;
      if (r.charge < w.charge) return null;
      const list = this.targetsInRange(r);
      if (!list.length) return null;
      const targets = AI.pickTargets(this, r, list);
      if (!targets.length) return null;
      r.charge = 0; r.shots++;
      const hits = targets.map(t => {
        const chance = w.acc * (1 - F.dodge(t));
        const hit = this.rand() < chance;
        const res = { target: t, hit, chance, dmg: 0, absorbed: 0, crashed: false, effects: [] };
        if (!hit) return res;
        r.hits++;
        t.lastAttacker = r.id;
        const d = this.applyDamage(t, Math.round(w.dmg * CFG.dmgMul), w.effect.pierce);
        res.dmg = d.real; res.absorbed = d.absorbed; res.crashed = d.crashed;
        r.dmgDealt += d.real;
        const e = w.effect;
        if (e.slow) { t.speed = Math.max(0, t.speed - e.slow); res.effects.push(`−${e.slow} скорости`); }
        if (e.burn && !t.skip) { t.burn = { dmg: e.burn.dmg, turns: e.burn.turns, src: r.id }; res.effects.push('поджог'); }
        if (e.lock && !t.skip) { res.locked = t.board.lockRandom(e.lock, CFG.lockTurns); res.effects.push(`заморозка ${res.locked.length} блоков`); }
        if (e.pull) {
          const st = Math.min(t.speed, e.pull);
          t.speed -= st; r.speed = Math.min(F.vmax(r) + 1, r.speed + st);
          res.effects.push(`кража скорости ${st.toFixed(1)}`);
        }
        if (e.knock) { res.knockFrom = t.pos; t.pos -= e.knock; res.knockTo = t.pos; res.effects.push(`отброшен на ${e.knock}`); }
        if (e.strip) { t.grip = 0; res.effects.push('сцепление потеряно'); }
        return res;
      });
      return { attacker: r, weapon: w, hits };
    }

    move(r) {
      const tr = this.track, vm = F.vmax(r);
      let boost = 0;
      if (r.nitro >= CFG.nitroMax && AI.useNitro(this, r)) { boost = F.nitroBoost(r); r.nitro = 0; }
      const sevOver = (v, frac) => {
        let sev = 0; const n = Math.floor(v + frac);
        for (let k = 1; k <= n; k++) sev = Math.max(sev, tr.cell(r.pos + k).corner);
        return sev;
      };
      let v = r.speed + boost;
      let sev = sevOver(v, r.frac);
      let brake = 0;
      // торможение перед поворотом (ограничено мощностью тормозов)
      if (sev && v > F.corner(r, sev) + 0.01) {
        brake = Math.min(v - F.corner(r, sev), CFG.brakePower, r.speed);
        r.speed -= brake; v -= brake;
        sev = sevOver(v, r.frac);
      }
      const want = v + r.frac;
      let cells = Math.floor(want);
      let skid = null;
      if (sev) {
        const lim = F.corner(r, sev);
        if (v > lim + 0.01) {
          const over = v - lim;
          cells = Math.max(1, Math.floor(lim + r.frac));
          r.frac = 0;
          r.speed = Math.max(0.5, lim * CFG.skidKeep);
          r.grip = 0;
          r.skids++;
          const dmg = Math.round(over * CFG.skidDamage);
          const d = this.applyDamage(r, dmg, true);
          skid = { over, lim, dmg: d.real, crashed: d.crashed, sev };
        } else {
          r.grip = Math.max(0, r.grip - 2);
          r.frac = want - Math.floor(want);
        }
      } else r.frac = want - Math.floor(want);
      const from = r.pos;
      if (!skid || !skid.crashed) r.pos += cells; else r.pos += Math.max(0, cells - 1);
      const to = r.pos;
      // эффект клетки приземления
      let cellFx = null;
      const c = tr.cell(r.pos);
      if (!r.skip && c.kind !== 'plain' && r.pos > 0 && r.pos < tr.total) {
        cellFx = { kind: c.kind };
        if (c.kind === 'boost') r.speed = Math.min(vm, r.speed + 2);
        else if (c.kind === 'ammo') r.charge = Math.min(r.weapon.charge, r.charge + 3);
        else if (c.kind === 'repair') r.hp = Math.min(CFG.MAX_HP, r.hp + 12);
        else if (c.kind === 'nitro') r.nitro = Math.min(CFG.nitroMax, r.nitro + 3);
        else if (c.kind === 'shield') r.shield = Math.min(CFG.shieldMax, r.shield + 9);
        else if (c.kind === 'hazard') { const d = this.applyDamage(r, 7, false); r.speed = Math.max(0, r.speed - 1); cellFx.dmg = d.real; cellFx.crashed = d.crashed; }
      }
      let finished = false;
      if (r.pos >= tr.total) {
        r.finished = true; r.place = this.finishOrder.length + 1; r.finishRound = this.round;
        this.finishOrder.push(r.id); finished = true;
        if (!this.firstFinishRound) this.firstFinishRound = this.round;
      }
      return { from, to, cells, boost, brake, sev, skid, cellFx, finished };
    }

    playTurn() {
      if (this.over) return null;
      const r = this.current;
      const res = { racer: r, round: this.round, idx: this.turn };
      r.board.tickLocks();
      if (r.burn) {
        const b = r.burn;
        b.turns--; if (b.turns <= 0) r.burn = null;
        const d = this.applyDamage(r, b.dmg, true);
        res.burn = { dmg: d.real, crashed: d.crashed };
      }
      if (r.skip > 0 && !(res.burn && res.burn.crashed)) {
        r.skip--;
        res.skipped = true;
        if (r.skip === 0) { r.hp = CFG.crashHp; res.repaired = true; }
        this.advance();
        return res;
      }
      if (r.skip > 0) { this.advance(); res.skipped = true; return res; }
      const mv = AI.choose(this, r);
      res.match = r.board.execute(mv[0], mv[1]);
      res.gains = this.applyGains(r, res.match.tally);
      res.attack = this.tryAttack(r);
      res.move = this.move(r);
      this.advance();
      return res;
    }

    advance() {
      const n = this.order.length;
      for (let k = 0; k < n; k++) {
        this.turn++;
        if (this.turn >= n) { this.turn = 0; this.round++; this.checkEnd(true); }
        if (this.over) return;
        if (!this.current.finished) return;
      }
      this.checkEnd(false);
    }

    checkEnd(roundWrap) {
      if (this.racers.every(r => r.finished)) { this.over = true; return; }
      if (roundWrap && this.firstFinishRound && this.round > this.firstFinishRound + 6) {
        const rest = this.standings().filter(r => !r.finished);
        rest.forEach(r => { r.finished = true; r.dnf = true; r.place = this.finishOrder.length + 1; this.finishOrder.push(r.id); });
        this.over = true;
      }
    }
  }

  G.Race = Race; G.RaceF = F; G.RaceAI = AI; G.CELL_FX = CELL_FX; G.mulberry32 = mulberry32; G.rollStats = rollStats;
})(typeof window !== 'undefined' ? window : globalThis);
