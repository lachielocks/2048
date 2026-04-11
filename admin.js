/* admin.js — Admin dashboard logic */
'use strict';

const adminDb = window.db.client;
let currentUser = null;

// ─── Demo board presets ───────────────────────────────────────────
// Each demo shows two equal tiles ready to merge into the featured value
const DEMO_BOARDS = {
  nearwin: {
    board: [
      [512,  512, 256, 128],
      [64,   32,  16,   8],
      [4,     2,   0,   0],
      [0,     0,   0,   0],
    ],
    score: 2336,
  },
  2048: {
    board: [
      [1024, 1024, 512, 256],
      [128,   64,  32,  16],
      [8,      4,   0,   0],
      [0,      0,   0,   0],
    ],
    score: 6560,
  },
  4096: {
    board: [
      [2048, 2048, 1024, 512],
      [256,  128,   64,  32],
      [16,     8,    0,   0],
      [0,      0,    0,   0],
    ],
    score: 15232,
  },
  8192: {
    board: [
      [4096, 4096, 2048, 1024],
      [512,  256,  128,    64],
      [32,    16,    0,     0],
      [0,      0,    0,     0],
    ],
    score: 34688,
  },
};

window.launchDemo = function (key) {
  const demo = DEMO_BOARDS[key];
  if (!demo) return;
  localStorage.setItem('demo_board', JSON.stringify(demo));
  window.location.href = '/';
};

// ─── Helpers ─────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDuration(secs) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function toast(msg, type = 'success') {
  const container = document.getElementById('admin-toast-container');
  const el = document.createElement('div');
  el.className = `admin-toast admin-toast--${type}`;
  el.textContent = msg;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('admin-toast--visible'));
  setTimeout(() => {
    el.classList.remove('admin-toast--visible');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, 3000);
}

function confirm(msg) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-msg').textContent = msg;
    modal.hidden = false;
    const ok = document.getElementById('confirm-ok');
    const cancel = document.getElementById('confirm-cancel');
    function cleanup(result) {
      modal.hidden = true;
      ok.replaceWith(ok.cloneNode(true));
      cancel.replaceWith(cancel.cloneNode(true));
      resolve(result);
    }
    document.getElementById('confirm-ok').addEventListener('click', () => cleanup(true), { once: true });
    document.getElementById('confirm-cancel').addEventListener('click', () => cleanup(false), { once: true });
  });
}

// ─── Overview stats ───────────────────────────────────────────────
async function loadOverview() {
  const { data, error } = await adminDb.rpc('admin_overview');
  if (error || !data?.[0]) return;
  const d = data[0];
  document.getElementById('ov-users').textContent = Number(d.total_users).toLocaleString();
  document.getElementById('ov-games').textContent = Number(d.total_games).toLocaleString();
  document.getElementById('ov-week').textContent = Number(d.games_this_week).toLocaleString();
  const winRate = d.total_games > 0 ? Math.round((d.total_wins / d.total_games) * 100) : 0;
  document.getElementById('ov-winrate').textContent = winRate + '%';
}

// ─── Users ────────────────────────────────────────────────────────
async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Loading…</td></tr>`;
  const { data, error } = await adminDb.rpc('admin_user_list');
  if (error || !data) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Failed to load users.</td></tr>`;
    return;
  }
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No users yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(u => `
    <tr>
      <td class="td-name">${esc(u.display_name || 'Unknown')}</td>
      <td>${fmtDate(u.created_at)}</td>
      <td>${Number(u.total_games).toLocaleString()}</td>
      <td class="td-score">${Number(u.best_score).toLocaleString()}</td>
      <td>${Number(u.best_tile).toLocaleString()}</td>
      <td>${u.is_admin ? '<span class="badge badge--admin">Admin</span>' : '—'}</td>
      <td>
        <div class="actions-cell">
          <button class="btn-admin" onclick="clearUserGames('${u.id}','${esc(u.display_name)}')">Clear Games</button>
          <button class="btn-admin" onclick="openAchievementsModal('${u.id}','${esc(u.display_name)}')">Achievements</button>
          ${!u.is_admin ? `<button class="btn-admin btn-admin--danger" onclick="deleteUser('${u.id}','${esc(u.display_name)}')">Delete</button>` : ''}
        </div>
      </td>
    </tr>`).join('');
}

