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

  function rollStats(rand, total) {
    const s = [CFG.STAT_MIN, CFG.STAT_MIN, CFG.STAT_MIN];
    let left = (total || CFG.STAT_TOTAL) - 3 * CFG.STAT_MIN;
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
  const has = (r, p) => !!(r.perks && r.perks.includes(p));
  const F = {
    vmax: r => (CFG.vmaxBase + CFG.vmaxPer * r.stats.top + (r.tm.vmaxAdd || 0) - (has(r, 'heavy') ? 0.4 : 0) + (r.lastLap && has(r, 'tactic') ? 2.6 : 0)) * (1 - CFG.hpSpeedFactor * (1 - r.hp / CFG.MAX_HP)),
    vmaxRaw: r => CFG.vmaxBase + CFG.vmaxPer * r.stats.top + (r.tm.vmaxAdd || 0) - (has(r, 'heavy') ? 0.4 : 0),
    accel: r => CFG.accBase + CFG.accPer * r.stats.accel,
    corner: (r, sev, grip) => CFG.cornerBase + CFG.cornerPer * r.stats.handling +
      CFG.gripPer * (grip === undefined ? r.grip : grip) - (sev === 2 ? CFG.hairpinPenalty : 0) + (r.tm.cornerAdd || 0) + (has(r, 'stunt') ? 1.3 : 0) + (has(r, 'careful') ? 0.8 : 0),
    dodge: r => Math.min(0.5, CFG.dodgePer * r.stats.handling + CFG.gripDodge * r.grip + (has(r, 'lucky') ? 0.1 : 0)),
    nitroBoost: r => (CFG.nitroBase + CFG.nitroPer * r.stats.top + 0.7 * r.crew.nitro) * (has(r, 'tactic') ? 2.5 : 1)
  };

  const CELL_FX = {
    boost: { name: 'Ускоритель', text: '+2 скорости' },
    ammo: { name: 'Ящик патронов', text: '+3 заряда' },
    repair: { name: 'Пит-стоп', text: '+12 прочности' },
    nitro: { name: 'Канистра нитро', text: '+3 нитро' },
    shield: { name: 'Бронепластина', text: '+9 щита' },
    hazard: { name: 'Обломки', text: '−7 прочности' },
    jump: { name: 'Трамплин', text: 'прыжок вперёд, −4 прочности' }
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
      W[0] = (over > 0 ? 0.15 : 0.45 + need * 2.6) * (has(r, 'ram') && over <= 0 ? 1.3 : 1);
      W[1] = r.nitro >= CFG.nitroMax && !has(r, 'tactic') ? 0.05 : 0.75;
      W[2] = r.charge >= w.charge ? 0.05 : (0.7 + (AI.preyNear(race, r) ? 0.8 : 0)) * (has(r, 'aggro') ? 3 : 1);
      W[3] = r.shield >= CFG.shieldMax ? 0.05 : 0.45 + Math.min(1.2, AI.threats(race, r) * 0.4) - (r.shield / CFG.shieldMax) * 0.35;
      W[4] = r.hp >= CFG.MAX_HP ? 0.03 : (CFG.MAX_HP - r.hp) / CFG.MAX_HP * 2.8 + (r.hp < 35 ? 1.4 : 0);
      W[5] = over > 0 ? 1.3 + over * 0.9 : (r.grip < 2 ? 0.45 : r.grip >= CFG.gripMax ? 0.05 : 0.2);
      if (has(r, 'careful')) { W[3] *= 1.6; W[4] *= 1.6; }
      return W;
    },
    choose(race, r) {
      let moves = r.board.listMoves();
      if (!moves.length) { r.board.shuffle(); moves = r.board.listMoves(); }
      if (has(r, 'impulsive') && race.rand() < 0.35) { r.impulseMove = true; return moves[Math.floor(race.rand() * moves.length)]; }
      r.impulseMove = false;
      const W = r.finished ? [1, 1, 1, 1, 1, 1] : AI.weights(race, r);
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
      if (has(r, 'tactic') && race.lapOf(r) < race.track.laps) return false; // копит до последнего круга
      if (has(r, 'careful') && r.hp < 50) return false;
      const v = r.speed + F.nitroBoost(r);
      const ca = AI.cornerAhead(race, r, Math.ceil(v) + 1);
      return !ca.sev || v <= F.corner(r, ca.sev);
    },
    pickTargets(race, r, list) {
      const w = r.weapon;
      if (w.effect.aoe) return list;
      if (has(r, 'hunter')) { const st = race.standings(); return [list.slice().sort((a, b) => st.indexOf(a) - st.indexOf(b))[0]]; }
      if (has(r, 'aggro')) return [list.slice().sort((a, b) => Math.abs(a.pos - r.pos) - Math.abs(b.pos - r.pos))[0]];
      if (w.effect.chain) return list.slice().sort((a, b) => Math.abs(a.pos - r.pos) - Math.abs(b.pos - r.pos)).slice(0, w.effect.chain);
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
      this.mods = Object.assign({}, this.track.mods || {}, opts.mods || {});
      if (this.mods.rain) { this.mods.cornerAdd = (this.mods.cornerAdd || 0) - 0.8; this.mods.accMul = (this.mods.accMul || 1) * 0.9; }
      this.round = 1;
      this.turn = 0;
      this.over = false;
      this.finishOrder = [];
      this.fx = []; // события перков для интерфейса: {id, text, color}
      this.firstFinishRound = 0;
      const weapons = G.WEAPONS.filter(w => !w.shop);
      const pool = [];
      while (pool.length < 16) {
        const w = weapons.slice();
        for (let i = w.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [w[i], w[j]] = [w[j], w[i]]; }
        pool.push(...w);
      }
      const grid = opts.grid || G.RACERS.map((_, i) => i);
      this.racers = G.RACERS.map((d, id) => {
        const ros = opts.roster && opts.roster[id];
        const stats = ros ? G.effectiveStats(ros) : opts.stats ? opts.stats(id, this.rand) : rollStats(this.rand);
        const slot = grid.indexOf(id);
        const r = {
          id, num: id + 1, name: d.name, color: d.color, stats, tm: this.mods,
          human: id === opts.human,
          weapon: ros ? G.makeWeapon(ros.weapon, ros.wmods) : opts.weapon ? opts.weapon(id) : pool[id],
          crew: Object.assign({ mech: 0, gun: 0, armor: 0, nitro: 0 }, ros && ros.crew), fame: 0, showFame: 0, kills: 0, breaks: [],
          perks: (ros && ros.perks) || [], tier: ros && ros.tier, baseStats: ros ? Object.assign({}, ros.stats) : null, broken: (ros && ros.broken) || [],
          morale: ros && typeof ros.morale === 'number' ? ros.morale : 50, nerves: 0, face: ros && ros.face,
          board: new G.Board(this.rand),
          hp: CFG.MAX_HP, shield: 0, speed: 0, frac: 0,
          pos: -Math.floor(slot / 2), lane: slot % 2,
          nitro: 0, grip: 0, charge: 0, burn: null, skip: 0,
          finished: false, place: 0, finishRound: 0,
          crashes: 0, hits: 0, shots: 0, dmgDealt: 0, dmgTaken: 0, skids: 0, lastAttacker: -1,
          noise: 0.5
        };
        return r;
      });
      this.order = grid.slice();
      // стартовые бонусы от команды
      this.racers.forEach(r => {
        r.shield = 6 * r.crew.armor;
        r.charge = Math.min(r.weapon.charge, Math.floor(r.weapon.charge * 0.4 * r.crew.gun));
        r.nitro = Math.min(CFG.nitroMax, 3 * r.crew.nitro);
      });
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
      let lucky = false;
      if (t.hp <= 0 && !t.skip && has(t, 'lucky') && !t.luckUsed) { t.hp = 1; t.luckUsed = true; lucky = true; this.fx.push({ id: t.id, text: '🍀 ЧУДО! Уцелел', color: '#2fdc74' }); }
      t.speed = Math.max(0, t.speed - real * CFG.hitSlowPer);
      t.dmgTaken += real;
      let crashed = false;
      if (t.hp <= 0 && !t.skip) { this.crash(t); crashed = true; }
      return { absorbed, real, crashed, lucky };
    }

    crash(t) {
      t.skip = CFG.crashSkip - (t.crew && t.crew.mech >= 3 ? 1 : 0); t.speed = 0; t.nitro = 0; t.shield = 0; t.burn = null; t.frac = 0;
      t.charge = Math.floor(t.charge / 2); t.crashes++;
      // поломка узла: проявится со следующего этапа
      if (CFG.breakOn && this.rand() < CFG.breakChance) {
        const st = ['accel', 'top', 'handling'][Math.floor(this.rand() * 3)];
        t.breaks.push(st);
        this.fx.push({ id: t.id, text: `🔧 ПОЛОМКА: ${{ accel: 'двигатель', top: 'трансмиссия', handling: 'подвеска' }[st]}`, color: '#ff7a00' });
      }
    }

    applyGains(r, tally) {
      const w = r.weapon, before = { speed: r.speed, nitro: r.nitro, charge: r.charge, shield: r.shield, hp: r.hp, grip: r.grip };
      const vm = F.vmax(r);
      r.speed = Math.min(vm, r.speed * (1 - CFG.drag) + F.accel(r) * (1 + CFG.fuelPer * tally[0]));
      const over = Math.max(0, r.nitro + tally[1] - CFG.nitroMax);
      r.nitro = Math.min(CFG.nitroMax, r.nitro + tally[1]);
      if (over && has(r, 'tactic')) r.shield = Math.min(CFG.shieldMax, r.shield + over * 3); // излишки нитро — в броню
      r.charge = Math.min(w.charge, r.charge + tally[2] * CFG.ammoPer * (1 + 0.1 * r.crew.gun));
      r.shield = Math.min(CFG.shieldMax, r.shield + tally[3] * CFG.shieldPer * (has(r, 'heavy') ? 1.5 : 1));
      r.hp = Math.min(CFG.MAX_HP, r.hp + tally[4] * CFG.repairPer * (1 + 0.15 * r.crew.mech));
      r.grip = Math.min(CFG.gripMax, r.grip + tally[5]);
      return {
        speed: r.speed - before.speed, nitro: r.nitro - before.nitro, charge: r.charge - before.charge,
        shield: r.shield - before.shield, hp: r.hp - before.hp, grip: r.grip - before.grip
      };
    }

    targetsInRange(r) {
      const tr = this.track;
      return this.racers.filter(t => {
        if (t === r || t.finished || t.skip) return false;
        if (inSector(r.weapon, t.pos - r.pos)) return true;
        if (this.mods.crossShots) { // мост «восьмёрки»: цель физически рядом
          const a = tr.cell(r.pos), b = tr.cell(t.pos);
          return Math.hypot(a.x - b.x, a.y - b.y) <= r.weapon.range * 14 + 30;
        }
        return false;
      });
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
        let acc = w.acc * (this.mods.accMul || 1) * (1 + (r.morale - 50) / 500); // мораль: твёрдость руки ±10%
        if (this.track.cell(r.pos).tunnel || this.track.cell(t.pos).tunnel) acc *= 0.6;
        const chance = acc * (1 - F.dodge(t));
        const hit = this.rand() < chance;
        const res = { target: t, hit, chance, dmg: 0, absorbed: 0, crashed: false, effects: [] };
        if (!hit) return res;
        r.hits++;
        t.lastAttacker = r.id;
        const revenge = has(r, 'avenger') && r.revengeOn === t.id;
        const hunt = has(r, 'hunter') && this.standings().indexOf(t) < 3;
        if (revenge) r.revengeOn = -1;
        const d = this.applyDamage(t, Math.round(w.dmg * CFG.dmgMul * (has(r, 'aggro') ? 1.2 : 1) * (revenge ? 1.5 : 1) * (hunt ? 1.3 : 1)), w.effect.pierce);
        if (hunt) res.effects.push('охота на лидера ×1,3');
        if (revenge) res.effects.push('месть ×1,5');
        res.dmg = d.real; res.absorbed = d.absorbed; res.crashed = d.crashed; res.lucky = d.lucky;
        r.dmgDealt += d.real;
        r.fame += G.ECON.fameHit + (d.crashed ? G.ECON.fameCrash : 0);
        if (d.crashed) r.kills++;
        const e = w.effect, cold = has(t, 'cold'), heavy = has(t, 'heavy'), fireproof = has(t, 'pyro');
        if ((cold && (e.slow || e.lock || e.strip)) || (heavy && (e.pull || e.knock)) || (fireproof && e.burn)) res.effects.push('иммунитет');
        if (e.slow && !cold) { t.speed = Math.max(0, t.speed - e.slow); res.effects.push(`−${e.slow} скорости`); }
        if (e.burn && !t.skip && !fireproof) { t.burn = { dmg: e.burn.dmg, turns: e.burn.turns, src: r.id }; res.effects.push('поджог'); }
        else if (has(r, 'pyro') && !t.skip && !fireproof && !t.burn) { t.burn = { dmg: 4, turns: 3, src: r.id }; res.effects.push('поджог'); }
        if (e.lock && !t.skip && !cold) { res.locked = t.board.lockRandom(e.lock, CFG.lockTurns); res.effects.push(`заморозка ${res.locked.length} блоков`); }
        if (has(t, 'avenger') && !t.skip) { t.charge = Math.min(t.weapon.charge, t.charge + 3); t.revengeOn = r.id; this.fx.push({ id: t.id, text: '💢 МЕСТЬ!', color: '#ff5470' }); }
        if (e.pull && !heavy) {
          const st = Math.min(t.speed, e.pull);
          t.speed -= st; r.speed = Math.min(F.vmax(r) + 1, r.speed + st);
          res.effects.push(`кража скорости ${st.toFixed(1)}`);
        }
        // эффекты в пользу стрелка (у дорогих пушек): форсаж и перехват нитро
        if (e.rush) { r.speed = Math.min(F.vmax(r) + 1, r.speed + e.rush); res.effects.push(`форсаж +${e.rush}`); }
        if (e.nitro) { r.nitro = Math.min(CFG.nitroMax, r.nitro + e.nitro); res.effects.push(`+${e.nitro} нитро стрелку`); }
        if (e.knock && !heavy) { res.knockFrom = t.pos; t.pos -= e.knock; res.knockTo = t.pos; res.effects.push(`отброшен на ${e.knock}`); }
        if (e.strip && !cold) { t.grip = 0; res.effects.push('сцепление потеряно'); }
        return res;
      });
      return { attacker: r, weapon: w, hits };
    }

    move(r) {
      r.lastLap = this.lapOf(r) >= this.track.laps;
      const tr = this.track, vm = F.vmax(r);
      if (has(r, 'drafter') && this.racers.some(o => o !== r && !o.finished && o.pos - r.pos >= 1 && o.pos - r.pos <= 3)) {
        r.speed = Math.min(vm + 0.5, r.speed + 0.5);
        this.fx.push({ id: r.id, text: '🌀 слипстрим', color: '#9fe8ff' });
      }
      // давка: проверка морали
      let nerve = null;
      const crowd = this.crowdAround(r);
      if (crowd >= 2 && this.round >= CFG.crowdFrom) {
        const p = Math.min(CFG.crowdMaxP, CFG.crowdBase * (crowd - 1) * (100 - r.morale) / 50) * (has(r, 'cold') ? 0.5 : 1);
        if (this.rand() < p) {
          const breakdown = this.rand() < CFG.breakdownChance;
          nerve = this.nerveHit(r, breakdown);
          r.nerves++;
          this.fx.push({ id: r.id, text: breakdown ? (nerve.stun ? '😱 СРЫВ: пропуск хода' : '😱 НЕРВНЫЙ СРЫВ') : '😰 ДРОГНУЛ!', color: '#c9a6ff' });
        }
      }
      let boost = 0;
      if (r.nitro >= CFG.nitroMax && AI.useNitro(this, r)) { boost = F.nitroBoost(r); r.nitro = 0; }
      const sevOver = (v, frac) => {
        let sev = 0; const n = Math.floor(v + frac);
        for (let k = 1; k <= n; k++) sev = Math.max(sev, tr.cell(r.pos + k).corner);
        return sev;
      };
      let v = r.speed + boost;
      if (nerve && nerve.halfMove) { const cut = v * 0.5; v -= cut; nerve.loss = cut; } // дрогнул: проехал только полпути
      let sev = sevOver(v, r.frac);
      let brake = 0;
      // осторожный тормозит заранее: смотрит на два хода вперёд
      if (has(r, 'careful') && !sev) {
        const ahead = sevOver(v * 2, r.frac);
        // тормозит заранее только если обычных тормозов на следующем ходу не хватит
        if (ahead && v - F.corner(r, ahead) > CFG.brakePower) { const b0 = Math.min(v - F.corner(r, ahead) - CFG.brakePower, CFG.brakePower, r.speed); r.speed -= b0; v -= b0; }
      }
      // торможение перед поворотом (ограничено мощностью тормозов)
      if (sev && v > F.corner(r, sev) + 0.01 && !has(r, 'stunt')) {
        brake = Math.min(v - F.corner(r, sev), CFG.brakePower * (has(r, 'cold') ? 2 : 1), r.speed);
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
          r.speed = Math.max(0.5, lim * (has(r, 'stunt') ? 0.95 : CFG.skidKeep));
          r.grip = 0;
          r.skids++;
          const dmg = Math.round(over * CFG.skidDamage * (has(r, 'stunt') ? 0.2 : 1));
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
      // барахольщик: бонусы клеток по пути
      const picked = [];
      if (has(r, 'magnet') && !r.skip) {
        for (let k = from + 1; k < to; k++) {
          const pc = tr.cell(k);
          if (k > 0 && ['boost', 'ammo', 'repair', 'nitro', 'shield'].includes(pc.kind)) { this.cellEffect(r, pc); picked.push({ kind: pc.kind, pos: k }); }
        }
      }
      // эффект клетки приземления
      let cellFx = null;
      const c = tr.cell(r.pos);
      if (!r.skip && c.kind !== 'plain' && r.pos > 0 && r.pos < tr.total) cellFx = this.cellEffect(r, c);
      // таран: закончил ход в одной клетке с соперником
      let ram = null;
      if (has(r, 'ram') && !r.skip && r.pos > 0 && r.pos < tr.total) {
        const t = this.racers.find(o => o !== r && !o.finished && !o.skip && Math.floor(o.pos) === Math.floor(r.pos));
        if (t) {
          const dt = this.applyDamage(t, 12, false); t.speed = Math.max(0, t.speed - 1);
          const ds = this.applyDamage(r, 6, true);
          r.fame += G.ECON.fameHit; if (dt.crashed) { r.kills++; r.fame += G.ECON.fameCrash; }
          ram = { target: t, dmg: dt.real, self: ds.real, crashed: dt.crashed, selfCrashed: ds.crashed };
          this.fx.push({ id: r.id, text: `🐏 ТАРАН! ${t.name} −${dt.real}`, color: '#ff9a3c' });
        }
      }
      let finished = false;
      if (r.pos >= tr.total) {
        r.finished = true; r.place = this.finishOrder.length + 1; r.finishRound = this.round;
        this.finishOrder.push(r.id); finished = true;
        if (!this.firstFinishRound) this.firstFinishRound = this.round;
      }
      return { from, to, cells, boost, brake, sev, skid, cellFx, picked, nerve, crowd, ram, finished };
    }

    // последствия «дрогнул» / «нервный срыв» (вариант задаётся CFG.nerveMode)
    nerveHit(r, breakdown) {
      const m = CFG.nerveMode, U = (a, b) => a + this.rand() * (b - a);
      const out = { breakdown, loss: 0, stun: false, locked: [] };
      const slow = v => { out.loss += Math.min(r.speed, v); r.speed = Math.max(0, r.speed - v); };
      if (m === 'A') { slow(U(0.8, 1.5)); if (breakdown) r.grip = Math.max(0, r.grip - 3); }
      else if (m === 'B') { slow(U(CFG.crowdLoss[0], CFG.crowdLoss[1])); if (breakdown) out.stun = true; }
      else if (m === 'C') { out.halfMove = true; if (breakdown) { out.stun = true; r.nitro = 0; } }
      else if (m === 'D') { slow(U(0.8, 1.5)); out.locked = r.board.lockRandom(3, 2); if (breakdown) out.stun = true; }
      else if (m === 'E') { slow(r.speed * 0.5); if (breakdown) { out.stun = true; slow(r.speed * 0.5); } }
      else if (m === 'F') { out.stun = true; if (breakdown) out.stun2 = true; }
      if (out.stun) r.stunned = out.stun2 ? 2 : 1;
      return out;
    }

    // сколько «давления» вокруг: соседи в ±1 клетке, агрессор давит за двоих
    crowdAround(r) {
      let n = 0;
      this.racers.forEach(o => { if (o !== r && !o.finished && !o.skip && Math.abs(o.pos - r.pos) <= 1) n += has(o, 'aggro') ? 2 : 1; });
      return n;
    }

    jackpot(r) {
      const t = Math.floor(this.rand() * 6), names = ['скорость', 'нитро', 'заряд', 'щит', 'ремонт', 'сцепление'];
      if (t === 0) r.speed = Math.min(F.vmax(r), r.speed + F.accel(r) * CFG.fuelPer * 3);
      else if (t === 1) r.nitro = Math.min(CFG.nitroMax, r.nitro + 3);
      else if (t === 2) r.charge = Math.min(r.weapon.charge, r.charge + 3 * CFG.ammoPer);
      else if (t === 3) r.shield = Math.min(CFG.shieldMax, r.shield + 3 * CFG.shieldPer);
      else if (t === 4) r.hp = Math.min(CFG.MAX_HP, r.hp + 3 * CFG.repairPer);
      else r.grip = Math.min(CFG.gripMax, r.grip + 3);
      this.fx.push({ id: r.id, text: `🎰 ДЖЕКПОТ: ${names[t]}`, color: '#ffd23f' });
    }

    cellEffect(r, c) {
      const tr = this.track, vm = F.vmax(r), fx = { kind: c.kind }, stunt = has(r, 'stunt');
      if (c.kind === 'boost') r.speed = Math.min(vm, r.speed + 2);
      else if (c.kind === 'ammo') r.charge = Math.min(r.weapon.charge, r.charge + 3);
      else if (c.kind === 'repair') r.hp = Math.min(CFG.MAX_HP, r.hp + 12 + 8 * r.crew.mech);
      else if (c.kind === 'nitro') r.nitro = Math.min(CFG.nitroMax, r.nitro + 3);
      else if (c.kind === 'shield') r.shield = Math.min(CFG.shieldMax, r.shield + 9);
      else if (c.kind === 'jump') {
        fx.from = r.pos; r.pos += tr.jumpLen + (stunt ? 2 : 0); fx.to = r.pos;
        const d = this.applyDamage(r, stunt ? 0 : 4, false); fx.dmg = d.real; fx.crashed = d.crashed;
      } else if (c.kind === 'hazard') {
        const d = this.applyDamage(r, stunt ? 0 : Math.round(7 * (this.mods.hazardMul || 1)), false);
        if (!stunt) r.speed = Math.max(0, r.speed - 1);
        fx.dmg = d.real; fx.crashed = d.crashed;
      }
      return fx;
    }

    // нужен ли ход человека (поле ждёт ввода)
    needsInput() {
      const r = this.current;
      return !this.over && r.human && (r.finished || (!r.skip && !r.stunned && !(r.burn && r.hp <= r.burn.dmg)));
    }

    playTurn(move) {
      if (this.over) return null;
      const r = this.current;
      const res = { racer: r, round: this.round, idx: this.turn };
      const fame0 = r.fame;
      if (r.finished) {
        // «Шоу для фанатов»: после финиша поле приносит славу
        const mv = move && r.board.swapValid(move[0], move[1]) ? move : AI.choose(this, r);
        res.match = r.board.execute(mv[0], mv[1]);
        const gain = Math.round(res.match.tally.reduce((a, b) => a + b, 0) + res.match.specials * 3);
        r.fame += gain; r.showFame += gain;
        res.show = true; res.fame = gain;
        r.board.tickLocks();
        this.advance();
        return res;
      }
      if (r.burn && has(r, 'pyro')) r.burn = null;
      if (r.burn) {
        const b = r.burn;
        b.turns--; if (b.turns <= 0) r.burn = null;
        const d = this.applyDamage(r, b.dmg, true);
        res.burn = { dmg: d.real, crashed: d.crashed };
      }
      if (r.stunned > 0 && !r.skip) {
        r.stunned--;
        res.skipped = true; res.stunned = true;
        r.speed *= CFG.stunKeep;
        r.board.tickLocks();
        this.advance();
        return res;
      }
      if (r.skip > 0 && !(res.burn && res.burn.crashed)) {
        r.skip--;
        res.skipped = true;
        if (r.skip === 0) { r.hp = CFG.crashHp; res.repaired = true; }
        r.board.tickLocks();
        this.advance();
        return res;
      }
      if (r.skip > 0) { r.board.tickLocks(); this.advance(); res.skipped = true; return res; }
      const mv = move && r.board.swapValid(move[0], move[1]) ? move : AI.choose(this, r);
      res.match = r.board.execute(mv[0], mv[1]);
      if (res.match.combo >= 3) r.fame += G.ECON.fameCombo * (res.match.combo - 2);
      if (has(r, 'impulsive') && res.match.combo >= 3) {
        res.match.tally = res.match.tally.map(x => x * 2);
        this.fx.push({ id: r.id, text: `🎲 ВЕЗЕНИЕ: улов ×2`, color: '#ffd23f' });
      }
      res.gains = this.applyGains(r, res.match.tally);
      if (r.crew.mech) r.hp = Math.min(CFG.MAX_HP, r.hp + 1.5 * r.crew.mech);
      if (has(r, 'gambler') && this.rand() < 0.15) this.jackpot(r);
      res.attack = this.tryAttack(r);
      res.move = this.move(r);
      res.fame = r.fame - fame0;
      r.board.tickLocks();
      this.advance();
      return res;
    }

    advance() {
      const n = this.order.length;
      for (let k = 0; k < n; k++) {
        this.turn++;
        if (this.turn >= n) { this.turn = 0; this.round++; this.checkEnd(true); }
        if (this.over) return;
        if (!this.current.finished || !this.current.dnf) return;
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

  // характеристики с учётом поломок и упадка духа (не ниже 1)
  G.effectiveStats = ros => {
    const s = Object.assign({}, ros.stats);
    (ros.broken || []).forEach(b => { s[b.stat] -= b.amount; });
    Object.keys(s).forEach(k => { s[k] = Math.max(1, s[k]); });
    return s;
  };
  G.Race = Race; G.RaceF = F; G.hasPerk = has; G.RaceAI = AI; G.CELL_FX = CELL_FX; G.mulberry32 = mulberry32; G.rollStats = rollStats;
})(typeof window !== 'undefined' ? window : globalThis);
