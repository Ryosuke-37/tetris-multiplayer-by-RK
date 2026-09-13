# Feature Roadmap / Workplan

This is the full build plan, broken into small tasks you can approve one at a
time. Each task is a checkbox. When a task is finished, its checkbox gets
checked (`[x]`) in a commit dedicated to that task, so **this file itself is
the live progress tracker** — anyone (including a future session with no
memory of this conversation) can open this file, see what's done, and know
exactly what to do next. That's what "resumable and pausable" means here:
work can stop after any single checked-off task and pick back up later
without re-reading the whole project.

**How to use this file:** tell me the ID of the task you want done next (e.g.
"do 1.3"). I will not start building until you pick one. After each task, I
commit with a message naming the task, push, and open/update a pull request,
then wait for your next instruction — I don't chain tasks together on my own
unless you ask me to.

**Ordering rule this plan follows:** every task in Phase 0 and Phase 1 must
be complete — meaning a **working single-player game is deployed and
reachable on the public internet** — before any task in Phase 2 or later
(multiplayer) begins. This is intentional: it proves the Cloudflare
deployment pipeline and the core game rules work before we add the harder
networking layer on top.

**Design note:** no Figma file exists for this project yet (see
`ProductSpec.md`, Section 1). Tasks below describe standard Tetris UI
patterns. If a Figma file is provided later, we'll insert a task to
reconcile the built UI against it, and flag anything in the design that
isn't buildable under our technical constraints rather than silently
changing it.

---

## Phase 0 — Project setup & deployment pipeline

Goal: an empty-but-real Cloudflare Worker is live on the internet, proving
the deploy process works before any game logic exists.

### 0.1 — Initialize the project structure
- [x] **Dependencies:** none
- **Files:** `package.json`, `.gitignore`, `wrangler.jsonc`, `public/index.html` (placeholder), `src/index.js` (placeholder Worker)
- **What it does:** Creates the folder layout described in `README.md` — a `public/` folder for the static page, a `src/` folder for the Worker/Durable Object code, and the config files Cloudflare needs.
- **Definition of Done:** Folder structure exists; `npm install` runs with no errors; a placeholder page ("Tetris Multiplayer — coming soon") exists in `public/index.html`.

