/* leaderboard.js — Leaderboard fetch + render logic */
'use strict';

(function () {
  let activeTab = 'top';
  const cache = {};

  // ─── Open / close ────────────────────────────────────────────
  function openLeaderboard() {
    const modal = document.getElementById('leaderboard-modal');
    if (!modal) return;
    modal.hidden = false;

    // Show/hide sign-in CTA based on current auth state
    const cta = document.getElementById('lb-signin-cta');
    if (cta) {
      const user = typeof window.getCurrentUser === 'function' ? window.getCurrentUser() : null;
      cta.hidden = !!user;
    }

    loadTab(activeTab);
  }

  function closeLeaderboard() {
    const modal = document.getElementById('leaderboard-modal');
    if (modal) modal.hidden = true;
  }

  window.openLeaderboard = openLeaderboard;

  // ─── Tab switching ───────────────────────────────────────────
  function loadTab(tab, force) {
    activeTab = tab;
    ['top', 'tile', 'week'].forEach((t) => {
      const btn = document.getElementById('lb-tab-' + t);
      if (btn) btn.classList.toggle('active', t === tab);
    });

    if (cache[tab] && !force) {
      renderRows(tab, cache[tab]);
    } else {
      renderSkeleton();
      fetchTab(tab);
    }
  }

  // ─── Fetch ────────────────────────────────────────────────────
  async function fetchTab(tab) {
    const { data, error } = await window.db.getLeaderboard(tab);
    if (error || !data) {
      renderError();
      return;
    }
    cache[tab] = data;
    renderRows(tab, data);
  }

  // ─── Render skeleton ─────────────────────────────────────────
  function renderSkeleton() {
    const tbody = document.getElementById('lb-tbody');
    if (!tbody) return;
    tbody.innerHTML = Array(5).fill(0).map(() => `
      <tr class="leaderboard-skeleton">
        <td><div class="skel-line skel-sm"></div></td>
        <td><div class="skel-line skel-lg"></div></td>
        <td><div class="skel-line skel-md"></div></td>
        <td><div class="skel-line skel-md"></div></td>
      </tr>`).join('');
  }

  function renderError() {
    const tbody = document.getElementById('lb-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="lb-empty">Failed to load data. Try refreshing.</td></tr>`;
  }

  // ─── Render rows ─────────────────────────────────────────────
  function renderRows(tab, rows) {
    const tbody = document.getElementById('lb-tbody');
    const thead = document.getElementById('lb-thead');
    if (!tbody) return;

    // Update column headers
    if (thead) {
      if (tab === 'tile') {
        thead.innerHTML = '<tr><th>Rank</th><th>Player</th><th>Tile</th><th>Best Score</th></tr>';
      } else {
        thead.innerHTML = '<tr><th>Rank</th><th>Player</th><th>Score</th><th>Best Tile</th></tr>';
      }
    }

    const currentUser = typeof window.getCurrentUser === 'function' ? window.getCurrentUser() : null;
    const currentName = currentUser?.user_metadata?.display_name || '';

    if (!rows || rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="lb-empty">No scores yet. Be the first!</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map((row, i) => {
      const rank = i + 1;
      const rankClass = rank === 1 ? 'rank-gold' : rank === 2 ? 'rank-silver' : rank === 3 ? 'rank-bronze' : '';
      const isMe = currentName && row.display_name === currentName;
      const rowClass = isMe ? 'leaderboard-current-user' : '';

      let mainVal, secVal;
      if (tab === 'tile') {
        mainVal = formatTile(row.best_tile);
        secVal = formatScore(row.best_score);
      } else {
        mainVal = formatScore(row.best_score);
        secVal = formatTile(row.best_tile);
      }

      return `
        <tr class="${rowClass}">
          <td class="lb-rank ${rankClass}">${rank}</td>
          <td class="lb-name">${escHtml(row.display_name || 'Anonymous')}${isMe ? ' <span class="lb-you">(you)</span>' : ''}</td>
          <td class="lb-main">${mainVal}</td>
          <td class="lb-sec">${secVal}</td>
        </tr>`;
    }).join('');
  }

  function formatScore(n) {
    return n != null ? Number(n).toLocaleString() : '—';
  }

  function formatTile(n) {
    return n != null ? Number(n).toLocaleString() : '—';
  }

  function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ─── Wire up DOM ─────────────────────────────────────────────
  function wireModal() {
    const btn = document.getElementById('leaderboard-btn');
    const closeBtn = document.getElementById('lb-close-btn');
    const refreshBtn = document.getElementById('lb-refresh-btn');
    const backdrop = document.getElementById('leaderboard-modal');
    const signInCta = document.getElementById('lb-signin-cta');

    if (btn) btn.addEventListener('click', openLeaderboard);
    if (closeBtn) closeBtn.addEventListener('click', closeLeaderboard);
    if (refreshBtn) refreshBtn.addEventListener('click', () => { delete cache[activeTab]; loadTab(activeTab, true); });
    if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeLeaderboard(); });

    ['top', 'tile', 'week'].forEach((t) => {
      const tabBtn = document.getElementById('lb-tab-' + t);
      if (tabBtn) tabBtn.addEventListener('click', () => loadTab(t));
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modal = document.getElementById('leaderboard-modal');
        if (modal && !modal.hidden) closeLeaderboard();
      }
    });

    if (signInCta) {
      signInCta.querySelector('button')?.addEventListener('click', () => {
        closeLeaderboard();
        if (typeof window.openAuthModal === 'function') window.openAuthModal('signup');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireModal);
  } else {
    wireModal();
  }
})();
