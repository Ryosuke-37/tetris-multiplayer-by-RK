import { Room } from './room.js';

export { Room };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const roomMatch = url.pathname.match(/^\/room\/([A-Za-z0-9]+)$/);

    if (roomMatch) {
      const roomCode = roomMatch[1].toUpperCase();
      const room = env.ROOM.getByName(roomCode);
      return room.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
