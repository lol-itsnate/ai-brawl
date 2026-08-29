// Deterministic AI controller. Runs a decision tick every ~200ms and returns
// an "intent" object (same shape as player input) each frame.
//
// Behaviour rules:
//  - Far from opponent → walk toward.
//  - In attack range → attack (mostly light, sometimes heavy, special when off cooldown and conditions fit).
//  - Occasionally block when opponent is winding up a heavy or attacks a lot.
//  - Occasionally jump at mid-range.
//  - After landing 2-3 hits, back off briefly.

const DECISION_INTERVAL = 0.20; // seconds

// Simple seeded RNG (mulberry32) for determinism given a seed.
function makeRng(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export class AIController {
  constructor(seed = 12345) {
    this.rng = makeRng(seed);
    this.decisionT = 0;
    this.mode = 'approach';         // 'approach' | 'attack' | 'block' | 'retreat' | 'jump'
    this.modeT = 0;                 // seconds until reevaluate forced
    this.hitStreak = 0;             // hits landed since last retreat
    this.playerAttackDetectedT = 0; // seconds since last saw player start an attack
    this.playerLastAttackId = null;
    this.jumpLatch = false;         // one-shot jump pulse
    this.lightLatch = false;
    this.heavyLatch = false;
    this.specialLatch = false;
  }

  reset() {
    this.decisionT = 0;
    this.mode = 'approach';
    this.modeT = 0;
    this.hitStreak = 0;
    this.playerAttackDetectedT = 0;
    this.playerLastAttackId = null;
    this._clearLatches();
  }

  _clearLatches() {
    this.jumpLatch = false;
    this.lightLatch = false;
    this.heavyLatch = false;
    this.specialLatch = false;
  }

  // Called from engine when the AI lands a hit on opponent (for retreat logic)
  notifyLandedHit() {
    this.hitStreak += 1;
    if (this.hitStreak >= 2 + Math.floor(this.rng() * 2)) {
      this.mode = 'retreat';
      this.modeT = 0.6 + this.rng() * 0.4;
      this.hitStreak = 0;
    }
  }

  update(dt, self, opponent) {
    this.decisionT -= dt;
    this.modeT -= dt;
    if (this.playerAttackDetectedT > 0) this.playerAttackDetectedT -= dt;

    // Detect player starting a heavy — used for reactive block
    if (opponent.attack) {
      const id = opponent.attack; // reference identity
      if (id !== this.playerLastAttackId) {
        this.playerLastAttackId = id;
        if (opponent.attack.type === 'heavy' && this.rng() < 0.55) {
          this.mode = 'block';
          this.modeT = 0.35 + this.rng() * 0.15;
        } else {
          this.playerAttackDetectedT = 0.5;
        }
      }
    } else {
      this.playerLastAttackId = null;
    }

    if (this.decisionT <= 0 && this.modeT <= 0) {
      this.decisionT = DECISION_INTERVAL;
      this._decide(self, opponent);
    }

    return this._buildIntent(self, opponent);
  }

  _decide(self, opponent) {
    const dx = opponent.x - self.x;
    const dist = Math.abs(dx);
    const specialReady = self.cooldowns.special <= 0;
    const specialKind = self.char.special.kind;

    // Priority: retreat/block persist via modeT above.
    if (this.mode === 'retreat' && this.modeT > 0) return;
    if (this.mode === 'block' && this.modeT > 0) return;

    // Character-tuned special ranges
    const wantsSpecial = specialReady && (
      (specialKind === 'slam'     && dist < 130 && this.rng() < 0.55) ||
      (specialKind === 'dash'     && dist > 180 && dist < 520 && this.rng() < 0.45) ||
      (specialKind === 'teleport' && (dist > 380 || this._nearWall(self)) && this.rng() < 0.55)
    );
    if (wantsSpecial) {
      this.mode = 'attack-special';
      this.modeT = 0.15;
      this.specialLatch = true;
      return;
    }

    if (dist < 110) {
      // In range → attack
      const r = this.rng();
      if (r < 0.15 && this.playerAttackDetectedT > 0) {
        this.mode = 'block';
        this.modeT = 0.30 + this.rng() * 0.15;
      } else if (r < 0.70) {
        this.mode = 'attack-light';
        this.modeT = 0.12;
        this.lightLatch = true;
      } else if (r < 0.92) {
        this.mode = 'attack-heavy';
        this.modeT = 0.20;
        this.heavyLatch = true;
      } else {
        this.mode = 'block';
        this.modeT = 0.25;
      }
    } else if (dist < 260) {
      // Mid range → jump occasionally, otherwise approach
      if (this.rng() < 0.14) {
        this.mode = 'jump-approach';
        this.modeT = 0.25;
        this.jumpLatch = true;
      } else {
        this.mode = 'approach';
        this.modeT = 0.10;
      }
    } else {
      this.mode = 'approach';
      this.modeT = 0.10;
    }
  }

  _nearWall(self) {
    return self.x < 200 || self.x > 1000;
  }

  _buildIntent(self, opponent) {
    const dx = opponent.x - self.x;
    const dir = dx >= 0 ? 1 : -1;

    let moveDir = 0;
    let jumpPressed = false;
    let blockHeld = false;
    let lightPressed = false;
    let heavyPressed = false;
    let specialPressed = false;

    if (this.mode === 'approach' || this.mode === 'jump-approach') {
      moveDir = dir;
    } else if (this.mode === 'retreat') {
      moveDir = -dir;
    } else if (this.mode === 'block') {
      blockHeld = true;
    }

    if (this.jumpLatch)   { jumpPressed = true; this.jumpLatch = false; }
    if (this.lightLatch)  { lightPressed = true; this.lightLatch = false; }
    if (this.heavyLatch)  { heavyPressed = true; this.heavyLatch = false; }
    if (this.specialLatch){ specialPressed = true; this.specialLatch = false; }

    return { moveDir, jumpPressed, blockHeld, lightPressed, heavyPressed, specialPressed };
  }
}
