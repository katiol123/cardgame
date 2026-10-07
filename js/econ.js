/* Гараж: магазин улучшений за «Славу» и покупки ИИ-гонщиков. Без DOM. */
(function (G) {
  'use strict';
  const E = G.ECON;
  const RANK = { common: 0, rare: 1, epic: 2, legend: 3 };
  const STAT_NAME = { accel: 'Разгон', top: 'Макс. скорость', handling: 'Маневренность' };

  function ensure(ros) {
    ros.wmods = Object.assign({ cal: 0, mag: 0, aim: 0 }, ros.wmods);
    ros.crew = Object.assign({ mech: 0, gun: 0, armor: 0, nitro: 0, psy: 0 }, ros.crew);
    if (typeof ros.morale !== 'number') ros.morale = 50;
    ros.perks = ros.perks || [];
    return ros;
  }
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
    const sell = sellValue(ros);
    G.WEAPONS.forEach(w => {
      if (w.id !== ros.weapon) out.push({ type: 'weapon', key: w.id, full: w.price, sell, price: Math.max(0, w.price - sell) });
    });
    return out;
  }

  function apply(ros, opt) {
    ensure(ros);
    if (opt.type === 'stat') ros.stats[opt.key]++;
    else if (opt.type === 'wmod') ros.wmods[opt.key]++;
    else if (opt.type === 'crew') ros.crew[opt.key]++;
    else if (opt.type === 'weapon') { ros.weapon = opt.key; ros.wmods = { cal: 0, mag: 0, aim: 0 }; }
  }

  function label(opt) {
    if (opt.type === 'stat') return `${STAT_NAME[opt.key]} ${opt.lvl} → ${opt.lvl + 1}`;
    if (opt.type === 'wmod') return `${E.wmods[opt.key].name} оружия ур. ${opt.lvl + 1}`;
    if (opt.type === 'crew') return `${E.crew[opt.key].name} ур. ${opt.lvl + 1}`;
    const w = G.WEAPONS.find(x => x.id === opt.key);
    return `${w.name} (${G.RARITY[w.rarity].name.toLowerCase()})`;
  }

  // Траты ИИ: немного случайности, тяга к редкому оружию, иногда копит
  function aiSpend(ros, wallet, rand) {
    ensure(ros);
    const bought = [], items = [];
    const curRank = () => RANK[weaponOf(ros).rarity];
    for (let n = 0; n < 4; n++) {
      const all = options(ros);
      const better = all.filter(o => o.type === 'weapon' && RANK[G.WEAPONS.find(w => w.id === o.key).rarity] > curRank());
      // копим на пушку получше
      const dream = better.filter(o => o.price > wallet).sort((a, b) => a.price - b.price)[0];
      if (dream && wallet >= dream.price * 0.55 && rand() < 0.45) break;
      const can = all.filter(o => o.price <= wallet && (o.type !== 'weapon' || better.includes(o)));
      if (!can.length) break;
      let best = null, bs = -1;
      for (const o of can) {
        // ценность = измеренная сила апгрейда (в местах), у пушки — по редкости
        let v = o.type === 'weapon' ? 0.3 * (RANK[G.WEAPONS.find(w => w.id === o.key).rarity] - curRank()) : E.value[o.type][o.key];
        if (o.type === 'stat') v *= 1.25 - ros.stats[o.key] / 25; // слабые характеристики тянет подтянуть
        if (o.type === 'wmod' || (o.type === 'crew' && o.key === 'gun')) v += 0.05;   // оружейные апы ещё и приносят славу за попадания
        const s = v / Math.max(15, o.price) * (0.6 + rand() * 0.8);
        if (s > bs) { bs = s; best = o; }
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
      const total = lo + Math.floor(rand() * (hi - lo + 1));
      const perks = rand() < G.PERK_CHANCE ? [keys[Math.floor(rand() * keys.length)]] : [];
      const morale = Math.round(G.CFG.moraleStart[tier] + (rand() * 20 - 10));
      return ensure({ tier, stats: G.rollStats(rand, total), weapon: ws[i], perks, morale });
    });
    // один (и только один) из обладателей перка получает второй, другой
    const holders = roster.filter(r => r.perks.length);
    if (holders.length) {
      const lucky = holders[Math.floor(rand() * holders.length)];
      const rest = keys.filter(k => k !== lucky.perks[0]);
      lucky.perks.push(rest[Math.floor(rand() * rest.length)]);
    }
    return roster;
  }
  // Мораль после гонки: результат, затем плавное возвращение к 50 (психолог меняет скорость)
  // rankShift — на сколько позиций гонщик поднялся (+) или опустился (−) в таблице чемпионата
  function moraleAfter(ros, place, crashes, rankShift) {
    const C = G.CFG, before = ros.morale, lvl = (ros.crew && ros.crew.psy) || 0;
    const parts = {
      place: (8.5 - place) * C.moralePlace,
      crash: -C.moraleCrash * crashes,
      rank: Math.max(-C.moraleRankCap, Math.min(C.moraleRankCap, (rankShift || 0) * C.moraleRank))
    };
    let m = before + parts.place + parts.crash + parts.rank;
    m = Math.max(0, Math.min(100, m));
    let k = C.moraleRegress;
    if (m > 50) k *= 1 - (G.CFG.psyDown || 0.22) * lvl;   // после успеха кураж держится дольше
    else k *= 1 + (G.CFG.psyUp || 0.35) * lvl;          // после неудачи быстрее приходит в себя
    m += (50 - m) * k;
    ros.morale = Math.max(0, Math.min(100, Math.round(m)));
    return { before, after: ros.morale, delta: ros.morale - before, parts, rankShift: rankShift || 0 };
  }
  const statSum = ros => ros.stats.accel + ros.stats.top + ros.stats.handling;

  G.Gen = { rollRoster, rollTier, statSum, moraleAfter };
  G.Shop = { ensure, options, apply, label, aiSpend, sellValue, weaponOf, RANK, STAT_NAME };
})(typeof window !== 'undefined' ? window : globalThis);
