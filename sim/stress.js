/* Стресс-тест перков и апгрейдов: node sim/stress.js [гонок]
 * Каждому гонщику — случайные 1–2 перка, случайная команда/тюнинг/оружие. Проверяет инварианты после каждого хода. */
require('../js/data.js'); require('../js/board.js'); require('../js/tracks.js'); require('../js/track.js'); require('../js/race.js'); require('../js/econ.js');
const G = globalThis, N = +(process.argv[2] || 200), CFG = G.CFG;
const tracks = G.TRACKS.map(d => G.buildTrack(d));
const keys = Object.keys(G.PERKS);
const stat = {}; keys.forEach(k => { stat[k] = { n: 0, place: 0, fame: 0 }; });
let base = { n: 0, place: 0, fame: 0 }, errors = 0, turns = 0, fxCount = {};
const fail = (msg, race, r) => { errors++; if (errors < 15) console.log('ОШИБКА:', msg, r ? `${r.name} perks=${r.perks} hp=${r.hp} pos=${r.pos} speed=${r.speed}` : '', 'раунд', race.round); };
for (let k = 0; k < N; k++) {
  const rnd = G.mulberry32(31337 + k);
  const roster = G.Gen.rollRoster(rnd);
  roster.forEach(r => {
    r.perks = [];
    if (rnd() < 0.7) r.perks.push(keys[Math.floor(rnd() * keys.length)]);
    if (rnd() < 0.3) { const o = keys.filter(x => !r.perks.includes(x)); r.perks.push(o[Math.floor(rnd() * o.length)]); }
    ['mech', 'gun', 'armor', 'nitro'].forEach(c => { r.crew[c] = Math.floor(rnd() * 4); });
    ['cal', 'mag', 'aim'].forEach(c => { r.wmods[c] = Math.floor(rnd() * 4); });
    if (rnd() < 0.4) r.weapon = G.WEAPONS[Math.floor(rnd() * G.WEAPONS.length)].id;
  });
  const track = tracks[k % tracks.length];
  const human = rnd() < 0.3 ? Math.floor(rnd() * 16) : -1; // имитация игрока (ходы — случайные валидные)
  const race = new G.Race({ seed: 777 + k, track, roster, human, mods: { rain: rnd() < 0.4 } });
  let g = 0;
  try {
    while (!race.over && g++ < 60000) {
      let mv;
      if (race.needsInput()) { const ms = race.current.board.listMoves(); mv = ms[Math.floor(rnd() * ms.length)]; }
      const res = race.playTurn(mv);
      turns++;
      race.fx.splice(0).forEach(f => { const t = f.text.split(' ')[0]; fxCount[t] = (fxCount[t] || 0) + 1; });
      for (const r of race.racers) {
        const nums = [r.hp, r.pos, r.speed, r.nitro, r.charge, r.shield, r.grip, r.fame, r.frac];
        if (nums.some(x => typeof x !== 'number' || !isFinite(x))) fail('не число', race, r);
        if (r.hp < 0 || r.hp > CFG.MAX_HP + 1e-9) fail('прочность вне 0..100', race, r);
        if (r.speed < 0) fail('отрицательная скорость', race, r);
        if (r.nitro > CFG.nitroMax + 1e-9 || r.charge > r.weapon.charge + 1e-9 || r.shield > CFG.shieldMax + 1e-9 || r.grip > CFG.gripMax + 1e-9) fail('ресурс выше максимума', race, r);
        if (r.skip < 0) fail('skip < 0', race, r);
        if (!r.board.hasMove()) fail('на поле нет ходов', race, r);
      }
      if (res && res.match && !res.match.final.every(Boolean)) fail('дыра на поле', race, res.racer);
    }
    if (!race.over) fail('гонка не закончилась', race);
    const places = race.racers.map(r => r.place).sort((a, b) => a - b);
    if (places.some((p, i) => p !== i + 1)) fail('места не 1..16: ' + places, race);
  } catch (e) { fail('исключение: ' + e.stack, race); }
  race.racers.forEach(r => {
    const fame = (G.ECON.prize[r.place - 1] + r.fame) * (r.perks.includes('press') ? 1.4 : 1);
    if (!r.perks.length) { base.n++; base.place += r.place; base.fame += fame; }
    r.perks.forEach(p => { stat[p].n++; stat[p].place += r.place; stat[p].fame += fame; });
  });
}
console.log(`гонок: ${N}, ходов: ${turns}, ошибок: ${errors}`);
console.log('события перков:', JSON.stringify(fxCount));
console.log('без перка'.padEnd(16), 'ср. место', (base.place / base.n).toFixed(2), ' ср. слава', (base.fame / base.n).toFixed(1));
keys.forEach(k => { const s = stat[k]; console.log((G.PERKS[k].icon + ' ' + G.PERKS[k].name).padEnd(16), 'ср. место', (s.place / s.n).toFixed(2), ' ср. слава', (s.fame / s.n).toFixed(1), ' n=' + s.n); });
