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

const boardCanvas = document.getElementById('board');
const boardCtx = boardCanvas.getContext('2d');
const scoreEl = document.getElementById('score');

let board = createEmptyBoard();
let current = spawnPiece(randomShapeName());
let score = 0;

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
  if (current.name === 'O') return;
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

  current = spawnPiece(randomShapeName());
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

  score += LINE_SCORES[cleared] || 0;
  scoreEl.textContent = score;
}

function hardDrop() {
  while (move(1, 0)) {
    /* keep dropping until blocked */
  }
  lockPiece();
}

// A plain browser timer is fine here: this is a client-side, single-player
// prototype. The project's "no setInterval/setTimeout" rule applies to the
// server-side Durable Object tick loop added in Phase 3, to avoid keeping a
// server process alive - a timer in the player's own tab costs nothing there.
let dropInterval = 800;
let dropTimer = null;

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

document.addEventListener('keydown', (event) => {
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

render();
startGravity();
