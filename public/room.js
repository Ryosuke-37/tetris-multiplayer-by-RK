(function connectToRoomIfOnRoomPage() {
  const match = window.location.pathname.match(/^\/room\/([A-Za-z0-9]+)$/);
  if (!match) return; // We're on the home screen, not a room page - nothing to do yet.

  const roomCode = match[1];
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/room/${roomCode}`);

  socket.addEventListener('open', () => {
    console.log(`Connected to room ${roomCode}`);
  });

  socket.addEventListener('close', () => {
    console.log(`Disconnected from room ${roomCode}`);
  });

  socket.addEventListener('error', (event) => {
    console.error('Room WebSocket error', event);
  });
})();
