// Deterministic AI controller with a rolling adaptation window.
//
// Base behaviour (unchanged): far → approach, in range → attack, occasional
// block / jump / special, backs off after a hit streak.
//
// NEW in this polish pass:
//  - Low-HP mode: below ~25% HP the AI biases toward spacing, blocking and
//    looking for special/counter openings instead of trading recklessly.
//  - Anti-spam attack pacing: an `attackCooldown` gate enforces a randomized
//    minimum gap between AI attack decisions, so it never machine-guns.
//  - Bounded adaptation: rolling 5s stats window tracks player attack rate,
//    block ratio and hit dominance. Adjusts three bounded biases:
//        aggressionBias  ∈ [-0.15, +0.15]
//        blockBias       ∈ [0,     +0.20]
//        spacingBias     ∈ [0,     +1.00]  (probability of retreat before hitting a blocker)
//    Hard caps prevent runaway rubber-banding — the AI stays within a fair
//    band around the medium-difficulty baseline.

const DECISION_INTERVAL = 0.20; // seconds

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
    this.mode = 'approach';
    this.modeT = 0;
    this.hitStreak = 0;
    this.playerAttackDetectedT = 0;
    this.playerLastAttackId = null;
    this.jumpLatch = false;
    this.lightLatch = false;
    this.heavyLatch = false;
    this.specialLatch = false;

    // Rolling adaptation window
    this._resetStats();
    this.timeInWindow = 0;
    this.windowLen = 5.0;

    // Bounded biases
    this.aggressionBias = 0;   // -0.15 .. +0.15
    this.blockBias = 0;        // 0 .. +0.20
    this.spacingBias = 0;      // 0 .. +1.00

    // Anti-spam attack gate (seconds until next attack decision allowed)
    this.attackCooldown = 0;
  }

  reset() {
    this.decisionT = 0;
    this.mode = 'approach';
    this.modeT = 0;
    this.hitStreak = 0;
    this.playerAttackDetectedT = 0;
    this.playerLastAttackId = null;
    this._clearLatches();
    this._resetStats();
    this.timeInWindow = 0;
    this.aggressionBias = 0;
    this.blockBias = 0;
    this.spacingBias = 0;
    this.attackCooldown = 0;
  }

  _resetStats() {
    this.stats = {
      playerAttacks: 0,
      playerBlockTicks: 0,
      hitsOnPlayer: 0,
      hitsOnSelf: 0,
    };
  }

  _clearLatches() {
    this.jumpLatch = false;
    this.lightLatch = false;
    this.heavyLatch = false;
    this.specialLatch = false;
  }

  notifyLandedHit() {
    this.stats.hitsOnPlayer += 1;
    this.hitStreak += 1;
    if (this.hitStreak >= 2 + Math.floor(this.rng() * 2)) {
      this.mode = 'retreat';
      this.modeT = 0.6 + this.rng() * 0.4;
      this.hitStreak = 0;
    }
  }

  notifyGotHit() {
    this.stats.hitsOnSelf += 1;
  }

  update(dt, self, opponent) {
    this.decisionT -= dt;
    this.modeT -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.playerAttackDetectedT > 0) this.playerAttackDetectedT -= dt;
    this.timeInWindow += dt;

    // Edge-detect player attacks (for reactive block + attack-count stat)
    if (opponent.attack) {
      if (opponent.attack !== this.playerLastAttackId) {
        this.playerLastAttackId = opponent.attack;
        this.stats.playerAttacks += 1;
        if (opponent.attack.type === 'heavy' && this.rng() < 0.55 + this.blockBias) {
          this.mode = 'block';
          this.modeT = 0.35 + this.rng() * 0.15;
        } else {
          this.playerAttackDetectedT = 0.5;
        }
      }
    } else {
      this.playerLastAttackId = null;
    }
    // Player is currently blocking?
    if (opponent.blocking) this.stats.playerBlockTicks += 1;

    // Rolling window rollover
    if (this.timeInWindow >= this.windowLen) {
      this._adaptBiases();
      this._resetStats();
      this.timeInWindow = 0;
    }

    if (this.decisionT <= 0 && this.modeT <= 0) {
      this.decisionT = DECISION_INTERVAL;
      this._decide(self, opponent);
    }

    return this._buildIntent(self, opponent);
  }

  _adaptBiases() {
    const secs = Math.max(0.5, this.timeInWindow);
    const spamRate  = this.stats.playerAttacks   / secs;      // attacks / sec
    const blockRate = this.stats.playerBlockTicks / (secs * 60); // fraction of frames blocking (approx at 60fps)
    const dominance = this.stats.hitsOnSelf - this.stats.hitsOnPlayer;

    // Player spams attacks → AI blocks more
    if (spamRate > 1.5) this.blockBias = Math.min(0.20, this.blockBias + 0.06);
    else                this.blockBias = Math.max(0,    this.blockBias - 0.04);

    // Player blocks a lot → AI backs off / staggers instead of hammering the shield
    if (blockRate > 0.25) this.spacingBias = Math.min(1.0, this.spacingBias + 0.20);
    else                  this.spacingBias = Math.max(0,   this.spacingBias - 0.12);

    // Dominance-based aggression (bounded)
    if      (dominance >  2) this.aggressionBias = Math.min( 0.15, this.aggressionBias + 0.05);
    else if (dominance < -3) this.aggressionBias = Math.max(-0.15, this.aggressionBias - 0.05);
    else                     this.aggressionBias *= 0.7; // decay toward 0
  }

  _decide(self, opponent) {
    const dx = opponent.x - self.x;
    const dist = Math.abs(dx);
    const specialReady = self.cooldowns.special <= 0;
    const specialKind = self.char.special.kind;
    const lowHp = self.hp < self.maxHp * 0.25;

    // Ongoing forced modes persist
    if (this.mode === 'retreat' && this.modeT > 0) return;
    if (this.mode === 'block'   && this.modeT > 0) return;

    // LOW-HP behaviour: retreat, block, or specials/counters over trades
    if (lowHp) {
      if (specialReady && this.rng() < 0.40) {
        this.mode = 'attack-special';
        this.modeT = 0.15;
        this.specialLatch = true;
        this.attackCooldown = 0.50 + this.rng() * 0.20;
        return;
      }
      if (dist < 140 && this.rng() < 0.45 + this.blockBias) {
        this.mode = 'block';
        this.modeT = 0.35 + this.rng() * 0.20;
        return;
      }
      if (dist < 220 && this.rng() < 0.55) {
        this.mode = 'retreat';
        this.modeT = 0.50 + this.rng() * 0.30;
        return;
      }
      // else fall through to normal decisioning at longer ranges
    }

    // Character-tuned special ranges (aggression bumps the odds)
    const specialRoll = this.rng();
    const wantsSpecial = specialReady && (
      (specialKind === 'slam'     && dist < 130 && specialRoll < 0.55 + this.aggressionBias) ||
      (specialKind === 'dash'     && dist > 180 && dist < 520 && specialRoll < 0.45 + this.aggressionBias) ||
      (specialKind === 'teleport' && (dist > 380 || this._nearWall(self)) && specialRoll < 0.55 + this.aggressionBias)
    );
    if (wantsSpecial) {
      this.mode = 'attack-special';
      this.modeT = 0.15;
      this.specialLatch = true;
      this.attackCooldown = 0.50 + this.rng() * 0.20;
      return;
    }

    const canAttackNow = this.attackCooldown <= 0;

    if (dist < 110) {
      // In range, but the anti-spam gate holds off a spam-attack loop.
      if (!canAttackNow) {
        if (this.rng() < 0.40 + this.blockBias) {
          this.mode = 'block';
          this.modeT = 0.25;
        } else {
          this.mode = 'approach';
          this.modeT = 0.10;
        }
        return;
      }
      // Player blocks a lot → space out before committing
      if (this.spacingBias > 0.3 && this.rng() < this.spacingBias * 0.7) {
        this.mode = 'retreat';
        this.modeT = 0.35 + this.rng() * 0.20;
        return;
      }
      const r = this.rng();
      const aggression = 0.85 + this.aggressionBias;    // fraction of "in-range roll" spent on attacks
      const reactBlock = 0.15 + this.blockBias;         // reactive-block window when player winds up
      if (r < reactBlock && this.playerAttackDetectedT > 0) {
        this.mode = 'block';
        this.modeT = 0.30 + this.rng() * 0.15;
      } else if (r < reactBlock + aggression * 0.65) {
        this.mode = 'attack-light';
        this.modeT = 0.12;
        this.lightLatch = true;
        this.attackCooldown = 0.35 + this.rng() * 0.20;
      } else if (r < reactBlock + aggression * 0.92) {
        this.mode = 'attack-heavy';
        this.modeT = 0.20;
        this.heavyLatch = true;
        this.attackCooldown = 0.55 + this.rng() * 0.20;
      } else {
        this.mode = 'block';
        this.modeT = 0.25;
      }
    } else if (dist < 260) {
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

    if (this.jumpLatch)    { jumpPressed = true;    this.jumpLatch = false; }
    if (this.lightLatch)   { lightPressed = true;   this.lightLatch = false; }
    if (this.heavyLatch)   { heavyPressed = true;   this.heavyLatch = false; }
    if (this.specialLatch) { specialPressed = true; this.specialLatch = false; }

    return { moveDir, jumpPressed, blockHeld, lightPressed, heavyPressed, specialPressed };
  }
}
