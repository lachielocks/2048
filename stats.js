/* stats.js — Stats fetch + render logic */
'use strict';

(function () {
  // ─── Open / close ────────────────────────────────────────────
  function openStatsModal() {
    const modal = document.getElementById('stats-modal');
    if (!modal) return;
    modal.hidden = false;
    renderStats();
  }

  function closeStatsModal() {
    const modal = document.getElementById('stats-modal');
    if (modal) modal.hidden = true;
  }

  window.openStatsModal = openStatsModal;

  // ─── Format helpers ───────────────────────────────────────────
  function fmtTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function fmtDate(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function fmtDateTs(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ─── Render ───────────────────────────────────────────────────
  async function renderStats() {
    const user = typeof window.getCurrentUser === 'function' ? window.getCurrentUser() : null;

    if (user) {
      await renderSignedIn(user);
    } else {
      renderGuest();
    }
  }

  // ─── Signed-in view ──────────────────────────────────────────
  async function renderSignedIn(user) {
    const container = document.getElementById('stats-content');
    if (!container) return;

    container.innerHTML = '<div class="stats-loading">Loading…</div>';

    const [statsResult, gamesResult, achievementsResult] = await Promise.all([
      window.db.getUserStats(user.id),
      window.db.getUserGames(user.id, 5),
      window.db.getUnlockedAchievements(user.id),
    ]);

    const s = statsResult.data || {};
    const games = gamesResult.data || [];
    const unlockedMap = {};
    (achievementsResult.data || []).forEach(a => { unlockedMap[a.key] = a.unlocked_at; });

    container.innerHTML = `
      ${renderSummaryGrid(s)}
      ${renderAchievementsGrid(unlockedMap)}
      ${renderRecentGames(games)}`;
  }

  // ─── Guest view ───────────────────────────────────────────────
  function renderGuest() {
    const container = document.getElementById('stats-content');
    if (!container) return;

    // Derive what we can from localStorage
    let games = [];
    try { games = JSON.parse(localStorage.getItem('games2048') || '[]'); } catch {}

    const totalGames = games.length;
    const wins = games.filter(g => g.won).length;
    const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
    const highScore = totalGames > 0 ? Math.max(...games.map(g => g.score || 0)) : 0;
    const highTile = totalGames > 0 ? Math.max(...games.map(g => g.highestTile || 0)) : 0;
    const avgScore = totalGames > 0 ? Math.round(games.reduce((s, g) => s + (g.score || 0), 0) / totalGames) : 0;
    const totalMoves = games.reduce((s, g) => s + (g.moves || 0), 0);
    const totalSeconds = games.reduce((s, g) => s + (g.durationSeconds || 0), 0);

    const s = { totalGames, wins, winRate, highScore, highTile, avgScore, totalMoves, totalSeconds };

    const localUnlocked = [];
    try {
      const keys = JSON.parse(localStorage.getItem('achievements2048') || '[]');
      keys.forEach(k => localUnlocked.push(k));
    } catch {}

    const unlockedMap = {};
    localUnlocked.forEach(k => { unlockedMap[k] = null; });

    const recentGames = games.slice(-5).reverse().map(g => ({
      score: g.score,
      highest_tile: g.highestTile,
      won: g.won,
      created_at: g.createdAt ? new Date(g.createdAt).toISOString() : null,
    }));

    container.innerHTML = `
      ${renderSummaryGrid(s)}
      ${renderAchievementsGrid(unlockedMap)}
      ${renderRecentGames(recentGames)}
      <div class="stats-signin-cta">
        <p>Sign in to sync your stats across devices and appear on the leaderboard.</p>
        <button class="btn" id="stats-signin-btn">Sign in</button>
      </div>`;

    document.getElementById('stats-signin-btn')?.addEventListener('click', () => {
      closeStatsModal();
      if (typeof window.openAuthModal === 'function') window.openAuthModal('signup');
    });
  }

  // ─── Summary grid ─────────────────────────────────────────────
  function renderSummaryGrid(s) {
    return `
      <div class="stats-section">
        <h3 class="stats-section-title">Overview</h3>
        <div class="stats-grid">
          <div class="stats-cell"><span class="stats-val">${(s.totalGames || 0).toLocaleString()}</span><span class="stats-key">Games Played</span></div>
          <div class="stats-cell"><span class="stats-val">${s.winRate ?? 0}%</span><span class="stats-key">Win Rate</span></div>
          <div class="stats-cell"><span class="stats-val">${(s.highScore || 0).toLocaleString()}</span><span class="stats-key">High Score</span></div>
          <div class="stats-cell"><span class="stats-val">${(s.highTile || 0).toLocaleString()}</span><span class="stats-key">Highest Tile</span></div>
          <div class="stats-cell"><span class="stats-val">${(s.avgScore || 0).toLocaleString()}</span><span class="stats-key">Avg Score</span></div>
          <div class="stats-cell"><span class="stats-val">${(s.totalMoves || 0).toLocaleString()}</span><span class="stats-key">Total Moves</span></div>
          <div class="stats-cell stats-cell--wide"><span class="stats-val">${fmtTime(s.totalSeconds || 0)}</span><span class="stats-key">Time Played</span></div>
        </div>
      </div>`;
  }

  // ─── Achievements grid ────────────────────────────────────────
  function renderAchievementsGrid(unlockedMap) {
    const items = (window.ACHIEVEMENTS || []).map((a) => {
      const unlocked = a.key in unlockedMap;
      const date = unlockedMap[a.key] ? fmtDate(unlockedMap[a.key]) : null;
      return `
        <div class="achievement-grid-item ${unlocked ? 'achievement-grid-item--unlocked' : ''}" data-tooltip="${escHtml(a.description)}${unlocked && date ? ' · Unlocked ' + date : ''}">
          <div class="achievement-grid-icon">${unlocked ? '🏆' : '🔒'}</div>
          <div class="achievement-grid-label">${escHtml(a.label)}</div>
        </div>`;
    }).join('');

    return `
      <div class="stats-section">
        <h3 class="stats-section-title">Achievements</h3>
        <div class="achievement-grid">${items}</div>
      </div>`;
  }

  // ─── Recent games table ───────────────────────────────────────
  function renderRecentGames(games) {
    if (!games || games.length === 0) {
      return `<div class="stats-section"><h3 class="stats-section-title">Recent Games</h3><p class="stats-empty">No games yet.</p></div>`;
    }

    const rows = games.map((g) => `
      <tr>
        <td class="rg-score">${(g.score || 0).toLocaleString()}</td>
        <td class="rg-tile">${(g.highest_tile || 0).toLocaleString()}</td>
        <td><span class="rg-badge ${g.won ? 'rg-badge--win' : 'rg-badge--loss'}">${g.won ? 'Won' : 'Lost'}</span></td>
        <td class="rg-date">${fmtDate(g.created_at)}</td>
      </tr>`).join('');

    return `
      <div class="stats-section">
        <h3 class="stats-section-title">Recent Games</h3>
        <table class="recent-games-table">
          <thead><tr><th>Score</th><th>Best Tile</th><th>Result</th><th>Date</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  // ─── Wire up DOM ─────────────────────────────────────────────
  function wireModal() {
    const closeBtn = document.getElementById('stats-close-btn');
    const backdrop = document.getElementById('stats-modal');

    if (closeBtn) closeBtn.addEventListener('click', closeStatsModal);
    if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeStatsModal(); });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modal = document.getElementById('stats-modal');
        if (modal && !modal.hidden) closeStatsModal();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireModal);
  } else {
    wireModal();
  }
})();
