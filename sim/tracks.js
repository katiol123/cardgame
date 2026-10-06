/* Проверка всех трасс чемпионата: node sim/tracks.js [гонок на трассу] */
require('../js/data.js'); require('../js/board.js'); require('../js/tracks.js'); require('../js/track.js'); require('../js/race.js');
const G = globalThis, R = +(process.argv[2] || 30);
if (process.env.CFG) Object.assign(G.CFG, JSON.parse(process.env.CFG));
const QUIET = !!process.env.QUIET;
function corr(xs, ys) {
  const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let a = 0, b = 0, c = 0; for (let i = 0; i < n; i++) { a += (xs[i] - mx) * (ys[i] - my); b += (xs[i] - mx) ** 2; c += (ys[i] - my) ** 2; }
  return a / Math.sqrt(b * c);
}
const all = [];
for (const def of G.TRACKS) {
  const track = G.buildTrack(def); const rows = []; let rounds = 0, crashes = 0;
  for (let k = 0; k < R; k++) {
    const indep = process.env.INDEP ? { stats: (id, rnd) => ({ accel: 1 + Math.floor(rnd() * 20), top: 1 + Math.floor(rnd() * 20), handling: 1 + Math.floor(rnd() * 20) }) } : {};
    const race = new G.Race({ ...indep, seed: 77 + k, track, mods: { rain: def.rain ? (k % 10) / 10 < def.rain : false } });
    let g = 0; while (!race.over && g++ < 30000) race.playTurn();
    rounds += race.round;
    race.racers.forEach(r => { rows.push({ s: r.stats, p: -r.place }); crashes += r.crashes; });
  }
  all.push(...rows);
  const c = ['accel', 'top', 'handling'].map(k => corr(rows.map(r => r.s[k]), rows.map(r => r.p)).toFixed(2));
  if (!QUIET) console.log(def.id.padEnd(13), 'rounds', (rounds / R).toFixed(1), 'crash/racer', (crashes / rows.length).toFixed(2), 'corr A/T/H', c.join(' '));
}
console.log('ALL'.padEnd(13), ['accel', 'top', 'handling'].map(k => corr(all.map(r => r.s[k]), all.map(r => r.p)).toFixed(3)).join(' '));
