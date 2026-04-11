/* supabase.js — Supabase client init + all DB helper functions */
'use strict';

const SUPABASE_URL = 'https://sxjvxfgylbeikmkwkogm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_uvsCih7WYiIWp1rmWvqqRw_b2cFqzLN';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
async function getLeaderboard(tab) {
  if (tab === 'top') {
    return supabaseClient.rpc('leaderboard_top_scores');
  } else if (tab === 'tile') {
    return supabaseClient.rpc('leaderboard_highest_tile');
  } else if (tab === 'week') {
    return supabaseClient.rpc('leaderboard_this_week');
  }
  return { data: [], error: null };
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

// ─── Exports ──────────────────────────────────────────────────────
window.db = {
  client: supabaseClient,
  saveGame,
  getLeaderboard,
  getUserStats,
  getUserGames,
  getUnlockedAchievements,
  saveAchievement,
  syncLocalGames,
};
