/* win-animation.js — Epic 2048 merge animation sequence */
'use strict';

(function () {
  const CHARGE_MS   = 650;
  const RAYS_MS     = 780;
  const FLASH_MS    = 240;
  const HOLD_MS     = 1350;
  const FLY_MS      = 680;

  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Cancel any in-progress animation if a new game starts
  let cancelled = false;
  document.addEventListener('game:new', () => {
    cancelled = true;
    document.getElementById('win-rays-canvas')?.remove();
    document.getElementById('win-slam-overlay')?.remove();
    document.querySelectorAll('.win-flyer').forEach(el => el.remove());
  });

  document.addEventListener('game:merge2048', async (e) => {
    cancelled = false;
    const { tileEl } = e.detail;

    try {
      if (cancelled) return;
      await chargeUp(tileEl);

      if (cancelled) return;
      await raysAndFlash(tileEl);

      if (cancelled) return;
      const slamTileEl = await slamReveal();
      playFanfare();

      if (cancelled) return;
      await delay(HOLD_MS);

      if (cancelled) return;
      await flyHome(slamTileEl, tileEl);

    } catch (err) {
      console.error('[win-animation]', err);
    } finally {
      document.getElementById('win-rays-canvas')?.remove();
      document.getElementById('win-slam-overlay')?.remove();
      document.querySelectorAll('.win-flyer').forEach(el => el.remove());
      if (!cancelled) window.finishWin2048?.();
    }
  });

  // ─── Phase 1: Charge up ───────────────────────────────────────────
  async function chargeUp(tileEl) {
    if (!tileEl) return delay(CHARGE_MS);
    tileEl.classList.remove('tile-slow-merge');
    tileEl.classList.add('tile-charging');
    await delay(CHARGE_MS);
    tileEl.classList.remove('tile-charging');
  }

  // ─── Phase 2: Rays + flash ────────────────────────────────────────
  function raysAndFlash(tileEl) {
    return new Promise(resolve => {
      const canvas = document.createElement('canvas');
      canvas.id = 'win-rays-canvas';
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      canvas.style.cssText = 'position:fixed;inset:0;z-index:9000;pointer-events:none;';
      document.body.appendChild(canvas);
      const ctx = canvas.getContext('2d');

      let cx = window.innerWidth / 2;
      let cy = window.innerHeight / 2;
      if (tileEl) {
        const r = tileEl.getBoundingClientRect();
        cx = r.left + r.width / 2;
        cy = r.top  + r.height / 2;
      }

      const maxDist = Math.max(
        Math.hypot(cx, cy),
        Math.hypot(window.innerWidth - cx, cy),
        Math.hypot(cx, window.innerHeight - cy),
        Math.hypot(window.innerWidth - cx, window.innerHeight - cy)
      ) * 1.15;

      const RAY_COUNT   = 22;
      const RAY_HALF    = Math.PI / RAY_COUNT / 1.5;
      const RAY_OFFSET  = 0.13; // slight rotation so rays don't align with axes
      const start = performance.now();

      function frame(now) {
        const t      = Math.min((now - start) / RAYS_MS, 1);
        const eased  = 1 - Math.pow(1 - t, 2.8);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Radial background glow
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxDist * eased);
        grd.addColorStop(0,    `rgba(255, 230, 80,  ${0.9 * t})`);
        grd.addColorStop(0.2,  `rgba(255, 160, 30,  ${0.7 * t})`);
        grd.addColorStop(0.55, `rgba(255, 80,  10,  ${0.45 * t})`);
        grd.addColorStop(1,    'rgba(255, 30,  0,   0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Rays
        for (let i = 0; i < RAY_COUNT; i++) {
          const angle   = (i / RAY_COUNT) * Math.PI * 2 + RAY_OFFSET;
          const tipDist = maxDist * eased;
          const baseDist = tipDist * 0.08;

          const rayGrd = ctx.createLinearGradient(
            cx + Math.cos(angle) * baseDist, cy + Math.sin(angle) * baseDist,
            cx + Math.cos(angle) * tipDist,  cy + Math.sin(angle) * tipDist
          );
          rayGrd.addColorStop(0,   `rgba(255, 245, 150, ${0.98 - t * 0.15})`);
          rayGrd.addColorStop(0.35, `rgba(255, 180, 40,  ${0.8 - t * 0.1})`);
          rayGrd.addColorStop(1,   'rgba(255, 80, 0, 0)');

          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(
            cx + Math.cos(angle - RAY_HALF) * baseDist,
            cy + Math.sin(angle - RAY_HALF) * baseDist
          );
          ctx.lineTo(
            cx + Math.cos(angle) * tipDist,
            cy + Math.sin(angle) * tipDist
          );
          ctx.lineTo(
            cx + Math.cos(angle + RAY_HALF) * baseDist,
            cy + Math.sin(angle + RAY_HALF) * baseDist
          );
          ctx.closePath();
          ctx.fillStyle = rayGrd;
          ctx.fill();
        }

        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          // White flash then remove canvas
          ctx.fillStyle = `rgba(255,255,255,0.92)`;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          setTimeout(() => { canvas.remove(); resolve(); }, FLASH_MS);
        }
      }

      requestAnimationFrame(frame);
    });
  }

  // ─── Phase 3: Slam reveal ─────────────────────────────────────────
  function slamReveal() {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.id = 'win-slam-overlay';
      overlay.innerHTML = `
        <div class="win-slam-inner">
          <div class="win-slam-tile">2048</div>
          <p class="win-slam-sub">Congratulations!</p>
        </div>`;
      document.body.appendChild(overlay);

      // Two rAF frames ensure transition triggers after paint
      requestAnimationFrame(() => requestAnimationFrame(() => {
        overlay.classList.add('win-slam-overlay--visible');
        // Screen shake on the wrapper
        const wrapper = document.querySelector('.wrapper');
        if (wrapper) {
          wrapper.classList.add('slam-shake');
          wrapper.addEventListener('animationend', () => wrapper.classList.remove('slam-shake'), { once: true });
        }
        // Resolve after slam tile animation settles (500ms)
        setTimeout(() => resolve(overlay.querySelector('.win-slam-tile')), 500);
      }));
    });
  }

  // ─── Phase 6: Fly home ────────────────────────────────────────────
  function flyHome(slamTileEl, realTileEl) {
    return new Promise(resolve => {
      if (!slamTileEl || !realTileEl) { resolve(); return; }

      const slamRect = slamTileEl.getBoundingClientRect();
      const realRect = realTileEl.getBoundingClientRect();
      if (!slamRect.width || !realRect.width) { resolve(); return; }

      // Create a flying tile that starts exactly where the slam tile is
      const flyer = document.createElement('div');
      flyer.className = 'win-flyer';
      flyer.textContent = '2048';
      flyer.style.cssText = `
        left:${slamRect.left}px; top:${slamRect.top}px;
        width:${slamRect.width}px; height:${slamRect.height}px;
        font-size:${slamRect.height * 0.3}px;
      `;
      document.body.appendChild(flyer);

      // Fade out the slam overlay
      const overlay = document.getElementById('win-slam-overlay');
      if (overlay) {
        overlay.style.transition = 'opacity 380ms ease';
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 400);
      }

      // FLIP to the real tile
      const dx     = realRect.left - slamRect.left;
      const dy     = realRect.top  - slamRect.top;
      const scaleX = realRect.width  / slamRect.width;
      const scaleY = realRect.height / slamRect.height;

      requestAnimationFrame(() => requestAnimationFrame(() => {
        flyer.style.transition = `transform ${FLY_MS}ms cubic-bezier(0.4,0,0.2,1), opacity 180ms ease ${FLY_MS - 180}ms`;
        flyer.style.transformOrigin = 'top left';
        flyer.style.transform = `translate(${dx}px,${dy}px) scale(${scaleX},${scaleY})`;
        flyer.style.opacity = '0';
        setTimeout(() => { flyer.remove(); resolve(); }, FLY_MS + 20);
      }));
    });
  }

  // ─── Fanfare ──────────────────────────────────────────────────────
  function playFanfare() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.gain.value = 0.28;
      master.connect(ctx.destination);

      // Triumphant C major fanfare: quick arpeggio then swelling chord
      const notes = [
        // Rising arpeggio
        { f: 523.25, t: 0,    d: 0.22, g: 0.8,  type: 'square'   }, // C5
        { f: 659.25, t: 0.11, d: 0.22, g: 0.8,  type: 'square'   }, // E5
        { f: 783.99, t: 0.22, d: 0.22, g: 0.8,  type: 'square'   }, // G5
        { f: 1046.5, t: 0.33, d: 0.55, g: 0.9,  type: 'square'   }, // C6
        // Held major chord
        { f: 261.63, t: 0.42, d: 1.5,  g: 0.55, type: 'sawtooth' }, // C4
        { f: 523.25, t: 0.42, d: 1.5,  g: 0.5,  type: 'sawtooth' }, // C5
        { f: 659.25, t: 0.42, d: 1.5,  g: 0.45, type: 'sawtooth' }, // E5
        { f: 783.99, t: 0.42, d: 1.5,  g: 0.4,  type: 'sawtooth' }, // G5
        // Sub bass punch
        { f: 130.81, t: 0.42, d: 0.6,  g: 0.7,  type: 'sine'     }, // C3
      ];

      notes.forEach(({ f, t: nt, d, g, type }) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0,          ctx.currentTime + nt);
        gain.gain.linearRampToValueAtTime(g, ctx.currentTime + nt + 0.03);
        gain.gain.setValueAtTime(g,          ctx.currentTime + nt + d - 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + nt + d);
        osc.connect(gain);
        gain.connect(master);
        osc.start(ctx.currentTime + nt);
        osc.stop(ctx.currentTime + nt + d + 0.05);
      });
    } catch {}
  }
})();
