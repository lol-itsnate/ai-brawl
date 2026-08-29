// Character definitions. Each character has stats, per-attack timing/damage,
// and a draw function (renderer.js orchestrates the call).
//
// Attack timing model:
//   startup:  windup time before hitbox becomes active
//   active:   duration the hitbox exists (damage window)
//   recovery: time after active before the fighter can act again
//   damage:   HP damage on clean hit
//   reach:    forward hitbox distance from fighter center
//   hbW/hbH:  hitbox width/height (0/0 = no self hitbox, e.g. self-buff specials)
//   knockback: horizontal push (px/s) applied to victim
//   hitstunOverride: optional seconds — for specials
//
// Phase F2: default 3 fighters (VOLT/TITAN/WRAITH) are FROZEN — never edit them.
// Generated fighters live in a runtime map registered from App.js.

export const CHAR_IDS = ['volt', 'titan', 'wraith'];

const base = {
  bodyW: 60,      // hurtbox width
  bodyH: 120,     // hurtbox height
};

export const CHARACTERS = {
  volt: {
    id: 'volt',
    name: 'VOLT',
    color: '#3ab6ff',
    accent: '#f9e94a',
    trail: '#7dd8ff',
    maxHp: 80,
    moveSpeed: 340,
    body: { ...base, bodyW: 52, bodyH: 118 },
    light: { startup: 0.06, active: 0.08, recovery: 0.10, damage: 7,  reach: 70,  hbW: 55, hbH: 42, knockback: 140, hitstun: 0.22 },
    heavy: { startup: 0.28, active: 0.10, recovery: 0.42, damage: 14, reach: 82,  hbW: 70, hbH: 55, knockback: 320, hitstun: 0.38 },
    special: {
      kind: 'dash',
      name: 'LIGHTNING DASH',
      cooldown: 4.5,
      startup: 0.10, active: 0.30, recovery: 0.22,
      damage: 12, reach: 80, hbW: 90, hbH: 90, knockback: 260, hitstun: 0.32,
      dashSpeed: 780,
    },
  },
  titan: {
    id: 'titan',
    name: 'TITAN',
    color: '#ff8a3d',
    accent: '#7a3a10',
    trail: '#ffb984',
    maxHp: 140,
    moveSpeed: 210,
    body: { ...base, bodyW: 78, bodyH: 128 },
    light: { startup: 0.09, active: 0.09, recovery: 0.14, damage: 8,  reach: 68, hbW: 60, hbH: 46, knockback: 160, hitstun: 0.24 },
    heavy: { startup: 0.40, active: 0.12, recovery: 0.50, damage: 20, reach: 78, hbW: 78, hbH: 62, knockback: 420, hitstun: 0.42 },
    special: {
      kind: 'slam',
      name: 'GROUND SLAM',
      cooldown: 5.5,
      startup: 0.30, active: 0.22, recovery: 0.45,
      damage: 22, reach: 110, hbW: 220, hbH: 90, knockback: 520, hitstun: 0.45,
      liftVelocity: -520, // fighter hops before slam
    },
  },
  wraith: {
    id: 'wraith',
    name: 'WRAITH',
    color: '#b56bff',
    accent: '#2a0f4a',
    trail: '#e0b9ff',
    maxHp: 100,
    moveSpeed: 290,
    body: { ...base, bodyW: 50, bodyH: 122 },
    light: { startup: 0.07, active: 0.08, recovery: 0.11, damage: 7,  reach: 72, hbW: 58, hbH: 44, knockback: 150, hitstun: 0.22 },
    heavy: { startup: 0.32, active: 0.10, recovery: 0.44, damage: 16, reach: 76, hbW: 72, hbH: 58, knockback: 340, hitstun: 0.38 },
    special: {
      kind: 'teleport',
      name: 'PHASE STRIKE',
      cooldown: 5.0,
      startup: 0.18, active: 0.12, recovery: 0.30,
      damage: 14, reach: 74, hbW: 70, hbH: 60, knockback: 260, hitstun: 0.34,
      teleportOffset: 90, // appears this many px behind target (target-facing)
    },
  },
};

// Runtime registry for generated fighters (registered by App.js on mount / after forge).
// Kept as a module-scoped Map so any consumer of getCharacter(id) transparently sees them.
const _runtimeRoster = new Map();

export function registerRuntimeCharacter(char) {
  if (char && typeof char.id === 'string') _runtimeRoster.set(char.id, char);
}
export function unregisterRuntimeCharacter(id) {
  _runtimeRoster.delete(id);
}
export function clearRuntimeRoster() {
  _runtimeRoster.clear();
}
export function listRuntimeCharacters() {
  return Array.from(_runtimeRoster.values());
}

export function getCharacter(id) {
  return CHARACTERS[id] || _runtimeRoster.get(id) || CHARACTERS.volt;
}
