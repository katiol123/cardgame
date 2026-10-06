/* Поле «три в ряд»: логика без отрисовки. Каждый ход возвращает «волны» для анимации. */
(function (G) {
  'use strict';
  const TYPES = 6;
  const NOVA = 6;

  class Board {
    constructor(rand, size) {
      this.rand = rand || Math.random;
      this.n = size || 8;
      this.grid = new Array(this.n * this.n).fill(null);
      this.uid = 1;
      this.fill();
    }

    gem(type) { return { id: this.uid++, type, special: null, lock: 0 }; }
    rt() { return Math.floor(this.rand() * TYPES); }
    type(r, c) {
      if (r < 0 || c < 0 || r >= this.n || c >= this.n) return -1;
      const g = this.grid[r * this.n + c];
      return g ? g.type : -1;
    }

    fill() {
      const n = this.n;
      let guard = 0;
      do {
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
          let t, tries = 0;
          do { t = this.rt(); tries++; }
          while (tries < 30 && ((c >= 2 && this.type(r, c - 1) === t && this.type(r, c - 2) === t) ||
                                (r >= 2 && this.type(r - 1, c) === t && this.type(r - 2, c) === t)));
          this.grid[r * n + c] = this.gem(t);
        }
      } while (!this.hasMove() && ++guard < 50);
    }

    snapshot() {
      return this.grid.map(g => g ? { id: g.id, type: g.type, special: g.special, lock: g.lock } : null);
    }

    swap(a, b) { const t = this.grid[a]; this.grid[a] = this.grid[b]; this.grid[b] = t; }

    adjacent(a, b) {
      const n = this.n, ra = (a / n) | 0, rb = (b / n) | 0;
      return (ra === rb && Math.abs(a - b) === 1) || Math.abs(a - b) === n;
    }

    matchAt(i) {
      const n = this.n, r = (i / n) | 0, c = i % n, t = this.type(r, c);
      if (t < 0 || t >= TYPES) return false;
      let h = 1, k = c - 1; while (this.type(r, k) === t) { h++; k--; }
      k = c + 1; while (this.type(r, k) === t) { h++; k++; }
      if (h >= 3) return true;
      let v = 1; k = r - 1; while (this.type(k, c) === t) { v++; k--; }
      k = r + 1; while (this.type(k, c) === t) { v++; k++; }
      return v >= 3;
    }

    swapValid(a, b) {
      const A = this.grid[a], B = this.grid[b];
      if (!A || !B || A.lock || B.lock || !this.adjacent(a, b)) return false;
      if (A.type === NOVA || B.type === NOVA) return true;
      this.swap(a, b);
      const ok = this.matchAt(a) || this.matchAt(b);
      this.swap(a, b);
      return ok;
    }

    listMoves() {
      const n = this.n, out = [];
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const i = r * n + c;
        if (c + 1 < n && this.swapValid(i, i + 1)) out.push([i, i + 1]);
        if (r + 1 < n && this.swapValid(i, i + n)) out.push([i, i + n]);
      }
      return out;
    }

    hasMove() {
      const n = this.n;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const i = r * n + c;
        if (c + 1 < n && this.swapValid(i, i + 1)) return true;
        if (r + 1 < n && this.swapValid(i, i + n)) return true;
      }
      return false;
    }

    // Находит группы совпадений (линии и пересечения Г/Т).
    findGroups() {
      const n = this.n, runs = [];
      for (let r = 0; r < n; r++) {
        let c = 0;
        while (c < n) {
          const t = this.type(r, c); let e = c + 1;
          while (e < n && this.type(r, e) === t) e++;
          if (t >= 0 && t < TYPES && e - c >= 3) {
            const cells = []; for (let k = c; k < e; k++) cells.push(r * n + k);
            runs.push({ dir: 'h', cells, type: t });
          }
          c = e;
        }
      }
      for (let c = 0; c < n; c++) {
        let r = 0;
        while (r < n) {
          const t = this.type(r, c); let e = r + 1;
          while (e < n && this.type(e, c) === t) e++;
          if (t >= 0 && t < TYPES && e - r >= 3) {
            const cells = []; for (let k = r; k < e; k++) cells.push(k * n + c);
            runs.push({ dir: 'v', cells, type: t });
          }
          r = e;
        }
      }
      if (!runs.length) return [];
      const parent = runs.map((_, i) => i);
      const find = x => (parent[x] === x ? x : (parent[x] = find(parent[x])));
      const owner = new Map();
      runs.forEach((run, i) => run.cells.forEach(cell => {
        if (owner.has(cell)) parent[find(i)] = find(owner.get(cell)); else owner.set(cell, i);
      }));
      const groups = new Map();
      runs.forEach((run, i) => {
        const root = find(i);
        if (!groups.has(root)) groups.set(root, { type: run.type, cells: new Set(), runs: [] });
        const g = groups.get(root);
        run.cells.forEach(c => g.cells.add(c));
        g.runs.push(run);
      });
      return [...groups.values()].map(g => ({
        type: g.type, cells: [...g.cells], runs: g.runs,
        maxLen: Math.max(...g.runs.map(r => r.cells.length)),
        hasH: g.runs.some(r => r.dir === 'h'), hasV: g.runs.some(r => r.dir === 'v')
      }));
    }

    specialFor(g) {
      if (g.maxLen >= 5) return 'nova';
      if (g.hasH && g.hasV) return 'bomb';
      if (g.maxLen === 4) return g.runs.find(r => r.cells.length === 4).dir === 'h' ? 'row' : 'col';
      return null;
    }

    pivot(g, prefer) {
      const free = i => this.grid[i] && !this.grid[i].special;
      for (const p of prefer) if (g.cells.includes(p) && free(p)) return p;
      if (g.hasH && g.hasV) {
        // клетка пересечения
        const h = g.runs.filter(r => r.dir === 'h').flatMap(r => r.cells);
        const x = g.runs.filter(r => r.dir === 'v').flatMap(r => r.cells).find(c => h.includes(c));
        if (x !== undefined && free(x)) return x;
      }
      const longest = g.runs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
      const mid = longest.cells[(longest.cells.length / 2) | 0];
      if (free(mid)) return mid;
      const any = g.cells.find(free);
      return any === undefined ? -1 : any;
    }

    mostCommonType() {
      const cnt = [0, 0, 0, 0, 0, 0];
      this.grid.forEach(g => { if (g && g.type < TYPES) cnt[g.type]++; });
      return cnt.indexOf(Math.max(...cnt));
    }

    // Цепная активация спецблоков, попавших в зону сжигания.
    expand(clear, activations, skip) {
      const n = this.n, done = new Set(skip || []), queue = [...clear];
      while (queue.length) {
        const i = queue.pop();
        const g = this.grid[i];
        if (!g || !g.special || done.has(i)) continue;
        done.add(i);
        const r = (i / n) | 0, c = i % n, area = [];
        if (g.special === 'row') for (let k = 0; k < n; k++) area.push(r * n + k);
        else if (g.special === 'col') for (let k = 0; k < n; k++) area.push(k * n + c);
        else if (g.special === 'bomb') {
          for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
            if (Math.abs(dr) + Math.abs(dc) > 2) continue;
            const rr = r + dr, cc = c + dc;
            if (rr >= 0 && cc >= 0 && rr < n && cc < n) area.push(rr * n + cc);
          }
        } else if (g.special === 'nova') {
          const t = this.mostCommonType();
          this.grid.forEach((x, k) => { if (x && x.type === t) area.push(k); });
        }
        activations.push({ i, r, c, special: g.special, type: g.type, area });
        for (const a of area) if (!clear.has(a) && this.grid[a]) { clear.add(a); queue.push(a); }
      }
    }

    novaClear(a, b) {
      const A = this.grid[a], B = this.grid[b];
      const clear = new Set([a, b]);
      if (A.type === NOVA && B.type === NOVA) {
        this.grid.forEach((g, i) => { if (g) clear.add(i); });
        return { clear, skip: [a, b], target: -1 };
      }
      const novaIdx = A.type === NOVA ? a : b;
      const other = this.grid[novaIdx === a ? b : a];
      this.grid.forEach((g, i) => { if (g && g.type === other.type) clear.add(i); });
      return { clear, skip: [novaIdx], target: other.type, novaIdx };
    }

    // Оценка хода для ИИ (только первая волна, без каскадов).
    evaluate(a, b) {
      const tally = [0, 0, 0, 0, 0, 0];
      let created = 0, clear, skip = [];
      this.swap(a, b);
      const A = this.grid[a], B = this.grid[b];
      if (A.type === NOVA || B.type === NOVA) {
        const res = this.novaClear(a, b); clear = res.clear; skip = res.skip; created = 1;
      } else {
        clear = new Set();
        for (const g of this.findGroups()) {
          g.cells.forEach(c => clear.add(c));
          const sp = this.specialFor(g);
          if (sp) created += sp === 'nova' ? 3 : sp === 'bomb' ? 2 : 1.5;
        }
      }
      const acts = [];
      this.expand(clear, acts, skip);
      clear.forEach(i => { const g = this.grid[i]; if (g && g.type < TYPES) tally[g.type]++; });
      this.swap(a, b);
      return { tally, created, activations: acts.length, cleared: clear.size };
    }

    // Выполнение хода: возвращает волны для анимации и итоговый «улов» по типам блоков.
    execute(a, b) {
      const waves = [], tally = [0, 0, 0, 0, 0, 0];
      const before = this.snapshot();
      this.swap(a, b);
      let forced = null, forcedSkip = [], novaInfo = null;
      const A = this.grid[a], B = this.grid[b];
      if (A.type === NOVA || B.type === NOVA) {
        const res = this.novaClear(a, b);
        forced = res.clear; forcedSkip = res.skip; novaInfo = { i: res.novaIdx !== undefined ? res.novaIdx : a, target: res.target };
      }
      let wave = 0, totalCleared = 0, specials = 0;
      while (wave < 40) {
        let clear, created = [], skip = [];
        if (forced) { clear = forced; skip = forcedSkip; forced = null; }
        else {
          const groups = this.findGroups();
          if (!groups.length) break;
          clear = new Set();
          for (const g of groups) {
            g.cells.forEach(c => clear.add(c));
            const sp = this.specialFor(g);
            if (sp) {
              const pv = this.pivot(g, wave === 0 ? [a, b] : []);
              if (pv >= 0 && !created.some(x => x.i === pv)) created.push({ i: pv, special: sp, type: sp === 'nova' ? NOVA : g.type });
            }
          }
        }
        const activations = [];
        this.expand(clear, activations, skip);
        if (wave === 0 && novaInfo) activations.unshift({ i: novaInfo.i, r: (novaInfo.i / this.n) | 0, c: novaInfo.i % this.n, special: 'novaswap', type: novaInfo.target, area: [...clear] });
        created.forEach(cr => clear.delete(cr.i));
        const mult = 1 + 0.5 * wave;
        const cleared = [];
        for (const i of clear) {
          const g = this.grid[i]; if (!g) continue;
          cleared.push({ id: g.id, i, type: g.type, special: g.special });
          if (g.type < TYPES) tally[g.type] += mult;
          this.grid[i] = null;
        }
        const createdOut = created.map(cr => {
          const g = this.grid[cr.i];
          if (g.type < TYPES) tally[g.type] += mult;
          g.special = cr.special; g.type = cr.type; g.lock = 0;
          return { id: g.id, i: cr.i, special: cr.special, type: cr.type };
        });
        totalCleared += cleared.length; specials += activations.length;
        const afterClear = this.snapshot();
        const spawn = this.gravity();
        waves.push({ cleared, created: createdOut, activations, afterClear, after: this.snapshot(), spawn, mult });
        wave++;
      }
      let shuffled = false;
      if (!this.hasMove()) { this.shuffle(); shuffled = true; }
      return { swap: [a, b], before, waves, tally, combo: waves.length, totalCleared, specials, shuffled, final: this.snapshot() };
    }

    gravity() {
      const n = this.n, spawn = {};
      for (let c = 0; c < n; c++) {
        let write = n - 1;
        for (let r = n - 1; r >= 0; r--) {
          const g = this.grid[r * n + c];
          if (g) {
            if (r !== write) { this.grid[write * n + c] = g; this.grid[r * n + c] = null; }
            write--;
          }
        }
        const k = write + 1;
        for (let r = write; r >= 0; r--) {
          const g = this.gem(this.rt());
          this.grid[r * n + c] = g;
          spawn[g.id] = r - k;
        }
      }
      return spawn;
    }

    shuffle() {
      const gems = this.grid.filter(Boolean);
      let tries = 0;
      do {
        for (let i = gems.length - 1; i > 0; i--) {
          const j = Math.floor(this.rand() * (i + 1)); const t = gems[i]; gems[i] = gems[j]; gems[j] = t;
        }
        gems.forEach((g, i) => { this.grid[i] = g; });
        tries++;
      } while ((this.findGroups().length || !this.hasMove()) && tries < 200);
      if (tries >= 200) this.fill();
    }

    tickLocks() { this.grid.forEach(g => { if (g && g.lock > 0) g.lock--; }); }

    lockRandom(k, turns) {
      const free = [];
      this.grid.forEach((g, i) => { if (g && !g.lock && g.type !== NOVA) free.push(i); });
      const out = [];
      for (let m = 0; m < k && free.length; m++) {
        const j = Math.floor(this.rand() * free.length);
        const i = free.splice(j, 1)[0];
        this.grid[i].lock = turns; out.push(i);
      }
      if (!this.hasMove()) { // не даём заблокировать поле насмерть
        out.forEach(i => { this.grid[i].lock = 0; });
        return [];
      }
      return out;
    }
  }

  G.Board = Board;
})(typeof window !== 'undefined' ? window : globalThis);
