import {
  createEmptyBoard,
  randomShapeName,
  spawnPiece,
  mergeBoardWithPiece,
  collides,
  lockPieceIntoBoard,
  clearLines,
  scoreForLines,
  levelForLines,
  dropIntervalForLevel,
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
      this.startGame();
      return;
    }
  }

  async webSocketClose(ws, code, reason, wasClean) {
    // Broadcast the updated roster (with this socket excluded) before
    // actually closing it - broadcasting after close() would try to send()
    // to this same socket and throw, silently killing the whole broadcast
    // so nobody's list would update.
    this.broadcastPlayers(ws);
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
  startGame() {
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
    this.scheduleAlarm();
  }

  async scheduleAlarm() {
    await this.ctx.storage.setAlarm(Date.now() + BASE_TICK_MS);
  }

  // Runs once per BASE_TICK_MS while the room has any active player -
  // scheduled by scheduleAlarm() rather than setInterval/setTimeout, so the
  // Durable Object can fully sleep between ticks instead of being kept
  // artificially alive.
  async alarm() {
    let anyPlaying = false;

    for (const player of this.players.values()) {
      if (player.status !== 'playing') continue;
      anyPlaying = true;

      player.msUntilDrop -= BASE_TICK_MS;
      if (player.msUntilDrop > 0) continue;

      player.msUntilDrop = player.dropIntervalMs;
      this.dropPlayerPiece(player);
    }

    this.broadcastState();

    if (anyPlaying) {
      await this.scheduleAlarm();
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
      const you = {
        grid: mergeBoardWithPiece(player.board, player.current),
        score: player.score,
        level: player.level,
        lines: player.linesCleared,
        nextName: player.nextName,
        status: player.status,
      };
      const opponents = [...this.players.values()]
        .filter((other) => other.playerId !== player.playerId)
        .map((other) => ({
          playerId: other.playerId,
          name: other.name,
          score: other.score,
          status: other.status,
        }));

      const message = JSON.stringify({ type: 'state', payload: { you, opponents } });
      try {
        player.socket.send(message);
      } catch (err) {
        // Ignore - handled by webSocketClose when the runtime notices.
      }
    }
  }
}
