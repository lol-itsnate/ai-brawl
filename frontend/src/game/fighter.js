import { ARENA, PHYSICS } from './constants.js';

// Fighter entity — physics + state machine for a single character.
// States: 'idle' | 'walk' | 'jump' | 'block' | 'attack' | 'hitstun'
// Attack phases: 'startup' | 'active' | 'recovery'

export class Fighter {
  constructor(character, x, side, tint = null) {
    this.char = character;
    this.side = side;              // 'left' or 'right' (starting side)
    this.tint = tint;              // optional color override for mirror matches
    this.x = x;
    this.y = ARENA.groundY;        // feet position
    this.vx = 0;
    this.vy = 0;
    this.facing = side === 'left' ? 1 : -1; // +1 faces right, -1 faces left
    this.hp = character.maxHp;
    this.maxHp = character.maxHp;
    this.onGround = true;
    this.state = 'idle';
    this.blocking = false;

    // Attack state
    this.attack = null;   // { type:'light'|'heavy'|'special', phase, t, def, hitTargets:Set }
    this.hitstunT = 0;
    this.flashT = 0;      // brief hit flash timer (visual only)
    this.blockFlashT = 0; // brief guard-pulse when a hit was blocked

    // Cooldowns (seconds remaining)
    this.cooldowns = { light: 0, heavy: 0, special: 0 };

    // Special-specific extras (dash direction, slam grounded check, teleport marker)
    this.specialFx = null; // { kind, ... } for renderer trails
  }

  get width()  { return this.char.body.bodyW; }
  get height() { return this.char.body.bodyH; }

  // Hurtbox rect in world coords (feet-based y)
  get hurtbox() {
    return {
      x: this.x - this.width / 2,
      y: this.y - this.height,
      w: this.width,
      h: this.height,
    };
  }

  // Current active attack hitbox (or null)
  getActiveHitbox() {
    if (!this.attack || this.attack.phase !== 'active') return null;
    const def = this.attack.def;
    const cx = this.x + this.facing * (this.width / 2 + def.reach / 2);
    const cy = this.y - this.height * 0.55;
    return {
      x: cx - def.hbW / 2,
      y: cy - def.hbH / 2,
      w: def.hbW,
      h: def.hbH,
    };
  }

  canAct() {
    return this.hitstunT <= 0 && !this.attack;
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
    };
    this.state = 'attack';
    // Halt lateral movement during light/heavy startup (specials handle motion below).
    if (type !== 'special') this.vx = 0;

