/* game.js — 2048 game logic, rendering, input handling, power-ups */
'use strict';

// ─── Constants ───────────────────────────────────────────────────
const SIZE = 4;
const SPAWN_2_PROB = 0.9;
const SLIDE_MS = 100; // must match CSS --transition-slide

// ─── State ───────────────────────────────────────────────────────
let grid;            // SIZE × SIZE array of Tile or null
let score = 0;
let best = 0;
let won = false;
let keepGoing = false;
let isGameOver = false;
let isAnimating = false;
let nextId = 1;

// Undo
let prevSnapshot = null; // [[value,...]] of previous board
let prevScore = 0;

// Power-up uses (reset each new game)
let swapUses = 0;
let deleteUses = 0;
const MAX_USES = 3;

// Active power-up mode
let activeMode = null; // 'swap' | 'delete' | null
let swapFirstTile = null;

// AI autoplay
let isAutoplay = false;
let autoplayTimer = null;

// ─── DOM refs ────────────────────────────────────────────────────
const tilesContainer  = document.getElementById('tiles-container');
const boardCells      = document.getElementById('board-cells');
const boardEl         = document.getElementById('board');
const scoreEl         = document.getElementById('score');
const bestEl          = document.getElementById('best');
const newGameBtn      = document.getElementById('new-game-btn');
const winOverlay      = document.getElementById('win-overlay');
const gameoverOverlay = document.getElementById('gameover-overlay');
const keepGoingBtn    = document.getElementById('keep-going-btn');
const winNewGameBtn   = document.getElementById('win-new-game-btn');
const tryAgainBtn     = document.getElementById('try-again-btn');
const winScoreEl      = document.getElementById('win-score');
const gameoverScoreEl = document.getElementById('gameover-score');
const logoEl          = document.querySelector('.logo');

// AI button DOM ref
const aiBtnEl = document.getElementById('ai-btn');

// Power-up DOM refs
const undoBtnEl    = document.getElementById('undo-btn');
const swapBtnEl    = document.getElementById('swap-btn');
const deleteBtnEl  = document.getElementById('delete-btn');
const undoSubEl    = document.getElementById('undo-sub');
const swapSubEl    = document.getElementById('swap-sub');
const deleteSubEl  = document.getElementById('delete-sub');

// Progress bar fill elements (3 per power-up)
const swapFills   = [0, 1, 2].map(i => document.getElementById('swap-fill-'   + i));
const deleteFills = [0, 1, 2].map(i => document.getElementById('delete-fill-' + i));

// ─── Cell sizing helper ──────────────────────────────────────────
function getCellSize() {
  const w = tilesContainer.clientWidth;
  const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 10;
  return { cell: (w - gap * (SIZE - 1)) / SIZE, gap };
}

// ─── Tile class ──────────────────────────────────────────────────
class Tile {
  constructor(row, col, value, isNew = true) {
    this.id = nextId++;
    this.row = row;
    this.col = col;
    this.value = value;

    // Merge bookkeeping (set during move())
    this.merging = false;
    this.absorbedTile = null;
    this.newValue = null;

    this.el = document.createElement('div');
    this.el.className = 'tile';
    this.el.dataset.value = value;
    this.el.textContent = value;
    this.position();
    tilesContainer.appendChild(this.el);

    if (isNew) {
      requestAnimationFrame(() => {
        this.el.classList.add('tile-new');
        this.el.addEventListener('animationend', () => {
          this.el.classList.remove('tile-new');
        }, { once: true });
      });
    }
  }

  position() {
    const { cell, gap } = getCellSize();
    if (cell <= 0) return;
    this.el.style.width  = cell + 'px';
    this.el.style.height = cell + 'px';
    this.el.style.top    = (this.row * (cell + gap)) + 'px';
    this.el.style.left   = (this.col * (cell + gap)) + 'px';
  }

  setValue(value) {
    this.value = value;
    this.el.dataset.value = value;
    this.el.textContent = value;
  }

  remove() {
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
  }

  popMerge() {
    this.el.classList.remove('tile-merge', 'tile-merge-glow', 'tile-merge-halo', 'tile-merge-lightning');
    void this.el.offsetWidth;
    this.el.classList.add('tile-merge');
    if (this.value >= 128)  this.el.classList.add('tile-merge-glow');
    if (this.value >= 512)  this.el.classList.add('tile-merge-halo');
    if (this.value >= 1024) this.el.classList.add('tile-merge-lightning');
    setTimeout(() => {
      this.el.classList.remove('tile-merge', 'tile-merge-glow', 'tile-merge-halo', 'tile-merge-lightning');
    }, 600);
  }
}

