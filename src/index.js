import { Room } from './room.js';

export { Room };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Temporary verification route for Task 2.2 - confirms the Durable
    // Object is reachable via env.ROOM.getByName(). Task 2.3 replaces this
    // with the real /room/:code routing used by the game.
    const testMatch = url.pathname.match(/^\/__do-test\/([A-Za-z0-9]+)$/);
    if (testMatch) {
      const room = env.ROOM.getByName(testMatch[1].toUpperCase());
      return room.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
