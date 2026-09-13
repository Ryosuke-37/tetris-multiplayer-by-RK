export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.requestCount = 0;
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
}
