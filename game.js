/* game.js — 2048 game logic, rendering, input handling */
'use strict';

// ─── Constants ───────────────────────────────────────────────────
const SIZE = 4;
const SLIDE_DURATION = 100; // ms — must match CSS --transition-slide
const SPAWN_2_PROB = 0.9;

// ─── State ────────────────────────────────────────────────────────
let board = [];           // 4×4 array of values (0 = empty)
let score = 0;
let best = 0;
let gameOver = false;
let won = false;
let keepGoing = false;

// Undo state
let prevBoard = null;
let prevScore = 0;
let canUndo = false;

// ─── DOM refs ────────────────────────────────────────────────────
const tilesContainer = document.getElementById('tiles-container');
const boardCells     = document.getElementById('board-cells');
const scoreEl        = document.getElementById('score');
const bestEl         = document.getElementById('best');
const newGameBtn     = document.getElementById('new-game-btn');
const undoBtn        = document.getElementById('undo-btn');
const winOverlay     = document.getElementById('win-overlay');
const gameoverOverlay= document.getElementById('gameover-overlay');
const keepGoingBtn   = document.getElementById('keep-going-btn');
const winNewGameBtn  = document.getElementById('win-new-game-btn');
const tryAgainBtn    = document.getElementById('try-again-btn');
const winScoreEl     = document.getElementById('win-score');
const gameoverScoreEl= document.getElementById('gameover-score');
const logoEl         = document.querySelector('.logo');

// ─── Init ─────────────────────────────────────────────────────────
function init() {
  best = parseInt(localStorage.getItem('best2048') || '0', 10);
  bestEl.textContent = best;
  buildCells();
  startNewGame();
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

// ─── New Game ─────────────────────────────────────────────────────
function startNewGame() {
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  score = 0;
  gameOver = false;
  won = false;
  keepGoing = false;
  canUndo = false;
  prevBoard = null;

  updateScoreDisplay(0);
  hideOverlays();
  tilesContainer.innerHTML = '';

  spawnTile();
  spawnTile();
  renderBoard();
}

// ─── Tile spawning ────────────────────────────────────────────────
function spawnTile() {
  const empty = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 0) empty.push({ r, c });
    }
  }
  if (empty.length === 0) return false;

  const { r, c } = empty[Math.floor(Math.random() * empty.length)];
  board[r][c] = Math.random() < SPAWN_2_PROB ? 2 : 4;
  return { r, c, value: board[r][c] };
}

// ─── Rendering ────────────────────────────────────────────────────
// Tile map: tracks DOM elements by unique id
let tileMap = new Map(); // id → { el, r, c, value }
let nextTileId = 1;

// Full re-render (used only at start)
function renderBoard() {
  tilesContainer.innerHTML = '';
  tileMap.clear();
  nextTileId = 1;

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] !== 0) {
        createTileEl(r, c, board[r][c], true);
      }
    }
  }
}

function createTileEl(r, c, value, isNew = false) {
  const el = document.createElement('div');
  el.className = 'tile';
  el.dataset.value = value;
  el.textContent = value;
  setTilePosition(el, r, c);
  tilesContainer.appendChild(el);

  const id = nextTileId++;
  tileMap.set(id, { el, r, c, value });

  if (isNew) {
    requestAnimationFrame(() => {
      el.classList.add('tile-new');
      el.addEventListener('animationend', () => el.classList.remove('tile-new'), { once: true });
    });
  }

  return id;
}

function setTilePosition(el, r, c) {
  const parent = tilesContainer;
  const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 10;
  const boardSize = parent.offsetWidth;
  const cellSize = (boardSize - gap * (SIZE - 1)) / SIZE;

  el.style.width  = cellSize + 'px';
  el.style.height = cellSize + 'px';
  el.style.top    = (r * (cellSize + gap)) + 'px';
  el.style.left   = (c * (cellSize + gap)) + 'px';
}

function repositionAllTiles() {
  for (const [, tile] of tileMap) {
    setTilePosition(tile.el, tile.r, tile.c);
  }
}

