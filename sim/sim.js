/* Балансировочная симуляция: node sim/sim.js [races]
 * Проверяет, что все три характеристики одинаково влияют на итоговое место. */
require('../js/data.js');
require('../js/board.js');
require('../js/track.js');
require('../js/race.js');
const G = globalThis;
if (process.env.CFG) Object.assign(G.CFG, JSON.parse(process.env.CFG));

const RACES = +(process.argv[2] || 200);
const track = G.buildTrack();
const rows = [];
let rounds = 0, crashes = 0, skids = 0, shots = 0, hits = 0, finishedTotal = 0;
const weaponPts = {};
const t0 = Date.now();
for (let k = 0; k < RACES; k++) {
  const indep = process.env.INDEP ? { stats: (id, rnd) => ({ accel: 1 + Math.floor(rnd() * 20), top: 1 + Math.floor(rnd() * 20), handling: 1 + Math.floor(rnd() * 20) }) } : {};
  const race = new G.Race(Object.assign({ seed: 1000 + k, track }, indep));
  let guard = 0;
  while (!race.over && guard++ < 20000) race.playTurn();
  rounds += race.round;
  race.racers.forEach(r => {
    rows.push({ s: r.stats, place: r.place });
    crashes += r.crashes; skids += r.skids; shots += r.shots; hits += r.hits;
    if (!r.dnf) finishedTotal++;
    (weaponPts[r.weapon.id] = weaponPts[r.weapon.id] || []).push(r.place);
  });
}
function corr(xs, ys) {
  const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
}
const place = rows.map(r => -r.place);
console.log(`races=${RACES} avgRounds=${(rounds / RACES).toFixed(1)} finished=${(finishedTotal / rows.length * 100).toFixed(0)}% time=${Date.now() - t0}ms`);
console.log(`per racer: crashes=${(crashes / rows.length).toFixed(2)} skids=${(skids / rows.length).toFixed(2)} shots=${(shots / rows.length).toFixed(2)} hitRate=${(hits / shots * 100).toFixed(0)}%`);
for (const k of ['accel', 'top', 'handling']) console.log(k.padEnd(9), 'corr with place:', corr(rows.map(r => r.s[k]), place).toFixed(3));
console.log('avg place by weapon:');
Object.entries(weaponPts).forEach(([k, v]) => console.log('  ', k.padEnd(8), (v.reduce((a, b) => a + b) / v.length).toFixed(2)));