// ─── Init ────────────────────────────────────────────────────────
function init() {
  best = parseInt(localStorage.getItem('best2048') || '0', 10);
  bestEl.textContent = best;
  buildCells();
  newGame();
  setupFooterCrossPromo();
}

function buildCells() {
  boardCells.innerHTML = '';
  for (let i = 0; i < SIZE * SIZE; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    boardCells.appendChild(cell);
  }
}

// ─── New game ────────────────────────────────────────────────────
function newGame() {
  stopAutoplay();
  setActiveMode(null);
  tilesContainer.innerHTML = '';
  grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  score = 0;
  isGameOver = false;
  won = false;
  keepGoing = false;
  isAnimating = false;
  prevSnapshot = null;
  prevScore = 0;
  swapUses = 0;
  deleteUses = 0;

  scoreEl.textContent = '0';
  hideOverlays();
  updatePowerUpUI();

  spawnTile();
  spawnTile();
}

// ─── Spawn ───────────────────────────────────────────────────────
function spawnTile() {
  const empty = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!grid[r][c]) empty.push([r, c]);
    }
  }
  if (!empty.length) return null;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const value = Math.random() < SPAWN_2_PROB ? 2 : 4;
  const tile = new Tile(r, c, value, true);
  grid[r][c] = tile;
  return tile;
}

// ─── Move ────────────────────────────────────────────────────────
function move(dir) {
  if (isAnimating || activeMode) return;
  if (isGameOver) return;
  if (won && !keepGoing) return;

  const snapshot = serializeGrid();
  const snapScore = score;

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = grid[r][c];
      if (t) { t.merging = false; t.absorbedTile = null; t.newValue = null; }
    }
  }

  const [dr, dc] = directionVector(dir);
  const traversal = getTraversal(dir);
  let moved = false;
  let scoreGain = 0;

  for (const [r, c] of traversal) {
    const tile = grid[r][c];
    if (!tile) continue;

    let nr = r, nc = c;
    while (true) {
      const tr = nr + dr;
      const tc = nc + dc;
      if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE) break;
      if (grid[tr][tc]) break;
      nr = tr;
      nc = tc;
    }

    const tr = nr + dr;
    const tc = nc + dc;
    let mergeWith = null;
    if (tr >= 0 && tr < SIZE && tc >= 0 && tc < SIZE) {
      const next = grid[tr][tc];
      if (next && next.value === tile.value && !next.merging) mergeWith = next;
    }

    if (mergeWith) {
      grid[r][c] = null;
      tile.row = tr; tile.col = tc;
      tile.position();
      mergeWith.merging = true;
      mergeWith.absorbedTile = tile;
      mergeWith.newValue = mergeWith.value * 2;
      scoreGain += mergeWith.newValue;
      moved = true;
    } else if (nr !== r || nc !== c) {
      grid[r][c] = null;
      grid[nr][nc] = tile;
      tile.row = nr; tile.col = nc;
      tile.position();
      moved = true;
    }
  }

  if (!moved) return;

  prevSnapshot = snapshot;
  prevScore = snapScore;

  if (scoreGain > 0) {
    score += scoreGain;
    updateScoreDisplay(scoreGain);
  } else {
    scoreEl.textContent = score;
  }

  isAnimating = true;
  setTimeout(afterSlide, SLIDE_MS + 20);
}

function afterSlide() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = grid[r][c];
      if (t && t.merging) {
        if (t.absorbedTile) { t.absorbedTile.remove(); t.absorbedTile = null; }
        t.setValue(t.newValue);
        t.merging = false;
        t.newValue = null;
        t.popMerge();

        // Award power-up uses
        if (t.value >= 256) swapUses   = Math.min(MAX_USES, swapUses + 1);
        if (t.value >= 512) deleteUses = Math.min(MAX_USES, deleteUses + 1);

        // Confetti
        if (t.value >= 512) {
          const rect = t.el.getBoundingClientRect();
          const count = t.value >= 2048 ? 150 : t.value >= 1024 ? 80 : 40;
          if (typeof window.triggerConfetti === 'function') {
            window.triggerConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2, count);
          }
        }

        // Win
        if (t.value === 2048 && !won) {
          won = true;
          showWinOverlay();
          pulseLogoOnWin();
        }
      }
    }
  }

  spawnTile();

  if (!hasValidMoves()) {
    isGameOver = true;
    showGameOverOverlay();
  }

  isAnimating = false;
  updatePowerUpUI();
}

