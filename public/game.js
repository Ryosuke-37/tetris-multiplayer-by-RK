const COLS = 10;
const ROWS = 20;
const CELL = 30;

const boardCanvas = document.getElementById('board');
const boardCtx = boardCanvas.getContext('2d');

let board = createEmptyBoard();

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
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

drawBoard();