// ─── Move logic ───────────────────────────────────────────────────
// Returns { moved: bool, addedScore: int, merges: [{r,c,value}] }
function move(direction) {
  // Save undo state before moving
  const boardSnapshot = board.map(row => [...row]);
  const scoreSnapshot = score;

  let moved = false;
  let addedScore = 0;
  const merges = []; // positions that merged, {r, c, value, fromId, toId}

  // We'll use a parallel "id board" for tracking tiles
  let idBoard = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  for (const [id, tile] of tileMap) {
    idBoard[tile.r][tile.c] = id;
  }

  // Helper: process a single line of 4 cells
  // Returns { newLine: [val,val,val,val], newIds: [id,...], mergedIds: [{id,value},...], scoreGain }
  function processLine(vals, ids) {
    // Filter out zeros
    let filtered = [];
    let filteredIds = [];
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] !== 0) {
        filtered.push(vals[i]);
        filteredIds.push(ids[i]);
      }
    }

    const merged = [];
    const mergedIds = [];
    let scoreGain = 0;

    let i = 0;
    while (i < filtered.length) {
      if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
        const newVal = filtered[i] * 2;
        merged.push(newVal);
        mergedIds.push({ fromId: filteredIds[i + 1], toId: filteredIds[i], value: newVal });
        scoreGain += newVal;
        i += 2;
      } else {
        merged.push(filtered[i]);
        mergedIds.push({ fromId: null, toId: filteredIds[i], value: filtered[i] });
        i++;
      }
    }

    // Pad to SIZE
    while (merged.length < SIZE) {
      merged.push(0);
      mergedIds.push({ fromId: null, toId: null, value: 0 });
    }

    return { newLine: merged, newIds: mergedIds, scoreGain };
  }

  // Build lines based on direction
  const lines = [];
  if (direction === 'left' || direction === 'right') {
    for (let r = 0; r < SIZE; r++) {
      let vals = board[r].slice();
      let ids  = idBoard[r].slice();
      if (direction === 'right') { vals.reverse(); ids.reverse(); }
      lines.push({ r, vals, ids, reversed: direction === 'right' });
    }
  } else {
    for (let c = 0; c < SIZE; c++) {
      let vals = [], ids = [];
      for (let r = 0; r < SIZE; r++) { vals.push(board[r][c]); ids.push(idBoard[r][c]); }
      if (direction === 'down') { vals.reverse(); ids.reverse(); }
      lines.push({ c, vals, ids, reversed: direction === 'down' });
    }
  }

  // Process each line and write back
  const newMoves = []; // { id, newR, newC, merged: bool, value, fromId }

  for (const line of lines) {
    const { newLine, newIds, scoreGain } = processLine(line.vals, line.ids);
    addedScore += scoreGain;

    let processedIds = newIds;
    if (line.reversed) processedIds = processedIds.slice().reverse();

    if (direction === 'left' || direction === 'right') {
      for (let c = 0; c < SIZE; c++) {
        const info = line.reversed ? processedIds[c] : processedIds[c];
        const newVal = line.reversed ? newLine.slice().reverse()[c] : newLine[c];
        board[line.r][c] = newVal;

        if (info.toId !== null) {
          newMoves.push({ id: info.toId, newR: line.r, newC: c, merged: info.fromId !== null, value: newVal, fromId: info.fromId });
        }
      }
    } else {
      const newLineResult = line.reversed ? newLine.slice().reverse() : newLine;
      const idsResult = line.reversed ? processedIds.slice().reverse() : processedIds;
      for (let r = 0; r < SIZE; r++) {
        board[r][line.c] = newLineResult[r];
        const info = idsResult[r];
        if (info.toId !== null) {
          newMoves.push({ id: info.toId, newR: r, newC: line.c, merged: info.fromId !== null, value: newLineResult[r], fromId: info.fromId });
        }
      }
    }
  }

  // Check if anything moved
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] !== boardSnapshot[r][c]) { moved = true; break; }
    }
    if (moved) break;
  }

  if (!moved) return { moved: false, addedScore: 0, merges: [] };

  // Save undo
  prevBoard = boardSnapshot;
  prevScore = scoreSnapshot;
  canUndo = true;

  // Animate tiles
  const mergePositions = [];

  for (const mv of newMoves) {
    const tile = tileMap.get(mv.id);
    if (!tile) continue;

    // If there's a "from" tile that got absorbed, move it to same position first
    if (mv.fromId !== null) {
      const fromTile = tileMap.get(mv.fromId);
      if (fromTile) {
        setTilePosition(fromTile.el, mv.newR, mv.newC);
        fromTile.r = mv.newR;
        fromTile.c = mv.newC;
      }
    }

    // Move the main tile
    tile.r = mv.newR;
    tile.c = mv.newC;
    setTilePosition(tile.el, mv.newR, mv.newC);

    if (mv.merged) {
      mergePositions.push({ id: mv.id, fromId: mv.fromId, r: mv.newR, c: mv.newC, value: mv.value });
    }
  }

  // After slide animation: update merged tiles
  setTimeout(() => {
    for (const merge of mergePositions) {
      // Remove the absorbed tile
      if (merge.fromId !== null) {
        const fromTile = tileMap.get(merge.fromId);
        if (fromTile) {
          fromTile.el.remove();
          tileMap.delete(merge.fromId);
        }
      }

      // Update the surviving tile's value
      const tile = tileMap.get(merge.id);
      if (tile) {
        tile.value = merge.value;
        tile.el.dataset.value = merge.value;
        tile.el.textContent = merge.value;

        // Merge animation classes
        tile.el.classList.remove('tile-merge', 'tile-merge-glow', 'tile-merge-halo', 'tile-merge-lightning');
        void tile.el.offsetWidth; // reflow to restart animation
        tile.el.classList.add('tile-merge');

        if (merge.value >= 128) tile.el.classList.add('tile-merge-glow');
        if (merge.value >= 512) tile.el.classList.add('tile-merge-halo');
        if (merge.value >= 1024) tile.el.classList.add('tile-merge-lightning');

        setTimeout(() => {
          tile.el.classList.remove('tile-merge', 'tile-merge-glow', 'tile-merge-halo', 'tile-merge-lightning');
        }, 500);

        // Trigger confetti for notable merges
        if (merge.value >= 512) {
          const rect = tile.el.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const count = merge.value >= 2048 ? 150 : merge.value >= 1024 ? 80 : 40;
          triggerConfetti(cx, cy, count);
        }

        merges.push({ r: merge.r, c: merge.c, value: merge.value });
      }
    }

    // Spawn new tile
    const spawned = spawnTile();
    if (spawned) {
      createTileEl(spawned.r, spawned.c, spawned.value, true);
    }

    // Update idBoard after merges
    idBoard = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    for (const [id, tile] of tileMap) {
      idBoard[tile.r][tile.c] = id;
    }

    // Check win
    if (!keepGoing && !won) {
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (board[r][c] === 2048) {
            won = true;
            showWinOverlay();
            // Pulse the logo
            logoEl.classList.remove('win-pulse');
            void logoEl.offsetWidth;
            logoEl.classList.add('win-pulse');
            logoEl.addEventListener('animationend', () => logoEl.classList.remove('win-pulse'), { once: true });
            return;
          }
        }
      }
    }

    // Check game over
    if (!hasValidMoves()) {
      gameOver = true;
      showGameOverOverlay();
    }

  }, SLIDE_DURATION + 10);

  return { moved: true, addedScore, merges };
}

