/* supabase.js — Supabase client init + all DB helper functions */
'use strict';

const SUPABASE_URL = 'https://sxjvxfgylbeikmkwkogm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4anZ4Zmd5bGJlaWtta3drb2dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MDI1NDcsImV4cCI6MjA5MTQ3ODU0N30.-MLJCQobg8w1yKyKoCoyw8OrIUpm842roj5SsadpDl8';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    // Bypass navigator.locks — the default locking strategy can deadlock across
    // page navigations (index → admin → index) when a lock isn't fully released
    // before the next createClient call acquires it.
    lock: (name, acquireTimeout, fn) => fn(),
  },
});

// ─── Game saving ──────────────────────────────────────────────────
async function saveGame(userId, gameData) {
  return supabaseClient.from('games').insert({
    user_id: userId,
    score: gameData.score,
    highest_tile: gameData.highestTile,
    moves: gameData.moves,
    duration_seconds: gameData.durationSeconds,
    mode: gameData.mode || 'classic',
    won: gameData.won,
    board_state: gameData.boardState,
  });
}

// ─── Leaderboard queries ──────────────────────────────────────────
async function getLeaderboard(tab, boardSize = 'all') {
  const boardSizeNum = Number(boardSize);
  const useFilter = Number.isInteger(boardSizeNum) && boardSizeNum >= 4 && boardSizeNum <= 8;
  if (tab === 'top' && !useFilter) {
    return supabaseClient.rpc('leaderboard_top_scores');
  } else if (tab === 'tile' && !useFilter) {
    return supabaseClient.rpc('leaderboard_highest_tile');
  } else if (tab === 'week' && !useFilter) {
    return supabaseClient.rpc('leaderboard_this_week');
  }

  const query = supabaseClient
    .from('games')
    .select('score, highest_tile, created_at, board_state, profiles(display_name)');

  const { data, error } = await query;
  if (error || !data) return { data: [], error };

  const weekCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const grouped = new Map();
  for (const row of data) {
    const size = inferBoardSizeFromRow(row);
    if (useFilter && size !== boardSizeNum) continue;
    if (tab === 'week') {
      const ts = row.created_at ? Date.parse(row.created_at) : 0;
      if (!ts || ts < weekCutoff) continue;
    }
    const name = row.profiles?.display_name || 'Anonymous';
    const key = name.toLowerCase();
    if (!grouped.has(key)) grouped.set(key, { display_name: name, best_score: 0, best_tile: 0 });
    const agg = grouped.get(key);
    agg.best_score = Math.max(agg.best_score, Number(row.score) || 0);
    agg.best_tile = Math.max(agg.best_tile, Number(row.highest_tile) || 0);
  }

  let rows = [...grouped.values()];
  if (tab === 'tile') rows.sort((a, b) => (b.best_tile - a.best_tile) || (b.best_score - a.best_score));
  else rows.sort((a, b) => (b.best_score - a.best_score) || (b.best_tile - a.best_tile));

  rows = rows.slice(0, 10);
  return { data: rows, error: null };
}

async function getDailyChallengeLeaderboard(challengeId) {
  if (!challengeId) return { data: [], error: null };
  const startIso = new Date(`${challengeId}T00:00:00.000Z`).toISOString();
  const endIso = new Date(`${challengeId}T23:59:59.999Z`).toISOString();
  const modeCode = `daily:${challengeId}`;
  const { data, error } = await supabaseClient
    .from('games')
    .select('score, highest_tile, created_at, mode, board_state, profiles(display_name)')
    .or(`mode.eq.${modeCode},mode.eq.${modeCode}:hardcore`)
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  if (error || !data) return { data: [], error };
  const grouped = new Map();
  for (const row of data) {
    const name = row.profiles?.display_name || 'Anonymous';
    const key = name.toLowerCase();
    if (!grouped.has(key)) grouped.set(key, { display_name: name, best_score: 0, best_tile: 0 });
    const agg = grouped.get(key);
    agg.best_score = Math.max(agg.best_score, Number(row.score) || 0);
    agg.best_tile = Math.max(agg.best_tile, Number(row.highest_tile) || 0);
  }
  const rows = [...grouped.values()]
    .sort((a, b) => (b.best_score - a.best_score) || (b.best_tile - a.best_tile))
    .slice(0, 10);
  return { data: rows, error: null };
}

