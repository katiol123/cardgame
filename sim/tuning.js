/* Сила тюнинга оружия по уровням: парные гонки (тот же сид, у гонщика уровень L−1 и L).
 * node sim/tuning.js [пар] [ключи через запятую: cal,mag,aim] [уровни: 1,2,3]  → мест за каждый уровень */
require('../js/data.js'); require('../js/board.js'); require('../js/tracks.js'); require('../js/track.js'); require('../js/race.js'); require('../js/econ.js');
const G = globalThis;
const PAIRS = +(process.argv[2] || 400);
const KEYS = (process.argv[3] || 'cal,mag,aim').split(',');
const OFF = +(process.argv[5] || 0); // сдвиг сидов для параллельных прогонов
const LEVELS = (process.argv[4] || '1,2,3').split(',').map(Number);
const tracks = G.TRACKS.map(d => G.buildTrack(d));
const clone = o => JSON.parse(JSON.stringify(o));
function run(seed, roster, track) {
  const race = new G.Race({ seed, track, roster });
  let g = 0; while (!race.over && g++ < 40000) race.playTurn();
  return race.racers.map(r => r.place);
}
for (const key of KEYS) for (const L of LEVELS) {
  let sum = 0, sq = 0;
  for (let n = 0; n < PAIRS; n++) {
    const rnd = G.mulberry32(2024 + (n + OFF) * 11);
    const pool = []; while (pool.length < 16) pool.push(...G.WEAPONS.filter(w => !w.shop).map(w => w.id));
    const roster = G.RACERS.map((_, i) => G.Shop.ensure({ stats: G.rollStats(rnd), weapon: pool[(i + n) % pool.length] }));
    const tgt = (n + OFF) % 16, track = tracks[(n + OFF) % tracks.length], seed = 8100 + n + OFF;
    const lo = clone(roster); lo[tgt].wmods[key] = L - 1;
    const hi = clone(roster); hi[tgt].wmods[key] = L;
    const d = run(seed, lo, track)[tgt] - run(seed, hi, track)[tgt];
    sum += d; sq += d * d;
  }
  const m = sum / PAIRS, se = Math.sqrt((sq / PAIRS - m * m) / PAIRS);
  console.log(`${key} ур.${L - 1}→${L}  мест: ${m >= 0 ? '+' : ''}${m.toFixed(3)} ±${se.toFixed(3)}`);
}
