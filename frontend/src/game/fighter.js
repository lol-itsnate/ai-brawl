import { ARENA, PHYSICS } from './constants.js';

// Fighter entity — physics + state machine for a single character.
// States: 'idle' | 'walk' | 'jump' | 'block' | 'attack' | 'hitstun' | 'stunned'
// Attack phases: 'startup' | 'active' | 'recovery'
//
// Phase F2 additions (runtime state layered on top of Phase 1):
//   stunT / stunImmuneT  — special-stun timer + post-stun immunity (anti chain-lock)
//   shieldHp / shieldT   — barrier HP absorbed before real HP, decays over duration
//   dmgBoostMult / dmgBoostT — self damage buff (damage_boost special or passive combo)
//   adrenalineMult / adrenalineT — post-hit speed buff (damage_taken_speed_boost passive)
//   comboCount / comboT  — landed-hit streak for combo_damage_boost passive
//   healFxT              — brief green sparkle after a heal
//
// The 3 default fighters carry NO passive field; passive checks are `?.` — no-ops for them.
// Non-hitbox specials (shield/heal/damage_boost/projectile) are attacks with hbW=hbH=0;
// getActiveHitbox() returns null so they never collide themselves. The engine reads
// attack.needsActivation on the startup→active transition and applies the effect
// (spawn projectile, heal, apply buff) once per activation.

const STUN_IMMUNITY_S = 1.5;   // grace after a stun ends — prevents chain-locking
const COMBO_WINDOW_S  = 1.5;
const ADRENALINE_S    = 2.0;

export class Fighter {
  constructor(character, x, side, tint = null) {
    this.char = character;
    this.side = side;
    this.tint = tint;
    this.x = x;
    this.y = ARENA.groundY;
    this.vx = 0;
    this.vy = 0;
    this.facing = side === 'left' ? 1 : -1;
    this.hp = character.maxHp;
    this.maxHp = character.maxHp;
    this.onGround = true;
    this.state = 'idle';
    this.blocking = false;

    // Attack state
    this.attack = null;
    this.hitstunT = 0;
    this.flashT = 0;
    this.blockFlashT = 0;

    // Cooldowns
    this.cooldowns = { light: 0, heavy: 0, special: 0 };
    this.specialFx = null;

    // Phase F2 runtime buff/debuff state
    this.stunT = 0;
    this.stunImmuneT = 0;
    this.shieldHp = 0;
    this.shieldT = 0;
    this.dmgBoostMult = 1;
    this.dmgBoostT = 0;
    this.adrenalineMult = 1;
    this.adrenalineT = 0;
    this.comboCount = 0;
    this.comboT = 0;
    this.healFxT = 0;
  }

  get width()  { return this.char.body.bodyW; }
  get height() { return this.char.body.bodyH; }

  get hurtbox() {
    return {
      x: this.x - this.width / 2,
      y: this.y - this.height,
      w: this.width,
      h: this.height,
    };
  }

  // Current active attack hitbox (or null). Non-hitbox specials (shield/heal/etc.)
  // return null so they never collide.
  getActiveHitbox() {
    if (!this.attack || this.attack.phase !== 'active') return null;
    const def = this.attack.def;
    if (!def.hbW || !def.hbH) return null;
    const cx = this.x + this.facing * (this.width / 2 + def.reach / 2);
    const cy = this.y - this.height * 0.55;
    return { x: cx - def.hbW / 2, y: cy - def.hbH / 2, w: def.hbW, h: def.hbH };
  }

  canAct() {
    return this.hitstunT <= 0 && this.stunT <= 0 && !this.attack;
  }

  effectiveMoveSpeed() {
    return this.char.moveSpeed * (this.adrenalineT > 0 ? this.adrenalineMult : 1);
  }