### 0.2 — Configure Cloudflare Workers correctly
- [x] **Dependencies:** 0.1
- **Files:** `wrangler.jsonc`
- **What it does:** Sets up `wrangler.jsonc` (Wrangler's configuration file) per the required constraints: serves `public/` via `"assets"` with `not_found_handling: "single-page-application"` (meaning: any URL that isn't a real file, like a room-code link, still loads the game page instead of showing a 404 error), `compatibility_date` set to today, and `{"observability": {"enabled": true}}` (turns on Cloudflare's built-in logging/metrics so we can see errors after deploying).
- **Definition of Done:** `wrangler.jsonc` contains all four settings above; `npm run dev` serves the placeholder page locally without config errors.

### 0.3 — First live deployment (pipeline smoke test)
- [x] **Dependencies:** 0.2
- **Files:** none (deployment step only), `README.md` (record the live URL once known)
- **What it does:** Runs the actual deploy to Cloudflare's Workers Free plan and confirms the placeholder page loads from a real, public `*.workers.dev` URL.
- **Definition of Done:** The placeholder page is reachable at a public URL from any browser, not just locally. This is the milestone that proves "we can ship."
- **Note:** deployed via Cloudflare's Git integration (Workers Builds) rather than a manual `wrangler deploy`, since this session's network policy blocks outbound access to Cloudflare's own servers. Live at https://tetris-multiplayer-by-rk.rkinoshita.workers.dev, confirmed working by the project owner (this session cannot reach the public internet to verify independently, for the same network-policy reason).

---

## Phase 1 — Single-player Tetris (must go live before multiplayer starts)

Goal: one person, alone, can play a complete, correct game of Tetris in
their browser, and it's deployed live. No room codes, no other players yet.

### 1.1 — Game screen layout & styling shell
- [x] **Dependencies:** 0.3
- **Files:** `public/index.html`, `public/styles.css`
- **What it does:** Builds the static visual structure for the game screen described in `ProductSpec.md` §4.3: the main board area, a "next piece" box, and a score/level display — using plain HTML and CSS (no game logic yet, just empty boxes in the right places).
- **Definition of Done:** Loading the page shows a styled, empty game layout matching the described structure (board area, next-piece box, score area) on both a laptop-sized and phone-sized browser window.

### 1.2 — Board data & rendering
- [x] **Dependencies:** 1.1
- **Files:** `public/game.js` (new)
- **What it does:** Represents the board as a 10-wide × 20-tall grid in JavaScript, and draws it onto the page (an empty grid at first).
- **Definition of Done:** The 10×20 grid renders visibly and correctly-proportioned inside the board area from 1.1.

### 1.3 — Tetromino shapes & spawning
- [x] **Dependencies:** 1.2
- **Files:** `public/game.js`
- **What it does:** Defines all 7 standard tetromino shapes (I, O, T, S, Z, J, L) and the logic to spawn a random one at the top of the board.
- **Definition of Done:** Reloading the page repeatedly shows different random pieces correctly shaped and centered at the top of the board.

### 1.4 — Movement & rotation controls
- [x] **Dependencies:** 1.3
- **Files:** `public/game.js`
- **What it does:** Listens for arrow keys (left/right to slide, down to soft-drop faster, up or a dedicated key to rotate, spacebar to hard-drop instantly to the bottom) and updates the falling piece's position accordingly, without letting it move through walls or already-placed blocks.
- **Definition of Done:** All controls work correctly from the keyboard; a piece cannot be moved or rotated outside the board or into blocks that are already locked in place.

### 1.5 — Gravity tick loop
- [x] **Dependencies:** 1.4
- **Files:** `public/game.js`
- **What it does:** Makes the current piece automatically fall one row on a repeating timer. (Note: for this single-player, browser-only phase, an ordinary JavaScript timer in the browser tab is fine — the "no `setInterval`" rule in this project applies specifically to server-side Durable Object code in Phase 3, to avoid keeping a server process alive; a timer in the player's own browser tab costs nothing on the server.)
- **Definition of Done:** The piece falls automatically at a steady rate without needing any key press.

### 1.6 — Locking & collision detection
- [x] **Dependencies:** 1.5
- **Files:** `public/game.js`
- **What it does:** Detects when a falling piece lands on the floor or on top of other pieces, "locks" it permanently into the board grid, and spawns the next piece.
- **Definition of Done:** Pieces stack correctly on top of each other and on the floor; a new piece spawns automatically after the previous one locks.

### 1.7 — Line clearing & scoring
- [x] **Dependencies:** 1.6
- **Files:** `public/game.js`
- **What it does:** Detects any fully-filled horizontal row, removes it, shifts everything above it down, and awards points (with a bigger bonus for clearing multiple rows at once, per standard Tetris scoring).
- **Definition of Done:** Filling a row makes it visibly disappear with rows above shifting down; the score display updates with the correct point value for 1/2/3/4-line clears.

### 1.8 — Level & speed progression
- [x] **Dependencies:** 1.7
- **Files:** `public/game.js`
- **What it does:** Increases the fall speed as the player clears more lines, and displays the current level.
- **Definition of Done:** The piece visibly falls faster after enough lines are cleared, and the level number on screen increases accordingly.

### 1.9 — Next-piece preview
- [x] **Dependencies:** 1.3
- **Files:** `public/game.js`
- **What it does:** Shows the upcoming piece in the "next piece" box from 1.1, so players can plan ahead.
- **Definition of Done:** The preview box always shows the correct next shape, and it updates the instant the current piece locks.

### 1.10 — Game over & restart
- [x] **Dependencies:** 1.6
- **Files:** `public/game.js`, `public/index.html`
- **What it does:** Detects when a new piece can't spawn because the stack is too high, stops the game, shows a "Game Over" message with the final score, and offers a restart button.
- **Definition of Done:** Deliberately stacking to the top ends the game with the correct message and score; the restart button starts a fresh game.

### 1.11 — Deploy single-player game live ⭐ (multiplayer work cannot begin before this is checked off)
- [x] **Dependencies:** 1.1–1.10
- **Files:** none (deployment step), `README.md` (update live URL if changed)
- **What it does:** Deploys the complete single-player game to Cloudflare and confirms it's fully playable — start to game-over — from the public URL, not just on a local machine.
- **Definition of Done:** A person with no access to this codebase can open the public URL in their own browser and play a full game of Tetris, unassisted, start to finish.
- **Confirmed:** verified live at https://tetris-multiplayer-by-rk.rkinoshita.workers.dev by the project owner (this session cannot reach the public internet to check independently) — board/next-piece/score panel render correctly, controls work, scoring and leveling work, and game over / restart work correctly.

**🎉 Milestone reached: a complete, working single-player Tetris game is live on the public internet. Per this project's ordering rule, Phase 2 (multiplayer) may now begin.**

---

## Phase 2 — Multiplayer room infrastructure (no shared gameplay yet)

Goal: players can create/join a room together and see each other in a
lobby, over a real WebSocket connection, before we wire up live board
syncing.

### 2.1 — Home screen: name entry & create/join room
- [x] **Dependencies:** 1.11
- **Files:** `public/index.html`, `public/styles.css`, `public/home.js` (new)
- **What it does:** Builds the screen from `ProductSpec.md` §4.1 — display name field, "Create Room" button, room code field + "Join Room" button — with basic validation (can't submit blank fields).
- **Definition of Done:** Entering a name and clicking "Create Room" generates a room code and navigates to a lobby URL containing that code (e.g. `/room/ABCD`); typing an existing code and clicking "Join Room" navigates to the same lobby URL.

### 2.2 — Durable Object skeleton & Cloudflare config
- [ ] **Dependencies:** 1.11
- **Files:** `src/room.js` (new — the Durable Object class), `src/index.js`, `wrangler.jsonc`
- **What it does:** Creates the `Room` Durable Object class (currently empty of game logic) and registers it in `wrangler.jsonc`, including the required `"new_sqlite_classes"` entry in the `migrations` array (this tells Cloudflare "this Durable Object type stores its data in the newer SQLite-backed storage," which is what the Alarms-based tick loop in Phase 3 needs).
- **Definition of Done:** The Worker deploys with no configuration errors and a Durable Object can be reached (even with a placeholder response) via `env.ROOM.getByName(roomCode)`.

### 2.3 — Room code generation & request routing
- [ ] **Dependencies:** 2.1, 2.2
- **Files:** `src/index.js`
- **What it does:** Generates short, human-shareable room codes on "Create Room," and routes any request for `/room/:code` (page loads and WebSocket upgrade requests alike) to that room code's specific Durable Object instance.
- **Definition of Done:** Two different room codes reliably route to two different, isolated Durable Object instances (confirmed by, e.g., temporarily logging the room code inside the Durable Object).

### 2.4 — WebSocket connection accepted by the Durable Object
- [ ] **Dependencies:** 2.3
- **Files:** `src/room.js`, `public/room.js` (new — client-side connection code)
- **What it does:** The browser opens a WebSocket to its room's Durable Object; the Durable Object accepts it using `ctx.acceptWebSocket(server)` (the hibernation-safe accept method this project requires, instead of the more common `server.accept()`).
- **Definition of Done:** Opening the lobby page establishes a visibly open WebSocket connection (checkable in the browser's developer tools) that stays connected.

### 2.5 — Player identity & lobby presence
- [ ] **Dependencies:** 2.4
- **Files:** `src/room.js`, `public/room.js`
- **What it does:** When a player connects, the Durable Object stores their display name on that specific connection using `ws.serializeAttachment()`, reads it back with `ws.deserializeAttachment()` when needed, and broadcasts the current list of connected players (as a JSON message, e.g. `{"type": "players", "payload": {"names": [...]}}`) to everyone in the room whenever someone joins or leaves.
- **Definition of Done:** Opening the same room code in two browser tabs with two different names shows both names, live, in both tabs' player lists — and closing one tab removes that name from the other tab's list within a few seconds.

### 2.6 — Lobby screen UI
- [ ] **Dependencies:** 2.5
- **Files:** `public/room.js`, `public/styles.css`, `public/index.html`
- **What it does:** Builds the lobby screen from `ProductSpec.md` §4.2: prominent room code with a copy-code button, live player list from 2.5, and a "Start Game" button (enabled once at least 2 players have joined).
- **Definition of Done:** The lobby visually matches the described layout and the "Start Game" button is disabled/greyed out with fewer than 2 players, enabled with 2+.

---

## Phase 3 — Server-authoritative multiplayer gameplay

Goal: the Durable Object becomes the single source of truth for every
player's board, ticking their pieces down via Alarms (not timers), and
broadcasting everyone's state live, so players actually see each other play.

### 3.1 — Move game state into the Durable Object
- [ ] **Dependencies:** 2.6, 1.11 (reuses the Phase 1 game-rule logic, e.g. collision/line-clear code, moved server-side)
- **Files:** `src/room.js`, `src/tetris-engine.js` (new — shared game-rule logic, adapted from `public/game.js`)
- **What it does:** Gives the Durable Object its own copy of each connected player's board, current piece, next piece, and score — reusing the same rules built in Phase 1, but now running on the server instead of trusting the browser.
- **Definition of Done:** Starting a game creates a correctly-initialized board and first piece for every connected player, tracked inside the Durable Object.

### 3.2 — Alarm-driven tick loop (replaces client-side timer)
- [ ] **Dependencies:** 3.1
- **Files:** `src/room.js`
- **What it does:** Implements the falling-piece tick using Cloudflare's Alarms API: after each tick (moving every active player's piece down one row, handling any that lock/clear lines), the Durable Object schedules its *own next* wake-up alarm rather than using `setInterval`/`setTimeout`. The alarm is cancelled once the last player leaves the room (see 3.10).
- **Definition of Done:** With no player input at all, connected players' pieces still fall automatically at the correct, steady rate, driven entirely by alarms (verified by confirming no `setInterval`/`setTimeout` exists in `src/room.js`).

### 3.3 — Player input over WebSocket
- [ ] **Dependencies:** 3.2
- **Files:** `public/room.js`, `src/room.js`
- **What it does:** Player key presses (move/rotate/drop) are sent to the server as JSON messages (`{"type": "input", "payload": {"action": "moveLeft"}}` and similar), and the Durable Object validates and applies them to that specific player's board — the browser no longer decides the outcome on its own, only requests it.
- **Definition of Done:** Pressing a key in one browser tab visibly moves that player's own piece, with the server rejecting any move that would be invalid (e.g. moving into a wall).

### 3.4 — Broadcast state to all players
- [ ] **Dependencies:** 3.3
- **Files:** `src/room.js`
- **What it does:** After every tick or accepted input, the Durable Object sends each connected player their own full board state plus a lighter-weight summary of every other player's board (enough to draw a small thumbnail: filled cells and score, not every detail).
- **Definition of Done:** Every connected browser receives up-to-date state for its own board and all opponents' boards within a fraction of a second of any change.

### 3.5 — Render opponent boards live
- [ ] **Dependencies:** 3.4, 1.2 (reuses board-rendering approach from Phase 1)
- **Files:** `public/room.js`, `public/styles.css`
- **What it does:** Builds the small, read-only opponent-board thumbnails described in `ProductSpec.md` §4.3, updating live from the broadcasts in 3.4.
- **Definition of Done:** With two browser tabs open in the same room, moves made in one tab appear, live, on the opponent thumbnail in the other tab (and vice versa).

### 3.6 — Persist state to SQLite each tick
- [ ] **Dependencies:** 3.2
- **Files:** `src/room.js`
- **What it does:** Saves the room's current game state to the Durable Object's built-in SQLite storage after every tick and every accepted player action, so a room recovers its exact in-progress state if the Durable Object briefly hibernates and wakes back up.
- **Definition of Done:** Forcing the Durable Object to restart mid-game (e.g. via a brief deploy or an intentional test hook) resumes the game from the last saved state rather than resetting it.

### 3.7 — Disconnect & reconnect handling
- [ ] **Dependencies:** 3.4
- **Files:** `src/room.js`, `public/room.js`
- **What it does:** Detects when a player's WebSocket closes unexpectedly, marks their board thumbnail "Disconnected" for everyone else (per `ProductSpec.md` §4.4) without stopping the game for remaining players, and cleans up their connection.
- **Definition of Done:** Closing one browser tab mid-game makes that player's thumbnail show "Disconnected" in the remaining tab(s) within a few seconds, while the other player(s) keep playing uninterrupted.

### 3.8 — End-of-game detection & results screen
- [ ] **Dependencies:** 3.7
- **Files:** `src/room.js`, `public/room.js`, `public/styles.css`
- **What it does:** Detects when all connected players have topped out (or only one remains active), stops ticking, and broadcasts final results; the client shows the results screen from `ProductSpec.md` §4.3 (scores ranked highest to lowest).
- **Definition of Done:** Playing a full multiplayer round to completion shows a correctly-ranked results screen, identically, on every connected player's browser.

### 3.9 — Play Again / rematch
- [ ] **Dependencies:** 3.8
- **Files:** `src/room.js`, `public/room.js`
- **What it does:** A "Play Again" button on the results screen resets the room's game state (same room code, same connected players) and returns everyone to the lobby (2.6) for a fresh round.
- **Definition of Done:** Clicking "Play Again" in one tab returns all connected tabs to a fresh lobby for the same room code, ready to start a new round.

### 3.10 — Alarm cancellation & room cleanup
- [ ] **Dependencies:** 3.2, 3.7
- **Files:** `src/room.js`
- **What it does:** When the last remaining player disconnects from a room, cancels any pending Alarm and lets the Durable Object go fully idle (per the project's Free-plan efficiency requirement), rather than continuing to tick an empty room forever.
- **Definition of Done:** Confirmed (e.g. via Cloudflare's dashboard/logs from the observability setting in 0.2) that an empty room has no further alarm activity after its last player leaves.

---

## Phase 4 — Polish & multiplayer launch

Goal: the full multiplayer experience is stable, reasonably good-looking,
and confirmed working live with real separate browsers/devices.

### 4.1 — Visual polish pass
- [ ] **Dependencies:** 3.9
- **Files:** `public/styles.css`
- **What it does:** Cleans up spacing, colors, and typography across all screens for a cohesive look. If a Figma file has been provided by this point, this task also reconciles the built UI against it (flagging anything not buildable rather than silently deviating).
- **Definition of Done:** All four screens (home, lobby, game, results) are visually consistent; any Figma discrepancies are explicitly listed for your review rather than silently resolved.

### 4.2 — Responsive layout check
- [ ] **Dependencies:** 4.1
- **Files:** `public/styles.css`
- **What it does:** Verifies and fixes layout on common phone and tablet screen widths, since opponent-board thumbnails and the main board need to fit without horizontal scrolling.
- **Definition of Done:** All screens are usable (no cut-off or overlapping elements) at common phone, tablet, and desktop widths.

### 4.3 — Error & edge-case states
- [ ] **Dependencies:** 4.1
- **Files:** `src/room.js`, `public/home.js`, `public/room.js`
- **What it does:** Handles and clearly messages: joining a room code that doesn't exist, a duplicate display name in the same room, and (optionally) a maximum room size.
- **Definition of Done:** Attempting each of the above shows a clear, human-readable message instead of a silent failure or a broken screen.

### 4.4 — Final live multiplayer smoke test & deploy
- [ ] **Dependencies:** 4.1, 4.2, 4.3
- **Files:** none (deployment/verification step), `README.md` (final live URL)
- **What it does:** Deploys the finished multiplayer game and plays a full round live, from at least two genuinely separate browsers (e.g. your laptop and your phone, not two tabs on one machine), start to finish.
- **Definition of Done:** A full multiplayer round — create room, join from a second real device, play to game over, see results, rematch — works correctly on the public internet, on the Workers Free plan.

---

## Later / stretch ideas (not scheduled — raise these explicitly if you want them added)

These are deliberately **not** in the phases above, per the Non-Goals in
`ProductSpec.md` §5. Listed here only so they aren't forgotten if you decide
later you want them:

- [ ] Mobile touch controls (on-screen buttons for phones/tablets)
- [ ] Sound effects and background music
- [ ] "Garbage row" attacks sent to opponents on multi-line clears (real competitive Tetris mechanic)
- [ ] Spectator mode (watch a room without playing)
- [ ] Late joining mid-round
