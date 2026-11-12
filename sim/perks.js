/* Сила перков: парные гонки (тот же сид, у гонщика перк есть / нет; у остальных перков нет).
 * node sim/perks.js [пар] [перки через запятую] [сдвиг сидов]  → мест за перк */
require('../js/data.js'); require('../js/board.js'); require('../js/tracks.js'); require('../js/track.js'); require('../js/race.js'); require('../js/econ.js');
const G = globalThis;
const PAIRS = +(process.argv[2] || 600);
const LIST = (process.argv[3] || Object.keys(G.PERKS).join(',')).split(',');
const OFF = +(process.argv[4] || 0);
// CFG='{"soulRush":0.25}' — подмена настроек для подбора баланса
if (process.env.CFG) Object.assign(G.CFG, JSON.parse(process.env.CFG));
const tracks = G.TRACKS.map(d => G.buildTrack(d));
const clone = o => JSON.parse(JSON.stringify(o));
const stat = { raised: 0, souls: 0, races: 0 };
function run(seed, roster, track, rain, tgt, count) {
  const race = new G.Race({ seed, track, roster, mods: { rain } });
  let g = 0;
  while (!race.over && g++ < 40000) { const res = race.playTurn(); if (count && res && res.move && res.move.undead && res.move.undead.souls) stat.souls += res.move.undead.souls; }
  if (count) { stat.raised += race.undead.filter(u => u.raised).length; stat.races++; }
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
    const d = run(seed, roster, track, rain, tgt) - run(seed, up, track, rain, tgt, true);
    sum += d; sq += d * d;
  }
  const m = sum / PAIRS, se = Math.sqrt((sq / PAIRS - m * m) / PAIRS);
  console.log(`${perk.padEnd(11)} мест: ${m >= 0 ? '+' : ''}${m.toFixed(3)} ±${se.toFixed(3)}` + (perk === 'necro' ? `  · за гонку: поднято мертвецов ${(stat.raised / stat.races).toFixed(1)}, душ ${(stat.souls / stat.races).toFixed(1)}` : ''));
  stat.raised = stat.souls = stat.races = 0;
}
