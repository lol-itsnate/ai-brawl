import { ARENA, ROUND, KEYS } from './constants.js';
import { Fighter } from './fighter.js';
import { AIController } from './ai.js';
import { getCharacter } from './characters.js';
import { InputManager } from './input.js';
import { renderScene } from './renderer.js';
import { ParticleSystem } from './particles.js';
import { DamageNumbers } from './damageNumbers.js';
import { Projectile } from './projectile.js';

// Fight lifecycle timings
const INTRO_DURATION = 1.8;
const KO_DURATION    = 0.75;

// Hit-stop (freeze-frame) durations
const FREEZE_HEAVY_HIT   = 0.075;
const FREEZE_SPECIAL_HIT = 0.090;
const FREEZE_BLOCKED_HVY = 0.040;

function rectsOverlap(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

export class GameEngine {
  constructor({ canvas, playerCharId, aiCharId, onStateChange }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.playerCharId = playerCharId;
    this.aiCharId = aiCharId;
    this.onStateChange = onStateChange || (() => {});

    this.input = new InputManager();
    this.particles = new ParticleSystem();
    this.damageNumbers = new DamageNumbers();
    this.projectiles = [];

    this.running = false;
    this.paused = false;
    this._backgroundPaused = false;
    this._raf = null;
    this._lastTime = 0;
    this._visHandler = null;

    // FX state
    this.shakeT = 0;
    this.shakeMag = 0;
    this.koFlashT = 0;
    this.freezeT = 0;

    this._buildMatch();
  }

  _buildMatch() {
    const p = getCharacter(this.playerCharId);
    const a = getCharacter(this.aiCharId);
    const mirror = this.playerCharId === this.aiCharId;

    this.player = new Fighter(p, 320, 'left');
    this.ai     = new Fighter(a, 880, 'right', mirror ? '#ff5d8f' : null);
    this.player.facing = 1;
    this.ai.facing = -1;

    this.aiCtrl = new AIController(0xC0FFEE);
    this.time = ROUND.timeLimit;

    this.phase = 'intro';
    this.status = null;
    this.koCause = null;
    this.introT = INTRO_DURATION;
    this.koT = 0;
    this.pendingStatus = null;

    this.particles.parts.length = 0;
    this.damageNumbers.reset();
    this.projectiles.length = 0;
    this.shakeT = 0;
    this.shakeMag = 0;
    this.koFlashT = 0;
    this.freezeT = 0;

    this._pushEvent();
  }

  _pushEvent() {
    this.onStateChange({
      phase: this.phase,
      paused: this.paused,
      introT: this.introT,
      status: this.status,
      koCause: this.koCause,
      time: this.time,
      player: this._hudFor(this.player),
      ai:     this._hudFor(this.ai),
    });
  }

  _hudFor(f) {
    return {
      name: f.char.name,
      id: f.char.id,
      hp: f.hp,
      maxHp: f.maxHp,
      specialCd: f.cooldowns.special,
      specialMax: f.char.special.cooldown,
      shieldHp: f.shieldHp,
      dmgBoostT: f.dmgBoostT,
      stunT: f.stunT,
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.input.attach();
    this._visHandler = () => {
      if (document.hidden) this._backgroundPaused = true;
      else { this._backgroundPaused = false; this._lastTime = performance.now(); }
    };
    document.addEventListener('visibilitychange', this._visHandler);
    this._lastTime = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this._raf);
    this.input.detach();
    if (this._visHandler) document.removeEventListener('visibilitychange', this._visHandler);
  }

  restart() {
    this.stop();
    this.paused = false;
    this._buildMatch();
    this.start();
  }

  setPaused(v) {
    const val = !!v;
    if (val === this.paused) return;
    this.paused = val;
    if (val) this.input.clear();
    else     this._lastTime = performance.now();
    this._pushEvent();
  }

  _tick = (now) => {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._tick);

    let dt = (now - this._lastTime) / 1000;
    this._lastTime = now;
    if (this._backgroundPaused || this.paused) dt = 0;
    if (dt > 0.05) dt = 0.05;

    if (this.shakeT > 0)   this.shakeT   = Math.max(0, this.shakeT - dt);
    if (this.koFlashT > 0) this.koFlashT = Math.max(0, this.koFlashT - dt);
    if (this.freezeT > 0)  this.freezeT  = Math.max(0, this.freezeT - dt);

    const simDt = this.freezeT > 0 ? 0 : dt;

    if (this.phase === 'intro') {
      this.introT -= dt;
      if (this.introT <= 0) { this.introT = 0; this.phase = 'active'; }
      this.particles.update(dt);
      this.damageNumbers.update(dt);
    } else if (this.phase === 'active') {
      this._simulate(simDt);
      this.particles.update(simDt);
      this.damageNumbers.update(simDt);
    } else if (this.phase === 'ko') {
      const slow = 0.35;
      const koDt = simDt * slow;
      this._stepEntities(koDt);
      this.particles.update(koDt);
      this.damageNumbers.update(koDt);
      this.koT -= dt;
      if (this.koT <= 0) {
        this.status = this.pendingStatus;
        this.phase = 'ended';
      }
    } else if (this.phase === 'ended') {
      this.particles.update(dt);
      this.damageNumbers.update(dt);
    }

    renderScene(this.ctx, this);
    this._pushEvent();
    this.input.endFrame();
  };

  _readPlayerIntent() {
    const inp = this.input;
    const left = inp.isDown(KEYS.left);
    const right = inp.isDown(KEYS.right);
    return {
      moveDir: (right ? 1 : 0) + (left ? -1 : 0),
      jumpPressed: inp.consumePress(KEYS.jump),
      blockHeld: inp.isDown(KEYS.block),
      lightPressed: inp.consumePress(KEYS.light),
      heavyPressed: inp.consumePress(KEYS.heavy),
      specialPressed: inp.consumePress(KEYS.special),
    };
  }

  _stepEntities(dt) {
    const pIntent = this._readPlayerIntent();
    const aIntent = this.aiCtrl.update(dt, this.ai, this.player);
    const pWasAir = !this.player.onGround;
    const aWasAir = !this.ai.onGround;
    this.player.update(dt, this.ai, pIntent);
    this.ai.update(dt, this.player, aIntent);

    // Special activation hooks: fires ONCE per attack when startup→active transition happens.
    // Fighter.update sets attack.needsActivation on the transition frame; we clear it here.
    for (const [self, other] of [[this.player, this.ai], [this.ai, this.player]]) {
      if (self.attack?.needsActivation) {
        self.attack.needsActivation = false;
        this._onSpecialActivate(self, other);
      }
    }

    if (pWasAir && this.player.onGround) this._onLanded(this.player);
    if (aWasAir && this.ai.onGround)     this._onLanded(this.ai);

    this._emitSpecialFxParticles(this.player);
    this._emitSpecialFxParticles(this.ai);
    this._resolveOverlap(this.player, this.ai);
    this._resolveAttack(this.player, this.ai, false);
    this._resolveAttack(this.ai, this.player, true);
    this._updateProjectiles(dt);
  }

  // Fires once when a fighter's special enters the 'active' phase.
  // Handles all effect-based specials: projectile spawn, self-buff (shield/heal/damage_boost).
  // Motion-based specials (dash/teleport/slam) do their setup in Fighter._onSpecialStart.
  _onSpecialActivate(self, opponent) {
    if (!self.attack || self.attack.type !== 'special') return;
    const s = self.char.special;
    switch (s.kind) {
      case 'projectile': {
        const spd = (s.projSpeed || 620) * self.facing;
        const proj = new Projectile({
          owner: self,
          x: self.x + self.facing * (self.width / 2 + 6),
          y: self.y - self.height * 0.55,
          vx: spd,
          damage: s.damage,
          def: s,
          radius: s.projRadius || 22,
          life: s.projLife || 1.2,
          color: self.char.trail || self.char.color,
          secondary: self.char.accent || '#ffffff',
        });
        this.projectiles.push(proj);
        this.particles.emit(proj.x, proj.y, {
          count: 14, color: proj.color, speed: 240, spread: 1.0,
          gravity: -40, life: 0.35, size: 4,
        });
        this.shakeT = Math.max(this.shakeT, 0.08);
        this.shakeMag = Math.max(this.shakeMag, 4);
        break;
      }
      case 'shield': {
        self.addShield(s.shieldAmount || 30, s.shieldDuration || 3.0);
        this.particles.emit(self.x, self.y - self.height / 2, {
          count: 26, color: '#8fd7ff', speed: 240, spread: 1.0,
          gravity: -60, life: 0.6, size: 5,
        });
        break;
      }
      case 'heal': {
        self.heal(s.damage);        // reuse `damage` as heal magnitude (server enforces range)
        this.particles.emit(self.x, self.y - self.height / 2, {
          count: 24, color: '#7fff9a', speed: 200, spread: 1.0,
          gravity: -160, life: 0.7, size: 4,
        });
        this.particles.emit(self.x, self.y - self.height / 2, {
          count: 10, color: '#ffffff', speed: 120, spread: 1.0,
          gravity: -100, life: 0.5, size: 3,
        });
        break;
      }
      case 'damage_boost': {
        self.addDamageBoost(s.boostMult || 1.5, s.boostDuration || 4.0);
        this.particles.emit(self.x, self.y - self.height / 2, {
          count: 22, color: '#ff9a4a', speed: 220, spread: 1.0,
          gravity: -100, life: 0.55, size: 5,
        });
        break;
      }
      case 'stun': {
        // No effect-on-activate; the stun is applied on-hit via _resolveAttack (stunDuration).
        this.particles.emit(self.x + self.facing * self.width * 0.5, self.y - self.height * 0.55, {
          count: 10, color: '#ffffff', speed: 240, spread: 0.8,
          gravity: 20, life: 0.35, size: 4,
        });
        break;
      }
      case 'lifesteal': {
        // On-hit heal is applied by _resolveAttack.
        this.particles.emit(self.x + self.facing * self.width * 0.5, self.y - self.height * 0.55, {
          count: 10, color: '#ff5a8f', speed: 220, spread: 0.8,
          gravity: 100, life: 0.4, size: 4,
        });
        break;
      }
      // dash/slam/teleport handled in fighter.js
    }
  }

  _onLanded(f) {
    if (f.attack?.type === 'special' && f.char.special.kind === 'slam' && f.specialFx) {
      f.specialFx.shockwave = Math.max(f.specialFx.shockwave, 0.35);
      this.shakeT = Math.max(this.shakeT, 0.50);
      this.shakeMag = Math.max(this.shakeMag, 18);
      const g = ARENA.groundY;
      this.particles.emit(f.x, g, {
        count: 26, color: '#ffb984', speed: 380, spread: 0.7,
        angle: Math.PI * 1.5, gravity: -200, life: 0.7, size: 6,
      });
      this.particles.emit(f.x - 70, g, {
        count: 12, color: '#ffe0aa', speed: 300, spread: 0.35,
        angle: Math.PI, gravity: 200, life: 0.6, size: 5, shape: 'square',
      });
      this.particles.emit(f.x + 70, g, {
        count: 12, color: '#ffe0aa', speed: 300, spread: 0.35,
        angle: 0, gravity: 200, life: 0.6, size: 5, shape: 'square',
      });
    }
  }

  _emitSpecialFxParticles(f) {
    if (!f.attack || f.attack.type !== 'special' || !f.specialFx) return;
    const a = f.attack;
    const s = f.char.special;
    const fx = f.specialFx;

    if (fx.justStarted) {
      fx.justStarted = false;
      if (s.kind === 'dash') {
        this.shakeT = Math.max(this.shakeT, 0.18);
        this.shakeMag = Math.max(this.shakeMag, 8);
        this.particles.emit(f.x, f.y - f.height/2, {
          count: 22, color: '#fff5a3', speed: 380, spread: 1.0,
          gravity: 100, life: 0.4, size: 4,
        });
      } else if (s.kind === 'slam') {
        this.particles.emit(f.x, ARENA.groundY, {
          count: 10, color: '#ffb984', speed: 240, spread: 0.5,
          angle: Math.PI * 1.5, gravity: -100, life: 0.45, size: 5,
        });
      } else if (s.kind === 'teleport') {
        this.shakeT = Math.max(this.shakeT, 0.15);
        this.shakeMag = Math.max(this.shakeMag, 6);
        this.particles.emit(f.x, f.y - f.height/2, {
          count: 24, color: f.char.trail, speed: 260, spread: 1.0,
          gravity: -60, life: 0.5, size: 4,
        });
      }
    }

    if (s.kind === 'teleport' && fx.arrivalBurstPending) {
      fx.arrivalBurstPending = false;
      this.shakeT = Math.max(this.shakeT, 0.22);
      this.shakeMag = Math.max(this.shakeMag, 10);
      this.particles.emit(f.x, f.y - f.height/2, {
        count: 30, color: f.char.trail, speed: 340, spread: 1.0,
        gravity: 200, life: 0.55, size: 5,
      });
      this.particles.emit(f.x, f.y - f.height/2, {
        count: 14, color: '#ffb3ff', speed: 220, spread: 1.0,
        gravity: 150, life: 0.45, size: 4,
      });
    }

    if (a.phase === 'recovery') return;
    if (s.kind === 'dash') {
      this.particles.emit(f.x - f.facing * f.width * 0.4, f.y - f.height * 0.55, {
        count: 3, color: '#fff5a3', speed: 220, spread: 0.6,
        angle: f.facing > 0 ? Math.PI : 0, gravity: -20, life: 0.28, size: 3.2,
      });
      this.particles.emit(f.x, f.y - f.height * 0.7, {
        count: 2, color: '#7fd0ff', speed: 260, spread: 1.0,
        gravity: 100, life: 0.35, size: 4,
      });
    } else if (s.kind === 'slam' && a.phase === 'active' && f.onGround) {
      this.particles.emit(f.x + (Math.random() - 0.5) * 60, ARENA.groundY, {
        count: 2, color: '#ffd090', speed: 260, spread: 0.4,
        angle: Math.PI * 1.5, gravity: -300, life: 0.5, size: 5,
      });
    } else if (s.kind === 'teleport' && a.phase === 'startup') {
      this.particles.emit(f.x, f.y - f.height/2, {
        count: 2, color: f.char.trail, speed: 130, spread: 1.0,
        gravity: -60, life: 0.35, size: 4,
      });
    }
  }

  _updateProjectiles(dt) {
    if (this.projectiles.length === 0) return;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt);
      // Despawn past arena horizontal bounds
      if (p.x < ARENA.wallPad - p.radius || p.x > ARENA.width - ARENA.wallPad + p.radius) {
        p.dead = true;
      }
      if (p.dead) { this.projectiles.splice(i, 1); continue; }
      if (p.hitOnce) continue;

      // Collide with the non-owner fighter
      const target = p.owner === this.player ? this.ai : this.player;
      if (rectsOverlap(p.getHitbox(), target.hurtbox)) {
        p.hitOnce = true;
        this._applyProjectileHit(p, target);
        p.dead = true;
      }
    }
  }

  _applyProjectileHit(proj, target) {
    const attacker = proj.owner;
    const blocked = target.blocking && target.onGround;
    const modDmg = this._computeOutgoingDamage(attacker, proj.damage);
    const effDef = {
      damage: modDmg,
      knockback: proj.def.knockback ?? 220,
      hitstun: proj.def.hitstun ?? 0.28,
    };
    const dealt = target.applyHit(attacker, effDef);
    if (!blocked) {
      attacker.notifyLandedHit();
      if (attacker.char.passive?.type === 'lifesteal') {
        attacker.heal(dealt * attacker.char.passive.value);
      }
    }
    // FX
    const hx = proj.x, hy = proj.y;
    this.shakeT = Math.max(this.shakeT, blocked ? 0.10 : 0.20);
    this.shakeMag = Math.max(this.shakeMag, blocked ? 4 : 8);
    this.freezeT = Math.max(this.freezeT, blocked ? 0.03 : 0.06);
    this.particles.emit(hx, hy, {
      count: blocked ? 14 : 22, color: blocked ? '#a7e0ff' : proj.color,
      speed: 360, spread: 1.0, gravity: 300, life: 0.45, size: 4,
    });
    this.damageNumbers.spawn(hx, hy, dealt, blocked ? 'blocked' : 'special', proj.color);
  }

  _simulate(dt) {
    this.time -= dt;
    if (this.time < 0) this.time = 0;
    this._stepEntities(dt);

    const pDown = this.player.hp <= 0;
    const aDown = this.ai.hp <= 0;
    let pending = null;
    if (pDown && aDown) pending = 'draw';
    else if (aDown)     pending = 'win';
    else if (pDown)     pending = 'lose';
    else if (this.time <= 0) {
      if      (this.player.hp > this.ai.hp) pending = 'win';
      else if (this.ai.hp > this.player.hp) pending = 'lose';
      else                                  pending = 'draw';
    }
    if (pending) {
      this.pendingStatus = pending;
      this.koCause = (pDown || aDown) ? 'ko' : 'timeup';
      this.phase = 'ko';
      this.koT = KO_DURATION;
      this.shakeT = 0.35;
      this.shakeMag = Math.max(this.shakeMag, 12);
      this.koFlashT = 0.18;
      const target = pDown && !aDown ? this.player
                   : aDown && !pDown ? this.ai
                   : null;
      if (target) {
        this.particles.emit(target.x, target.y - target.height / 2, {
          count: 34, color: '#ffe680', speed: 380, spread: 1.0, gravity: 700,
          life: 0.9, size: 5,
        });
        this.particles.emit(target.x, target.y - target.height / 2, {
          count: 18, color: '#ff7a3d', speed: 260, spread: 1.0, gravity: 500,
          life: 0.75, size: 4,
        });
      }
    }
  }

  _resolveOverlap(a, b) {
    const ha = a.hurtbox, hb = b.hurtbox;
    if (!rectsOverlap(ha, hb)) return;
    const overlap = (Math.min(ha.x + ha.w, hb.x + hb.w) - Math.max(ha.x, hb.x));
    if (overlap <= 0) return;
    const push = overlap / 2 + 0.5;
    if (a.x < b.x) { a.x -= push; b.x += push; }
    else           { a.x += push; b.x -= push; }
    const clamp = (f) => {
      const minX = ARENA.wallPad + f.width/2;
      const maxX = ARENA.width - ARENA.wallPad - f.width/2;
      f.x = Math.max(minX, Math.min(maxX, f.x));
    };
    clamp(a); clamp(b);
  }

  // Attacker-side outgoing damage modifiers:
  //   low_health_damage_boost: attacker below 30% HP
  //   combo_damage_boost:      stacks × per-stack value (max 4 stacks)
  //   damage_boost buff:       temporary damage multiplier (damage_boost special)
  // Note: defender-side reduction (damage_reduction passive) is applied inside applyHit.
  _computeOutgoingDamage(attacker, baseDamage) {
    let dmg = baseDamage;
    const p = attacker.char.passive;
    if (p?.type === 'low_health_damage_boost' && attacker.hp < attacker.maxHp * 0.30) {
      dmg *= p.value;
    }
    if (p?.type === 'combo_damage_boost') {
      const stacks = Math.min(4, attacker.comboCount || 0);
      dmg *= (1 + p.value * stacks);
    }
    if (attacker.dmgBoostT > 0) dmg *= attacker.dmgBoostMult;
    return dmg;
  }

  _resolveAttack(attacker, defender, aiOwnsAttack) {
    const hb = attacker.getActiveHitbox();
    if (!hb) return;
    if (!attacker.attack) return;
    if (attacker.attack.hitTargets.has(defender)) return;
    if (!rectsOverlap(hb, defender.hurtbox)) return;

    attacker.attack.hitTargets.add(defender);
    const blocked = defender.blocking && defender.onGround;
    const rawDef = attacker.attack.def;
    const attackType = attacker.attack.type;

    // Effective damage with outgoing modifiers (defender reduction applied inside applyHit)
    const modDamage = this._computeOutgoingDamage(attacker, rawDef.damage);
    const effDef = { ...rawDef, damage: modDamage };

    // Special-specific rider effects
    let stunDuration = 0;
    let lifestealFrac = 0;
    if (attackType === 'special') {
      const s = attacker.char.special;
      if (s.kind === 'stun')      stunDuration = s.stunDuration || 1.0;
      if (s.kind === 'lifesteal') lifestealFrac = s.lifestealFraction || 0.5;
    }

    const dealt = defender.applyHit(attacker, effDef, { stunDuration });

    // On-hit passives / special riders
    if (!blocked) {
      attacker.notifyLandedHit();
      if (attacker.char.passive?.type === 'lifesteal') {
        attacker.heal(dealt * attacker.char.passive.value);
      }
      if (lifestealFrac > 0) attacker.heal(dealt * lifestealFrac);
    }

    if (aiOwnsAttack) this.aiCtrl.notifyLandedHit();
    else              this.aiCtrl.notifyGotHit();

    // Shake + freeze
    const mag = blocked ? 3 : Math.min(12, 3.5 + effDef.damage * 0.45);
    const dur = blocked ? 0.07 : Math.min(0.30, 0.10 + effDef.damage * 0.012);
    if (dur > this.shakeT)    this.shakeT = dur;
    if (mag > this.shakeMag)  this.shakeMag = mag;
    if (!blocked) {
      if      (attackType === 'heavy')   this.freezeT = Math.max(this.freezeT, FREEZE_HEAVY_HIT);
      else if (attackType === 'special') this.freezeT = Math.max(this.freezeT, FREEZE_SPECIAL_HIT);
    } else if (attackType === 'heavy' || attackType === 'special') {
      this.freezeT = Math.max(this.freezeT, FREEZE_BLOCKED_HVY);
    }

    // Particles + damage number
    const hx = hb.x + hb.w / 2;
    const hy = hb.y + hb.h / 2;
    const dir = Math.sign(attacker.facing);
    const coneAngle = dir > 0 ? 0 : Math.PI;

    const dmgShown = Math.round(dealt);
    const dmgStyle = blocked ? 'blocked' : attackType;
    const dmgAccent = attackType === 'special' ? attacker.char.trail : null;
    this.damageNumbers.spawn(hx, hy, dmgShown, dmgStyle, dmgAccent);

    if (blocked) {
      this.particles.emit(hx, hy, {
        count: 22, color: '#a7e0ff', speed: 380, spread: 0.55,
        angle: coneAngle, gravity: 150, life: 0.45, size: 4, shape: 'square',
      });
      this.particles.emit(hx, hy, {
        count: 14, color: '#ffffff', speed: 320, spread: 0.7,
        angle: coneAngle, gravity: 250, life: 0.35, size: 3,
      });
      this.particles.emit(hx, hy, {
        count: 6, color: '#ffffff', speed: 60, spread: 1.0,
        gravity: 0, life: 0.28, size: 8,
      });
    } else {
      const color =
        attackType === 'special' ? attacker.char.trail :
        attackType === 'heavy'   ? '#ff6a6a' : '#fff7a3';
      const count = 10 + Math.round(effDef.damage * 0.6);
      this.particles.emit(hx, hy, {
        count, color, speed: 300 + effDef.damage * 6, spread: 0.4,
        angle: coneAngle, gravity: 600, life: 0.45, size: 3.8,
      });
      this.particles.emit(hx, hy, {
        count: 6, color: '#ffffff', speed: 340, spread: 0.55,
        angle: coneAngle, gravity: 500, life: 0.28, size: 2.6,
      });
    }
  }
}
