/* Трасса-«настолка»: замкнутая кривая, разбитая на клетки. Повороты вычисляются из кривизны. */
(function (G) {
  'use strict';

  const POINTS = [
    [250, 640], [550, 652], [820, 630], [945, 525], [958, 335], [905, 168], [762, 92],
    [600, 132], [560, 272], [450, 352], [330, 292], [300, 152], [190, 92], [80, 172],
    [62, 382], [108, 552]
  ];

  function bezierSegments(pts) {
    const segs = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const t = 1 / 6;
      segs.push([p1, [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t],
        [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t], p2]);
    }
    return segs;
  }
  function bez(s, t) {
    const u = 1 - t;
    return [
      u * u * u * s[0][0] + 3 * u * u * t * s[1][0] + 3 * u * t * t * s[2][0] + t * t * t * s[3][0],
      u * u * u * s[0][1] + 3 * u * u * t * s[1][1] + 3 * u * t * t * s[2][1] + t * t * t * s[3][1]
    ];
  }

  function buildTrack(cellsPerLap) {
    const N = cellsPerLap || G.CFG.CELLS_PER_LAP;
    const segs = bezierSegments(POINTS);
    const samples = [];
    const STEPS = 160;
    segs.forEach(s => { for (let k = 0; k < STEPS; k++) samples.push(bez(s, k / STEPS)); });
    const len = [0];
    for (let i = 1; i <= samples.length; i++) {
      const a = samples[i - 1], b = samples[i % samples.length];
      len.push(len[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const total = len[samples.length];
    const at = s => {
      s = ((s % total) + total) % total;
      let lo = 0, hi = samples.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (len[m + 1] < s) lo = m + 1; else hi = m; }
      const a = samples[lo], b = samples[(lo + 1) % samples.length];
      const f = (s - len[lo]) / ((len[lo + 1] - len[lo]) || 1);
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    };
    const angleAt = s => { const a = at(s - 3), b = at(s + 3); return Math.atan2(b[1] - a[1], b[0] - a[0]); };

    // старт — на нижней прямой
    let s0 = 0, best = 1e9;
    for (let i = 0; i < samples.length; i++) {
      const d = Math.hypot(samples[i][0] - 690, samples[i][1] - 645);
      if (d < best) { best = d; s0 = len[i]; }
    }
    const step = total / N;
    const cells = [];
    for (let k = 0; k < N; k++) {
      const s = s0 + k * step;
      const p = at(s);
      let turn = angleAt(s + step * 0.9) - angleAt(s - step * 0.9);
      while (turn > Math.PI) turn -= 2 * Math.PI;
      while (turn < -Math.PI) turn += 2 * Math.PI;
      cells.push({ i: k, x: p[0], y: p[1], a: angleAt(s), turn, s });
    }
    // Классификация поворотов
    cells.forEach(c => {
      const t = Math.abs(c.turn);
      c.corner = t > 0.62 ? 2 : t > 0.36 ? 1 : 0;
    });
    // сглаживаем: одиночные «прямые» между поворотами — тоже поворот
    cells.forEach((c, k) => {
      const prev = cells[(k - 1 + N) % N], next = cells[(k + 1) % N];
      if (!c.corner && prev.corner && next.corner) c.corner = 1;
    });
    // одиночный пологий «поворот» — это прямая
    cells.forEach((c, k) => {
      const prev = cells[(k - 1 + N) % N], next = cells[(k + 1) % N];
      if (c.corner === 1 && !prev.corner && !next.corner) c.corner = 0;
    });
    // Спецклетки (по кругу на прямых)
    const kinds = ['boost', 'ammo', 'repair', 'nitro', 'hazard', 'boost', 'shield', 'ammo', 'hazard', 'repair'];
    let kIdx = 0;
    cells.forEach((c, k) => {
      c.kind = 'plain';
      if (k < 3 || k > N - 10) return; // стартовая решётка
      if (c.corner) return;
      if (k % 5 === 3) c.kind = kinds[kIdx++ % kinds.length];
    });
    // после крутых поворотов — шипы/обломки на выходе
    cells.forEach((c, k) => {
      const prev = cells[(k - 1 + N) % N];
      const next = cells[(k + 1) % N];
      if (c.kind === 'plain' && next.kind === 'plain' && !c.corner && prev.corner === 2 && k > 3 && k < N - 10) c.kind = 'hazard';
    });
    // Зоны поворотов для подсветки
    const zones = [];
    let cur = null;
    for (let k = 0; k < N; k++) {
      const c = cells[k];
      if (c.corner) {
        if (!cur) { cur = { from: k, to: k, sev: c.corner }; zones.push(cur); }
        else { cur.to = k; cur.sev = Math.max(cur.sev, c.corner); }
      } else cur = null;
    }
    zones.forEach(z => { for (let k = z.from; k <= z.to; k++) cells[k].zoneSev = z.sev; });

    // путь для SVG
    let d = `M ${segs[0][0][0].toFixed(1)} ${segs[0][0][1].toFixed(1)}`;
    segs.forEach(s => { d += ` C ${s[1][0].toFixed(1)} ${s[1][1].toFixed(1)}, ${s[2][0].toFixed(1)} ${s[2][1].toFixed(1)}, ${s[3][0].toFixed(1)} ${s[3][1].toFixed(1)}`; });
    d += ' Z';

    return {
      N, laps: G.CFG.LAPS, total: N * G.CFG.LAPS, cells, zones, path: d, length: total, step,
      cell(pos) { return cells[((Math.floor(pos) % N) + N) % N]; },
      pointAt(pos) { // плавная позиция между клетками
        const s = s0 + pos * step;
        const p = at(s);
        return { x: p[0], y: p[1], a: angleAt(s) };
      }
    };
  }

  G.buildTrack = buildTrack;
})(typeof window !== 'undefined' ? window : globalThis);
