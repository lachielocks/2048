/* game.js — 2048 game logic, rendering, input handling, power-ups */
'use strict';

// ─── Constants ───────────────────────────────────────────────────
const DEFAULT_BOARD_SIZE = 4;
const MIN_BOARD_SIZE = 4;
const MAX_BOARD_SIZE = 8;
const PREFERRED_SIZE_KEY = 'preferredBoardSize';
const SPAWN_2_PROB = 0.9;
const SLIDE_MS = 100; // must match CSS --transition-slide

// ─── State ───────────────────────────────────────────────────────
let SIZE = DEFAULT_BOARD_SIZE; // square edge length (classic 2048 = 4)
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

// Set true for AI or demo games — skips best-score update + game:end event
let isUntrackedGame = false;

// Board size UI (confirm before abandoning a game)
let pendingBoardSize = null;

// Game tracking (for saving + achievements)
let moveCount = 0;
let gameStartTime = null;
let undoUsed = false;
let powerupUsed = false;

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

const boardSizeDropdown     = document.getElementById('board-size-dropdown');
const boardSizeTrigger      = document.getElementById('board-size-trigger');
const boardSizeTriggerLabel = document.getElementById('board-size-trigger-label');
const boardSizeMenu         = document.getElementById('board-size-menu');
const boardSizeModal        = document.getElementById('board-size-modal');
const boardSizeModalText    = document.getElementById('board-size-modal-text');
const boardSizeModalCancel  = document.getElementById('board-size-modal-cancel');
const boardSizeModalConfirm = document.getElementById('board-size-modal-confirm');

// ─── Cell sizing helper ──────────────────────────────────────────
// Compute from the board element's actual rendered width — no dependency on grid layout timing.
function getCellSize() {
  if (!SIZE) return { cell: 0, gap: 10 };
  const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 10;
  // .board has box-sizing: border-box + padding: var(--gap)
  // .tiles-container is absolute with inset: var(--gap), so its width = board.offsetWidth - 2*gap
  const containerWidth = boardEl.offsetWidth - 2 * gap;
  const cell = (containerWidth - gap * (SIZE - 1)) / SIZE;
  return { cell: Math.max(cell, 0), gap };
}

function clampBoardSize(n) {
  const x = parseInt(n, 10);
  if (!Number.isFinite(x)) return DEFAULT_BOARD_SIZE;
  return Math.max(MIN_BOARD_SIZE, Math.min(MAX_BOARD_SIZE, x));
}

function getSpawnCountForBoardSize(size = SIZE) {
  return Math.max(1, clampBoardSize(size) - 3);
}

function getScoreMultiplierForBoardSize(size = SIZE) {
  return size >= 7 ? 0.5 : 1;
}

function getMergeScore(mergedValue) {
  return Math.round(mergedValue * getScoreMultiplierForBoardSize());
}

function spawnTurnTiles() {
  const spawnCount = getSpawnCountForBoardSize();
  for (let i = 0; i < spawnCount; i++) {
    if (!spawnTile()) break;
  }
}

/** Apply N×N grid tracks (repeat(var(), 1fr) is unreliable; minmax avoids flex blowout). */
function syncBoardGridLayout() {
  const track = `repeat(${SIZE}, minmax(0, 1fr))`;
  boardCells.style.gridTemplateColumns = track;
  boardCells.style.gridTemplateRows = track;
  tilesContainer.style.gridTemplateColumns = track;
  tilesContainer.style.gridTemplateRows = track;
}

function repositionAllTiles() {
  if (!grid) return;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c]) grid[r][c].position();
    }
  }
}

function scheduleTileLayoutFix() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => repositionAllTiles());
  });
}

/** Sets grid edge length, rebuilds cells, and syncs grid tracks. Always rebuilds if size changes. */
function setBoardSize(n) {
  const next = clampBoardSize(n);
  SIZE = next;
  boardEl.dataset.size = String(SIZE);
  boardEl.setAttribute('aria-label', `${SIZE} by ${SIZE} game board`);
  buildCells();
  syncBoardGridLayout();
}

function readPreferredBoardSize() {
  return clampBoardSize(localStorage.getItem(PREFERRED_SIZE_KEY));
}

function persistPreferredBoardSize(n) {
  localStorage.setItem(PREFERRED_SIZE_KEY, String(clampBoardSize(n)));
}

function isGameInProgress() {
  return moveCount > 0 || score > 0;
}

