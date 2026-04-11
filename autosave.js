/* autosave.js — Cloud game-state autosave + cloud icon */
'use strict';

(function () {
  const DEBOUNCE_MS = 2000;

  let saveTimer    = null;
  let currentUser  = null;
  let iconState    = 'hidden'; // hidden | offline | saving | saved | error

  // ─── Icon element ────────────────────────────────────────────────
  function el() { return document.getElementById('cloud-save-indicator'); }

  const ICON_MAP = {
    offline: { icon: 'cloud',        tip: 'Sign in to save your progress to the cloud' },
    saving:  { icon: 'cloud-upload', tip: 'Saving…' },
    saved:   { icon: 'cloud-check',  tip: 'Progress saved to cloud' },
    error:   { icon: 'cloud-alert',  tip: 'Could not save — will retry on next move' },
  };

  function setIcon(state) {
    iconState = state;
    const wrap = el();
    if (!wrap) return;
    if (state === 'hidden') { wrap.hidden = true; return; }
    wrap.hidden = false;
    wrap.dataset.state = state;
    const { icon, tip } = ICON_MAP[state] || ICON_MAP.offline;
    wrap.innerHTML = `<i data-lucide="${icon}"></i>`;
    wrap.title = tip;
    window.refreshIcons?.();
  }

  // ─── Save ────────────────────────────────────────────────────────
  function scheduleSave() {
    if (!currentUser) return;
    clearTimeout(saveTimer);
    setIcon('saving');
    saveTimer = setTimeout(doSave, DEBOUNCE_MS);
  }

  async function doSave() {
    if (!currentUser) return;
    const state = window.getGameState?.();
    if (!state) return;
    const { error } = await window.db.saveGameState(currentUser.id, state);
    setIcon(error ? 'error' : 'saved');
  }

  // ─── Clear on new game ───────────────────────────────────────────
  window.onGameReset = async function () {
    clearTimeout(saveTimer);
    if (!currentUser) return;
    setIcon('saving');
    await window.db.clearGameState(currentUser.id);
    setIcon('hidden');
  };

  // ─── Restore on sign-in ──────────────────────────────────────────
  async function tryRestore(userId) {
    const { data, error } = await window.db.loadGameState(userId);
    if (error || !data) return;
    // Only restore if the current game has no progress
    const current = window.getGameState?.();
    if (current && current.moveCount > 0) return;
    window.applyGameState?.(data);
    setIcon('saved');
  }

  // ─── Auth integration ────────────────────────────────────────────
  document.addEventListener('autosave:signin', (e) => {
    currentUser = e.detail.user;
    setIcon('saved'); // will update after tryRestore
    tryRestore(currentUser.id);
  });

  document.addEventListener('autosave:signout', () => {
    currentUser = null;
    clearTimeout(saveTimer);
    setIcon('offline');
  });

  document.addEventListener('autosave:guest', () => {
    currentUser = null;
    setIcon('offline');
  });

  // ─── Game events ─────────────────────────────────────────────────
  document.addEventListener('game:move', () => {
    scheduleSave();
  });

  document.addEventListener('game:end', () => {
    // Save final state immediately so it doesn't get lost
    clearTimeout(saveTimer);
    if (currentUser) doSave();
  });

})();
