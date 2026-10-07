/* Мораль на дистанции чемпионата с бонусом за движение в таблице: node sim/morale_champ.js [чемпионатов] */
require('../js/data.js'); require('../js/board.js'); require('../js/tracks.js'); require('../js/track.js'); require('../js/race.js'); require('../js/econ.js');
const G = globalThis, N = +(process.argv[2] || 4);
const tracks = G.TRACKS.map(d => G.buildTrack(d));
let all = [], extremes = 0, cnt = 0, midClimb = [], midNo = [];
for (let c = 0; c < N; c++) {
  const roster = G.Gen.rollRoster(G.mulberry32(300 + c));
  const pts = Array(16).fill(0);
  const rank = () => G.RACERS.map((_, i) => i).sort((a, b) => pts[b] - pts[a] || a - b);
  tracks.forEach((track, k) => {
    const race = new G.Race({ seed: 40000 + c * 50 + k, track, roster });
    while (!race.over) { race.playTurn(); race.fx.length = 0; }
    const before = rank();
    race.racers.forEach(r => { pts[r.id] += G.POINTS_TABLE[r.place - 1] || 0; });
    const after = rank();
    race.racers.forEach(r => {
      const shift = k > 0 ? before.indexOf(r.id) - after.indexOf(r.id) : 0;
      const mo = G.Gen.moraleAfter(roster[r.id], r.place, r.crashes, shift);
      if (r.place >= 8 && r.place <= 12) (shift > 0 ? midClimb : midNo).push(mo.delta);
      all.push(mo.after); cnt++;
      if (mo.after <= 5 || mo.after >= 95) extremes++;
    });
  });
}
const avg = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
all.sort((a, b) => a - b);
console.log(`мораль: среднее ${avg(all)}, 10% ${all[Math.floor(all.length * 0.1)]}, медиана ${all[Math.floor(all.length / 2)]}, 90% ${all[Math.floor(all.length * 0.9)]}, у края (≤5 или ≥95) ${(extremes / cnt * 100).toFixed(1)}%`);
console.log(`места 8–12: обошёл кого-то в таблице → мораль ${avg(midClimb)} (n=${midClimb.length}); не поднялся → ${avg(midNo)} (n=${midNo.length})`);
