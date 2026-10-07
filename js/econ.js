/* Гараж: магазин улучшений за «Славу» и покупки ИИ-гонщиков. Без DOM. */
(function (G) {
  'use strict';
  const E = G.ECON;
  const RANK = { common: 0, rare: 1, epic: 2, legend: 3, relic: 4 };
  const STAT_NAME = { accel: 'Разгон', top: 'Макс. скорость', handling: 'Маневренность' };

  function ensure(ros) {
    ros.wmods = Object.assign({ cal: 0, mag: 0, aim: 0 }, ros.wmods);
    ros.crew = Object.assign({ mech: 0, gun: 0, armor: 0, nitro: 0, psy: 0 }, ros.crew);
    if (typeof ros.morale !== 'number') ros.morale = 50;
    ros.perks = ros.perks || [];
    ros.broken = ros.broken || [];
    if (ros.perks.includes('paladin')) ros.weapon = 'holy'; // реликвия паладина навсегда
    return ros;
  }
  const PART = { accel: 'двигатель', top: 'трансмиссия', handling: 'подвеска' };
  // цена ремонта: механик −25% за уровень; при repairByRank лидеру дороже (×1,3), аутсайдеру дешевле (×0,7)
  // при repairByStat цена пропорциональна значению сломанной характеристики (×значение/12)
  const repairCost = (ros, stat) => {
    const rankMul = G.CFG.repairByRank && ros.champRank ? 1.3 - 0.6 * (ros.champRank - 1) / 15 : 1;
    const statMul = G.CFG.repairByStat && stat ? ros.stats[stat] / 12 : 1;
    return Math.max(15, Math.round(G.CFG.repairCost * rankMul * statMul * (1 - 0.25 * ((ros.crew && ros.crew.mech) || 0))));
  };
  const weaponOf = ros => G.WEAPONS.find(w => w.id === ros.weapon);
  const sellValue = ros => Math.round(weaponOf(ros).price * E.sellBack);

  // Все доступные покупки для гонщика
  function options(ros) {
    ensure(ros);
    const out = [];
    Object.keys(STAT_NAME).forEach(k => {
      const v = ros.stats[k];
      if (v < E.statMax) out.push({ type: 'stat', key: k, lvl: v, price: E.statCost(k, v) });
    });
    Object.keys(E.wmods).forEach(k => {
      const l = ros.wmods[k];
      if (l < 3) out.push({ type: 'wmod', key: k, lvl: l, price: E.wmodCost[k][l] });
    });
    Object.keys(E.crew).forEach(k => {
      const l = ros.crew[k];
      if (l < 3) out.push({ type: 'crew', key: k, lvl: l, price: E.crewCost[k][l] });
    });
    ros.broken.forEach((b, i) => out.push({ type: 'repair', key: i, stat: b.stat, amount: b.amount, price: repairCost(ros, b.stat) }));
    const sell = sellValue(ros);
    if (!ros.perks.includes('paladin')) G.WEAPONS.forEach(w => {
      if (w.id !== ros.weapon && !w.relic) out.push({ type: 'weapon', key: w.id, full: w.price, sell, price: Math.max(0, w.price - sell) });
    });
    return out;
  }

  function apply(ros, opt) {
    ensure(ros);
    if (opt.type === 'stat') ros.stats[opt.key]++;
    else if (opt.type === 'wmod') ros.wmods[opt.key]++;
    else if (opt.type === 'crew') ros.crew[opt.key]++;
    else if (opt.type === 'weapon') { ros.weapon = opt.key; ros.wmods = { cal: 0, mag: 0, aim: 0 }; }
    else if (opt.type === 'repair') ros.broken.splice(opt.key, 1);
  }

  function label(opt) {
    if (opt.type === 'repair') return `Ремонт: ${PART[opt.stat]} (${STAT_NAME[opt.stat]} +${opt.amount})`;
    if (opt.type === 'stat') return `${STAT_NAME[opt.key]} ${opt.lvl} → ${opt.lvl + 1}`;
    if (opt.type === 'wmod') return `${E.wmods[opt.key].name} оружия ур. ${opt.lvl + 1}`;
    if (opt.type === 'crew') return `${E.crew[opt.key].name} ур. ${opt.lvl + 1}`;
    const w = G.WEAPONS.find(x => x.id === opt.key);
    return `${w.name} (${G.RARITY[w.rarity].name.toLowerCase()})`;
  }

  // Траты ИИ. Каждый вариант оценивается как «сила апгрейда / цена» (сила измерена симуляцией).
  // Лучший вариант выбирается из ВСЕХ, а не только из доступных: если он пока не по карману,
  // но уже накоплена заметная часть, ИИ копит. Иначе дешёвые апы всегда перебивали бы дорогую команду.
  const W_POWER = { common: 0, rare: 0.45, epic: 1.05, legend: 1.75, relic: 0 };
  function aiValue(ros, o) {
    let v;
    if (o.type === 'weapon') v = W_POWER[G.WEAPONS.find(w => w.id === o.key).rarity] - W_POWER[weaponOf(ros).rarity]; // мест к обычной пушке, sim/weapons.js
    else if (o.type === 'repair') v = E.value.stat[o.stat] * (o.amount * 1.5 + G.CFG.sponsorLoss * 4); // ремонт спасает и от постоянной потери
    else v = E.value[o.type][o.key];
    if (o.type === 'stat') v *= 1.25 - ros.stats[o.key] / 25;
    if (o.type === 'repair') v *= 1.25 - ros.stats[o.stat] / 25; // слабые характеристики тянет подтянуть
    if (o.type === 'wmod' || (o.type === 'crew' && o.key === 'gun')) v += 0.01; // оружейные апы ещё и приносят немного славы за попадания
    return v;
  }
  function aiSpend(ros, wallet, rand) {
    ensure(ros);
    const bought = [], items = [];
    // вкус гонщика на весь магазин: кто-то любит железо, кто-то команду, кто-то пушки
    const taste = { stat: 0.8 + rand() * 0.4, crew: 0.8 + rand() * 0.4, wmod: 0.8 + rand() * 0.4, weapon: 0.8 + rand() * 0.4, repair: 1 };
    for (let n = 0; n < 4; n++) {
      const all = options(ros).filter(o => o.type !== 'weapon' || aiValue(ros, o) > 0);
      let best = null, bs = -1;
      for (const o of all) {
        const s = aiValue(ros, o) / Math.max(8, o.price) * taste[o.type] * (0.75 + rand() * 0.5);
        if (s > bs) { bs = s; best = o; }
      }
      if (!best) break;
      if (best.price > wallet) {
        // копим, если цель достижима за пару этапов; иначе берём лучшее из доступного
        if (wallet >= best.price * 0.35) break;
        best = null; bs = -1;
        for (const o of all) {
          if (o.price > wallet) continue;
          const s = aiValue(ros, o) / Math.max(8, o.price) * taste[o.type] * (0.75 + rand() * 0.5);
          if (s > bs) { bs = s; best = o; }
        }
        if (!best) break;
      }
      apply(ros, best);
      wallet -= best.price;
      bought.push(label(best));
      items.push({ label: label(best), type: best.type, key: best.key, price: best.price });
    }
    return { wallet, bought, items };
  }

  /* Генерация состава: уровень мастерства, перки, оружие */
  function rollTier(rand) {
    const x = rand();
    return x < G.TIERS.elite.chance ? 'elite' : x < G.TIERS.elite.chance + G.TIERS.pro.chance ? 'pro' : 'rookie';
  }
  const START_COMP = { common: 0, rare: 1, epic: 3, legend: 5, relic: 0 }; // ≈ 0,35 места за очко (sim/weapons.js)
  function rollRoster(rand) {
    const base = G.WEAPONS.filter(w => !w.shop).map(w => w.id), ws = [];
    while (ws.length < 16) {
      const b = base.slice();
      for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
      ws.push(...b);
    }
    const keys = Object.keys(G.PERKS);
    const roster = G.RACERS.map((_, i) => {
      const tier = rollTier(rand), [lo, hi] = G.TIERS[tier].sum;
      // стартовая пушка редкого/эпического класса сильнее обычной — компенсируем очками характеристик
      const perks = rand() < G.PERK_CHANCE ? [keys[Math.floor(rand() * keys.length)]] : [];
      const weapon = perks.includes('paladin') ? 'holy' : ws[i];
      const total = lo + Math.floor(rand() * (hi - lo + 1)) - START_COMP[G.WEAPONS.find(w => w.id === weapon).rarity];
      const morale = Math.round(G.CFG.moraleStart[tier] + (rand() * 20 - 10));
      const face = G.Faces ? G.Faces.newSeed(rand) : 0;
      return { tier, stats: G.rollStats(rand, total), weapon, perks, morale, face };
    });
    // один (и только один) из обладателей перка получает второй, другой
    const holders = roster.filter(r => r.perks.length);
    if (holders.length) {
      const lucky = holders[Math.floor(rand() * holders.length)];
      const rest = keys.filter(k => k !== lucky.perks[0]);
      lucky.perks.push(rest[Math.floor(rand() * rest.length)]);
    }
    // паладин получает реликвию вместо стартовой пушки: компенсация за редкую пушку возвращается
    roster.forEach(r => {
      if (!r.perks.includes('paladin') || r.weapon === 'holy') return;
      let back = START_COMP[G.WEAPONS.find(w => w.id === r.weapon).rarity];
      while (back-- > 0) { const k = ['accel', 'top', 'handling'].sort((a, b) => r.stats[a] - r.stats[b])[0]; r.stats[k]++; }
      r.weapon = 'holy';
    });
    roster.forEach(ensure);
    return roster;
  }
  // Мораль после гонки: результат, затем плавное возвращение к 50 (психолог меняет скорость)
  // rankShift — на сколько позиций гонщик поднялся (+) или опустился (−) в таблице чемпионата
  // info: { crashes, kills, rankShift, fameTop, fameBottom }
  function moraleAfter(ros, info) {
    const C = G.CFG, before = ros.morale, lvl = (ros.crew && ros.crew.psy) || 0, rankShift = info.rankShift || 0;
    const parts = {
      rank: Math.max(-C.moraleRankCap, Math.min(C.moraleRankCap, rankShift * C.moraleRank)),
      crash: -C.moraleCrash * (info.crashes || 0),
      kill: Math.min(C.moraleKillCap, C.moraleKill * (info.kills || 0)),
      fame: (info.fameTop ? C.moraleFameTop : 0) - (info.fameBottom ? C.moraleFameBottom : 0)
    };
    let m = before + parts.rank + parts.crash + parts.kill + parts.fame;
    m = Math.max(0, Math.min(100, m));
    let k = C.moraleRegress;
    if (m > 50) k *= 1 - (G.CFG.psyDown || 0.22) * lvl;   // после успеха кураж держится дольше
    else k *= 1 + (G.CFG.psyUp || 0.35) * lvl;          // после неудачи быстрее приходит в себя
    m += (50 - m) * k;
    ros.morale = Math.max(0, Math.min(100, Math.round(m)));
    return { before, after: ros.morale, delta: ros.morale - before, parts, rankShift };
  }
  // После этапа: самопочинка механиком, замена спонсором (постоянная потеря), новые поломки
  function afterRaceDamage(ros, newBreaks, rand) {
    const C = G.CFG, ev = [];
    ensure(ros);
    ros.broken = ros.broken.filter(b => {
      b.left--;
      if (b.left <= 0) {
        // спонсор оплатил дешёвую запчасть: поломка ушла, но базовая характеристика упала навсегда
        const loss = Math.min(C.sponsorLoss, ros.stats[b.stat] - 1);
        ros.stats[b.stat] -= loss;
        ros.lost = ros.lost || {}; ros.lost[b.stat] = (ros.lost[b.stat] || 0) + loss;
        ev.push({ type: 'sponsor', stat: b.stat, loss });
        return false;
      }
      if (ros.crew.mech && rand() < C.mechFixChance * ros.crew.mech) { ev.push({ type: 'mechfix', stat: b.stat }); return false; }
      return true;
    });
    (newBreaks || []).forEach(stat => { ros.broken.push({ stat, amount: C.breakAmount, left: C.breakRaces }); ev.push({ type: 'broke', stat }); });
    return ev;
  }
  const statSum = ros => ros.stats.accel + ros.stats.top + ros.stats.handling;

  G.Gen = { rollRoster, rollTier, statSum, moraleAfter, afterRaceDamage, PART, repairCost };
  G.Shop = { ensure, options, apply, label, aiSpend, sellValue, weaponOf, RANK, STAT_NAME };
})(typeof window !== 'undefined' ? window : globalThis);