// ─── Valid moves check ────────────────────────────────────────────
function hasValidMoves() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 0) return true;
      if (c + 1 < SIZE && board[r][c] === board[r][c + 1]) return true;
      if (r + 1 < SIZE && board[r][c] === board[r + 1][c]) return true;
    }
  }
  return false;
}

// ─── Score ────────────────────────────────────────────────────────
function updateScoreDisplay(addedScore) {
  scoreEl.textContent = score;
  if (score > best) {
    best = score;
    bestEl.textContent = best;
    localStorage.setItem('best2048', best);
  }

  if (addedScore > 0) {
    showScorePop(addedScore);
  }
}

function showScorePop(n) {
  const scoreBox = document.getElementById('score-box');
  const pop = document.createElement('span');
  pop.className = 'score-pop';
  pop.textContent = '+' + n;
  scoreBox.appendChild(pop);
  pop.addEventListener('animationend', () => pop.remove(), { once: true });
}

// ─── Overlays ─────────────────────────────────────────────────────
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

// ─── Undo ─────────────────────────────────────────────────────────
function undoMove() {
  if (!canUndo || !prevBoard) return;
  board = prevBoard.map(row => [...row]);
  score = prevScore;
  canUndo = false;
  prevBoard = null;
  gameOver = false;

  updateScoreDisplay(0);
  hideOverlays();

  // Full re-render
  tilesContainer.innerHTML = '';
  tileMap.clear();
  nextTileId = 1;
  renderBoard();
}

// ─── Input handling ───────────────────────────────────────────────
function handleDirection(dir) {
  if (gameOver) return;
  if (won && !keepGoing) return;

  const result = move(dir);
  if (result.moved) {
    score += result.addedScore;
    updateScoreDisplay(result.addedScore);
  }
}

// Keyboard
document.addEventListener('keydown', (e) => {
  const map = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    a: 'left', d: 'right', w: 'up', s: 'down',
    A: 'left', D: 'right', W: 'up', S: 'down',
  };
  if (map[e.key]) {
    e.preventDefault();
    handleDirection(map[e.key]);
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    undoMove();
  }
});

// Prevent page scroll on arrow keys
window.addEventListener('keydown', (e) => {
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
    e.preventDefault();
  }
}, { passive: false });

// Touch / pointer swipe
(function setupSwipe() {
  const board = document.getElementById('board');
  let startX = 0, startY = 0;
  const MIN_SWIPE = 30;

  board.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
  }, { passive: true });

  board.addEventListener('pointerup', (e) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (Math.max(absDx, absDy) < MIN_SWIPE) return;

    if (absDx > absDy) {
      handleDirection(dx > 0 ? 'right' : 'left');
    } else {
      handleDirection(dy > 0 ? 'down' : 'up');
    }
  }, { passive: true });
})();

// Button handlers
newGameBtn.addEventListener('click', startNewGame);
undoBtn.addEventListener('click', undoMove);
keepGoingBtn.addEventListener('click', () => {
  keepGoing = true;
  hideOverlays();
});
winNewGameBtn.addEventListener('click', startNewGame);
tryAgainBtn.addEventListener('click', startNewGame);

// ─── Resize handler ───────────────────────────────────────────────
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(repositionAllTiles, 80);
});

// ─── Footer cross-promo ───────────────────────────────────────────
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

// ─── Boot ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
