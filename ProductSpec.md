# Product Spec: Tetris Multiplayer

## 1. Design source

**No Figma file was provided for this project.** Everything below describes a
standard, sensible Tetris layout and flow — the kind found in most browser
Tetris games — not a specific approved design. If a Figma file is shared
later, we will hold it up against this spec and the working app, and call out
anything in the design that can't be built under our technical constraints
(see `FEATUREROADMAP_workplan.md` intro) rather than quietly building
something different.

## 2. What the app does

A player opens the game in a web browser, picks a **display name** (just a
typed nickname — not an account; nothing is saved about who they are), and
either:

- **Creates a room**, which generates a short **room code** (a handful of
  letters/numbers, like a code you'd read aloud to a friend), or
- **Joins a room** by typing in a room code someone else shared with them.

Everyone who enters the same room code lands in the same game session. Each
player gets their own falling-piece board, controlled by their own keyboard,
but every player in the room can see a live, small view of every other
player's board update in real time — so you're all playing "together" even
though each of you is really playing your own game of Tetris side by side.

There is no login, no password, no saved history, and no leaderboard. Close
the tab and the game (and the room) is gone — this is a lightweight,
disposable, "let's play right now" experience, not a persistent service.

## 3. Standard Tetris rules we're implementing

For readers unfamiliar with Tetris: differently-shaped blocks made of four
squares each (called **tetrominoes** — "tetra" for four) fall one at a time
down a tall, narrow grid (the **board**, standard size 10 squares wide by 20
tall). The player can slide each piece left/right, rotate it, and drop it
faster. When a horizontal row across the board fills up completely with
squares and has no gaps, that row clears (disappears, and everything above
it shifts down) and the player scores points. The game ends for a player when
incoming pieces stack up so high they can no longer fit on the board.

We are implementing the standard version of this: 7 piece shapes, a "next
piece" preview, scoring for clearing 1–4 rows at once, and increasing fall
speed as the player's score/level increases. We are **not** implementing
advanced competitive Tetris mechanics (like "hold piece," "sending garbage
rows to opponents," wall-kick rotation systems, or ranked scoring) unless
added to the roadmap later — see the Non-Goals section below.

## 4. Screens

### 4.1 Home screen

- Game title/logo.
- A text field for **display name**.
- A button to **Create Room** (generates a new room code and takes the
  player straight into that room as the first player).
- A text field to type an existing **room code**, plus a **Join Room**
  button.
- Simple validation: can't create/join without a display name; can't join
  without a room code that matches the expected format.

### 4.2 Room lobby screen

- Shows the room code prominently (so the host can read/share it) and a
  "copy code" button.
- Lists display names of everyone currently in the room.
- A **Start Game** button, usable by any player once at least... a design
  decision: we default to **2 minimum players** to start, host-triggered.
  (Single-player testing mode is available separately during development —
  see the workplan's Phase 1 — but the shared-room lobby is for multiplayer.)

### 4.3 Game screen

- **Your board**: the large, primary Tetris grid the player is actively
  controlling, with the current falling piece, a "next piece" preview box,
  and your current score/level/lines-cleared.
- **Opponent boards**: smaller, read-only, live-updating thumbnails of every
  other player's board in the same room, each labeled with that player's
  display name and score, arranged in a row or grid beside/below your board
  depending on screen size.
- A visible **room code** reminder and player list stay accessible (e.g. a
  small header) in case someone else wants to join mid-game (see Non-Goals —
  late joining is out of scope for v1, but the code stays visible for
  reference/rematches).
- When a player's board fills up (game over for them), their thumbnail is
  marked "Game Over" but keeps showing their final board; other players keep
  playing.
- When **all** players in the room have topped out (or the last remaining
  player wins), a **results screen** (or overlay) shows final scores ranked
  highest to lowest, and a **Play Again** button that returns everyone to the
  lobby (same room code, same players) for a rematch.

### 4.4 Disconnect / edge states

- If a player's browser tab loses connection, the other players see that
  player's thumbnail marked "Disconnected" (their board freezes in place)
  rather than the game breaking for everyone else.
- If everyone leaves a room, the room and its Durable Object (see Section 6)
  are cleaned up — nothing lingers on the server.

## 5. Non-goals (explicitly out of scope)

To keep this buildable and match the assignment's constraints:

- No accounts, login, or passwords.
- No persistent user database, profiles, or friends lists.
- No leaderboard, matchmaking, or ranked play.
- No statistics or match history saved anywhere.
- No "attack"/garbage-row mechanics between players (each player's board is
  independent; multiplayer here means *watching each other play live*, not
  competitive interaction between boards) — this could be a future
  enhancement, not v1.
- No late joining mid-round (players join in the lobby, before Start Game).
- No mobile touch controls in v1 (keyboard only) unless added later.

## 6. How it's organized (architecture, in plain English)

This section explains the shape of the system. Full step-by-step build tasks
live in `FEATUREROADMAP_workplan.md`.

### The two halves of the app

1. **The static game page** (HTML for structure, CSS for appearance, and
   JavaScript for behavior) — this is what's sent to a player's browser. It
   draws the board, listens for arrow-key presses, and renders whatever
   updates arrive.
2. **The Durable Object "room referee"** — one instance of this per active
   room code, running on Cloudflare's servers. It's the single source of
   truth for that room: it knows every player's board, whose turn pieces fall
   next, and the score. Browsers don't trust each other's version of events;
   they trust what this referee says happened.

### Why one Durable Object per room

Cloudflare can run many copies of ordinary code at once across its network,
which is normally good for speed, but it's a problem for a shared game: if
two different copies of the "referee" each thought they were in charge of
the same room, players could see two different, conflicting versions of the
game. A **Durable Object** solves this by guaranteeing that a given room code
always maps to the exact same single running instance, no matter which
Cloudflare data center a player connects from. We look one up (or create it)
with a call shaped like `env.ROOM.getByName(roomCode)` — you can read that as
"find (or start) the one and only referee for this room code."

### How players and the referee talk (WebSockets)

Each browser opens one **WebSocket** to its room's Durable Object — a
connection that, unlike a normal web page request, stays open in both
directions. That lets the referee immediately broadcast "player B just
cleared 2 lines" to everyone else the instant it happens, instead of
browsers repeatedly polling ("anything new? anything new?").

Every message sent over these connections is plain **JSON** (a simple, both
human- and computer-readable text format for structured data, e.g.
`{"type": "move", "payload": {"direction": "left"}}`). Every message has a
`type` (what kind of event this is — a move, a piece lock, a chat ping, etc.)
and a `payload` (the details for that event). This consistent shape keeps the
client and server code predictable to write and debug.

### How the falling-piece "tick" works without wasting resources

A normal Tetris game ticks — moves the falling piece down one row — on a
repeating timer, e.g. every second. But leaving a repeating timer
(`setInterval`) running inside a Durable Object would keep it "awake"
indefinitely, which defeats the point of Cloudflare's pay-for-what-you-use
model and can exhaust the free plan's usage allowance even when nobody is
playing. Instead, we use Cloudflare's **Alarms API**: the referee schedules
one single wake-up call for itself at a specific future time (e.g. "wake me
in 800 milliseconds to drop the piece one row"). When that alarm fires, it
does one tick, saves the updated board, and schedules the *next* alarm before
going back to sleep. This way the Durable Object is only ever "on" for the
brief instant it's doing work, and it's allowed to fully sleep between ticks
— and when the last player leaves a room, we cancel the pending alarm so the
room doesn't tick forever in the background.

### Remembering who's who on a connection

A Durable Object can have several WebSocket connections open at once (one
per player in the room). To remember which connection belongs to which
player without a database or login system, we attach a small label directly
to each connection using `serializeAttachment()` (e.g. "this socket belongs
to display name 'Alex', player slot 2") and read it back with
`deserializeAttachment()`. This matters especially because Durable Objects
can go fully idle and "hibernate" between messages to save resources —
`ctx.acceptWebSocket(server)` (rather than the more common `server.accept()`)
is what allows connections to survive that hibernation, and the attached
label is how the referee still knows who's who when it wakes back up.

### Saving progress

The referee saves the current board state to its own attached **SQLite**
database (a small, embedded database — no separate database server to set
up or pay for) after every tick and every player action, so that if the
Durable Object briefly goes to sleep and wakes back up, it picks up exactly
where it left off instead of losing the game in progress.

## 7. Glossary (all technical terms used above, in one place)

| Term | Plain-English meaning |
|---|---|
| Cloudflare Workers | The hosting platform: your code runs in short bursts on Cloudflare's servers instead of one always-on machine you rent and manage. |
| Durable Object | A Cloudflare Worker guaranteed to run as exactly one instance per ID — used here as the single "referee" for each room. |
| WebSocket | An always-open, two-way connection between browser and server, so updates can be pushed instantly. |
| JSON | A simple text format for structured data, e.g. `{"key": "value"}`, readable by both humans and computers. |
| Alarms API | A Cloudflare feature letting a Durable Object schedule one future wake-up, instead of running a constant repeating timer. |
| Tick | One "step" of the game clock — in Tetris, one row-drop of the falling piece. |
| SQLite | A lightweight, embedded database (no separate server needed) used to save each room's game state. |
| Room code | A short, shareable code that lets multiple players land in the same game session. |
| Tetromino | A four-square falling game piece (there are 7 standard shapes). |
| Hibernation | A Durable Object going fully idle/asleep between messages to save resources, without losing its remembered state. |
