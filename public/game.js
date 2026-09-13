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

const boardCanvas = document.getElementById('board');
const boardCtx = boardCanvas.getContext('2d');

let board = createEmptyBoard();
let current = spawnPiece(randomShapeName());

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

render();
