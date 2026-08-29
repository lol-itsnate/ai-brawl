// Deterministic AI controller with a rolling adaptation window.
//
// Base behaviour: far → approach, in range → attack, occasional block/jump,
// backs off after a hit streak.
//
// Phase F2 additions — the AI understands all 9 special kinds and picks
// contextually appropriate usage per kind:
//   dash        → mid-range gap-close
//   teleport    → long-range or near-wall escape
//   slam / aoe  → close-range punish
//   projectile  → mid/long-range poke
//   stun        → close-range punish (safer commit)
//   shield      → defensive; use when HP < 55%
//   heal        → defensive; use when HP < 45%
//   lifesteal   → close-range aggressive; use when HP not full
//   damage_boost→ pre-engage; use before closing to opponent
//
// Stun-fighter safety: post-stun immunity (STUN_IMMUNITY_S in fighter.js)
// makes chain-locking impossible; the AI doesn't need to know about it.

const DECISION_INTERVAL = 0.20;

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

    this._resetStats();
    this.timeInWindow = 0;
    this.windowLen = 5.0;

    this.aggressionBias = 0;
    this.blockBias = 0;
    this.spacingBias = 0;
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
    this.stats = { playerAttacks: 0, playerBlockTicks: 0, hitsOnPlayer: 0, hitsOnSelf: 0 };
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

  notifyGotHit() { this.stats.hitsOnSelf += 1; }

  update(dt, self, opponent) {
    this.decisionT -= dt;
    this.modeT -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.playerAttackDetectedT > 0) this.playerAttackDetectedT -= dt;
    this.timeInWindow += dt;

    // If stunned, produce a no-op intent — cannot decide or act
    if (self.stunT > 0) {
      this._clearLatches();
      return { moveDir: 0, jumpPressed: false, blockHeld: false,
               lightPressed: false, heavyPressed: false, specialPressed: false };
    }

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
    if (opponent.blocking) this.stats.playerBlockTicks += 1;

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
    const spamRate  = this.stats.playerAttacks   / secs;
    const blockRate = this.stats.playerBlockTicks / (secs * 60);
    const dominance = this.stats.hitsOnSelf - this.stats.hitsOnPlayer;

    if (spamRate > 1.5) this.blockBias = Math.min(0.20, this.blockBias + 0.06);
    else                this.blockBias = Math.max(0,    this.blockBias - 0.04);

    if (blockRate > 0.25) this.spacingBias = Math.min(1.0, this.spacingBias + 0.20);
    else                  this.spacingBias = Math.max(0,   this.spacingBias - 0.12);

    if      (dominance >  2) this.aggressionBias = Math.min( 0.15, this.aggressionBias + 0.05);
    else if (dominance < -3) this.aggressionBias = Math.max(-0.15, this.aggressionBias - 0.05);
    else                     this.aggressionBias *= 0.7;
  }

  _decide(self, opponent) {
    const dx = opponent.x - self.x;
    const dist = Math.abs(dx);
    const specialReady = self.cooldowns.special <= 0;
    const specialKind = self.char.special.kind;
    const lowHp = self.hp < self.maxHp * 0.25;

    if (this.mode === 'retreat' && this.modeT > 0) return;
    if (this.mode === 'block'   && this.modeT > 0) return;

    // Utility/self-buff specials — pick based on HP + state, not distance
    if (specialReady) {
      if (specialKind === 'heal' && self.hp < self.maxHp * 0.45) {
        return this._commitSpecial();
      }
      if (specialKind === 'shield' && self.shieldHp <= 0 && self.hp < self.maxHp * 0.55) {
        return this._commitSpecial();
      }
      if (specialKind === 'damage_boost' && self.dmgBoostT <= 0 && dist < 400 && this.rng() < 0.6) {
        return this._commitSpecial();
      }
      // Projectile — mid/long range
      if (specialKind === 'projectile' && dist > 220 && dist < 900 && this.rng() < 0.55 + this.aggressionBias) {
        return this._commitSpecial();
      }
      // Stun / lifesteal — close range punish
      if ((specialKind === 'stun' || specialKind === 'lifesteal') && dist < 130 && this.rng() < 0.55 + this.aggressionBias) {
        return this._commitSpecial();
      }
    }

    if (lowHp) {
      if (specialReady && this.rng() < 0.40) {
        return this._commitSpecial();
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
    }

    const specialRoll = this.rng();
    const wantsSpecial = specialReady && (
      (specialKind === 'slam'     && dist < 130 && specialRoll < 0.55 + this.aggressionBias) ||
      (specialKind === 'dash'     && dist > 180 && dist < 520 && specialRoll < 0.45 + this.aggressionBias) ||
      (specialKind === 'teleport' && (dist > 380 || this._nearWall(self)) && specialRoll < 0.55 + this.aggressionBias)
    );
    if (wantsSpecial) return this._commitSpecial();

    const canAttackNow = this.attackCooldown <= 0;

    if (dist < 110) {
      if (!canAttackNow) {
        if (this.rng() < 0.40 + this.blockBias) { this.mode = 'block'; this.modeT = 0.25; }
        else                                    { this.mode = 'approach'; this.modeT = 0.10; }
        return;
      }
      if (this.spacingBias > 0.3 && this.rng() < this.spacingBias * 0.7) {
        this.mode = 'retreat'; this.modeT = 0.35 + this.rng() * 0.20;
        return;
      }
      const r = this.rng();
      const aggression = 0.85 + this.aggressionBias;
      const reactBlock = 0.15 + this.blockBias;
      if (r < reactBlock && this.playerAttackDetectedT > 0) {
        this.mode = 'block'; this.modeT = 0.30 + this.rng() * 0.15;
      } else if (r < reactBlock + aggression * 0.65) {
        this.mode = 'attack-light'; this.modeT = 0.12;
        this.lightLatch = true;
        this.attackCooldown = 0.35 + this.rng() * 0.20;
      } else if (r < reactBlock + aggression * 0.92) {
        this.mode = 'attack-heavy'; this.modeT = 0.20;
        this.heavyLatch = true;
        this.attackCooldown = 0.55 + this.rng() * 0.20;
      } else {
        this.mode = 'block'; this.modeT = 0.25;
      }
    } else if (dist < 260) {
      if (this.rng() < 0.14) {
        this.mode = 'jump-approach'; this.modeT = 0.25; this.jumpLatch = true;
      } else {
        this.mode = 'approach'; this.modeT = 0.10;
      }
    } else {
      this.mode = 'approach'; this.modeT = 0.10;
    }
  }

  _commitSpecial() {
    this.mode = 'attack-special';
    this.modeT = 0.15;
    this.specialLatch = true;
    this.attackCooldown = 0.50 + this.rng() * 0.20;
  }

  _nearWall(self) {
    return self.x < 200 || self.x > 1000;
  }

  _buildIntent(self, opponent) {
    const dx = opponent.x - self.x;
    const dir = dx >= 0 ? 1 : -1;
    let moveDir = 0, jumpPressed = false, blockHeld = false;
    let lightPressed = false, heavyPressed = false, specialPressed = false;

    if (this.mode === 'approach' || this.mode === 'jump-approach') moveDir = dir;
    else if (this.mode === 'retreat')                              moveDir = -dir;
    else if (this.mode === 'block')                                blockHeld = true;

    if (this.jumpLatch)    { jumpPressed = true;    this.jumpLatch = false; }
    if (this.lightLatch)   { lightPressed = true;   this.lightLatch = false; }
    if (this.heavyLatch)   { heavyPressed = true;   this.heavyLatch = false; }
    if (this.specialLatch) { specialPressed = true; this.specialLatch = false; }

    return { moveDir, jumpPressed, blockHeld, lightPressed, heavyPressed, specialPressed };
  }
}
