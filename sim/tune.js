/* Перебор коэффициентов баланса: node sim/tune.js */
const { execFileSync } = require('child_process');
const grid = [];
for (const drag of [0.1, 0.16, 0.22])
  for (const accPer of [0.06, 0.075])
    for (const accBase of [0.12, 0.3])
      grid.push({ accBase, accPer, drag, cornerPer: 0.3, vmaxPer: 0.3, ammoPer: 2, shieldPer: 2, repairPer: 2, dmgMul: 1.3 });
const run = (cfg, indep) => {
  const out = execFileSync('node', [__dirname + '/sim.js', '60'], { env: Object.assign({}, process.env, { CFG: JSON.stringify(cfg), INDEP: indep ? '1' : '' }) }).toString();
  return ['accel', 'top', 'handling'].map(k => +out.match(new RegExp(k + '\\s+corr with place: (-?[\\d.]+)'))[1]);
};
for (const cfg of grid) {
  const a = run(cfg, false), b = run(cfg, true);
  const spread = Math.max(...a) - Math.min(...a) + Math.max(...b) - Math.min(...b);
  console.log(spread.toFixed(3), JSON.stringify(a), JSON.stringify(b), JSON.stringify(cfg));
}
