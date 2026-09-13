const COLS = 10;
const ROWS = 20;
const CELL = 30;

const SHAPES = {
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

const LINE_SCORES = { 1: 100, 2: 300, 3: 500, 4: 800 };
const LINES_PER_LEVEL = 10;

const boardCanvas = document.getElementById('board');
const boardCtx = boardCanvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const overlay = document.getElementById('game-over-overlay');
const finalScoreEl = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');

let board;
let current;
let nextName;
let score;
let level;
let linesCleared;
let dropInterval;
let dropTimer = null;
let gameOver;

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function randomShapeName() {
  return SHAPE_NAMES[Math.floor(Math.random() * SHAPE_NAMES.length)];
}

function spawnPiece(name) {
  const shape = SHAPES[name];
  const cells = shape.cells.map((row) => row.slice());
  const col = Math.floor((COLS - cells[0].length) / 2);
  return { name, cells, color: shape.color, row: 0, col };
}

function getNextPieceAndQueue() {
  const name = nextName;
  nextName = randomShapeName();
  drawNextPreview();
  return spawnPiece(name);
}

function drawNextPreview() {
  nextCtx.fillStyle = '#111827';
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = SHAPES[nextName];
  const size = 24;
  const offsetX = (nextCanvas.width - shape.cells[0].length * size) / 2;
  const offsetY = (nextCanvas.height - shape.cells.length * size) / 2;
  shape.cells.forEach((rowArr, r) => {
    rowArr.forEach((val, c) => {
      if (!val) return;
      nextCtx.fillStyle = shape.color;
      nextCtx.fillRect(offsetX + c * size, offsetY + r * size, size, size);
      nextCtx.strokeStyle = '#1f2937';
      nextCtx.strokeRect(offsetX + c * size, offsetY + r * size, size, size);
    });
  });
}

function drawCell(ctx, col, row, color) {
  ctx.fillStyle = color;
  ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
  ctx.strokeStyle = '#1f2937';
  ctx.strokeRect(col * CELL, row * CELL, CELL, CELL);
}

function drawBoard() {
  boardCtx.fillStyle = '#111827';
  boardCtx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (board[row][col]) {
        drawCell(boardCtx, col, row, board[row][col]);
      }
    }
  }
}

function drawPiece(ctx, piece) {
  piece.cells.forEach((rowArr, r) => {
    rowArr.forEach((val, c) => {
      if (val) drawCell(ctx, piece.col + c, piece.row + r, piece.color);
    });
  });
}

function render() {
  drawBoard();
  drawPiece(boardCtx, current);
}

function collides(cells, row, col) {
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

function move(dRow, dCol) {
  if (gameOver) return false;
  const newRow = current.row + dRow;
  const newCol = current.col + dCol;
  if (collides(current.cells, newRow, newCol)) return false;
  current.row = newRow;
  current.col = newCol;
  render();
  return true;
}

function rotateMatrix(cells) {
  const size = cells.length;
  const rotated = Array.from({ length: size }, () => Array(size).fill(0));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      rotated[c][size - 1 - r] = cells[r][c];
    }
  }
  return rotated;
}

function rotate() {
  if (gameOver || current.name === 'O') return;
  const rotated = rotateMatrix(current.cells);
  if (!collides(rotated, current.row, current.col)) {
    current.cells = rotated;
    render();
  }
}

function lockPiece() {
  current.cells.forEach((rowArr, r) => {
    rowArr.forEach((val, c) => {
      if (val) {
        const boardRow = current.row + r;
        const boardCol = current.col + c;
        if (boardRow >= 0) board[boardRow][boardCol] = current.color;
      }
    });
  });

  clearLines();

  current = getNextPieceAndQueue();
  if (collides(current.cells, current.row, current.col)) {
    endGame();
    return;
  }
  render();
}

function clearLines() {
  let cleared = 0;
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row].every((cell) => cell)) {
      board.splice(row, 1);
      board.unshift(Array(COLS).fill(0));
      cleared++;
      row++;
    }
  }
  if (cleared === 0) return;

  score += (LINE_SCORES[cleared] || 0) * level;
  linesCleared += cleared;
  scoreEl.textContent = score;
  linesEl.textContent = linesCleared;

  const newLevel = Math.floor(linesCleared / LINES_PER_LEVEL) + 1;
  if (newLevel !== level) {
    level = newLevel;
    levelEl.textContent = level;
    dropInterval = Math.max(100, 800 - (level - 1) * 70);
    startGravity();
  }
}

function hardDrop() {
  if (gameOver) return;
  while (move(1, 0)) {
    /* keep dropping until blocked */
  }
  lockPiece();
}

// A plain browser timer is fine here: this is a client-side, single-player
// prototype. The project's "no setInterval/setTimeout" rule applies to the
// server-side Durable Object tick loop added in Phase 3, to avoid keeping a
// server process alive - a timer in the player's own tab costs nothing there.
function startGravity() {
  stopGravity();
  dropTimer = setInterval(() => {
    if (!move(1, 0)) {
      lockPiece();
    }
  }, dropInterval);
}

function stopGravity() {
  if (dropTimer) clearInterval(dropTimer);
  dropTimer = null;
}

function endGame() {
  gameOver = true;
  stopGravity();
  finalScoreEl.textContent = score;
  overlay.hidden = false;
}

function resetGame() {
  board = createEmptyBoard();
  score = 0;
  level = 1;
  linesCleared = 0;
  dropInterval = 800;
  gameOver = false;

  scoreEl.textContent = score;
  levelEl.textContent = level;
  linesEl.textContent = linesCleared;
  overlay.hidden = true;

  nextName = randomShapeName();
  current = getNextPieceAndQueue();

  render();
  startGravity();
}

document.addEventListener('keydown', (event) => {
  if (gameOver) return;
  switch (event.key) {
    case 'ArrowLeft':
      move(0, -1);
      break;
    case 'ArrowRight':
      move(0, 1);
      break;
    case 'ArrowDown':
      move(1, 0);
      break;
    case 'ArrowUp':
      rotate();
      break;
    case ' ':
      event.preventDefault();
      hardDrop();
      break;
    default:
      break;
  }
});

restartBtn.addEventListener('click', resetGame);

resetGame();
