/* Симуляция целого чемпионата с экономикой «Славы»: node sim/champ.js [чемпионатов] */
require('../js/data.js'); require('../js/board.js'); require('../js/tracks.js'); require('../js/track.js'); require('../js/race.js'); require('../js/econ.js');
const G = globalThis, N = +(process.argv[2] || 3);
const tracks = G.TRACKS.map(d => G.buildTrack(d));
let incomeTotal = 0, showTotal = 0, buys = {}, races = 0;
for (let c = 0; c < N; c++) {
  const rnd = G.mulberry32(500 + c);
  const pool = []; while (pool.length < 16) pool.push(...G.WEAPONS.filter(w => !w.shop).map(w => w.id));
  const roster = G.RACERS.map((_, i) => G.Shop.ensure({ stats: G.rollStats(rnd), weapon: pool[i] }));
  const fame = Array(16).fill(0), pts = Array(16).fill(0);
  tracks.forEach((track, k) => {
    const race = new G.Race({ seed: 9000 + c * 100 + k, track, roster });
    let g = 0; while (!race.over && g++ < 40000) race.playTurn();
    races++;
    race.racers.forEach(r => {
      const inc = G.ECON.prize[r.place - 1] + r.fame;
      fame[r.id] += inc; incomeTotal += inc; showTotal += r.showFame;
      pts[r.id] += G.POINTS_TABLE[r.place - 1] || 0;
    });
    roster.forEach((ros, i) => {
      const res = G.Shop.aiSpend(ros, fame[i], rnd); fame[i] = res.wallet;
      res.bought.forEach(b => { const t = b.split(' ')[0]; buys[t] = (buys[t] || 0) + 1; });
    });
  });
  if (c === 0) {
    console.log('итог чемпионата 0:');
    roster.forEach((r, i) => console.log(' ', G.RACERS[i].name.padEnd(8), 'очки', String(pts[i]).padStart(3), 'Р/С/М', r.stats.accel, r.stats.top, r.stats.handling, 'пушка', r.weapon, JSON.stringify(r.wmods), JSON.stringify(r.crew), 'кошелёк', fame[i]));
  }
}
console.log('средний доход за гонку на гонщика:', (incomeTotal / races / 16).toFixed(1), 'из них шоу:', (showTotal / races / 16).toFixed(1));
console.log('покупки:', JSON.stringify(buys));
