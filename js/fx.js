/* Система частиц и эффектов на canvas (аддитивное смешивание, свечения, трассеры, тексты). */
(function (G) {
  'use strict';

  class FX {
    constructor(canvas, mapper) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.map = mapper || null;   // функция: мировые координаты -> {x,y,s}
      this.parts = [];
      this.tasks = [];             // анимационные задачи (снаряды и т.п.)
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.timeScale = 1;
      this.resize();
      this.loop = this.loop.bind(this);
      this.last = performance.now();
      requestAnimationFrame(this.loop);
    }

    resize() {
      const r = this.cv.getBoundingClientRect();
      this.w = r.width; this.h = r.height;
      this.cv.width = Math.max(1, Math.round(r.width * this.dpr));
      this.cv.height = Math.max(1, Math.round(r.height * this.dpr));
      if (this.onResize) this.onResize();
    }

    P(x, y) { return this.map ? this.map(x, y) : { x, y, s: 1 }; }

    add(p) {
      if (this.parts.length > 1600) this.parts.splice(0, 200);
      p.life = 0; p.max = p.max || 0.8;
      p.drag = p.drag === undefined ? 0.92 : p.drag;
      p.g = p.g || 0;
      this.parts.push(p);
      return p;
    }

    burst(x, y, color, n, o) {
      o = o || {};
      const sp = o.speed || 220;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = sp * (0.3 + Math.random() * 0.9);
        this.add({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up || 0),
          size: (o.size || 4) * (0.5 + Math.random()), color, max: (o.life || 0.7) * (0.6 + Math.random() * 0.6),
          shape: o.shape || (Math.random() < 0.5 ? 'spark' : 'dot'), g: o.g === undefined ? 300 : o.g, drag: o.drag
        });
      }
    }

    ring(x, y, color, r, o) {
      o = o || {};
      this.add({ x, y, vx: 0, vy: 0, shape: 'ring', color, r0: o.r0 || 4, r1: r, max: o.life || 0.5, width: o.width || 4 });
    }

    flash(x, y, color, r, life) { this.add({ x, y, vx: 0, vy: 0, shape: 'flash', color, r1: r, max: life || 0.25 }); }

    smoke(x, y, n, o) {
      o = o || {};
      for (let i = 0; i < n; i++) {
        this.add({
          x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10,
          vx: (Math.random() - 0.5) * 40 + (o.vx || 0), vy: (Math.random() - 0.5) * 40 - 20 + (o.vy || 0),
          size: (o.size || 10) * (0.6 + Math.random() * 0.8), color: o.color || 'rgba(160,160,170,', max: (o.life || 1.2) * (0.6 + Math.random() * 0.6),
          shape: 'smoke', drag: 0.96
        });
      }
    }

    text(x, y, str, color, o) {
      o = o || {};
      this.add({ x, y, vx: 0, vy: -(o.rise || 50), shape: 'text', str, color, size: o.size || 18, max: o.life || 1.2, drag: 0.97, stroke: o.stroke || 'rgba(0,0,0,.85)' });
    }

    beam(x1, y1, x2, y2, color, o) {
      o = o || {};
      this.add({ x: x1, y: y1, x2, y2, vx: 0, vy: 0, shape: 'beam', color, width: o.width || 6, max: o.life || 0.45, jitter: o.jitter || 0 });
    }

    // Задача, выполняемая каждый кадр: fn(t 0..1, dt) ; возвращает Promise
    task(duration, fn) {
      return new Promise(res => this.tasks.push({ t: 0, d: Math.max(0.01, duration), fn, res }));
    }

    loop(now) {
      try { this.frame(now); } catch (e) { console.error(e); this.parts.length = 0; }
      requestAnimationFrame(this.loop);
    }

    frame(now) {
      const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000)) * this.timeScale;
      this.last = now;
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.cv.width, this.cv.height);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (this.pre) { try { this.pre(ctx, dt, this); } catch (e) { console.error(e); } }
      for (let i = this.tasks.length - 1; i >= 0; i--) {
        const k = this.tasks[i];
        k.t += dt;
        const done = k.t >= k.d;
        try { k.fn(Math.min(1, k.t / k.d), dt); } catch (e) { console.error(e); }
        if (done) { this.tasks.splice(i, 1); k.res(); }
      }
      ctx.globalCompositeOperation = 'lighter';
      const ps = this.parts;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life += dt;
        if (p.life >= p.max) { ps.splice(i, 1); continue; }
        const k = p.life / p.max;
        p.vx *= Math.pow(p.drag, dt * 60); p.vy *= Math.pow(p.drag, dt * 60);
        p.vy += p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        const q = this.P(p.x, p.y), s = q.s;
        if (p.shape === 'dot') {
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.5, p.size * s * (1 - k * 0.5)), 0, 6.283); ctx.fill();
        } else if (p.shape === 'spark') {
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, p.size * 0.5 * s); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - p.vx * 0.04 * s, q.y - p.vy * 0.04 * s); ctx.stroke();
        } else if (p.shape === 'ring') {
          ctx.globalAlpha = (1 - k) * 0.9;
          ctx.strokeStyle = p.color; ctx.lineWidth = p.width * (1 - k) * s + 0.5;
          ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.1, (p.r0 + (p.r1 - p.r0) * (1 - Math.pow(1 - k, 3))) * s), 0, 6.283); ctx.stroke();
        } else if (p.shape === 'flash') {
          const r = Math.max(0.1, p.r1 * s * (0.6 + k * 0.6));
          const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
          g.addColorStop(0, 'rgba(255,255,255,' + (1 - k) + ')');
          g.addColorStop(0.3, p.color);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = 1 - k; ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.283); ctx.fill();
        } else if (p.shape === 'smoke') {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = (1 - k) * 0.35;
          ctx.fillStyle = p.color + (1 - k) * 0.6 + ')';
          ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.1, p.size * s * (1 + k * 1.5)), 0, 6.283); ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
        } else if (p.shape === 'beam') {
          const q2 = this.P(p.x2, p.y2);
          ctx.globalAlpha = 1 - k;
          ctx.lineCap = 'round';
          const path = () => {
            ctx.beginPath(); ctx.moveTo(q.x, q.y);
            if (p.jitter) {
              const segs = 8;
              for (let j = 1; j < segs; j++) {
                const f = j / segs;
                ctx.lineTo(q.x + (q2.x - q.x) * f + (Math.random() - 0.5) * p.jitter * s, q.y + (q2.y - q.y) * f + (Math.random() - 0.5) * p.jitter * s);
              }
            }
            ctx.lineTo(q2.x, q2.y);
          };
          ctx.strokeStyle = p.color; ctx.lineWidth = p.width * 2.4 * s * (1 - k); path(); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = p.width * 0.6 * s * (1 - k); path(); ctx.stroke();
        } else if (p.shape === 'text') {
          ctx.globalCompositeOperation = 'source-over';
          const pop = k < 0.15 ? 0.6 + k / 0.15 * 0.6 : k < 0.25 ? 1.2 - (k - 0.15) / 0.1 * 0.2 : 1;
          ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
          ctx.font = `900 ${Math.round(p.size * Math.max(0.7, s) * pop)}px "Russo One", "Exo 2", sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 4; ctx.strokeStyle = p.stroke; ctx.strokeText(p.str, q.x, q.y);
          ctx.fillStyle = p.color; ctx.fillText(p.str, q.x, q.y);
          ctx.globalCompositeOperation = 'lighter';
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  G.FX = FX;
})(window);
