// Game world constants — all in world units (pixels of logical canvas).
// Canvas is 1200x600 logical, scaled by CSS to fit viewport.

export const ARENA = {
  width: 1200,
  height: 600,
  groundY: 520,       // top of the ground plane
  wallPad: 40,        // fighters can't cross past this
};

export const PHYSICS = {
  gravity: 2200,
  jumpVelocity: -820,
  friction: 12,         // ground friction coefficient (higher = quicker stop)
  softPushForce: 320,   // px/s applied when overlapping
};

export const ROUND = {
  timeLimit: 60, // seconds
};

// Key bindings — code strings (event.code)
export const KEYS = {
  left: 'KeyA',
  right: 'KeyD',
  jump: 'KeyW',
  block: 'KeyS',
  light: 'KeyJ',
  heavy: 'KeyK',
  special: 'KeyL',
};

// Attack anim frame stages (seconds)
export const HITSTUN = {
  light: 0.22,
  heavy: 0.40,
  special: 0.32,
};