  startAttack(type) {
    if (!this.canAct() || !this.onGround) return false;
    if (this.blocking) return false;
    if (this.cooldowns[type] > 0) return false;
    const def = type === 'special' ? this.char.special :
                type === 'heavy'   ? this.char.heavy   :
                                     this.char.light;
    this.attack = {
      type,
      phase: 'startup',
      t: def.startup,
      def,
      hitTargets: new Set(),
      needsActivation: false,  // set true on startup→active for engine hook
    };
    this.state = 'attack';
    if (type !== 'special') this.vx = 0;
    if (type === 'special') this._onSpecialStart();
    return true;
  }

  _onSpecialStart() {
    const s = this.char.special;
    switch (s.kind) {
      case 'dash':
        this.vx = this.facing * (s.dashSpeed || 720);
        this.specialFx = { kind: 'dash', trail: [], justStarted: true };
        break;
      case 'slam':
        this.vy = s.liftVelocity ?? -520;
        this.onGround = false;
        this.specialFx = { kind: 'slam', shockwave: 0, justStarted: true };
        break;
      case 'teleport':
        this.specialFx = { kind: 'teleport', phase: 'vanish', pre: { x: this.x, y: this.y }, justStarted: true };
        break;
      case 'projectile':
      case 'stun':
      case 'lifesteal':
      case 'shield':
      case 'heal':
      case 'damage_boost':
        // Grounded cast — halt lateral drift so cast/telegraph reads clearly
        this.vx = 0;
        this.specialFx = { kind: s.kind, justStarted: true };
        break;
      default:
        this.specialFx = { kind: s.kind || 'dash', justStarted: true };
    }
  }

  // Applies a hit to THIS fighter (defender).
  // Returns the amount of HP actually lost (post-mitigation, post-shield-absorb).
  // opts: { stunDuration?: seconds — attempts to stun on hit if not stunImmune }
  applyHit(attacker, def, opts = {}) {
    // Damage_reduction defender passive
    let baseDmg = def.damage;
    if (this.char.passive?.type === 'damage_reduction') {
      baseDmg *= (1 - this.char.passive.value);
    }

    if (this.blocking && this.onGround) {
      // Blocked hit — shield does NOT absorb blocked chip damage (block itself already reduces to 20%)
      const chip = baseDmg * 0.20;
      this.hp -= chip;
      this.vx += Math.sign(attacker.facing) * def.knockback * 0.15;
      this.vy = 0;
      this.flashT = 0.10;
      this.blockFlashT = 0.24;
      if (this.hp < 0) this.hp = 0;
      return chip;
    }

    // Shield absorption
    let remaining = baseDmg;
    let absorbed = 0;
    if (this.shieldHp > 0) {
      absorbed = Math.min(this.shieldHp, remaining);
      this.shieldHp -= absorbed;
      remaining -= absorbed;
      this.blockFlashT = Math.max(this.blockFlashT, 0.20);
    }
    this.hp -= remaining;
    const totalTaken = remaining + absorbed;   // damage that "counted" (for lifesteal etc)

    this.vx = Math.sign(attacker.facing) * def.knockback;
    if (def.knockback > 300 && this.onGround) {
      this.vy = -180;
      this.onGround = false;
    }
    if (this.vy < -260) this.vy = -260;
    this.hitstunT = def.hitstun;
    this.state = 'hitstun';
    this.attack = null;
    this.specialFx = null;
    this.flashT = 0.22;

    // damage_taken_speed_boost passive → adrenaline
    if (this.char.passive?.type === 'damage_taken_speed_boost') {
      this.adrenalineT = ADRENALINE_S;
      this.adrenalineMult = this.char.passive.value;
    }

    // Stun on hit (respects post-stun immunity to prevent chain-lock)
    if (opts.stunDuration && opts.stunDuration > 0 && this.stunImmuneT <= 0) {
      this.stunT = opts.stunDuration;
      this.state = 'hitstun';
    }

    if (this.hp < 0) this.hp = 0;
    return totalTaken;
  }