// ─── Direction helpers ───────────────────────────────────────────
function directionVector(dir) {
  switch (dir) {
    case 'left':  return [0, -1];
    case 'right': return [0,  1];
    case 'up':    return [-1, 0];
    case 'down':  return [ 1, 0];
  }
  return [0, 0];
}

function getTraversal(dir) {
  let rows = [0, 1, 2, 3];
  let cols = [0, 1, 2, 3];
  if (dir === 'right') cols = [3, 2, 1, 0];
  if (dir === 'down')  rows = [3, 2, 1, 0];
  const order = [];
  for (const r of rows) for (const c of cols) order.push([r, c]);
  return order;
}

// ─── Valid moves check ───────────────────────────────────────────
function hasValidMoves() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!grid[r][c]) return true;
      const v = grid[r][c].value;
      if (c + 1 < SIZE && grid[r][c + 1] && grid[r][c + 1].value === v) return true;
      if (r + 1 < SIZE && grid[r + 1][c] && grid[r + 1][c].value === v) return true;
    }
  }
  return false;
}

// ─── Serialize ───────────────────────────────────────────────────
function serializeGrid() {
  return grid.map(row => row.map(t => (t ? t.value : 0)));
}

// ─── Undo ────────────────────────────────────────────────────────
function undoMove() {
  if (!prevSnapshot || isAnimating) return;

  setActiveMode(null);
  tilesContainer.innerHTML = '';
  grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = prevSnapshot[r][c];
      if (v) grid[r][c] = new Tile(r, c, v, false);
    }
  }

  score = prevScore;
  scoreEl.textContent = score;
  prevSnapshot = null;
  isGameOver = false;
  won = false; // revert won flag since board is rolled back
  hideOverlays();
  updatePowerUpUI();
}

// ─── Power-up: active mode ───────────────────────────────────────
function setActiveMode(mode) {
  // Clean up previous mode
  if (activeMode === 'swap' && swapFirstTile) {
    swapFirstTile.el.classList.remove('swap-selected');
    swapFirstTile = null;
  }
  // Clear any delete highlights
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid && grid[r][c]) {
        grid[r][c].el.classList.remove('will-delete', 'wont-delete', 'swap-selected');
      }
    }
  }

  activeMode = mode;
  boardEl.classList.remove('mode-swap', 'mode-delete');
  if (mode) boardEl.classList.add('mode-' + mode);

  swapBtnEl.classList.toggle('active', mode === 'swap');
  deleteBtnEl.classList.toggle('active', mode === 'delete');

  // Set mode-entry instructions; clearing is handled by updatePowerUpUI
  if (mode === 'swap')   swapSubEl.textContent   = 'Click 1st tile';
  if (mode === 'delete') deleteSubEl.textContent = 'Click any tile';
  if (!mode) updatePowerUpUI();
}

// ─── Power-up: swap ──────────────────────────────────────────────
function doSwap(tileA, tileB) {
  prevSnapshot = serializeGrid();
  prevScore = score;

  const r1 = tileA.row, c1 = tileA.col;
  const r2 = tileB.row, c2 = tileB.col;

  grid[r1][c1] = tileB;
  grid[r2][c2] = tileA;
  tileA.row = r2; tileA.col = c2;
  tileB.row = r1; tileB.col = c1;

  tileA.position();
  tileB.position();

  swapUses--;
  setActiveMode(null);

  // If board was game over, re-check after swap
  if (isGameOver && hasValidMoves()) {
    isGameOver = false;
    hideOverlays();
  }
}

// ─── Power-up: delete ────────────────────────────────────────────
function doDelete(value) {
  prevSnapshot = serializeGrid();
  prevScore = score;

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = grid[r][c];
      if (t && t.value === value) {
        grid[r][c] = null;
        t.el.classList.add('tile-vanish');
        // Remove element after animation
        setTimeout(() => t.remove(), 240);
      }
    }
  }

  deleteUses--;
  setActiveMode(null);

  if (isGameOver && hasValidMoves()) {
    isGameOver = false;
    hideOverlays();
  }
}

