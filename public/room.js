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
  });
})();
