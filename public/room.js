(function connectToRoomIfOnRoomPage() {
  const match = window.location.pathname.match(/^\/room\/([A-Za-z0-9]+)$/);
  if (!match) return; // We're on the home screen, not a room page - nothing to do yet.

  const roomCode = match[1];

  document.getElementById('home-screen').hidden = true;
  const lobbyScreen = document.getElementById('lobby-screen');
  lobbyScreen.hidden = false;

  const roomCodeEl = document.getElementById('lobby-room-code');
  const playerListEl = document.getElementById('player-list');
  const startBtn = document.getElementById('start-game-btn');
  const copyBtn = document.getElementById('copy-code-btn');
  const copyFeedback = document.getElementById('copy-feedback');

  roomCodeEl.textContent = roomCode;

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      copyFeedback.hidden = false;
      setTimeout(() => {
        copyFeedback.hidden = true;
      }, 2000);
    } catch (err) {
      console.error('Could not copy room code', err);
    }
  });

  function renderPlayers(names) {
    playerListEl.innerHTML = '';
    names.forEach((name) => {
      const li = document.createElement('li');
      li.textContent = name;
      playerListEl.appendChild(li);
    });
    startBtn.disabled = names.length < 2;
  }

  startBtn.addEventListener('click', () => {
    socket.send(JSON.stringify({ type: 'start' }));
  });

  // ---- Game screen (built here rather than in index.html, same as the
  // lobby's other client-only pieces - it only ever needs to exist once a
  // round actually starts). ----

  const MY_CELL = 30;
  const OPP_CELL = 10;

  let gameScreen = null;
  let myBoardCtx = null;
  let myNextCtx = null;
  const opponentEls = new Map(); // playerId -> { card, canvas, ctx, nameEl, scoreEl }

  function buildGameScreen() {
    const screen = document.createElement('main');
    screen.id = 'game-screen';
    screen.className = 'game-screen';
    screen.hidden = true;
    screen.innerHTML = `
      <h1 class="title">Tetris Multiplayer</h1>
      <div class="game-layout">
        <div class="board-area">
          <canvas id="my-board" width="300" height="600"></canvas>
        </div>
        <div class="side-panel">
          <section class="panel next-panel">
            <h2>Next</h2>
            <canvas id="my-next" width="90" height="90"></canvas>
          </section>
          <section class="panel score-panel">
            <p>Score<br /><span id="my-score">0</span></p>
            <p>Level<br /><span id="my-level">1</span></p>
            <p>Lines<br /><span id="my-lines">0</span></p>
          </section>
        </div>
      </div>
      <div id="opponents-container" class="opponents-container"></div>
    `;
    document.body.appendChild(screen);
    myBoardCtx = screen.querySelector('#my-board').getContext('2d');
    myNextCtx = screen.querySelector('#my-next').getContext('2d');
    return screen;
  }

  function showGameScreen() {
    if (!gameScreen) gameScreen = buildGameScreen();
    lobbyScreen.hidden = true;
    gameScreen.hidden = false;
  }

  function drawGrid(ctx, grid, cellSize) {
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    grid.forEach((row, r) => {
      row.forEach((color, c) => {
        if (!color) return;
        ctx.fillStyle = color;
        ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        if (cellSize >= 16) {
          ctx.strokeStyle = '#1f2937';
          ctx.strokeRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
      });
    });
  }

  function drawNext(next) {
    myNextCtx.fillStyle = '#111827';
    myNextCtx.fillRect(0, 0, myNextCtx.canvas.width, myNextCtx.canvas.height);
    const size = 20;
    const offsetX = (myNextCtx.canvas.width - next.cells[0].length * size) / 2;
    const offsetY = (myNextCtx.canvas.height - next.cells.length * size) / 2;
    next.cells.forEach((row, r) => {
      row.forEach((val, c) => {
        if (!val) return;
        myNextCtx.fillStyle = next.color;
        myNextCtx.fillRect(offsetX + c * size, offsetY + r * size, size, size);
        myNextCtx.strokeStyle = '#1f2937';
        myNextCtx.strokeRect(offsetX + c * size, offsetY + r * size, size, size);
      });
    });
  }

  function renderYou(you) {
    drawGrid(myBoardCtx, you.grid, MY_CELL);
    document.getElementById('my-score').textContent = you.score;
    document.getElementById('my-level').textContent = you.level;
    document.getElementById('my-lines').textContent = you.lines;
    drawNext(you.next);
  }

  function getOrCreateOpponentCard(playerId) {
    let entry = opponentEls.get(playerId);
    if (entry) return entry;

    const container = document.getElementById('opponents-container');
    const card = document.createElement('div');
    card.className = 'opponent-card';
    card.innerHTML = `
      <p class="opponent-name"></p>
      <canvas width="100" height="200"></canvas>
      <p class="opponent-score"></p>
      <div class="opponent-status-badge" hidden></div>
    `;
    container.appendChild(card);

    entry = {
      card,
      nameEl: card.querySelector('.opponent-name'),
      canvas: card.querySelector('canvas'),
      scoreEl: card.querySelector('.opponent-score'),
      badgeEl: card.querySelector('.opponent-status-badge'),
    };
    entry.ctx = entry.canvas.getContext('2d');
    opponentEls.set(playerId, entry);
    return entry;
  }

  const OPPONENT_STATUS_LABELS = {
    disconnected: 'Disconnected',
    'topped-out': 'Game Over',
  };

  function renderOpponents(opponents) {
    const seen = new Set();
    opponents.forEach((opp) => {
      seen.add(opp.playerId);
      const entry = getOrCreateOpponentCard(opp.playerId);
      entry.nameEl.textContent = opp.name;
      entry.scoreEl.textContent = `Score: ${opp.score}`;
      drawGrid(entry.ctx, opp.grid, OPP_CELL);

      const label = OPPONENT_STATUS_LABELS[opp.status];
      entry.badgeEl.textContent = label || '';
      entry.badgeEl.hidden = !label;
    });

    // Clean up a card for a player no longer in the list (shouldn't
    // normally happen mid-round, but keeps this correct either way).
    for (const [playerId, entry] of opponentEls) {
      if (!seen.has(playerId)) {
        entry.card.remove();
        opponentEls.delete(playerId);
      }
    }
  }

  let resultsOverlay = null;

  function buildResultsOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'results-overlay';
    overlay.className = 'overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="overlay-content">
        <h2>Results</h2>
        <ol id="results-list" class="results-list"></ol>
        <button id="play-again-btn" class="primary-btn">Play Again</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#play-again-btn').addEventListener('click', () => {
      socket.send(JSON.stringify({ type: 'playAgain' }));
    });
    return overlay;
  }

  function showResults(rankings) {
    if (!resultsOverlay) resultsOverlay = buildResultsOverlay();
    const list = resultsOverlay.querySelector('#results-list');
    list.innerHTML = '';
    rankings.forEach((entry) => {
      const li = document.createElement('li');
      const nameSpan = document.createElement('span');
      nameSpan.textContent = entry.name; // textContent, not innerHTML - display names are untrusted user input
      const scoreSpan = document.createElement('span');
      scoreSpan.textContent = entry.score;
      li.appendChild(nameSpan);
      li.appendChild(scoreSpan);
      list.appendChild(li);
    });
    resultsOverlay.hidden = false;
    gameStarted = false;
  }

  let gameStarted = false;
  const INPUT_ACTIONS = {
    ArrowLeft: 'moveLeft',
    ArrowRight: 'moveRight',
    ArrowDown: 'softDrop',
    ArrowUp: 'rotate',
    ' ': 'hardDrop',
  };

  document.addEventListener('keydown', (event) => {
    if (!gameStarted) return;
    const action = INPUT_ACTIONS[event.key];
    if (!action) return;
    event.preventDefault();
    socket.send(JSON.stringify({ type: 'input', payload: { action } }));
  });

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/room/${roomCode}`);

  socket.addEventListener('open', () => {
    console.log(`Connected to room ${roomCode}`);
    const name = sessionStorage.getItem('displayName') || 'Player';
    socket.send(JSON.stringify({ type: 'join', payload: { name } }));
  });

  socket.addEventListener('close', () => {
    console.log(`Disconnected from room ${roomCode}`);
  });

  socket.addEventListener('error', (event) => {
    console.error('Room WebSocket error', event);
  });

  socket.addEventListener('message', (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (err) {
      return;
    }

    if (data.type === 'players') {
      renderPlayers(data.payload.names);
    }

    if (data.type === 'start') {
      console.log('Game started');
      gameStarted = true;
      window.__gameStarted = true;
      showGameScreen();
    }

    if (data.type === 'state') {
      window.__gameState = data.payload; // kept for test/debug inspection
      if (!gameStarted) return;
      renderYou(data.payload.you);
      renderOpponents(data.payload.opponents);
    }

    if (data.type === 'results') {
      window.__results = data.payload.rankings; // kept for test/debug inspection
      showResults(data.payload.rankings);
    }
  });
})();