function setBoardSizeMenuOpen(open) {
  if (!boardSizeMenu || !boardSizeTrigger) return;
  boardSizeMenu.hidden = !open;
  boardSizeTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  boardSizeTrigger.classList.toggle('board-size-dropdown__trigger--open', open);
  if (open) window.refreshIcons?.();
}

function closeBoardSizeMenu() {
  if (!boardSizeMenu || boardSizeMenu.hidden) return;
  setBoardSizeMenuOpen(false);
}

function syncBoardSizePicker() {
  if (boardSizeTriggerLabel) {
    boardSizeTriggerLabel.textContent = SIZE === 4 ? '4×4' : `${SIZE}×${SIZE}`;
  }
  boardSizeMenu?.querySelectorAll('.board-size-dropdown__item').forEach((el) => {
    const n = clampBoardSize(el.dataset.size);
    el.setAttribute('aria-selected', n === SIZE ? 'true' : 'false');
    el.classList.toggle('board-size-dropdown__item--current', n === SIZE);
  });
}

function applyBoardSizeChange(n) {
  n = clampBoardSize(n);
  persistPreferredBoardSize(n);
  localStorage.setItem('skipRestore', '1');
  location.reload();
}

function trySelectBoardSize(n) {
  n = clampBoardSize(n);
  if (n === SIZE) return;
  closeBoardSizeMenu();
  if (isGameInProgress()) {
    pendingBoardSize = n;
    if (boardSizeModalText) {
      boardSizeModalText.textContent =
        `Switch to ${n}×${n}? Your current game will be replaced with a new board.`;
    }
    if (boardSizeModal) {
      boardSizeModal.hidden = false;
      boardSizeModalConfirm?.focus();
    }
    return;
  }
  applyBoardSizeChange(n);
}

function initBoardSizePicker() {
  boardSizeTrigger?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setBoardSizeMenuOpen(!!boardSizeMenu?.hidden);
  });

  boardSizeMenu?.addEventListener('click', (e) => {
    const item = e.target.closest('.board-size-dropdown__item');
    if (!item) return;
    const n = clampBoardSize(item.dataset.size);
    setBoardSizeMenuOpen(false);
    trySelectBoardSize(n);
  });

  document.addEventListener('mousedown', (e) => {
    if (!boardSizeMenu || boardSizeMenu.hidden) return;
    if (boardSizeDropdown?.contains(e.target)) return;
    setBoardSizeMenuOpen(false);
  });

  boardSizeModalCancel?.addEventListener('click', () => {
    pendingBoardSize = null;
    if (boardSizeModal) boardSizeModal.hidden = true;
    syncBoardSizePicker();
  });

  boardSizeModalConfirm?.addEventListener('click', () => {
    const next = pendingBoardSize;
    pendingBoardSize = null;
    if (boardSizeModal) boardSizeModal.hidden = true;
    if (next != null) applyBoardSizeChange(next);
  });

  boardSizeModal?.addEventListener('click', (e) => {
    if (e.target === boardSizeModal) {
      pendingBoardSize = null;
      boardSizeModal.hidden = true;
      syncBoardSizePicker();
    }
  });
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
    tilesContainer.appendChild(this.el);
    this.position();

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
  setBoardSize(readPreferredBoardSize());
  initBoardSizePicker();
  newGame();
  syncBoardSizePicker();
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
// suppressReset: true when restoring a saved state — skips the cloud-clear hook
let suppressReset = false;

