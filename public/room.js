(function connectToRoomIfOnRoomPage() {
  const match = window.location.pathname.match(/^\/room\/([A-Za-z0-9]+)$/);
  if (!match) return; // We're on the home screen, not a room page - nothing to do yet.

  const roomCode = match[1];
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
      console.log('Players in room:', data.payload.names);
      // Exposed for now so the connection/broadcast logic can be tested
      // independently; Task 2.6 replaces this with the real lobby UI.
      window.__roomPlayers = data.payload.names;
    }
  });
})();
