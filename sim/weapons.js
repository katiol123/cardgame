/* Сила оружия: парные гонки (тот же сид), гонщику выдают пушку X вместо его стартовой.
 * node sim/weapons.js [пар]  → прирост среднего места относительно стартовых пушек */
require('../js/data.js'); require('../js/board.js'); require('../js/tracks.js'); require('../js/track.js'); require('../js/race.js'); require('../js/econ.js');
const G = globalThis;
const PAIRS = +(process.argv[2] || 200);
const tracks = G.TRACKS.map(d => G.buildTrack(d));
const clone = o => JSON.parse(JSON.stringify(o));
function run(seed, roster, track) {
  const race = new G.Race({ seed, track, roster });
  let g = 0; while (!race.over && g++ < 40000) race.playTurn();
  return race.racers.map(r => r.place);
}
const rows = [];
for (const w of G.WEAPONS) {
  let sum = 0, sq = 0;
  for (let n = 0; n < PAIRS; n++) {
    const rnd = G.mulberry32(91 + n * 17);
    const pool = []; while (pool.length < 16) pool.push(...G.WEAPONS.filter(x => !x.shop).map(x => x.id));
    const roster = G.RACERS.map((_, i) => G.Shop.ensure({ stats: G.rollStats(rnd), weapon: pool[(i + n) % pool.length] }));
    const tgt = n % 16, track = tracks[n % tracks.length], seed = 7000 + n;
    const base = run(seed, roster, track)[tgt];
    const up = clone(roster); up[tgt].weapon = w.id;
    const d = base - run(seed, up, track)[tgt];
    sum += d; sq += d * d;
  }
  const m = sum / PAIRS, se = Math.sqrt((sq / PAIRS - m * m) / PAIRS);
  rows.push([w.id, w.rarity, m]);
  console.log(w.id.padEnd(9), w.rarity.padEnd(7), 'мест:', m.toFixed(3), '±', se.toFixed(3));
}
const by = {};
rows.forEach(([, r, m]) => (by[r] = by[r] || []).push(m));
Object.entries(by).forEach(([r, a]) => console.log('среднее', r.padEnd(7), (a.reduce((x, y) => x + y, 0) / a.length).toFixed(3)));
