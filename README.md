# Tetris Multiplayer (by RK)

A browser-based, real-time multiplayer Tetris game. Two or more players join
the same **room code** and play at the same time, watching each other's
boards update live — no app to install, just a web page.

Built by Ryosuke Kinoshita ([rkinoshita@brandeis.edu](mailto:rkinoshita@brandeis.edu)),
with implementation assistance from Claude Code (Anthropic's AI coding
assistant).

> **Design note:** No Figma file was available when this project's planning
> documents were written, so the screens described in `ProductSpec.md` follow
> standard, sensible Tetris UI conventions rather than a specific mockup. If a
> Figma design is provided later, we will compare it against what's built and
> call out anything that isn't buildable within our technical constraints
> instead of silently changing it.

## What this is, in plain terms

- **Cloudflare Workers**: the hosting platform this game runs on. Instead of
  renting a traditional server that is always on, your code runs in small,
  short-lived bursts on Cloudflare's global network, only when a request
  comes in. This is cheaper and simpler to operate for a small game like
  this.
- **Durable Object**: a special kind of Cloudflare Worker that Cloudflare
  guarantees will only ever run as a *single instance* for a given ID (in our
  case, one per room code). This matters because Tetris multiplayer needs one
  "referee" that all players in a room talk to, so everyone sees the same
  game state — a Durable Object is that referee.
- **WebSocket**: a connection between a player's browser and the server that
  stays open, so the server can push updates (like "the other player just
  moved a piece") the instant they happen, instead of the browser having to
  keep asking "anything new?" over and over.

## Project status

**Live URL:** https://tetris-multiplayer-by-rk.rkinoshita.workers.dev

Deployment is handled by Cloudflare's own **Git integration** (also called
Workers Builds): Cloudflare watches this repository directly and
automatically rebuilds and republishes the game every time new code is
pushed to the `claude/multiplayer-tetris-cloudflare-jrjg0a` branch — no
manual deploy step required. (Once the project is finished, the production
branch can be switched to `main`.)

All planned features are built and tested (single-player prototype through
full server-authoritative multiplayer, polish, and error handling). See
`FEATUREROADMAP_workplan.md` for the full task-by-task build plan and
progress — the one remaining item is a final live smoke test from two
genuinely separate devices.

## Running it locally (once code exists)

You'll need:

1. **Node.js** — a program that lets JavaScript run outside a web browser,
   used here only to run developer tools (not to host the game itself).
   Install the LTS version from [nodejs.org](https://nodejs.org).
2. **Wrangler** — Cloudflare's command-line tool (a program you run from a
   terminal) for developing and deploying Workers. It's installed
   automatically as a project dependency; you don't need to install it
   separately.

Once the project has code, from the project's root folder:

```
npm install       # downloads the project's tools and libraries
npm run dev       # starts a local copy of the game at http://localhost:8787
```

Open that address in two different browser tabs (or two browsers) to try
multiplayer against yourself.

## Deploying it live

This project runs on the **Workers Free plan** (Cloudflare's no-cost tier
for Workers, with usage limits generous enough for a small game like this).

Deployment is automatic: Cloudflare's Git integration is connected directly
to this GitHub repository, so pushing to the tracked branch (see "Project
status" above) triggers Cloudflare to build and republish the game on its
own — nothing to run locally.

If you ever need to deploy manually (e.g. testing from a machine with its
own Cloudflare login), the command is:

```
npm run deploy
```

The first time you run this yourself, Wrangler will ask you to log in to
your Cloudflare account in a browser window. Wrangler prints the live URL
when it finishes.

## Project layout

```
/                       project root
  wrangler.jsonc         Cloudflare Workers configuration (how/where this deploys)
  src/
    index.js              Worker entry point - routes /room/:code to its Durable Object
    room.js                the "Room" Durable Object - one per room code, the referee for that room
    tetris-engine.js        DOM-free Tetris rules (shapes, movement, scoring) shared by the server
  public/
    index.html            the single HTML shell for every screen (home/lobby/game)
    styles.css             all styling
    home.js                 home screen: display name, create/join room
    room.js                  lobby, live game, and results screens once in a room
    game.js                   Phase 1's original single-player prototype (kept for reference;
                                no longer linked from index.html - see ProductSpec.md history)
  ProductSpec.md          what the app does and how it's organized
  FEATUREROADMAP_workplan.md   the build plan, as checkable tasks
```

## Docs

- [`ProductSpec.md`](./ProductSpec.md) — what the app does and how it's organized.
- [`FEATUREROADMAP_workplan.md`](./FEATUREROADMAP_workplan.md) — the full build plan as checkbox tasks, in build order.