// ─── Tile click handler (swap / delete modes) ────────────────────
tilesContainer.addEventListener('click', (e) => {
  if (!activeMode) return;

  const el = e.target.closest('.tile');
  if (!el) return;

  // Find the Tile object
  let clicked = null;
  outer: for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] && grid[r][c].el === el) { clicked = grid[r][c]; break outer; }
    }
  }
  if (!clicked) return;

  if (activeMode === 'swap') {
    if (!swapFirstTile) {
      swapFirstTile = clicked;
      clicked.el.classList.add('swap-selected');
      swapSubEl.textContent = 'Click 2nd tile';
    } else if (swapFirstTile === clicked) {
      // Deselect
      clicked.el.classList.remove('swap-selected');
      swapFirstTile = null;
      swapSubEl.textContent = 'Click 1st tile';
    } else {
      doSwap(swapFirstTile, clicked);
    }
  } else if (activeMode === 'delete') {
    doDelete(clicked.value);
  }
});

// Delete mode: highlight matching tiles on hover
tilesContainer.addEventListener('mouseover', (e) => {
  if (activeMode !== 'delete') return;
  const el = e.target.closest('.tile');
  if (!el) return;
  const val = parseInt(el.dataset.value, 10);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = grid[r][c];
      if (!t) continue;
      if (t.value === val) { t.el.classList.add('will-delete'); t.el.classList.remove('wont-delete'); }
      else                 { t.el.classList.add('wont-delete'); t.el.classList.remove('will-delete'); }
    }
  }
});

tilesContainer.addEventListener('mouseout', (e) => {
  if (activeMode !== 'delete') return;
  // Only clear when leaving the container itself
  if (tilesContainer.contains(e.relatedTarget)) return;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c]) grid[r][c].el.classList.remove('will-delete', 'wont-delete');
    }
  }
});

// ─── Power-up UI sync ────────────────────────────────────────────
function updateBarFills(fills, uses) {
  for (let i = 0; i < MAX_USES; i++) {
    fills[i].style.width = uses > i ? '100%' : '0%';
  }
}

function updatePowerUpUI() {
  // Undo
  const hasUndo = !!prevSnapshot;
  undoBtnEl.classList.toggle('unavailable', !hasUndo);
  undoSubEl.textContent = hasUndo ? 'Last move' : 'No moves yet';

  // Swap
  if (swapUses > 0) {
    swapBtnEl.classList.remove('locked');
    if (activeMode !== 'swap') swapSubEl.textContent = '';
  } else {
    swapBtnEl.classList.add('locked');
    swapBtnEl.classList.remove('active');
    if (activeMode !== 'swap') swapSubEl.textContent = 'Reach 256';
  }
  updateBarFills(swapFills, swapUses);

  // Delete
  if (deleteUses > 0) {
    deleteBtnEl.classList.remove('locked');
    if (activeMode !== 'delete') deleteSubEl.textContent = '';
  } else {
    deleteBtnEl.classList.add('locked');
    deleteBtnEl.classList.remove('active');
    if (activeMode !== 'delete') deleteSubEl.textContent = 'Reach 512';
  }
  updateBarFills(deleteFills, deleteUses);
}

// ─── Score ───────────────────────────────────────────────────────
function updateScoreDisplay(addedScore) {
  scoreEl.textContent = score;
  if (score > best) {
    best = score;
    bestEl.textContent = best;
    localStorage.setItem('best2048', best);
  }
  if (addedScore > 0) showScorePop(addedScore);
}

function showScorePop(n) {
  const scoreBox = document.getElementById('score-box');
  const pop = document.createElement('span');
  pop.className = 'score-pop';
  pop.textContent = '+' + n;
  scoreBox.appendChild(pop);
  pop.addEventListener('animationend', () => pop.remove(), { once: true });
}

// ─── Overlays ────────────────────────────────────────────────────
function showWinOverlay() {
  winScoreEl.textContent = score.toLocaleString();
  winOverlay.hidden = false;
}

function showGameOverOverlay() {
  gameoverScoreEl.textContent = score.toLocaleString();
  gameoverOverlay.hidden = false;
}

function hideOverlays() {
  winOverlay.hidden = true;
  gameoverOverlay.hidden = true;
}

function pulseLogoOnWin() {
  logoEl.classList.remove('win-pulse');
  void logoEl.offsetWidth;
  logoEl.classList.add('win-pulse');
}

// ─── Resize ──────────────────────────────────────────────────────
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid && grid[r][c]) grid[r][c].position();
      }
    }
  }, 80);
});