function inferBoardSizeFromRow(row) {
  const b = row?.board_state;
  if (Array.isArray(b) && b.length && b.every(r => Array.isArray(r) && r.length === b.length)) return b.length;
  return 4;
}

// ─── User stats ───────────────────────────────────────────────────
async function getUserStats(userId) {
  const { data, error } = await supabaseClient
    .from('games')
    .select('score, highest_tile, moves, duration_seconds, won, created_at')
    .eq('user_id', userId);

  if (error || !data) return { data: null, error };

  const totalGames = data.length;
  const wins = data.filter(g => g.won).length;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  const highScore = totalGames > 0 ? Math.max(...data.map(g => g.score)) : 0;
  const highTile = totalGames > 0 ? Math.max(...data.map(g => g.highest_tile)) : 0;
  const avgScore = totalGames > 0 ? Math.round(data.reduce((s, g) => s + g.score, 0) / totalGames) : 0;
  const totalMoves = data.reduce((s, g) => s + (g.moves || 0), 0);
  const totalSeconds = data.reduce((s, g) => s + (g.duration_seconds || 0), 0);

  return {
    data: { totalGames, wins, winRate, highScore, highTile, avgScore, totalMoves, totalSeconds },
    error: null,
  };
}

// ─── Recent games ─────────────────────────────────────────────────
async function getUserGames(userId, limit = 5) {
  return supabaseClient
    .from('games')
    .select('score, highest_tile, moves, duration_seconds, won, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
}

// ─── Achievements ─────────────────────────────────────────────────
async function getUnlockedAchievements(userId) {
  return supabaseClient
    .from('achievements')
    .select('key, unlocked_at')
    .eq('user_id', userId);
}

async function saveAchievement(userId, key) {
  return supabaseClient
    .from('achievements')
    .upsert({ user_id: userId, key }, { onConflict: 'user_id,key', ignoreDuplicates: true });
}

// ─── Sync localStorage games on sign-in ──────────────────────────
async function syncLocalGames(userId) {
  const raw = localStorage.getItem('games2048');
  if (!raw) return;
  let games;
  try { games = JSON.parse(raw); } catch { return; }
  if (!Array.isArray(games) || games.length === 0) return;

  const toSync = games.slice(-5); // up to last 5
  const rows = toSync.map(g => ({
    user_id: userId,
    score: g.score || 0,
    highest_tile: g.highestTile || 0,
    moves: g.moves || 0,
    duration_seconds: g.durationSeconds || 0,
    mode: g.mode || 'classic',
    won: g.won || false,
    board_state: g.boardState || null,
    created_at: g.createdAt ? new Date(g.createdAt).toISOString() : new Date().toISOString(),
  }));

  await supabaseClient.from('games').insert(rows);
}

// ─── Game state autosave ──────────────────────────────────────────
async function saveGameState(userId, state) {
  return supabaseClient.from('game_states').upsert({
    user_id:      userId,
    board:        state.board,
    score:        state.score,
    move_count:   state.moveCount,
    won:          state.won,
    keep_going:   state.keepGoing,
    swap_uses:    state.swapUses,
    delete_uses:  state.deleteUses,
    undo_used:    state.undoUsed,
    powerup_used: state.powerupUsed,
    duration_so_far: state.durationSoFar,
    updated_at:   new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

async function loadGameState(userId) {
  return supabaseClient
    .from('game_states')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
}

async function clearGameState(userId) {
  return supabaseClient.from('game_states').delete().eq('user_id', userId);
}

// ─── Exports ──────────────────────────────────────────────────────
window.db = {
  client: supabaseClient,
  saveGame,
  getLeaderboard,
  getDailyChallengeLeaderboard,
  getUserStats,
  getUserGames,
  getUnlockedAchievements,
  saveAchievement,
  syncLocalGames,
  saveGameState,
  loadGameState,
  clearGameState,
};
