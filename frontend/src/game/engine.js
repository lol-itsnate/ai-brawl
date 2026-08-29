import { ARENA, ROUND, KEYS } from './constants.js';
import { Fighter } from './fighter.js';
import { AIController } from './ai.js';
import { getCharacter } from './characters.js';
import { InputManager } from './input.js';
import { renderScene } from './renderer.js';
import { ParticleSystem } from './particles.js';

// Fight lifecycle timings
const INTRO_DURATION = 1.8;   // "READY" (~1.0s) then "FIGHT!" (~0.8s)
const KO_DURATION    = 0.75;  // brief slow-mo before result overlay

function rectsOverlap(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

export class GameEngine {
  constructor({ canvas, playerCharId, aiCharId, onStateChange }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.playerCharId = playerCharId;
    this.aiCharId = aiCharId;
    this.onStateChange = onStateChange || (() => {});

    this.input = new InputManager();
    this.particles = new ParticleSystem();

    this.running = false;
    this.paused = false;             // external pause (controls overlay)
    this._backgroundPaused = false;  // tab-blur pause
    this._raf = null;
    this._lastTime = 0;
    this._visHandler = null;

    // FX state
    this.shakeT = 0;
    this.shakeMag = 0;
    this.koFlashT = 0;

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

    // Phase model:
    //   'intro'  → showing READY/FIGHT!, neither side can act
    //   'active' → normal simulation
    //   'ko'     → brief slow-mo + flash after match-end trigger
    //   'ended'  → frozen scene, result overlay shown
    this.phase = 'intro';
    this.status = null;              // 'win' | 'lose' | 'draw' | null
    this.introT = INTRO_DURATION;
    this.koT = 0;
    this.pendingStatus = null;

    this.particles.parts.length = 0;
    this.shakeT = 0;
    this.shakeMag = 0;
    this.koFlashT = 0;

    this._pushEvent();
  }

  _pushEvent() {
    this.onStateChange({
      phase: this.phase,
      paused: this.paused,
      introT: this.introT,
      status: this.status,
      time: this.time,
      player: {
        name: this.player.char.name,
        id: this.player.char.id,
        hp: this.player.hp,
        maxHp: this.player.maxHp,
        specialCd: this.player.cooldowns.special,
        specialMax: this.player.char.special.cooldown,
      },
      ai: {
        name: this.ai.char.name,
        id: this.ai.char.id,
        hp: this.ai.hp,
        maxHp: this.ai.maxHp,
        specialCd: this.ai.cooldowns.special,
        specialMax: this.ai.char.special.cooldown,
      },
    });
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
    if (val) {
      // Drop held keys so releasing them off-focus doesn't fire on resume
      this.input.clear();
    } else {
      // Prevent dt spike on resume
      this._lastTime = performance.now();
    }
    this._pushEvent();
  }

  _tick = (now) => {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._tick);

    let dt = (now - this._lastTime) / 1000;
    this._lastTime = now;
    if (this._backgroundPaused || this.paused) dt = 0;
    if (dt > 0.05) dt = 0.05;

    // Global timers (shake, flash) tick regardless of phase
    if (this.shakeT > 0)   this.shakeT   = Math.max(0, this.shakeT - dt);
    if (this.koFlashT > 0) this.koFlashT = Math.max(0, this.koFlashT - dt);

    if (this.phase === 'intro') {
      this.introT -= dt;
      if (this.introT <= 0) {
        this.introT = 0;
        this.phase = 'active';
      }
      this.particles.update(dt);
    } else if (this.phase === 'active') {
      this._simulate(dt);
      this.particles.update(dt);
    } else if (this.phase === 'ko') {
      // Slow-mo: entities keep resolving knockback + reactions at reduced speed
      const slow = 0.35;
      this._stepEntities(dt * slow);
      this.particles.update(dt * slow);
      this.koT -= dt;
      if (this.koT <= 0) {
        this.status = this.pendingStatus;
        this.phase = 'ended';
      }
    } else if (this.phase === 'ended') {
      // Freeze scene; let particles finish
      this.particles.update(dt);
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

  // Entity + combat step (no timer, no phase transitions). Used by 'active' and 'ko'.
  _stepEntities(dt) {
    const pIntent = this._readPlayerIntent();
    const aIntent = this.aiCtrl.update(dt, this.ai, this.player);
    this.player.update(dt, this.ai, pIntent);
    this.ai.update(dt, this.player, aIntent);
    this._resolveOverlap(this.player, this.ai);
    this._resolveAttack(this.player, this.ai, /*aiOwnsAttack*/ false);
    this._resolveAttack(this.ai, this.player, /*aiOwnsAttack*/ true);
  }

  _simulate(dt) {
    this.time -= dt;
    if (this.time < 0) this.time = 0;
    this._stepEntities(dt);

    // End conditions → transition to 'ko'
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
      this.phase = 'ko';
      this.koT = KO_DURATION;
      // KO emphasis: shake + flash + burst on the fallen fighter (or center on time-out draw)
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

  _resolveAttack(attacker, defender, aiOwnsAttack) {
    const hb = attacker.getActiveHitbox();
    if (!hb) return;
    if (!attacker.attack) return;
    if (attacker.attack.hitTargets.has(defender)) return;
    if (!rectsOverlap(hb, defender.hurtbox)) return;

    attacker.attack.hitTargets.add(defender);
    const blocked = defender.blocking && defender.onGround;
    const def = attacker.attack.def;
    defender.applyHit(attacker, def);
    if (aiOwnsAttack) this.aiCtrl.notifyLandedHit();

    // Screen shake proportional to damage; smaller on block
    const mag = blocked ? 3 : Math.min(12, 3.5 + def.damage * 0.45);
    const dur = blocked ? 0.07 : Math.min(0.30, 0.10 + def.damage * 0.012);
    if (dur > this.shakeT) this.shakeT = dur;
    if (mag > this.shakeMag) this.shakeMag = mag;

    // Particles at hit point
    const hx = hb.x + hb.w / 2;
    const hy = hb.y + hb.h / 2;
    const dir = Math.sign(attacker.facing);
    const coneAngle = dir > 0 ? 0 : Math.PI;

    if (blocked) {
      // Block impact — cool white/blue burst, tight cone kicking outward
      this.particles.emit(hx, hy, {
        count: 12, color: '#a7e0ff', speed: 300, spread: 0.35,
        angle: coneAngle, gravity: 200, life: 0.35, size: 3.2, shape: 'square',
      });
      this.particles.emit(hx, hy, {
        count: 8, color: '#ffffff', speed: 220, spread: 0.5,
        angle: coneAngle, gravity: 350, life: 0.28, size: 2.4,
      });
    } else {
      // Hit sparks — colored by attack type
      const color =
        attacker.attack.type === 'special' ? attacker.char.trail :
        attacker.attack.type === 'heavy'   ? '#ff6a6a' : '#fff7a3';
      const count = 10 + Math.round(def.damage * 0.6);
      this.particles.emit(hx, hy, {
        count, color, speed: 300 + def.damage * 6, spread: 0.4,
        angle: coneAngle, gravity: 600, life: 0.45, size: 3.8,
      });
      // Bright white flash burst
      this.particles.emit(hx, hy, {
        count: 6, color: '#ffffff', speed: 340, spread: 0.55,
        angle: coneAngle, gravity: 500, life: 0.28, size: 2.6,
      });
    }
  }
}
