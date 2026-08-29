# AI BRAWL — PRD

## Problem Statement
Build a real, playable browser-based 2D fighting game rendered on HTML5 Canvas (not a chatbot, not a board game). Phased delivery: core engine → polished screens → LLM Fighter Forge.

## Tech
- Frontend: React 19 + hand-rolled Canvas engine (requestAnimationFrame + delta-time physics).
- Backend: FastAPI + `emergentintegrations` LLM client for the Fighter Forge endpoint.
- Persistence: **client-side only** (`localStorage`). No Mongo, no accounts, no multiplayer, no sound.

## Personas
- Solo player using desktop keyboard.

## Core Requirements (static)
- 3 original fighters (VOLT, TITAN, WRAITH) — distinct silhouettes, stats, and specials. **NEVER altered** — they are the balance anchor.
- Keyboard-first controls: A/D move, W jump, S block, J light, K heavy, L special.
- Single 60s round, KO or higher-HP-at-timeout, DRAW on tie / simultaneous KO.
- Deterministic AI state machine at medium difficulty.
- HUD with HP bars, name, timer, special cooldown, buff badges.
- Restart resets state fully; pause on tab blur.

## What's Implemented

### Phase 1 (Core Engine)
- Full canvas engine under `/src/game/` (constants, characters, input, fighter, ai, engine, renderer, particles, damageNumbers).
- React screens: `SelectScreen`, `GameCanvas`.
- Combat: light/heavy/special with startup/active/recovery, hit vs hurt rects, knockback, hitstun, block (20% reduction, no knockback, ground-only), single jump.
- Character specials: VOLT lightning dash, TITAN ground slam + shockwave, WRAITH teleport strike.
- AI: decision ticks ~200ms with rolling adaptation window and bounded biases; backs off after hit streaks.

### Phase 2 (Polish)
- Intro overlay (READY/FIGHT), KO banner (K.O. / TIME UP), result overlay (VICTORY/DEFEAT/DRAW + Rematch + Change Fighters).
- Controls modal with pause-on-open.
- Damage numbers, hit-stop (freeze-frame), screen shake, particles for hits/blocks/specials, low-HP HP-bar pulse, ghost HP bar (damage lag).
- Momentum: ramp-based acceleration + snap-on-reverse; airborne knockback safety cap (fixes sky-launch chained combos).

### F1 (LLM Fighter Generation — backend only)
- `POST /api/forge/generate` — validates + clamps + balance-budgets LLM output.
- Uses `emergentintegrations.LlmChat` with `EMERGENT_LLM_KEY` and openai `gpt-5.4-mini`.
- 3-attempt retry, strict JSON schema (Pydantic + enum), never returns fake success on failure (502 on terminal failure).

### F2 (Engine mechanics + Forge UI + persistence)
- 5 passives implemented in `fighter.js` runtime state + `engine._computeOutgoingDamage`:
  - `low_health_damage_boost` (attacker <30% HP)
  - `damage_taken_speed_boost` (adrenaline, 2s window)
  - `lifesteal` (heal % of damage dealt)
  - `damage_reduction` (defender-side, applied in `applyHit`)
  - `combo_damage_boost` (max 4 stacks, 1.5s window)
- 9 specials implemented (existing dash/slam/teleport preserved unchanged for defaults):
  - Kinetic: `dash`, `teleport`, `slam` (aoe)
  - Ranged: `projectile` (new `Projectile` entity in `engine.projectiles[]`, despawns at bounds/life)
  - On-hit riders: `stun` (1.0s + 1.5s post-stun immunity to prevent chain-lock), `lifesteal` (heal on hit)
  - Self-buffs (non-hitbox — cast pose): `shield` (barrier HP absorbed before real HP), `heal`, `damage_boost`
- Procedural renderer `drawGenerated` — silhouette (slim/medium/bulky) + 8 motifs (blades/orbs/spikes/wings/armor/flames/frost/shadow). Buff auras (shield bubble, damage-boost fringe, heal sparkle, stun stars) draw for ALL fighters.
- `ForgeScreen`: textarea + generate button with animated loading orbs, error card with retry, result card (`FighterPreview` + stat bars + passive/special abilities + BALANCED indicator when budget scales stats + TEST/SAVE actions).
- Persistence via `game/roster.js` (localStorage `aibrawl.forge.roster.v1`, schema validation + graceful corruption handling + 50-item cap).
- App-level runtime character registry (`registerRuntimeCharacter` in `characters.js`) — engine transparently picks up generated fighters via `getCharacter(id)`.
- `SelectScreen` shows generated cards alongside defaults, with FORGED tag + two-step-confirm delete (2s auto-revert, no modal).
- HUD buff badges: `SHIELD`, `BOOST`, `STUNNED`.

## Prioritized Backlog
- P0: Complete.
- P1: Best-of-3 rounds, in-fight fighter portraits with animations, sound design pass.
- P1: Fighter Forge history / favorites, prompt suggestions.
- P2: Local 2P mode, difficulty settings, custom key rebind, mobile touch controls.
- P2: Save fighters to cloud (would need accounts — out of scope for now).

## Next Tasks
- Broader creative UX pass (motif previews, more starter prompts, tone-per-fighter).
- Optional analytics on which generated fighters win most.

## File Map (key)
- Engine: `/app/frontend/src/game/{engine,fighter,ai,renderer,characters,constants,input,particles,damageNumbers,projectile,roster,forge}.js`
- React: `/app/frontend/src/App.js`, `/app/frontend/src/components/{SelectScreen,GameCanvas,ForgeScreen,FighterPreview,ControlsOverlay}.jsx`
- Backend: `/app/backend/{server,forge}.py`
