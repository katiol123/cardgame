/* Сила перков: парные гонки (тот же сид, у гонщика перк есть / нет; у остальных перков нет).
 * node sim/perks.js [пар] [перки через запятую] [сдвиг сидов]  → мест за перк */
require('../js/data.js'); require('../js/board.js'); require('../js/tracks.js'); require('../js/track.js'); require('../js/race.js'); require('../js/econ.js');
const G = globalThis;
const PAIRS = +(process.argv[2] || 600);
const LIST = (process.argv[3] || Object.keys(G.PERKS).join(',')).split(',');
const OFF = +(process.argv[4] || 0);
const tracks = G.TRACKS.map(d => G.buildTrack(d));
const clone = o => JSON.parse(JSON.stringify(o));
function run(seed, roster, track, rain, tgt) {
  const race = new G.Race({ seed, track, roster, mods: { rain } });
  let g = 0; while (!race.over && g++ < 40000) race.playTurn();
  return race.racers[tgt].place;
}
for (const perk of LIST) {
  let sum = 0, sq = 0;
  for (let k = 0; k < PAIRS; k++) {
    const n = k + OFF, rnd = G.mulberry32(5150 + n * 13);
    const roster = G.Gen.rollRoster(rnd);
    roster.forEach(r => { r.perks = []; if (r.weapon === 'holy') r.weapon = 'mg'; });
    const tgt = n % 16, track = tracks[n % tracks.length], seed = 6200 + n, rain = rnd() < 0.35;
    if (perk === 'paladin') roster[(tgt + 5) % 16].perks.push('necro');
    const up = clone(roster); up[tgt].perks = [perk]; if (perk === 'paladin') up[tgt].weapon = 'holy';
    const d = run(seed, roster, track, rain, tgt) - run(seed, up, track, rain, tgt);
    sum += d; sq += d * d;
  }
  const m = sum / PAIRS, se = Math.sqrt((sq / PAIRS - m * m) / PAIRS);
  console.log(`${perk.padEnd(11)} мест: ${m >= 0 ? '+' : ''}${m.toFixed(3)} ±${se.toFixed(3)}`);
}