function newGame() {
  if (!suppressReset) window.onGameReset?.();
  suppressReset = false;
  stopAutoplay();
  setActiveMode(null);

  let demoPayload = null;
  const demoRaw = localStorage.getItem('demo_board');
  if (demoRaw) {
    try {
      const demo = JSON.parse(demoRaw);
      const b = demo.board;
      if (Array.isArray(b) && b.length > 0 &&
          b.every(row => Array.isArray(row) && row.length === b.length)) {
        const n = clampBoardSize(b.length);
        setBoardSize(n);
        persistPreferredBoardSize(n);
        demoPayload = demo;
      }
    } catch {}
    localStorage.removeItem('demo_board');
  }

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
  moveCount = 0;
  gameStartTime = null;
  undoUsed = false;
  powerupUsed = false;
  isUntrackedGame = false;

  scoreEl.textContent = '0';
  hideOverlays();
  updatePowerUpUI();
  document.dispatchEvent(new CustomEvent('game:new'));

  if (demoPayload) {
    const b = demoPayload.board;
    if (Array.isArray(b) && b.length === SIZE &&
        b.every(row => Array.isArray(row) && row.length === SIZE)) {
      for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
          if (b[r][c]) grid[r][c] = new Tile(r, c, b[r][c], false);
      if (demoPayload.score) { score = demoPayload.score; scoreEl.textContent = score; updateScoreDisplay(0); }
      if (demoPayload.won) { won = true; }
      isUntrackedGame = true;
      syncBoardSizePicker();
      scheduleTileLayoutFix();
      return;
    }
  }

  spawnTile();
  spawnTile();
  scheduleTileLayoutFix();
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
  closeBoardSizeMenu();
  if (boardSizeModal && !boardSizeModal.hidden) return;
  if (isAnimating || activeMode) return;
  if (isGameOver) return;
  if (won && !keepGoing) return;

  if (!gameStartTime) gameStartTime = Date.now();

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
  let will2048Merge = false;

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
      // Slow the slide for the epic 2048 merge (real games only)
      if (mergeWith.value === 1024 && tile.value === 1024 && !won && !isAutoplay) {
        tile.el.classList.add('tile-slow-merge');
        mergeWith.el.classList.add('tile-slow-merge');
        will2048Merge = true;
      }
      tile.position();
      mergeWith.merging = true;
      mergeWith.absorbedTile = tile;
      mergeWith.newValue = mergeWith.value * 2;
      scoreGain += getMergeScore(mergeWith.newValue);
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

  moveCount++;
  prevSnapshot = snapshot;
  prevScore = snapScore;

  if (scoreGain > 0) {
    score += scoreGain;
    updateScoreDisplay(scoreGain);
  } else {
    scoreEl.textContent = score;
  }

  if (!isAutoplay && !isUntrackedGame) {
    document.dispatchEvent(new CustomEvent('game:move', {
      detail: { score, highestTile: getHighestTile(), moveCount }
    }));
  }

  isAnimating = true;
  setTimeout(afterSlide, (will2048Merge ? 620 : SLIDE_MS) + 20);
}

function afterSlide() {
  let tile2048 = null;
  let justWon = false;

  // Process all merges first
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

        // Confetti (skip for 2048 — win animation handles it)
        if (t.value >= 512 && t.value !== 2048) {
          const rect = t.el.getBoundingClientRect();
          const count = t.value >= 1024 ? 80 : 40;
          if (typeof window.triggerConfetti === 'function') {
            window.triggerConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2, count);
          }
        }

        // Track 2048 tile for win handling after loop
        if (t.value === 2048 && !won) {
          tile2048 = t;
          justWon = true;
        }
      }
    }
  }

  // Handle win after all merges are processed
  if (justWon) {
    won = true;
    if (!isAutoplay) {
      // Hand off to win-animation.js; keep isAnimating = true to block input
      spawnTurnTiles();
      updatePowerUpUI();
      document.dispatchEvent(new CustomEvent('game:merge2048', { detail: { tileEl: tile2048.el } }));
      return; // afterSlide returns early; win-animation calls finishWin2048 when done
    }
    showWinOverlay();
    pulseLogoOnWin();
  }

  spawnTurnTiles();

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
  const idx = Array.from({ length: SIZE }, (_, i) => i);
  let rows = idx.slice();
  let cols = idx.slice();
  if (dir === 'right') cols.reverse();
  if (dir === 'down') rows.reverse();
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

// ─── Highest tile helper ─────────────────────────────────────────
function getHighestTile() {
  let max = 0;
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (grid[r][c] && grid[r][c].value > max) max = grid[r][c].value;
  return max;
}

// ─── Serialize ───────────────────────────────────────────────────
function serializeGrid() {
  return grid.map(row => row.map(t => (t ? t.value : 0)));
}

