import { ARENA, ROUND, KEYS } from './constants.js';
import { Fighter } from './fighter.js';
import { AIController } from './ai.js';
import { getCharacter } from './characters.js';
import { InputManager } from './input.js';
import { renderScene } from './renderer.js';

// Rectangle overlap test
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
    this.running = false;
    this._raf = null;
    this._lastTime = 0;
    this._paused = false;

    this._visHandler = null;
    this._resizeHandler = null;

    this._buildMatch();
  }

  _buildMatch() {
    const p = getCharacter(this.playerCharId);
    const a = getCharacter(this.aiCharId);

    const mirror = this.playerCharId === this.aiCharId;

    this.player = new Fighter(p, 320, 'left');
    this.ai     = new Fighter(a, 880, 'right', mirror ? '#ff5d8f' : null);

    // Face each other initially
    this.player.facing = 1;
    this.ai.facing = -1;

    this.aiCtrl = new AIController(0xC0FFEE);
    this.time = ROUND.timeLimit;
    this.status = 'playing'; // 'playing' | 'win' | 'lose' | 'draw'
    this.hitFlashGlobal = 0; // for HUD tick
    this._pushEvent();
  }

  _pushEvent() {
    this.onStateChange({
      status: this.status,
      time: this.time,
      player: {
        name: this.player.char.name,
        hp: this.player.hp,
        maxHp: this.player.maxHp,
        specialCd: this.player.cooldowns.special,
        specialMax: this.player.char.special.cooldown,
      },
      ai: {
        name: this.ai.char.name,
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
      if (document.hidden) this._paused = true;
      else { this._paused = false; this._lastTime = performance.now(); }
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
    this._buildMatch();
    this.start();
  }

  _tick = (now) => {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._tick);

    let dt = (now - this._lastTime) / 1000;
    this._lastTime = now;
    if (this._paused) { dt = 0; }
    // Clamp big dt (tab switch spikes) — safety
    if (dt > 0.05) dt = 0.05;

    if (this.status === 'playing') {
      this._simulate(dt);
    }

    renderScene(this.ctx, this);
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

  _simulate(dt) {
    this.time -= dt;
    if (this.time < 0) this.time = 0;

    const pIntent = this._readPlayerIntent();
    const aIntent = this.aiCtrl.update(dt, this.ai, this.player);

    this.player.update(dt, this.ai, pIntent);
    this.ai.update(dt, this.player, aIntent);

    // Soft push: prevent fighters from occupying the same space
    this._resolveOverlap(this.player, this.ai, dt);

    // Combat resolution — check both directions
    this._resolveAttack(this.player, this.ai, /*aiOwnsAttack*/ false);
    this._resolveAttack(this.ai, this.player, /*aiOwnsAttack*/ true);

    // End conditions
    const pDown = this.player.hp <= 0;
    const aDown = this.ai.hp <= 0;
    if (pDown && aDown) this.status = 'draw';
    else if (aDown) this.status = 'win';
    else if (pDown) this.status = 'lose';
    else if (this.time <= 0) {
      if (this.player.hp > this.ai.hp) this.status = 'win';
      else if (this.ai.hp > this.player.hp) this.status = 'lose';
      else this.status = 'draw';
    }

    this.input.endFrame();
    this._pushEvent();
  }

  _resolveOverlap(a, b, dt) {
    const ha = a.hurtbox, hb = b.hurtbox;
    if (!rectsOverlap(ha, hb)) return;
    // Compute penetration on x-axis and push both apart
    const overlap = (Math.min(ha.x + ha.w, hb.x + hb.w) - Math.max(ha.x, hb.x));
    if (overlap <= 0) return;
    const push = overlap / 2 + 0.5;
    if (a.x < b.x) { a.x -= push; b.x += push; }
    else           { a.x += push; b.x -= push; }
    // clamp to arena
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
    // Only apply hit once per attack per target
    if (attacker.attack.hitTargets.has(defender)) return;
    if (rectsOverlap(hb, defender.hurtbox)) {
      attacker.attack.hitTargets.add(defender);
      defender.applyHit(attacker, attacker.attack.def);
      if (aiOwnsAttack) this.aiCtrl.notifyLandedHit();
    }
  }
}
