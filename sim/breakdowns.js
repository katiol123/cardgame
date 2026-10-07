/* Поломки и упадок духа: целые чемпионаты с экономикой, моралью и покупками ИИ.
 * node sim/breakdowns.js [чемпионатов]  — сравнивает варианты */
require('../js/data.js'); require('../js/board.js'); require('../js/tracks.js'); require('../js/track.js'); require('../js/race.js'); require('../js/faces.js'); require('../js/econ.js');
const G = globalThis, N = +(process.argv[2] || 6), CFG = G.CFG;
const tracks = G.TRACKS.map(d => G.buildTrack(d));
const base = JSON.parse(JSON.stringify(CFG));
const VARIANTS = [
  ['ремонт ★80', { breakOn: true, repairCost: 80 }],
  ['ремонт по месту', { breakOn: true, repairCost: 80, repairByRank: true }],
  ['ремонт по характеристике (★80×знач/12)', { breakOn: true, repairCost: 80, repairByStat: true }],
  ['по характеристике ★100×знач/12', { breakOn: true, repairCost: 100, repairByStat: true }],
  ['по характеристике + по месту', { breakOn: true, repairCost: 80, repairByStat: true, repairByRank: true }]
];
const corr = (xs, ys) => { const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n; let a = 0, b = 0, c = 0; for (let i = 0; i < n; i++) { a += (xs[i] - mx) * (ys[i] - my); b += (xs[i] - mx) ** 2; c += (ys[i] - my) ** 2; } return a / Math.sqrt(b * c); };
for (const [name, cfg] of VARIANTS) {
  Object.assign(CFG, base, cfg);
  const M = { perm: 0, permTop: 0, permBot: 0, repaired: 0, dmgPlace: 0, dmgN: 0, okPlace: 0, okN: 0, breaks: 0, damagedRaces: 0, raceSlots: 0, spent: 0, repairSpent: 0, despair: 0, botBreaks: 0, topBreaks: 0, botN: 0, topN: 0, climbBottom: 0, nBottom: 0, gap: 0, strength: [], finalRank: [] };
  for (let c = 0; c < N; c++) {
    const rnd = G.mulberry32(700 + c);
    const roster = G.Gen.rollRoster(rnd);
    const pts = Array(16).fill(0), fame = Array(16).fill(0), seasonBreaks = Array(16).fill(0), seasonPerm = Array(16).fill(0);
    const rank = () => G.RACERS.map((_, i) => i).sort((a, b) => pts[b] - pts[a] || a - b);
    let midRank = null;
    tracks.forEach((track, k) => {
      const dmg = roster.map(r => !!((r.broken || []).length || r.despair));
      roster.forEach((r, i) => { M.raceSlots++; if (dmg[i]) M.damagedRaces++; });
      const race = new G.Race({ seed: 90000 + c * 50 + k, track, roster });
      while (!race.over) { race.playTurn(); race.fx.length = 0; }
      race.racers.forEach(r => { if (dmg[r.id]) { M.dmgPlace += r.place; M.dmgN++; } else { M.okPlace += r.place; M.okN++; } });
      const before = rank();
      race.racers.forEach(r => { pts[r.id] += G.POINTS_TABLE[r.place - 1] || 0; fame[r.id] += G.ECON.prize[r.place - 1] + r.fame; });
      const after = rank(), acts = race.racers.map(r => r.fame), top = Math.max(...acts), bot = Math.min(...acts);
      race.racers.forEach(r => {
        const shift = k >= 2 ? before.indexOf(r.id) - after.indexOf(r.id) : 0;
        G.Gen.moraleAfter(roster[r.id], { crashes: r.crashes, kills: r.kills, rankShift: shift, fameTop: r.fame === top && top > bot, fameBottom: r.fame === bot && top > bot });
        const ev = G.Gen.afterRaceDamage(roster[r.id], r.breaks, rnd);
        ev.forEach(e => { if (e.type === 'broke') { M.breaks++; seasonBreaks[r.id]++; } if (e.type === 'sponsor') { M.perm++; seasonPerm[r.id]++; } });
      });
      if (k === 5) midRank = rank();
      const rk = rank(); roster.forEach((ros, i) => { ros.champRank = rk.indexOf(i) + 1; });
      roster.forEach((ros, i) => {
        if (CFG.noRepair) { const keep = ros.broken; ros.broken = []; const res0 = G.Shop.aiSpend(ros, fame[i], rnd); ros.broken = keep; res0.items.forEach(it => { M.spent += it.price; }); fame[i] = res0.wallet; return; }
        const res = G.Shop.aiSpend(ros, fame[i], rnd);
        res.items.forEach(it => { M.spent += it.price; if (it.type === 'repair') { M.repairSpent += it.price; M.repaired++; } });
        fame[i] = res.wallet;
      });
    });
    const fin = rank();
    fin.forEach((id, i) => { if (i < 4) { M.topBreaks += seasonBreaks[id]; M.permTop += seasonPerm[id]; M.topN++; } if (i >= 12) { M.botBreaks += seasonBreaks[id]; M.permBot += seasonPerm[id]; M.botN++; } });
    midRank.slice(12).forEach(id => { M.climbBottom += 12 - fin.indexOf(id); M.nBottom++; }); // >0 — выбрался из последней четвёрки
    M.gap += pts[fin[0]] - pts[fin[15]];
    roster.forEach((r, i) => { M.strength.push(r.base ? 0 : 0); });
  }
  const pct = (a, b) => (a / b * 100).toFixed(0) + '%';
  console.log(`\n== ${name}`);
  console.log(`  поломок за сезон на гонщика ${(M.breaks / N / 16).toFixed(2)}: починено за славу ${pct(M.repaired, Math.max(1, M.breaks))}, ушло в постоянную −1 ${pct(M.perm, Math.max(1, M.breaks))}; этапов с поломкой ${pct(M.damagedRaces, M.raceSlots)}`);
  console.log(`  средняя цена ремонта ★${M.repaired ? Math.round(M.repairSpent / M.repaired) : 0}`);
  console.log(`  постоянных потерь за сезон: у топ-4 ${(M.permTop / M.topN).toFixed(2)}, у последних 4 ${(M.permBot / M.botN).toFixed(2)}`);
  console.log(`  доля славы на ремонт ${pct(M.repairSpent, Math.max(1, M.spent))}, поломок у топ-4 сезона ${(M.topBreaks / M.topN).toFixed(2)} vs у последних 4: ${(M.botBreaks / M.botN).toFixed(2)}`);
  if (M.dmgN) console.log(`  среднее место с поломкой ${(M.dmgPlace / M.dmgN).toFixed(2)} vs без ${(M.okPlace / M.okN).toFixed(2)} (n=${M.dmgN})`);
  console.log(`  последние 4 после 6 этапов в итоге поднялись в среднем на ${(M.climbBottom / M.nBottom).toFixed(2)} позиций; отрыв 1-го от 16-го: ${(M.gap / N).toFixed(0)} оч.`);
}
