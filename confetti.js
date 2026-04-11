/* confetti.js — canvas-based particle system for 2048 merge celebrations */
'use strict';

(function () {
  const canvas = document.getElementById('confetti');
  const ctx = canvas.getContext('2d');

  const COLORS = ['#FF6B2B', '#ffffff', '#ffd700', '#ff3d00', '#c084fc'];

  // Active particles
  let particles = [];
  let rafId = null;

  // Resize canvas to fill viewport
  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  // ─── Particle factory ───────────────────────────────────────────
  function createParticle(x, y, count) {
    const batch = [];
    for (let i = 0; i < count; i++) {
      const angle  = Math.random() * Math.PI * 2;
      // Initial burst — stronger upward bias
      const speed  = 4 + Math.random() * 10;
      const vx     = Math.cos(angle) * speed * 0.9;
      const vy     = -Math.abs(Math.sin(angle)) * speed - Math.random() * 6;
      const color  = COLORS[Math.floor(Math.random() * COLORS.length)];
      const shape  = ['circle', 'rect', 'star'][Math.floor(Math.random() * 3)];
      const size   = 5 + Math.random() * 9;
      const rot    = Math.random() * Math.PI * 2;
      const rotV   = (Math.random() - 0.5) * 0.25;
      const life   = 2000 + Math.random() * 1000; // ms

      batch.push({ x, y, vx, vy, color, shape, size, rot, rotV, life, born: performance.now(), alpha: 1 });
    }
    return batch;
  }

  // ─── Draw helpers ───────────────────────────────────────────────
  function drawCircle(p) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRect(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillRect(-p.size / 2, -p.size * 0.35, p.size, p.size * 0.7);
    ctx.restore();
  }

  function drawStar(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    const r1 = p.size / 2;
    const r2 = r1 * 0.45;
    const pts = 5;
    ctx.beginPath();
    for (let i = 0; i < pts * 2; i++) {
      const r   = i % 2 === 0 ? r1 : r2;
      const ang = (i * Math.PI) / pts - Math.PI / 2;
      i === 0 ? ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r)
              : ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ─── Animation loop ─────────────────────────────────────────────
  function loop(ts) {
    if (particles.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      rafId = null;
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles = particles.filter(p => {
      const elapsed = ts - p.born;
      if (elapsed >= p.life) return false;

      // Physics
      p.vy += 0.4;          // gravity
      p.vx *= 0.995;        // slight air resistance
      p.x  += p.vx;
      p.y  += p.vy;
      p.rot += p.rotV;

      // Fade out over the last 40% of life
      const fadeStart = p.life * 0.6;
      if (elapsed > fadeStart) {
        p.alpha = 1 - (elapsed - fadeStart) / (p.life - fadeStart);
      }

      // Cull off-screen (below viewport only — let them fly upward)
      if (p.y > canvas.height + 40) return false;

      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle   = p.color;

      if (p.shape === 'circle')     drawCircle(p);
      else if (p.shape === 'rect')  drawRect(p);
      else                          drawStar(p);

      return true;
    });

    ctx.globalAlpha = 1;
    rafId = requestAnimationFrame(loop);
  }

  // ─── Public API ─────────────────────────────────────────────────
  // x, y  — screen coords of burst origin
  // count — number of particles
  window.triggerConfetti = function triggerConfetti(x, y, count) {
    const newBatch = createParticle(x, y, count);
    particles.push(...newBatch);

    if (!rafId) {
      rafId = requestAnimationFrame(loop);
    }
  };

})();