async function clearUserGames(userId, name) {
  if (!await confirm(`Delete all games for "${name}"? This cannot be undone.`)) return;
  const { error } = await adminDb.from('games').delete().eq('user_id', userId);
  if (error) { toast('Failed: ' + error.message, 'danger'); return; }
  toast(`Games cleared for ${name}.`);
  loadUsers();
  loadOverview();
}

async function clearUserAchievements(userId, name) {
  if (!await confirm(`Reset all achievements for "${name}"?`)) return;
  const { error } = await adminDb.from('achievements').delete().eq('user_id', userId);
  if (error) { toast('Failed: ' + error.message, 'danger'); return; }
  toast(`Achievements reset for ${name}.`);
}

async function deleteUser(userId, name) {
  if (!await confirm(`Permanently delete "${name}" and all their data? This cannot be undone.`)) return;
  const { error } = await adminDb.rpc('admin_delete_user', { target_user_id: userId });
  if (error) { toast('Failed: ' + error.message, 'danger'); return; }
  toast(`${name} deleted.`);
  loadUsers();
  loadOverview();
}

// ─── Achievement force-unlock ─────────────────────────────────────
const ALL_ACHIEVEMENTS = [
  { key: 'first_game',      label: 'First Move',       desc: 'Complete your first game' },
  { key: 'first_win',       label: '2048 Club',         desc: 'Reach the 2048 tile' },
  { key: 'tile_4096',       label: 'Going Further',     desc: 'Reach the 4096 tile' },
  { key: 'tile_8192',       label: 'Legendary',         desc: 'Reach the 8192 tile' },
  { key: 'no_undo_win',     label: 'Purist',            desc: 'Win without using Undo' },
  { key: 'no_powerup_win',  label: 'Raw Skill',         desc: 'Win without any power-ups' },
  { key: 'score_10k',       label: 'Ten Thousand',      desc: 'Score 10,000+ in one game' },
  { key: 'score_50k',       label: 'Fifty Thousand',    desc: 'Score 50,000+ in one game' },
  { key: 'speed_win',       label: 'Speed Run',         desc: 'Win in under 5 minutes' },
  { key: 'comeback',        label: 'Comeback Kid',      desc: 'Win using all three power-ups' },
];

let achievementTargetUserId = null;

async function openAchievementsModal(userId, name) {
  achievementTargetUserId = userId;
  document.getElementById('ach-modal-title').textContent = `Achievements — ${name}`;

  // Fetch currently unlocked
  const { data: unlocked } = await adminDb.from('achievements').select('key').eq('user_id', userId);
  const unlockedKeys = new Set((unlocked || []).map(r => r.key));

  const list = document.getElementById('ach-checkbox-list');
  list.innerHTML = ALL_ACHIEVEMENTS.map(a => `
    <label class="ach-check-row">
      <input type="checkbox" name="ach" value="${a.key}" ${unlockedKeys.has(a.key) ? 'checked' : ''} />
      <span class="ach-check-label"><strong>${a.label}</strong> — ${a.desc}</span>
    </label>`).join('');

  document.getElementById('ach-modal').hidden = false;
}

async function saveAchievements() {
  const checked = [...document.querySelectorAll('#ach-checkbox-list input[name="ach"]:checked')]
    .map(el => el.value);
  if (!achievementTargetUserId) return;

  if (checked.length === 0) {
    toast('No achievements selected.', 'danger'); return;
  }

  const rows = checked.map(key => ({ user_id: achievementTargetUserId, key }));
  const { error } = await adminDb.from('achievements').upsert(rows, { onConflict: 'user_id,key', ignoreDuplicates: true });
  if (error) { toast('Failed: ' + error.message, 'danger'); return; }

  toast(`Unlocked ${checked.length} achievement(s).`);
  closeAchievementsModal();
}

