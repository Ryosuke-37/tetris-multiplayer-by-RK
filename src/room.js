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
    // Player identity and message handling arrive in Tasks 2.5+.
  }

  async webSocketClose(ws, code, reason, wasClean) {
    ws.close(code, reason);
  }
}