    // Trigger special-specific motion at attack start
    if (type === 'special') {
      const s = this.char.special;
      if (s.kind === 'dash') {
        this.vx = this.facing * s.dashSpeed;
        this.specialFx = { kind: 'dash', trail: [], justStarted: true };
      } else if (s.kind === 'slam') {
        this.vy = s.liftVelocity;
        this.onGround = false;
        this.specialFx = { kind: 'slam', shockwave: 0, justStarted: true };
      } else if (s.kind === 'teleport') {
        this.specialFx = { kind: 'teleport', phase: 'vanish', pre: {x:this.x, y:this.y}, justStarted: true };
      }
    }
    return true;
  }

  applyHit(attacker, def, hitStunOverride = null) {
    // Blocking: cannot block airborne
    if (this.blocking && this.onGround) {
      this.hp -= def.damage * 0.20;
      this.vx += Math.sign(attacker.facing) * def.knockback * 0.15;
      this.vy = 0;                // blocking cancels any vertical launch
      this.flashT = 0.10;
      this.blockFlashT = 0.24;    // triggers guard-pulse render + spark burst
    } else {
      this.hp -= def.damage;
      this.vx = Math.sign(attacker.facing) * def.knockback;
      // Small vertical pop — ONLY if grounded, so airborne victims don't relaunch.
      // (Previously this set vy without setting onGround=false, so gravity never applied
      //  and chained hits pushed the fighter off the top of the arena.)
      if (def.knockback > 300 && this.onGround) {
        this.vy = -180;
        this.onGround = false;
      }
      // Hard safety cap on upward velocity from any source.
      if (this.vy < -260) this.vy = -260;
      this.hitstunT = hitStunOverride ?? def.hitstun;
      this.state = 'hitstun';
      // Cancel own attack
      this.attack = null;
      this.specialFx = null;
      this.flashT = 0.22;
    }
    if (this.hp < 0) this.hp = 0;
  }

  update(dt, opponent, intent) {
    // intent = { moveDir, jumpPressed, blockHeld, lightPressed, heavyPressed, specialPressed }

    // Tick cooldowns
    for (const k of ['light','heavy','special']) {
      if (this.cooldowns[k] > 0) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    }
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);
    if (this.blockFlashT > 0) this.blockFlashT = Math.max(0, this.blockFlashT - dt);

    // Face opponent (only when not attacking; keeps swings consistent)
    if (!this.attack && this.hitstunT <= 0) {
      this.facing = opponent.x >= this.x ? 1 : -1;
    }

    // Hitstun tick
    if (this.hitstunT > 0) {
      this.hitstunT -= dt;
      if (this.hitstunT <= 0) {
        this.hitstunT = 0;
        this.state = this.onGround ? 'idle' : 'jump';
      }
    }

    // Blocking
    this.blocking = !!(intent.blockHeld && this.onGround && this.canAct());

    // Handle attack progression
    if (this.attack) {
      const a = this.attack;
      a.t -= dt;
      if (a.t <= 0) {
        if (a.phase === 'startup') {
          a.phase = 'active';
          a.t = a.def.active;
        } else if (a.phase === 'active') {
          a.phase = 'recovery';
          a.t = a.def.recovery;
          // Special: end active phase specifics
          if (a.type === 'special' && this.char.special.kind === 'teleport') {
            // teleport uses full active window drawn at target spot; nothing more here
          }
        } else if (a.phase === 'recovery') {
          this.cooldowns[a.type] = a.type === 'special' ? this.char.special.cooldown :
                                   a.type === 'heavy'   ? 0.9 : 0.35;
          this.attack = null;
          this.state = this.onGround ? 'idle' : 'jump';
          this.specialFx = null;
        }
      }

      // Character-specific special motion during active
      if (this.attack && this.attack.type === 'special') {
        const s = this.char.special;
        if (s.kind === 'dash' && a.phase !== 'recovery') {
          // stay at dash speed during startup+active
          this.vx = this.facing * s.dashSpeed;
          if (this.specialFx?.trail) {
            this.specialFx.trail.push({ x: this.x, y: this.y - this.height/2, t: 0.28 });
            if (this.specialFx.trail.length > 12) this.specialFx.trail.shift();
          }
        }
        if (s.kind === 'teleport' && a.phase === 'active' && this.specialFx?.phase === 'vanish') {
          // Reappear near opponent, opposite side of their facing
          const offset = s.teleportOffset;
          const targetSide = opponent.facing === 1 ? -1 : 1; // appear behind opponent
          this.x = opponent.x + targetSide * offset;
          this.x = Math.max(ARENA.wallPad + this.width/2, Math.min(ARENA.width - ARENA.wallPad - this.width/2, this.x));
          this.facing = opponent.x >= this.x ? 1 : -1;
          this.specialFx.phase = 'strike';
          this.specialFx.postAt = { x: this.x, y: this.y };
          this.specialFx.arrivalBurstPending = true;
        }
        if (s.kind === 'slam' && this.specialFx) {
          // Shockwave grows while grounded during active AND recovery so the ring lingers.
          if (this.onGround && (a.phase === 'active' || a.phase === 'recovery')) {
            this.specialFx.shockwave = Math.min(1, this.specialFx.shockwave + dt * 3);
          }
        }
      }
    }

    // Movement input (only if actionable and not attacking non-dash)
    const canMove = this.canAct() && !this.blocking;
    if (canMove) {
      if (intent.moveDir !== 0) {
        this.vx = intent.moveDir * this.char.moveSpeed;
        if (this.onGround) this.state = 'walk';
      } else if (this.onGround) {
        // decelerate
        this.vx -= this.vx * Math.min(1, PHYSICS.friction * dt);
        if (Math.abs(this.vx) < 5) this.vx = 0;
        this.state = 'idle';
      }
      if (intent.jumpPressed && this.onGround) {
        this.vy = PHYSICS.jumpVelocity;
        this.onGround = false;
        this.state = 'jump';
      }
      if (intent.lightPressed)   this.startAttack('light');
      else if (intent.heavyPressed) this.startAttack('heavy');
      else if (intent.specialPressed) this.startAttack('special');
    } else if (!this.canAct()) {
      // In hitstun or attacking: apply ground friction if not dash-special
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

    // Ground collision + airborne state sync
    if (this.y >= ARENA.groundY) {
      this.y = ARENA.groundY;
      this.vy = 0;
      this.onGround = true;
      if (this.state === 'jump') this.state = this.hitstunT > 0 ? 'hitstun' : 'idle';
    } else {
      // Above ground → mark airborne so gravity keeps applying next frame.
      // (Fixes: hits used to pop vy without setting onGround=false, so gravity
      // wouldn't apply and fighters launched to the sky on combos.)
      this.onGround = false;
    }
    // Hard ceiling — fighter can never leave the visible arena
    if (this.y < 120) {
      this.y = 120;
      if (this.vy < 0) this.vy = 0;
    }

    // Arena bounds
    const minX = ARENA.wallPad + this.width/2;
    const maxX = ARENA.width - ARENA.wallPad - this.width/2;
    if (this.x < minX) { this.x = minX; if (this.vx < 0) this.vx = 0; }
    if (this.x > maxX) { this.x = maxX; if (this.vx > 0) this.vx = 0; }
  }
}
