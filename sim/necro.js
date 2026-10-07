/* Некромант и паладин: парные гонки (тот же сид с перком и без).
 * node sim/necro.js [пар] [урон нежити через запятую]  → сила перка в местах, слава, удары и аварии от нежити */
require('../js/data.js'); require('../js/board.js'); require('../js/tracks.js'); require('../js/track.js'); require('../js/race.js'); require('../js/econ.js');
const G = globalThis;
const PAIRS = +(process.argv[2] || 300);
const DMGS = (process.argv[3] || String(G.CFG.undeadDmg)).split(',').map(Number);
const tracks = G.TRACKS.map(d => G.buildTrack(d));
const clone = o => JSON.parse(JSON.stringify(o));
function run(seed, roster, track, tgt) {
  const race = new G.Race({ seed, track, roster });
  let g = 0, trig = 0, hits = 0, kills = 0;
  while (!race.over && g++ < 40000) {
    const res = race.playTurn();
    const u = res && res.move && res.move.undead;
    if (u && !u.banished) { trig++; if (u.hit) hits++; if (u.crashed) kills++; }
  }
  const r = race.racers[tgt];
  return { place: r.place, fame: G.ECON.prize[r.place - 1] + r.fame, trig, hits, kills, crashes: race.racers.reduce((a, x) => a + x.crashes, 0) };
}
for (const perk of ['necro', 'paladin']) for (const dmg of perk === 'necro' ? DMGS : [G.CFG.undeadDmg]) {
  G.CFG.undeadDmg = dmg;
  let dp = 0, sq = 0, df = 0, trig = 0, hits = 0, kills = 0, cr0 = 0, cr1 = 0;
  for (let n = 0; n < PAIRS; n++) {
    const rnd = G.mulberry32(4242 + n * 7);
    const roster = G.Gen.rollRoster(rnd);
    roster.forEach(r => { r.perks = r.perks.filter(p => p !== 'necro' && p !== 'paladin'); if (r.weapon === 'holy') r.weapon = 'mg'; });
    // для паладина на трассе есть некромант-соперник, иначе изгонять некого
    const tgt = n % 16, track = tracks[n % tracks.length], seed = 3000 + n;
    if (perk === 'paladin') roster[(tgt + 5) % 16].perks.push('necro');
    const a = run(seed, roster, track, tgt);
    const up = clone(roster); up[tgt].perks.push(perk); if (perk === 'paladin') up[tgt].weapon = 'holy';
    const b = run(seed, up, track, tgt);
    const d = a.place - b.place; dp += d; sq += d * d; df += b.fame - a.fame;
    trig += b.trig; hits += b.hits; kills += b.kills; cr0 += a.crashes; cr1 += b.crashes;
  }
  const m = dp / PAIRS, se = Math.sqrt((sq / PAIRS - m * m) / PAIRS);
  console.log(`${perk.padEnd(8)} урон ${String(dmg).padStart(2)}×${G.CFG.dmgMul}: мест ${m >= 0 ? '+' : ''}${m.toFixed(2)} ±${se.toFixed(2)}, слава ${df >= 0 ? '+' : ''}${(df / PAIRS).toFixed(1)}` +
    (perk === 'necro' ? `, за гонку: срабатываний ${(trig / PAIRS).toFixed(1)}, попаданий ${(hits / PAIRS).toFixed(1)}, аварий от нежити ${(kills / PAIRS).toFixed(2)}, всего аварий ${(cr0 / PAIRS).toFixed(1)} → ${(cr1 / PAIRS).toFixed(1)}` : ''));
}
