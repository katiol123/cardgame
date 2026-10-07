/* Давка и мораль: node sim/morale.js [гонок]
 * 1) давка вкл/выкл: длина гонки, плотность пелотона, события «дрогнул», влияние морали на место
 * 2) ценность +10 морали (парные гонки)
 * 3) психолог: средняя мораль и место на дистанции чемпионата */
require('../js/data.js'); require('../js/board.js'); require('../js/tracks.js'); require('../js/track.js'); require('../js/race.js'); require('../js/econ.js');
const G = globalThis, N = +(process.argv[2] || 150), CFG = G.CFG;
if (process.env.CFG) Object.assign(CFG, JSON.parse(process.env.CFG));
const BASE = CFG.crowdBase;
const tracks = G.TRACKS.map(d => G.buildTrack(d));
const clone = o => JSON.parse(JSON.stringify(o));
function corr(xs, ys) {
  const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let a = 0, b = 0, c = 0; for (let i = 0; i < n; i++) { a += (xs[i] - mx) * (ys[i] - my); b += (xs[i] - mx) ** 2; c += (ys[i] - my) ** 2; }
  return a / Math.sqrt(b * c);
}
function runRace(seed, roster, track, stats) {
  const race = new G.Race({ seed, track, roster });
  while (!race.over) {
    const r = race.current;
    if (stats && !r.finished && !r.skip) {
      const n = race.crowdAround(r), b = race.round <= 3 ? 'start' : race.round <= 10 ? 'mid' : 'late';
      stats.dens[b][0]++; stats.dens[b][1] += n >= 2 ? 1 : 0;
    }
    race.playTurn(); race.fx.length = 0;
  }
  return race;
}
// 1) давка вкл/выкл
for (const on of [false, true]) {
  CFG.crowdBase = on ? BASE : 0;
  const st = { dens: { start: [0, 0], mid: [0, 0], late: [0, 0] } };
  let rounds = 0, nerves = 0, rows = [], placeStd = 0;
  for (let k = 0; k < N; k++) {
    const roster = G.Gen.rollRoster(G.mulberry32(100 + k));
    const race = runRace(500 + k, roster, tracks[k % 12], st);
    rounds += race.round;
    race.racers.forEach(r => { nerves += r.nerves; rows.push([r.morale, -r.place, G.Gen.statSum(roster[r.id])]); });
  }
  const pct = b => (st.dens[b][1] / st.dens[b][0] * 100).toFixed(0) + '%';
  console.log(`давка ${on ? 'ВКЛ ' : 'ВЫКЛ'}: раундов ${(rounds / N).toFixed(1)}, «дрогнул» на гонщика ${(nerves / N / 16).toFixed(2)}, ходов в толпе (2+ соседей): старт ${pct('start')}, раунды 4–10 ${pct('mid')}, позже ${pct('late')}, корр. морали с местом ${corr(rows.map(x => x[0]), rows.map(x => x[1])).toFixed(3)}, корр. силы с местом ${corr(rows.map(x => x[2]), rows.map(x => x[1])).toFixed(3)}`);
}
CFG.crowdBase = BASE;
// 2) ценность +10 морали
{
  let sum = 0; const P = N * 2;
  for (let n = 0; n < P; n++) {
    const roster = G.Gen.rollRoster(G.mulberry32(9000 + n)), tgt = n % 16, track = tracks[n % 12];
    const base = runRace(700 + n, roster, track).racers[tgt].place;
    const up = clone(roster); up[tgt].morale = Math.min(100, up[tgt].morale + 30);
    sum += (base - runRace(700 + n, up, track).racers[tgt].place) / 3;
  }
  console.log(`+10 морали ≈ +${(sum / P).toFixed(3)} места за гонку`);
}
// 3) психолог на дистанции чемпионата (только динамика морали, по реальным местам из гонок)
for (const lvl of [0, 1, 2, 3]) {
  let mSum = 0, cnt = 0, lowSum = 0, low = 0;
  for (let c = 0; c < 40; c++) {
    const rnd = G.mulberry32(c + 1);
    const roster = G.Gen.rollRoster(rnd); roster.forEach(r => { r.crew.psy = lvl; });
    for (let k = 0; k < 12; k++) {
      // место и аварии — случайная выборка, как в среднем чемпионате
      roster.forEach(r => { const place = 1 + Math.floor(rnd() * 16), cr = rnd() < 0.2 ? 1 : 0; G.Gen.moraleAfter(r, { crashes: cr, kills: rnd() < 0.2 ? 1 : 0, rankShift: Math.round((rnd() - 0.5) * 4), fameTop: rnd() < 1 / 16, fameBottom: rnd() < 1 / 16 }); void place; mSum += r.morale; cnt++; if (r.morale < 40) low++; });
    }
  }
  console.log(`психолог ур.${lvl}: средняя мораль ${(mSum / cnt).toFixed(1)}, доля «упавших духом» (<40) ${(low / cnt * 100).toFixed(1)}%`);
}
