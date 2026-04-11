/* achievements.js — Achievement definitions, unlock logic, toast UI */
'use strict';

(function () {
  // ─── Config ─────────────────────────────────────────────────────
  const ACHIEVEMENTS = [
    {
      key: 'first_game',
      label: 'First Move',
      description: 'Complete your first game.',
      checkOnEnd: (d) => true,
    },
    {
      key: 'first_win',
      label: '2048 Club',
      description: 'Reach the 2048 tile.',
      checkOnEnd: (d) => d.won,
    },
    {
      key: 'tile_4096',
      label: 'Going Further',
      description: 'Reach the 4096 tile.',
      checkOnMove: (d) => d.highestTile >= 4096,
      checkOnEnd: (d) => d.highestTile >= 4096,
    },
    {
      key: 'tile_8192',
      label: 'Legendary',
      description: 'Reach the 8192 tile.',
      checkOnMove: (d) => d.highestTile >= 8192,
      checkOnEnd: (d) => d.highestTile >= 8192,
    },
    {
      key: 'no_undo_win',
      label: 'Purist',
      description: 'Win without using undo.',
      checkOnEnd: (d) => d.won && !d.undoUsed,
    },
    {
      key: 'no_powerup_win',
      label: 'Minimalist',
      description: 'Win without using any power-up.',
      checkOnEnd: (d) => d.won && !d.powerupUsed,
    },
    {
      key: 'score_10k',
      label: '10K Club',
      description: 'Score over 10,000 in one game.',
      checkOnEnd: (d) => d.score >= 10000,
    },
    {
      key: 'score_50k',
      label: 'High Roller',
      description: 'Score over 50,000 in one game.',
      checkOnEnd: (d) => d.score >= 50000,
    },
    {
      key: 'speed_win',
      label: 'Speed Runner',
      description: 'Win in under 5 minutes.',
      checkOnEnd: (d) => d.won && d.durationSeconds < 300,
    },
    {
      key: 'comeback',
      label: 'Comeback Kid',
      description: 'Win after using all 3 power-ups.',
      checkOnEnd: (d) => d.won && d.powerupUsed,
    },
  ];

  // Expose config for stats.js
  window.ACHIEVEMENTS = ACHIEVEMENTS;

  // ─── Local storage helpers ────────────────────────────────────
  function getLocalUnlocked() {
    try { return JSON.parse(localStorage.getItem('achievements2048') || '[]'); } catch { return []; }
  }

  function setLocalUnlocked(keys) {
    localStorage.setItem('achievements2048', JSON.stringify(keys));
  }

  function isUnlocked(key) {
    return getLocalUnlocked().includes(key);
  }

  function unlockLocal(key) {
    const keys = getLocalUnlocked();
    if (!keys.includes(key)) {
      keys.push(key);
      setLocalUnlocked(keys);
    }
  }

  // ─── Sync localStorage achievements to Supabase ───────────────
  window.syncLocalAchievements = async function (userId) {
    const keys = getLocalUnlocked();
    for (const key of keys) {
      await window.db.saveAchievement(userId, key);
    }
  };

  // ─── Toast queue ──────────────────────────────────────────────
  let toastQueue = [];
  let toastBusy = false;

  function enqueueToast(achievement) {
    toastQueue.push(achievement);
    if (!toastBusy) processToastQueue();
  }

  function processToastQueue() {
    if (toastQueue.length === 0) { toastBusy = false; return; }
    toastBusy = true;
    const a = toastQueue.shift();
    showToast(a);
    // Next toast after current auto-dismiss (4s) + 1.5s gap
    setTimeout(processToastQueue, 5500);
  }

  function showToast(achievement) {
    const container = document.getElementById('achievement-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'achievement-toast';
    toast.innerHTML = `
      <div class="achievement-toast-icon"><i data-lucide="award"></i></div>
      <div class="achievement-toast-body">
        <div class="achievement-toast-label">${achievement.label}</div>
        <div class="achievement-toast-desc">${achievement.description}</div>
      </div>
      <button class="achievement-toast-close" aria-label="Dismiss"><i data-lucide="x"></i></button>`;
    window.refreshIcons?.();

    container.appendChild(toast);

    // Trigger slide-in
    requestAnimationFrame(() => toast.classList.add('achievement-toast--visible'));

    // Play sound
    playAchievementSound();

    // Auto-dismiss after 4s
    const timer = setTimeout(() => dismissToast(toast), 4000);

    toast.querySelector('.achievement-toast-close').addEventListener('click', () => {
      clearTimeout(timer);
      dismissToast(toast);
    });
  }

  function dismissToast(toast) {
    toast.classList.remove('achievement-toast--visible');
    toast.classList.add('achievement-toast--hiding');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }

  // ─── Web Audio chime ─────────────────────────────────────────
  function playAchievementSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + i * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.3);
      });
    } catch {}
  }

  // ─── Check and award ─────────────────────────────────────────
  async function checkAndAward(key, achievement) {
    if (isUnlocked(key)) return;
    unlockLocal(key);

    const user = typeof window.getCurrentUser === 'function' ? window.getCurrentUser() : null;
    if (user) {
      await window.db.saveAchievement(user.id, key);
    }

    enqueueToast(achievement);
  }

  // ─── Event listeners ─────────────────────────────────────────
  document.addEventListener('game:move', (e) => {
    const d = e.detail;
    ACHIEVEMENTS.forEach((a) => {
      if (a.checkOnMove && a.checkOnMove(d)) checkAndAward(a.key, a);
    });
  });

  document.addEventListener('game:end', (e) => {
    const d = e.detail;
    ACHIEVEMENTS.forEach((a) => {
      if (a.checkOnEnd && a.checkOnEnd(d)) checkAndAward(a.key, a);
    });
  });

  // Reset per-game state (move-based checks re-evaluate fresh)
  document.addEventListener('game:new', () => {
    // nothing to reset — isUnlocked() persists across games intentionally
  });
})();
