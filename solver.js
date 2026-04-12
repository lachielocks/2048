/* solver.js — Expectimax AI solver for 2048 */
/* Exposes window.getBestMove(board2D) where board2D is N×N (0 = empty); N inferred from board.length */
(function () {
  'use strict';

  var DIRS = ['up', 'down', 'left', 'right'];

  // ─── Board helpers ────────────────────────────────────────────
  function clone(board) {
    return board.map(function (row) { return row.slice(); });
  }

  function range(n) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(i);
    return a;
  }

  // Simulate one move. Returns { board, moved }.
  // Mirrors the canonical game.js algorithm exactly.
  function simulateMove(board, dir) {
    var SIZE = board.length;
    var b = clone(board);
    var dr, dc;
    var rows = range(SIZE);
    var cols = range(SIZE);

    switch (dir) {
      case 'left':  dr = 0; dc = -1; break;
      case 'right': dr = 0; dc =  1; cols.reverse(); break;
      case 'up':    dr = -1; dc = 0; break;
      case 'down':  dr =  1; dc = 0; rows.reverse(); break;
    }

    var merging = [];
    for (var mi = 0; mi < SIZE; mi++) {
      merging.push([]);
      for (var mj = 0; mj < SIZE; mj++) merging[mi].push(false);
    }

    var moved = false;

    for (var ri = 0; ri < SIZE; ri++) {
      for (var ci = 0; ci < SIZE; ci++) {
        var r = rows[ri], c = cols[ci];
        var val = b[r][c];
        if (!val) continue;

        // Slide as far as possible
        var nr = r, nc = c;
        while (true) {
          var tr = nr + dr, tc = nc + dc;
          if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE) break;
          if (b[tr][tc]) break;
          nr = tr; nc = tc;
        }

        // Check merge
        var mr = nr + dr, mc = nc + dc;
        if (mr >= 0 && mr < SIZE && mc >= 0 && mc < SIZE &&
            b[mr][mc] === val && !merging[mr][mc]) {
          b[r][c] = 0;
          b[mr][mc] = val * 2;
          merging[mr][mc] = true;
          moved = true;
        } else if (nr !== r || nc !== c) {
          b[r][c] = 0;
          b[nr][nc] = val;
          moved = true;
        }
      }
    }

    return { board: b, moved: moved };
  }

  // ─── Heuristics ───────────────────────────────────────────────
  function log2safe(v) {
    return v ? Math.log2(v) : 0;
  }

  function scoreBoard(board) {
    var SIZE = board.length;
    var emptyCells = 0;
    var smoothness = 0;
    var mono = 0;
    var maxVal = 0;
    var maxR = -1, maxC = -1;

    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var v = board[r][c];
        if (!v) { emptyCells++; continue; }
        if (v > maxVal) { maxVal = v; maxR = r; maxC = c; }

        // Smoothness: penalise log2 difference with right/down neighbour
        if (c + 1 < SIZE && board[r][c + 1]) {
          smoothness -= Math.abs(log2safe(v) - log2safe(board[r][c + 1]));
        }
        if (r + 1 < SIZE && board[r + 1][c]) {
          smoothness -= Math.abs(log2safe(v) - log2safe(board[r + 1][c]));
        }
      }
    }

    // Monotonicity across all rows and columns
    for (var r2 = 0; r2 < SIZE; r2++) {
      var rowInc = 0, rowDec = 0;
      for (var c2 = 0; c2 < SIZE - 1; c2++) {
        var cur  = log2safe(board[r2][c2]);
        var next = log2safe(board[r2][c2 + 1]);
        if (cur > next) rowDec += cur - next;
        else            rowInc += next - cur;
      }
      mono -= Math.min(rowInc, rowDec);
    }
    for (var c3 = 0; c3 < SIZE; c3++) {
      var colInc = 0, colDec = 0;
      for (var r3 = 0; r3 < SIZE - 1; r3++) {
        var cur2  = log2safe(board[r3][c3]);
        var next2 = log2safe(board[r3 + 1][c3]);
        if (cur2 > next2) colDec += cur2 - next2;
        else              colInc += next2 - cur2;
      }
      mono -= Math.min(colInc, colDec);
    }

    // Corner bonus: reward largest tile in any corner
    var corners = [
      board[0][0], board[0][SIZE-1],
      board[SIZE-1][0], board[SIZE-1][SIZE-1]
    ];
    var cornerBonus = 0;
    if (maxVal > 0 && corners.indexOf(maxVal) !== -1) {
      cornerBonus = log2safe(maxVal) * 3;
    }

    return emptyCells * 270 + mono * 1.0 + smoothness * 0.1 + cornerBonus;
  }

  // ─── Expectimax ───────────────────────────────────────────────
  function getEmpty(board) {
    var SIZE = board.length;
    var empties = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (!board[r][c]) empties.push([r, c]);
      }
    }
    return empties;
  }

  function hasAnyMove(board) {
    for (var d = 0; d < DIRS.length; d++) {
      if (simulateMove(board, DIRS[d]).moved) return true;
    }
    return false;
  }

  function expectimax(board, depth, isMax) {
    if (depth === 0) return scoreBoard(board);

    if (isMax) {
      // Player node — pick best direction
      var best = -Infinity;
      var anyMoved = false;
      for (var d = 0; d < DIRS.length; d++) {
        var result = simulateMove(board, DIRS[d]);
        if (!result.moved) continue;
        anyMoved = true;
        var s = expectimax(result.board, depth - 1, false);
        if (s > best) best = s;
      }
      return anyMoved ? best : -Infinity;
    } else {
      // Chance node — average over all empty cells spawning 2 (90%) or 4 (10%)
      var empties = getEmpty(board);
      if (!empties.length) return expectimax(board, depth, true);

      // Limit branching: sample at most 6 empty cells when board is open
      var cells = empties;
      if (cells.length > 6) {
        // pick evenly spaced subset to keep it fast
        var step = cells.length / 6;
        var sampled = [];
        for (var i = 0; i < 6; i++) sampled.push(cells[Math.floor(i * step)]);
        cells = sampled;
      }

      var total = 0;
      var count = cells.length;
      for (var j = 0; j < count; j++) {
        var r = cells[j][0], c = cells[j][1];

        // Spawn 2 (weight 0.9)
        board[r][c] = 2;
        total += 0.9 * expectimax(board, depth - 1, true);

        // Spawn 4 (weight 0.1)
        board[r][c] = 4;
        total += 0.1 * expectimax(board, depth - 1, true);

        board[r][c] = 0;
      }
      return total / count;
    }
  }

  // ─── Public API ───────────────────────────────────────────────
  // board: N×N array of numbers (0 = empty)
  // returns: direction string 'up'|'down'|'left'|'right', or null if stuck
  window.getBestMove = function getBestMove(board) {
    if (!board || !board.length) return null;
    var N = board.length;
    if (board.some(function (row) { return !row || row.length !== N; })) return null;

    // Choose depth based on number of empty tiles (shallower when board is open)
    var empties = getEmpty(board).length;
    var depth = empties <= 4 ? 5 : empties <= 8 ? 4 : 3;
    if (N > 4) depth = Math.max(2, depth - 1);
    if (N > 6) depth = Math.min(depth, 3);

    var bestDir = null;
    var bestScore = -Infinity;

    for (var d = 0; d < DIRS.length; d++) {
      var dir = DIRS[d];
      var result = simulateMove(board, dir);
      if (!result.moved) continue;
      var score = expectimax(result.board, depth, false);
      if (score > bestScore) {
        bestScore = score;
        bestDir = dir;
      }
    }
    return bestDir;
  };
})();
