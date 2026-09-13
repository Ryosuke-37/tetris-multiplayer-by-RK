export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.requestCount = 0;
  }

  async fetch(request) {
    this.requestCount += 1;

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/room\/([A-Za-z0-9]+)/);
    const roomCode = match ? match[1] : 'unknown';
    console.log(`Room ${roomCode} received request #${this.requestCount}`);

    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
      // WebSocket handling arrives in Task 2.4.
      return new Response('WebSocket upgrade not yet implemented', { status: 501 });
    }

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
}