  // Engine calls this whenever this fighter's attack lands (so combo_damage_boost
  // passive can advance its stack counter). Non-passive characters just ignore.
  notifyLandedHit() {
    if (this.char.passive?.type === 'combo_damage_boost') {
      this.comboCount = Math.min(4, this.comboCount + 1);
      this.comboT = COMBO_WINDOW_S;
    }
  }

  // Buff application helpers (engine calls on shield/damage_boost/heal special activation)
  addShield(amount, duration) {
    this.shieldHp = Math.max(this.shieldHp, amount);
    this.shieldT = Math.max(this.shieldT, duration);
  }
  addDamageBoost(mult, duration) {
    this.dmgBoostMult = Math.max(this.dmgBoostMult, mult);
    this.dmgBoostT = Math.max(this.dmgBoostT, duration);
  }
  heal(amount) {
    if (amount <= 0) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.healFxT = 0.6;
  }

  update(dt, opponent, intent) {
    // Tick cooldowns
    for (const k of ['light','heavy','special']) {
      if (this.cooldowns[k] > 0) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    }
    if (this.flashT > 0)      this.flashT      = Math.max(0, this.flashT - dt);
    if (this.blockFlashT > 0) this.blockFlashT = Math.max(0, this.blockFlashT - dt);
    if (this.healFxT > 0)     this.healFxT     = Math.max(0, this.healFxT - dt);

    // Buff/debuff timers
    if (this.shieldT > 0) {
      this.shieldT = Math.max(0, this.shieldT - dt);
      if (this.shieldT <= 0) this.shieldHp = 0;
    }
    if (this.dmgBoostT > 0) {
      this.dmgBoostT = Math.max(0, this.dmgBoostT - dt);
      if (this.dmgBoostT <= 0) this.dmgBoostMult = 1;
    }
    if (this.adrenalineT > 0) {
      this.adrenalineT = Math.max(0, this.adrenalineT - dt);
      if (this.adrenalineT <= 0) this.adrenalineMult = 1;
    }
    if (this.comboT > 0) {
      this.comboT = Math.max(0, this.comboT - dt);
      if (this.comboT <= 0) this.comboCount = 0;
    }
    if (this.stunT > 0) {
      this.stunT = Math.max(0, this.stunT - dt);
      if (this.stunT <= 0) {
        // Grant immunity so a stun-fighter can't chain-lock this one
        this.stunImmuneT = STUN_IMMUNITY_S;
        this.state = this.onGround ? 'idle' : 'jump';
      }
    } else if (this.stunImmuneT > 0) {
      this.stunImmuneT = Math.max(0, this.stunImmuneT - dt);
    }

    // Face opponent (idle turnaround)
    if (!this.attack && this.hitstunT <= 0 && this.stunT <= 0) {
      this.facing = opponent.x >= this.x ? 1 : -1;
    }

    // Hitstun tick
    if (this.hitstunT > 0) {
      this.hitstunT -= dt;
      if (this.hitstunT <= 0) {
        this.hitstunT = 0;
        this.state = this.stunT > 0 ? 'hitstun' : (this.onGround ? 'idle' : 'jump');
      }
    }

    // Blocking — only while grounded and actionable (not stunned)
    this.blocking = !!(intent.blockHeld && this.onGround && this.canAct());

    // Attack progression
    if (this.attack) {
      const a = this.attack;
      a.t -= dt;
      if (a.t <= 0) {
        if (a.phase === 'startup') {
          a.phase = 'active';
          a.t = a.def.active;
          a.needsActivation = true;   // engine's activation hook fires this frame
        } else if (a.phase === 'active') {
          a.phase = 'recovery';
          a.t = a.def.recovery;
        } else if (a.phase === 'recovery') {
          this.cooldowns[a.type] = a.type === 'special' ? this.char.special.cooldown :
                                   a.type === 'heavy'   ? 0.9 : 0.35;
          this.attack = null;
          this.state = this.onGround ? 'idle' : 'jump';
          this.specialFx = null;
        }
      }

      // Special-specific motion during active window (dash/teleport/slam)
      if (this.attack && this.attack.type === 'special') {
        const s = this.char.special;
        if (s.kind === 'dash' && a.phase !== 'recovery') {
          this.vx = this.facing * (s.dashSpeed || 720);
          if (this.specialFx?.trail) {
            this.specialFx.trail.push({ x: this.x, y: this.y - this.height/2, t: 0.28 });
            if (this.specialFx.trail.length > 12) this.specialFx.trail.shift();
          }
        }
        if (s.kind === 'teleport' && a.phase === 'active' && this.specialFx?.phase === 'vanish') {
          const offset = s.teleportOffset || 90;
          const targetSide = opponent.facing === 1 ? -1 : 1;
          this.x = opponent.x + targetSide * offset;
          this.x = Math.max(ARENA.wallPad + this.width/2, Math.min(ARENA.width - ARENA.wallPad - this.width/2, this.x));
          this.facing = opponent.x >= this.x ? 1 : -1;
          this.specialFx.phase = 'strike';
          this.specialFx.postAt = { x: this.x, y: this.y };
          this.specialFx.arrivalBurstPending = true;
        }
        if (s.kind === 'slam' && this.specialFx) {
          if (this.onGround && (a.phase === 'active' || a.phase === 'recovery')) {
            this.specialFx.shockwave = Math.min(1, this.specialFx.shockwave + dt * 3);
          }
        }
      }
    }

    // Movement input (only if actionable and not attacking non-dash)
    const canMove = this.canAct() && !this.blocking;
    if (canMove) {
      const speed = this.effectiveMoveSpeed();
      const target = intent.moveDir * speed;
      if (target !== 0 && this.vx !== 0 && Math.sign(target) !== Math.sign(this.vx)) {
        this.vx = 0;
      }
      const rampTime = 0.10;
      const accel = speed / rampTime;
      const delta = target - this.vx;
      const step = Math.sign(delta) * Math.min(Math.abs(delta), accel * dt);
      this.vx += step;
      if (target === 0 && Math.abs(this.vx) < 4) this.vx = 0;
      if (this.onGround) this.state = intent.moveDir !== 0 ? 'walk' : 'idle';
      if (intent.jumpPressed && this.onGround) {
        this.vy = PHYSICS.jumpVelocity;
        this.onGround = false;
        this.state = 'jump';
      }
      if (intent.lightPressed)   this.startAttack('light');
      else if (intent.heavyPressed) this.startAttack('heavy');
      else if (intent.specialPressed) this.startAttack('special');
    } else if (!this.canAct()) {
      if (this.onGround && !(this.attack && this.attack.type === 'special' && this.char.special.kind === 'dash')) {
        this.vx -= this.vx * Math.min(1, PHYSICS.friction * 0.5 * dt);
      }
    }

    // Gravity
    if (!this.onGround) {
      this.vy += PHYSICS.gravity * dt;
    }

    // Integrate
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Ground / air resync
    if (this.y >= ARENA.groundY) {
      this.y = ARENA.groundY;
      this.vy = 0;
      this.onGround = true;
      if (this.state === 'jump') this.state = this.hitstunT > 0 ? 'hitstun' : 'idle';
    } else {
      this.onGround = false;
    }
    if (this.y < 120) { this.y = 120; if (this.vy < 0) this.vy = 0; }

    // Arena bounds
    const minX = ARENA.wallPad + this.width/2;
    const maxX = ARENA.width - ARENA.wallPad - this.width/2;
    if (this.x < minX) { this.x = minX; if (this.vx < 0) this.vx = 0; }
    if (this.x > maxX) { this.x = maxX; if (this.vx > 0) this.vx = 0; }
  }
}