function closeAchievementsModal() {
  document.getElementById('ach-modal').hidden = true;
  achievementTargetUserId = null;
}

window.openAchievementsModal = openAchievementsModal;
window.saveAchievements = saveAchievements;
window.closeAchievementsModal = closeAchievementsModal;

// Make these global so onclick attributes work
window.clearUserGames = clearUserGames;
window.clearUserAchievements = clearUserAchievements;
window.deleteUser = deleteUser;

// ─── Recent games ─────────────────────────────────────────────────
async function loadRecentGames() {
  const tbody = document.getElementById('games-tbody');
  tbody.innerHTML = `<tr><td colspan="8" class="table-empty">Loading…</td></tr>`;

  const { data, error } = await adminDb
    .from('games')
    .select('id, score, highest_tile, moves, duration_seconds, won, mode, created_at, profiles(display_name)')
    .order('created_at', { ascending: false })
    .limit(25);

  if (error || !data) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty">Failed to load games.</td></tr>`;
    return;
  }
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty">No games yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(g => `
    <tr>
      <td class="td-name">${esc(g.profiles?.display_name || '—')}</td>
      <td class="td-score">${g.score.toLocaleString()}</td>
      <td>${g.highest_tile.toLocaleString()}</td>
      <td>${g.moves.toLocaleString()}</td>
      <td>${fmtDuration(g.duration_seconds)}</td>
      <td><span class="badge ${g.won ? 'badge--win' : 'badge--loss'}">${g.won ? 'Won' : 'Lost'}</span></td>
      <td>${fmtDate(g.created_at)}</td>
      <td><button class="btn-admin btn-admin--danger" onclick="deleteGame('${g.id}')">Delete</button></td>
    </tr>`).join('');
}

async function deleteGame(gameId) {
  if (!await confirm('Delete this game record?')) return;
  const { error } = await adminDb.from('games').delete().eq('id', gameId);
  if (error) { toast('Failed: ' + error.message, 'danger'); return; }
  toast('Game deleted.');
  loadRecentGames();
  loadOverview();
}

window.deleteGame = deleteGame;
window.loadUsers = loadUsers;
window.loadRecentGames = loadRecentGames;

// ─── Auth gate ────────────────────────────────────────────────────
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

async function init() {
  try {
    console.log('[admin] getSession start');
    const { data, error: sessionError } = await withTimeout(
      adminDb.auth.getSession(),
      10000, 'getSession'
    );
    console.log('[admin] getSession done', { session: !!data?.session, sessionError });

    if (sessionError || !data?.session) { redirect(); return; }
    currentUser = data.session.user;

    console.log('[admin] fetching profile');
    const { data: profile, error: profileError } = await withTimeout(
      adminDb.from('profiles').select('display_name, is_admin').eq('id', currentUser.id).single(),
      10000, 'profile fetch'
    );
    console.log('[admin] profile done', { profile, profileError });

    if (profileError || !profile?.is_admin) { redirect(); return; }

    // Show UI
    document.getElementById('auth-gate').hidden = true;
    document.getElementById('admin-ui').hidden = false;
    document.getElementById('admin-user-name').textContent = profile.display_name || currentUser.email;

    // Load all data
    await Promise.all([loadOverview(), loadUsers(), loadRecentGames()]);
  } catch (err) {
    console.error('[admin] init failed:', err);
    document.querySelector('.gate-msg').textContent = `Error: ${err.message} — redirecting…`;
    setTimeout(() => { window.location.href = '/'; }, 2000);
  }
}

function redirect() {
  document.querySelector('.gate-msg').textContent = 'Access denied. Redirecting…';
  setTimeout(() => { window.location.href = '/'; }, 1500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
