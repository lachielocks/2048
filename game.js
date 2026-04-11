/* game.js — 2048 game logic, rendering, input handling */
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

// ─── DOM refs ────────────────────────────────────────────────────
const tilesContainer  = document.getElementById('tiles-container');
const boardCells      = document.getElementById('board-cells');
const boardEl         = document.getElementById('board');
const scoreEl         = document.getElementById('score');
const bestEl          = document.getElementById('best');
const newGameBtn      = document.getElementById('new-game-btn');
const undoBtn         = document.getElementById('undo-btn');
const winOverlay      = document.getElementById('win-overlay');
const gameoverOverlay = document.getElementById('gameover-overlay');
const keepGoingBtn    = document.getElementById('keep-going-btn');
const winNewGameBtn   = document.getElementById('win-new-game-btn');
const tryAgainBtn     = document.getElementById('try-again-btn');
const winScoreEl      = document.getElementById('win-score');
const gameoverScoreEl = document.getElementById('gameover-score');
const logoEl          = document.querySelector('.logo');

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
      // Wait one frame so the spawn animation actually plays from scale 0
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
    void this.el.offsetWidth; // force reflow to restart animation
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
  tilesContainer.innerHTML = '';
  grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  score = 0;
  isGameOver = false;
  won = false;
  keepGoing = false;
  isAnimating = false;
  prevSnapshot = null;
  prevScore = 0;

  scoreEl.textContent = '0';
  hideOverlays();

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
  if (isAnimating || isGameOver) return;
  if (won && !keepGoing) return;

  // Snapshot for undo & "did anything change?" check
  const snapshot = serializeGrid();
  const snapScore = score;

  // Reset merge flags on every tile
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = grid[r][c];
      if (t) {
        t.merging = false;
        t.absorbedTile = null;
        t.newValue = null;
      }
    }
  }

  const [dr, dc] = directionVector(dir);
  const traversal = getTraversal(dir);
  let moved = false;
  let scoreGain = 0;

  for (const [r, c] of traversal) {
    const tile = grid[r][c];
    if (!tile) continue;

    // Walk in direction until we hit edge or another tile
    let nr = r, nc = c;
    while (true) {
      const tr = nr + dr;
      const tc = nc + dc;
      if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE) break;
      if (grid[tr][tc]) break;
      nr = tr;
      nc = tc;
    }

    // Check the tile we stopped against — can it merge?
    const tr = nr + dr;
    const tc = nc + dc;
    let mergeWith = null;
    if (tr >= 0 && tr < SIZE && tc >= 0 && tc < SIZE) {
      const next = grid[tr][tc];
      if (next && next.value === tile.value && !next.merging) {
        mergeWith = next;
      }
    }

    if (mergeWith) {
      // Slide INTO mergeWith's cell
      grid[r][c] = null;
      tile.row = tr;
      tile.col = tc;
      tile.position();

      mergeWith.merging = true;
      mergeWith.absorbedTile = tile;
      mergeWith.newValue = mergeWith.value * 2;

      scoreGain += mergeWith.newValue;
      moved = true;
    } else if (nr !== r || nc !== c) {
      // Just slide
      grid[r][c] = null;
      grid[nr][nc] = tile;
      tile.row = nr;
      tile.col = nc;
      tile.position();
      moved = true;
    }
  }

  if (!moved) return;

  // Save undo state
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
  // Apply merges: swallow absorbed tiles, double the survivors
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = grid[r][c];
      if (t && t.merging) {
        if (t.absorbedTile) {
          t.absorbedTile.remove();
          t.absorbedTile = null;
        }
        t.setValue(t.newValue);
        t.merging = false;
        t.newValue = null;
        t.popMerge();

        // Confetti for big merges
        if (t.value >= 512) {
          const rect = t.el.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const count = t.value >= 2048 ? 150 : t.value >= 1024 ? 80 : 40;
          if (typeof window.triggerConfetti === 'function') {
            window.triggerConfetti(cx, cy, count);
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
  // Traverse from the wall outward so the closest tile to the wall moves first
  let rows = [0, 1, 2, 3];
  let cols = [0, 1, 2, 3];
  if (dir === 'right') cols = [3, 2, 1, 0];
  if (dir === 'down')  rows = [3, 2, 1, 0];
  const order = [];
  for (const r of rows) {
    for (const c of cols) {
      order.push([r, c]);
    }
  }
  return order;
}

// ─── Game over check ─────────────────────────────────────────────
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

  tilesContainer.innerHTML = '';
  grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = prevSnapshot[r][c];
      if (v) {
        grid[r][c] = new Tile(r, c, v, false);
      }
    }
  }

  score = prevScore;
  scoreEl.textContent = score;
  prevSnapshot = null;
  isGameOver = false;
  hideOverlays();
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

// ─── Resize handling ─────────────────────────────────────────────
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
  // Undo: Ctrl+Z / Cmd+Z
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    undoMove();
    return;
  }

  let dir = null;
  switch (e.key) {
    case 'ArrowLeft':  case 'a': case 'A': dir = 'left';  break;
    case 'ArrowRight': case 'd': case 'D': dir = 'right'; break;
    case 'ArrowUp':    case 'w': case 'W': dir = 'up';    break;
    case 'ArrowDown':  case 's': case 'S': dir = 'down';  break;
  }
  if (dir) {
    e.preventDefault(); // also blocks page scroll on arrows
    move(dir);
  }
}, { passive: false });

// ─── Pointer / touch swipe ───────────────────────────────────────
let pStartX = 0, pStartY = 0, pStarted = false;
const MIN_SWIPE = 30;

boardEl.addEventListener('pointerdown', (e) => {
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
  if (Math.abs(dx) > Math.abs(dy)) {
    move(dx > 0 ? 'right' : 'left');
  } else {
    move(dy > 0 ? 'down' : 'up');
  }
}, { passive: true });

boardEl.addEventListener('pointercancel', () => { pStarted = false; }, { passive: true });

// Block native scroll while interacting with the board
boardEl.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// ─── Buttons ─────────────────────────────────────────────────────
newGameBtn.addEventListener('click', newGame);
undoBtn.addEventListener('click', undoMove);
keepGoingBtn.addEventListener('click', () => {
  keepGoing = true;
  hideOverlays();
});
winNewGameBtn.addEventListener('click', newGame);
tryAgainBtn.addEventListener('click', newGame);

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
