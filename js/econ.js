/* Гараж: магазин улучшений за «Славу» и покупки ИИ-гонщиков. Без DOM. */
(function (G) {
  'use strict';
  const E = G.ECON;
  const RANK = { common: 0, rare: 1, epic: 2, legend: 3 };
  const STAT_NAME = { accel: 'Разгон', top: 'Макс. скорость', handling: 'Маневренность' };

  function ensure(ros) {
    ros.wmods = Object.assign({ cal: 0, mag: 0, aim: 0 }, ros.wmods);
    ros.crew = Object.assign({ mech: 0, gun: 0, armor: 0, nitro: 0 }, ros.crew);
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
      if (v < E.statMax) out.push({ type: 'stat', key: k, lvl: v, price: E.statCost(v) });
    });
    Object.keys(E.wmods).forEach(k => {
      const l = ros.wmods[k];
      if (l < 3) out.push({ type: 'wmod', key: k, lvl: l, price: E.wmodCost[l] });
    });
    Object.keys(E.crew).forEach(k => {
      const l = ros.crew[k];
      if (l < 3) out.push({ type: 'crew', key: k, lvl: l, price: E.crewCost[l] });
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
    const bought = [];
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
        let v = o.type === 'stat' ? 1.0 : o.type === 'wmod' ? 0.85 : o.type === 'crew' ? 0.8 :
          1.5 * (RANK[G.WEAPONS.find(w => w.id === o.key).rarity] - curRank());
        if (o.type === 'stat') v *= 1.25 - ros.stats[o.key] / 25; // слабые характеристики тянет подтянуть
        const s = v / Math.max(20, o.price) * (0.6 + rand() * 0.8);
        if (s > bs) { bs = s; best = o; }
      }
      apply(ros, best);
      wallet -= best.price;
      bought.push(label(best));
    }
    return { wallet, bought };
  }

  G.Shop = { ensure, options, apply, label, aiSpend, sellValue, weaponOf, RANK, STAT_NAME };
})(typeof window !== 'undefined' ? window : globalThis);