// ─── Undo ────────────────────────────────────────────────────────
function undoMove() {
  if (!prevSnapshot || isAnimating) return;

  undoUsed = true;
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
  powerupUsed = true;
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
  powerupUsed = true;
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
  if (score > best && !isUntrackedGame && !isAutoplay) {
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

// ─── Game end dispatch + localStorage save ────────────────────────
function dispatchGameEnd(isWon) {
  // AI autoplay and admin demo games never count toward scores or leaderboards
  if (isAutoplay || isUntrackedGame) return;

  const durationSeconds = gameStartTime ? Math.floor((Date.now() - gameStartTime) / 1000) : 0;
  const highestTile = getHighestTile();
  const boardState = serializeGrid();

  document.dispatchEvent(new CustomEvent('game:end', { detail: {
    score, highestTile, moves: moveCount,
    durationSeconds, won: isWon, boardState,
    undoUsed, powerupUsed, mode: 'classic', boardSize: SIZE,
  }}));

  // Persist to localStorage for guest sync later
  try {
    const games = JSON.parse(localStorage.getItem('games2048') || '[]');
    games.push({
      score, highestTile, moves: moveCount, durationSeconds, won: isWon, mode: 'classic',
      boardSize: SIZE, boardState, createdAt: Date.now(),
    });
    if (games.length > 10) games.splice(0, games.length - 10);
    localStorage.setItem('games2048', JSON.stringify(games));
  } catch {}
}

// ─── Overlays ────────────────────────────────────────────────────
function showWinOverlay() {
  dispatchGameEnd(true);
  winScoreEl.textContent = score.toLocaleString();
  winOverlay.hidden = false;
}

// Called by win-animation.js when the epic sequence finishes
window.finishWin2048 = function () {
  isAnimating = false;
  if (won) { showWinOverlay(); pulseLogoOnWin(); }
};

function showGameOverOverlay() {
  dispatchGameEnd(false);
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
  resizeTimer = setTimeout(() => repositionAllTiles(), 80);
});

// ─── Keyboard ────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  // Escape — board size menu, modal, then power-up mode
  if (e.key === 'Escape') {
    if (boardSizeMenu && !boardSizeMenu.hidden) {
      e.preventDefault();
      setBoardSizeMenuOpen(false);
      return;
    }
    if (boardSizeModal && !boardSizeModal.hidden) {
      e.preventDefault();
      pendingBoardSize = null;
      boardSizeModal.hidden = true;
      syncBoardSizePicker();
      return;
    }
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

  // Don't intercept keys when the user is typing in a form field
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

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
  closeBoardSizeMenu();
  if (boardSizeModal && !boardSizeModal.hidden) return;
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
  isUntrackedGame = true;
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

// ─── Autosave API ────────────────────────────────────────────────
window.getGameState = function () {
  if (moveCount === 0 && score === 0) return null; // nothing worth saving
  const board = [];
  for (let r = 0; r < SIZE; r++) {
    board.push([]);
    for (let c = 0; c < SIZE; c++) board[r].push(grid[r][c] ? grid[r][c].value : 0);
  }
  return {
    board, boardSize: SIZE, score, moveCount, won, keepGoing,
    swapUses, deleteUses, undoUsed, powerupUsed,
    durationSoFar: gameStartTime ? Math.floor((Date.now() - gameStartTime) / 1000) : 0,
  };
};

window.applyGameState = function (state) {
  if (!state || !Array.isArray(state.board) || state.board.length === 0) return;
  if (localStorage.getItem('skipRestore')) {
    localStorage.removeItem('skipRestore');
    return;
  }
  suppressReset = true;
  const rawBoard = state.board;
  let n = DEFAULT_BOARD_SIZE;
  if (rawBoard.every(row => Array.isArray(row) && row.length === rawBoard.length))
    n = clampBoardSize(rawBoard.length);
  else if (state.board_size != null) n = clampBoardSize(state.board_size);
  else if (state.boardSize != null) n = clampBoardSize(state.boardSize);
  setBoardSize(n);
  newGame();
  // Drop random spawns; rebuild exactly from saved board
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = grid[r][c];
      if (t) t.remove();
      grid[r][c] = null;
    }
  }
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = rawBoard[r]?.[c];
      if (v) grid[r][c] = new Tile(r, c, v, false);
    }
  }
  // Restore state
  score        = state.score        || 0;
  moveCount    = state.move_count   || state.moveCount || 0;
  won          = state.won          || false;
  keepGoing    = state.keep_going   || state.keepGoing || false;
  swapUses     = state.swap_uses    ?? state.swapUses    ?? 0;
  deleteUses   = state.delete_uses  ?? state.deleteUses  ?? 0;
  undoUsed     = state.undo_used    || state.undoUsed    || false;
  powerupUsed  = state.powerup_used || state.powerupUsed || false;
  const dur    = state.duration_so_far ?? state.durationSoFar ?? 0;
  if (dur > 0) gameStartTime = Date.now() - dur * 1000;
  scoreEl.textContent = score;
  updateScoreDisplay(0);
  updatePowerUpUI();
  persistPreferredBoardSize(SIZE);
  syncBoardSizePicker();
  scheduleTileLayoutFix();
};

// ─── Boot ────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
