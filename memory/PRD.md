# AI BRAWL — PRD

## Problem Statement
Build a real, playable browser-based 2D fighting game rendered on HTML5 Canvas (not a chatbot, not a board game). Phase 1 delivers the core fight engine: player vs deterministic AI, one arena, 3 fighters, minimal dev select UI, playable end-to-end.

## Tech
- Frontend: React 19 + hand-rolled Canvas engine (requestAnimationFrame + delta-time physics).
- Backend: FastAPI scaffold with `/api/openapi.json` served (no game logic on server).
- Mongo: unused for Phase 1.
- No auth, no persistence, no multiplayer, no sound.

## Personas
- Solo player using desktop keyboard.

## Core Requirements (static)
- 3 original fighters (VOLT, TITAN, WRAITH) — distinct silhouettes, stats, and specials.
- Keyboard-first controls: A/D move, W jump, S block, J light, K heavy, L special.
- Single 60s round, KO or higher-HP-at-timeout, DRAW on tie / simultaneous KO.
- Deterministic AI state machine at medium difficulty.
- HUD with HP bars, name, timer, special cooldown.
- Restart resets state fully.
- Pause on tab blur (visibilitychange).

## What's Implemented (2026-02)
- Full canvas engine under `/src/game/`:
  - `constants.js`, `characters.js`, `input.js`, `fighter.js`, `ai.js`, `engine.js`, `renderer.js`
- React screens:
  - `SelectScreen` (pick player + AI from 3 fighters, mirror allowed)
  - `GameCanvas` (canvas + HUD + result overlay + controls hint)
- Combat: light/heavy/special with startup/active/recovery, hit vs hurt rects, knockback, hitstun, block (20% reduction, no knockback, ground-only), single jump.
- Character specials: VOLT lightning dash, TITAN ground slam + shockwave, WRAITH teleport strike.
- AI: decision ticks ~200ms, approach / attack / block / retreat / jump / special, backs off after streaks.
- Result overlay: VICTORY / DEFEAT / DRAW + Rematch + Change Fighters.
- Backend: `openapi_url="/api/openapi.json"` (verify in server.py) — health endpoint served under `/api`.

## Prioritized Backlog
- P0: Verify /api/openapi.json served.
- P1 (Phase 2): Polished character-select screen, particles, screen shake, sound, round intro animation.
- P1 (Phase 2): Best-of-3, character portraits with animation.
- P2: Local 2P mode, difficulty settings, custom key rebind, mobile touch controls.

## Next Tasks
1. Ensure backend serves `/api/openapi.json`.
2. Run testing_agent on the full fight flow (matchups, HP zero → win, timer expiry → higher-HP win, tie draw, restart, AI behaviours).
