import {
  createEmptyBoard,
  randomShapeName,
  spawnPiece,
  mergeBoardWithPiece,
  collides,
  rotateMatrix,
  lockPieceIntoBoard,
  clearLines,
  scoreForLines,
  levelForLines,
  dropIntervalForLevel,
  getShape,
} from './tetris-engine.js';

// The Alarms API only lets a Durable Object have one pending alarm at a
// time, but each player has their own independent fall speed (faster at
// higher levels). Rather than one alarm per player, the room wakes up on
// this fixed, fast cadence and only actually drops a given player's piece
// once their own per-player countdown (msUntilDrop) reaches zero - so
// everyone still falls at their own correct speed off a single alarm.
const BASE_TICK_MS = 100;

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.requestCount = 0;
    this.gameState = 'lobby'; // 'lobby' | 'playing' | 'results'
    this.players = new Map(); // playerId -> player state, populated by startGame()

    // blockConcurrencyWhile makes every fetch/webSocketMessage/alarm call
    // wait for this to finish before running, so the Durable Object never
    // handles a request against half-loaded state after waking back up
    // from hibernation (or a redeploy) mid-round.
    this.ctx.blockConcurrencyWhile(async () => {
      await this.loadState();
    });
  }

  // Reloads gameState/players from this Durable Object's own SQLite-backed
  // storage (see the "new_sqlite_classes" migration in wrangler.jsonc).
  // Hibernatable WebSockets (ctx.acceptWebSocket) survive the Durable
  // Object itself being evicted from memory, so ctx.getWebSockets() here
  // still returns the same live connections with their playerId
  // attachments intact - used to re-link each restored player record back
  // to its actual socket.
  async loadState() {
    const stored = await this.ctx.storage.get('gameState');
    if (!stored) return;

    this.gameState = stored.gameState;

    const socketByPlayerId = new Map();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment();
      if (attachment && attachment.playerId) {
        socketByPlayerId.set(attachment.playerId, socket);
      }
    }

    for (const playerData of stored.players) {
      this.players.set(playerData.playerId, {
        ...playerData,
        socket: socketByPlayerId.get(playerData.playerId) || null,
      });
    }
  }

  async persistState() {
    if (this.gameState === 'lobby') {
      await this.ctx.storage.delete('gameState');
      return;
    }
    const players = [...this.players.values()].map(({ socket, ...rest }) => rest);
    await this.ctx.storage.put('gameState', { gameState: this.gameState, players });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/room\/([A-Za-z0-9]+)/);
    const roomCode = match ? match[1] : 'unknown';

    if (request.headers.get('Upgrade') === 'websocket') {
      console.log(`Room ${roomCode}: accepting WebSocket connection`);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // ctx.acceptWebSocket (not server.accept()) is required so this
      // connection survives the Durable Object hibernating between
      // messages - the runtime can wake the object back up and still
      // deliver webSocketMessage/webSocketClose events to it.
      this.ctx.acceptWebSocket(server);

      return new Response(null, { status: 101, webSocket: client });
    }

    this.requestCount += 1;
    console.log(`Room ${roomCode} received request #${this.requestCount}`);

    // Plain page load: serve the SPA shell through this room's own Durable
    // Object instance. The per-instance requestCount below (exposed via the
    // x-room-request-count header) proves two different room codes get two
    // separate, isolated instances: hitting the same code again increments
    // its own counter independently of any other room's counter.
    const assetResponse = await this.env.ASSETS.fetch(request);
    const headers = new Headers(assetResponse.headers);
    headers.set('x-room-request-count', String(this.requestCount));
    return new Response(assetResponse.body, {
      status: assetResponse.status,
      headers,
    });
  }

  async webSocketMessage(ws, message) {
    let data;
    try {
      data = JSON.parse(message);
    } catch (err) {
      return; // ignore malformed messages
    }

    if (data.type === 'join' && data.payload && typeof data.payload.name === 'string') {
      // Remembering which display name belongs to which connection has to
      // survive this Durable Object hibernating (going fully idle) between
      // messages, so it's stored directly on the socket via
      // serializeAttachment() rather than in a plain instance field.
      ws.serializeAttachment({ name: data.payload.name });
      this.broadcastPlayers();
      return;
    }

    if (data.type === 'start') {
      await this.startGame();
      return;
    }

    if (data.type === 'input' && data.payload && typeof data.payload.action === 'string') {
      await this.handleInput(ws, data.payload.action);
      return;
    }

    if (data.type === 'playAgain') {
      await this.resetToLobby();
      return;
    }
  }

  // Any connected player can trigger a rematch, same as Start Game - no
  // special "host" role exists in this project (see ProductSpec's scope).
  async resetToLobby() {
    if (this.gameState !== 'results') return;

    this.gameState = 'lobby';
    this.players = new Map();
    await this.persistState(); // gameState is 'lobby', so this clears stored round state

    const message = JSON.stringify({ type: 'lobby' });
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
      } catch (err) {
        // Ignore - socket already gone.
      }
    }

    // Re-broadcast the roster from each still-connected socket's name
    // attachment (untouched by the round that just ended), so the lobby
    // shows exactly who's still here.
    this.broadcastPlayers();
  }

  async handleInput(ws, action) {
    const attachment = ws.deserializeAttachment();
    const player = attachment && attachment.playerId ? this.players.get(attachment.playerId) : null;
    // The server, not the browser, decides whether a move is legal - a
    // disconnected/topped-out player's stale socket can't act, and an
    // unrecognized action is simply ignored rather than trusted blindly.
    if (!player || player.status !== 'playing') return;

    switch (action) {
      case 'moveLeft':
        this.movePiece(player, 0, -1);
        break;
      case 'moveRight':
        this.movePiece(player, 0, 1);
        break;
      case 'softDrop':
        this.movePiece(player, 1, 0);
        break;
      case 'rotate':
        this.rotatePiece(player);
        break;
      case 'hardDrop':
        this.hardDropPiece(player);
        break;
      default:
        return;
    }

    await this.checkForGameEnd();
    if (this.gameState === 'playing') {
      this.broadcastState();
    }
    await this.persistState();
  }

  movePiece(player, dRow, dCol) {
    const newRow = player.current.row + dRow;
    const newCol = player.current.col + dCol;
    if (collides(player.board, player.current.cells, newRow, newCol)) return false;
    player.current.row = newRow;
    player.current.col = newCol;
    return true;
  }

  rotatePiece(player) {
    if (player.current.name === 'O') return;
    const rotated = rotateMatrix(player.current.cells);
    if (!collides(player.board, rotated, player.current.row, player.current.col)) {
      player.current.cells = rotated;
    }
  }

  hardDropPiece(player) {
    while (this.movePiece(player, 1, 0)) {
      /* keep dropping until blocked */
    }
    // dropPlayerPiece re-checks collision one row down, finds it now
    // blocked, and locks immediately - reusing the exact same
    // lock/clear-lines/spawn-next/game-over logic the gravity tick uses.
    this.dropPlayerPiece(player);
  }

  async webSocketClose(ws, code, reason, wasClean) {
    if (this.gameState === 'lobby') {
      // Broadcast the updated roster (with this socket excluded) before
      // actually closing it - broadcasting after close() would try to
      // send() to this same socket and throw, silently killing the whole
      // broadcast so nobody's list would update.
      this.broadcastPlayers(ws);
      ws.close(code, reason);
      return;
    }

    // Mid-round: the player isn't removed, just marked disconnected, so
    // their last board state stays visible to everyone else and the round
    // continues uninterrupted for whoever's left. Because broadcastState()
    // only sends to a player whose own status is still 'playing', marking
    // this one 'disconnected' first means it naturally never tries to
    // send() to this now-closing socket.
    const attachment = ws.deserializeAttachment();
    const player = attachment && attachment.playerId ? this.players.get(attachment.playerId) : null;
    if (player && player.status === 'playing') {
      player.status = 'disconnected';
      await this.checkForGameEnd();
      if (this.gameState === 'playing') {
        this.broadcastState();
      }
      await this.persistState();
    }
    ws.close(code, reason);
  }

  broadcastPlayers(excludeSocket = null) {
    const sockets = this.ctx.getWebSockets().filter((socket) => socket !== excludeSocket);
    const names = sockets
      .map((socket) => socket.deserializeAttachment())
      .filter((attachment) => attachment && attachment.name)
      .map((attachment) => attachment.name);

    const message = JSON.stringify({ type: 'players', payload: { names } });
    for (const socket of sockets) {
      try {
        socket.send(message);
      } catch (err) {
        // Socket is already closing/closed - ignore, it'll drop out of
        // ctx.getWebSockets() on the next call.
      }
    }
  }

  // Task 3.1: give every currently-connected, named player their own
  // initialized board and first piece, tracked here in the Durable Object
  // (not trusted from the browser). Tick loop (3.2), input handling (3.3),
  // and state broadcast (3.4) build on top of this.
  async startGame() {
    if (this.gameState === 'playing') return;

    this.gameState = 'playing';
    this.players = new Map();

    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment();
      if (!attachment || !attachment.name) continue;

      const playerId = crypto.randomUUID();
      socket.serializeAttachment({ name: attachment.name, playerId });

      this.players.set(playerId, {
        playerId,
        name: attachment.name,
        socket,
        board: createEmptyBoard(),
        current: spawnPiece(randomShapeName()),
        nextName: randomShapeName(),
        score: 0,
        level: 1,
        linesCleared: 0,
        dropIntervalMs: 800,
        msUntilDrop: 800,
        status: 'playing',
      });
    }

    const startMessage = JSON.stringify({ type: 'start' });
    for (const player of this.players.values()) {
      try {
        player.socket.send(startMessage);
      } catch (err) {
        // Ignore - a player whose send fails here will show up as
        // disconnected once webSocketClose fires.
      }
    }

    this.broadcastState();
    await this.persistState();
    await this.scheduleAlarm();
  }

  async scheduleAlarm() {
    await this.ctx.storage.setAlarm(Date.now() + BASE_TICK_MS);
  }

  // Runs once per BASE_TICK_MS while the room has any active player -
  // scheduled by scheduleAlarm() rather than setInterval/setTimeout, so the
  // Durable Object can fully sleep between ticks instead of being kept
  // artificially alive.
  async alarm() {
    for (const player of this.players.values()) {
      if (player.status !== 'playing') continue;

      player.msUntilDrop -= BASE_TICK_MS;
      if (player.msUntilDrop > 0) continue;

      player.msUntilDrop = player.dropIntervalMs;
      this.dropPlayerPiece(player);
    }

    await this.checkForGameEnd();

    // checkForGameEnd() moves gameState to 'results' once the round is
    // over; while still 'playing' there must be more than one active
    // player left (otherwise it would have already ended it), so it's
    // always correct to keep ticking in that case.
    if (this.gameState === 'playing') {
      this.broadcastState();
      await this.persistState();
      await this.scheduleAlarm();
    } else {
      await this.persistState();
    }
  }

  // Ends the round once at most one player is still actively playing
  // (everyone else has topped out or disconnected) - "the last remaining
  // player wins," or if literally everyone has topped out, nobody does.
  async checkForGameEnd() {
    if (this.gameState !== 'playing') return;

    const activePlayers = [...this.players.values()].filter((p) => p.status === 'playing');
    const threshold = this.players.size >= 2 ? 1 : 0;
    if (activePlayers.length > threshold) return;

    this.gameState = 'results';
    await this.ctx.storage.deleteAlarm();

    const rankings = [...this.players.values()]
      .map((p) => ({ name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score);

    const message = JSON.stringify({ type: 'results', payload: { rankings } });
    for (const player of this.players.values()) {
      if (!player.socket) continue;
      try {
        player.socket.send(message);
      } catch (err) {
        // Ignore - nothing to notify, this player is already gone.
      }
    }
  }

  // Moves a player's current piece down one row if possible, or locks it,
  // clears any completed lines, updates score/level/speed, and spawns the
  // next piece - ending that player's game if the new piece has nowhere to
  // spawn.
  dropPlayerPiece(player) {
    if (!collides(player.board, player.current.cells, player.current.row + 1, player.current.col)) {
      player.current.row += 1;
      return;
    }

    lockPieceIntoBoard(player.board, player.current);

    const cleared = clearLines(player.board);
    if (cleared > 0) {
      player.score += scoreForLines(cleared, player.level);
      player.linesCleared += cleared;
      const newLevel = levelForLines(player.linesCleared);
      if (newLevel !== player.level) {
        player.level = newLevel;
        player.dropIntervalMs = dropIntervalForLevel(player.level);
      }
    }

    const nextPiece = spawnPiece(player.nextName);
    player.nextName = randomShapeName();
    player.current = nextPiece;
    player.msUntilDrop = player.dropIntervalMs;

    if (collides(player.board, player.current.cells, player.current.row, player.current.col)) {
      player.status = 'topped-out';
    }
  }

  // Sends each player their own full board (with their current piece
  // overlaid) plus everyone else's. Full opponent detail arrives in 3.4/3.5
  // - for now this proves per-player state is correctly initialized and
  // reaches the browser.
  broadcastState() {
    for (const player of this.players.values()) {
      const nextShape = getShape(player.nextName);
      const you = {
        grid: mergeBoardWithPiece(player.board, player.current),
        score: player.score,
        level: player.level,
        lines: player.linesCleared,
        next: { cells: nextShape.cells, color: nextShape.color },
        status: player.status,
      };
      const opponents = [...this.players.values()]
        .filter((other) => other.playerId !== player.playerId)
        .map((other) => ({
          playerId: other.playerId,
          name: other.name,
          // A merged grid (locked blocks + current piece) is all a
          // thumbnail needs to draw - the recipient doesn't need to know
          // this opponent's separate piece position/shape/next-piece.
          grid: mergeBoardWithPiece(other.board, other.current),
          score: other.score,
          status: other.status,
        }));

      // No live connection to send to: either reloaded from storage and
      // not yet re-linked to a live socket, or this player has
      // disconnected - either way there's nobody there to receive it, and
      // retrying every tick forever would be pure waste.
      if (!player.socket || player.status === 'disconnected') continue;

      const message = JSON.stringify({ type: 'state', payload: { you, opponents } });
      try {
        player.socket.send(message);
      } catch (err) {
        // Ignore - handled by webSocketClose when the runtime notices.
      }
    }
  }
}
