// Shared Tetris rules, adapted from public/game.js (Phase 1's single-player
// prototype). This module has no DOM/canvas dependency so it can run inside
// the Durable Object (the Cloudflare Workers runtime has no `document`) -
// the server uses it as the single source of truth for every player's game.

export const COLS = 10;
export const ROWS = 20;

export const SHAPES = {
  I: { color: '#22d3ee', cells: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ] },
  O: { color: '#facc15', cells: [
    [1, 1],
    [1, 1],
  ] },
  T: { color: '#a78bfa', cells: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ] },
  S: { color: '#4ade80', cells: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ] },
  Z: { color: '#f87171', cells: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ] },
  J: { color: '#60a5fa', cells: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ] },
  L: { color: '#fb923c', cells: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ] },
};
const SHAPE_NAMES = Object.keys(SHAPES);

export function getShape(name) {
  return SHAPES[name];
}

export const LINE_SCORES = { 1: 100, 2: 300, 3: 500, 4: 800 };
export const LINES_PER_LEVEL = 10;
export const BASE_DROP_INTERVAL_MS = 800;
export const MIN_DROP_INTERVAL_MS = 100;
export const LEVEL_SPEEDUP_MS = 70;

export function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

export function randomShapeName() {
  return SHAPE_NAMES[Math.floor(Math.random() * SHAPE_NAMES.length)];
}

export function spawnPiece(name) {
  const shape = SHAPES[name];
  const cells = shape.cells.map((row) => row.slice());
  const col = Math.floor((COLS - cells[0].length) / 2);
  return { name, cells, color: shape.color, row: 0, col };
}

export function collides(board, cells, row, col) {
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      if (!cells[r][c]) continue;
      const boardRow = row + r;
      const boardCol = col + c;
      if (boardCol < 0 || boardCol >= COLS || boardRow >= ROWS) return true;
      if (boardRow >= 0 && board[boardRow][boardCol]) return true;
    }
  }
  return false;
}

export function rotateMatrix(cells) {
  const size = cells.length;
  const rotated = Array.from({ length: size }, () => Array(size).fill(0));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      rotated[c][size - 1 - r] = cells[r][c];
    }
  }
  return rotated;
}

export function lockPieceIntoBoard(board, piece) {
  piece.cells.forEach((rowArr, r) => {
    rowArr.forEach((val, c) => {
      if (val) {
        const boardRow = piece.row + r;
        const boardCol = piece.col + c;
        if (boardRow >= 0) board[boardRow][boardCol] = piece.color;
      }
    });
  });
}

export function clearLines(board) {
  let cleared = 0;
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row].every((cell) => cell)) {
      board.splice(row, 1);
      board.unshift(Array(COLS).fill(0));
      cleared++;
      row++;
    }
  }
  return cleared;
}

export function scoreForLines(cleared, level) {
  return (LINE_SCORES[cleared] || 0) * level;
}

export function levelForLines(linesCleared) {
  return Math.floor(linesCleared / LINES_PER_LEVEL) + 1;
}

export function dropIntervalForLevel(level) {
  return Math.max(MIN_DROP_INTERVAL_MS, BASE_DROP_INTERVAL_MS - (level - 1) * LEVEL_SPEEDUP_MS);
}

// A single grid combining locked blocks with the current falling piece -
// exactly what a viewer (the player themselves, or an opponent watching
// live) needs to draw a board, without needing to track the piece
// separately on the client.
export function mergeBoardWithPiece(board, piece) {
  const grid = board.map((row) => row.slice());
  if (!piece) return grid;
  piece.cells.forEach((rowArr, r) => {
    rowArr.forEach((val, c) => {
      if (!val) return;
      const boardRow = piece.row + r;
      const boardCol = piece.col + c;
      if (boardRow >= 0 && boardRow < ROWS && boardCol >= 0 && boardCol < COLS) {
        grid[boardRow][boardCol] = piece.color;
      }
    });
  });
  return grid;
}