// ─── Keyboard ────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  // Escape — cancel active power-up mode
  if (e.key === 'Escape') {
    if (activeMode) { e.preventDefault(); setActiveMode(null); }
    return;
  }

  // Undo: Ctrl+Z / Cmd+Z
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    undoMove();
    return;
  }

  if (isAutoplay) return; // AI has control

  let dir = null;
  switch (e.key) {
    case 'ArrowLeft':  case 'a': case 'A': dir = 'left';  break;
    case 'ArrowRight': case 'd': case 'D': dir = 'right'; break;
    case 'ArrowUp':    case 'w': case 'W': dir = 'up';    break;
    case 'ArrowDown':  case 's': case 'S': dir = 'down';  break;
  }
  if (dir) {
    e.preventDefault();
    move(dir);
  }
}, { passive: false });

// ─── Pointer / touch swipe ───────────────────────────────────────
let pStartX = 0, pStartY = 0, pStarted = false;
const MIN_SWIPE = 30;

boardEl.addEventListener('pointerdown', (e) => {
  // Don't initiate swipe if a power-up mode is active or AI is running
  if (activeMode || isAutoplay) return;
  pStartX = e.clientX;
  pStartY = e.clientY;
  pStarted = true;
}, { passive: true });

boardEl.addEventListener('pointerup', (e) => {
  if (!pStarted) return;
  pStarted = false;
  const dx = e.clientX - pStartX;
  const dy = e.clientY - pStartY;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < MIN_SWIPE) return;
  if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
  else                              move(dy > 0 ? 'down'  : 'up');
}, { passive: true });

boardEl.addEventListener('pointercancel', () => { pStarted = false; }, { passive: true });
boardEl.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// ─── Buttons ─────────────────────────────────────────────────────
newGameBtn.addEventListener('click', newGame);
aiBtnEl.addEventListener('click', toggleAutoplay);

undoBtnEl.addEventListener('click', undoMove);

swapBtnEl.addEventListener('click', () => {
  if (swapUses <= 0) return;
  if (won && !keepGoing) return;
  setActiveMode(activeMode === 'swap' ? null : 'swap');
});

deleteBtnEl.addEventListener('click', () => {
  if (deleteUses <= 0) return;
  if (won && !keepGoing) return;
  setActiveMode(activeMode === 'delete' ? null : 'delete');
});

keepGoingBtn.addEventListener('click', () => {
  keepGoing = true;
  hideOverlays();
});
winNewGameBtn.addEventListener('click', newGame);
tryAgainBtn.addEventListener('click', newGame);

// ─── AI Autoplay ─────────────────────────────────────────────────
function toggleAutoplay() {
  if (isAutoplay) {
    stopAutoplay();
  } else {
    startAutoplay();
  }
}

function startAutoplay() {
  if (isGameOver) return;
  if (won && !keepGoing) return;
  isAutoplay = true;
  aiBtnEl.textContent = 'Stop AI';
  aiBtnEl.classList.add('active');
  setActiveMode(null);
  scheduleAiMove();
}

function stopAutoplay() {
  isAutoplay = false;
  clearTimeout(autoplayTimer);
  autoplayTimer = null;
  aiBtnEl.textContent = 'Watch AI';
  aiBtnEl.classList.remove('active');
}

function scheduleAiMove() {
  if (!isAutoplay) return;
  autoplayTimer = setTimeout(doAiMove, 320);
}

function doAiMove() {
  if (!isAutoplay) return;
  if (isGameOver || (won && !keepGoing)) { stopAutoplay(); return; }
  if (isAnimating) { scheduleAiMove(); return; }

  const board = serializeGrid();
  const dir = window.getBestMove(board);
  if (!dir) { stopAutoplay(); return; }
  move(dir);
  scheduleAiMove();
}

// ─── Footer cross-promo ──────────────────────────────────────────
function setupFooterCrossPromo() {
  const el = document.getElementById('footer-cross-promo');
  const hostname = window.location.hostname;
  if (hostname === '2048.lachiethurlow.com') {
    el.innerHTML = 'Also available at <a href="https://2048.transnology.co" target="_blank" rel="noopener noreferrer">2048.transnology.co</a>';
  } else if (hostname === '2048.transnology.co') {
    el.innerHTML = 'Also available at <a href="https://2048.lachiethurlow.com" target="_blank" rel="noopener noreferrer">2048.lachiethurlow.com</a>';
  } else {
    el.innerHTML = 'Available at <a href="https://2048.lachiethurlow.com" target="_blank" rel="noopener noreferrer">2048.lachiethurlow.com</a> and <a href="https://2048.transnology.co" target="_blank" rel="noopener noreferrer">2048.transnology.co</a>';
  }
}

// ─── Boot ────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
