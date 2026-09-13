export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    return new Response('Room Durable Object placeholder\n', {
      headers: { 'content-type': 'text/plain' },
    });
  }
}
