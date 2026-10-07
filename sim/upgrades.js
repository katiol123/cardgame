/* Сила каждого апгрейда: парные гонки (тот же сид, с апом и без).
 * node sim/upgrades.js <пар> [ключи через запятую]  → прирост среднего места за 1 уровень */
require('../js/data.js'); require('../js/board.js'); require('../js/tracks.js'); require('../js/track.js'); require('../js/race.js'); require('../js/econ.js');
const G = globalThis;
const PAIRS = +(process.argv[2] || 300);
const ALL = ['crew.mech', 'crew.gun', 'crew.armor', 'crew.nitro', 'wmods.cal', 'wmods.mag', 'wmods.aim', 'stats.accel', 'stats.top', 'stats.handling'];
const KEYS = process.argv[3] ? process.argv[3].split(',') : ALL;
const LV = 2; // меряем +2 уровня и делим на 2 — сигнал сильнее шума
const tracks = G.TRACKS.map(d => G.buildTrack(d));
const clone = o => JSON.parse(JSON.stringify(o));
function run(seed, roster, track) {
  const race = new G.Race({ seed, track, roster });
  let g = 0; while (!race.over && g++ < 40000) race.playTurn();
  return race.racers.map(r => r.place);
}
for (const key of KEYS) {
  const [grp, k] = key.split('.');
  let sum = 0, sq = 0;
  for (let n = 0; n < PAIRS; n++) {
    const rnd = G.mulberry32(77 + n * 13);
    const pool = []; while (pool.length < 16) pool.push(...G.WEAPONS.filter(w => !w.shop).map(w => w.id));
    const roster = G.RACERS.map((_, i) => G.Shop.ensure({ stats: G.rollStats(rnd), weapon: pool[(i + n) % pool.length] }));
    const tgt = n % 16, track = tracks[n % tracks.length], seed = 5000 + n;
    const base = run(seed, roster, track)[tgt];
    const up = clone(roster);
    up[tgt][grp][k] = Math.min(grp === 'stats' ? 20 : 3, up[tgt][grp][k] + LV);
    const d = (base - run(seed, up, track)[tgt]) / LV;
    sum += d; sq += d * d;
  }
  const m = sum / PAIRS, se = Math.sqrt((sq / PAIRS - m * m) / PAIRS);
  console.log(key.padEnd(15), 'мест за уровень:', m.toFixed(3), '±', se.toFixed(3));
}
