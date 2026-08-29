// Simple pooled particle system. Additive blending, gravity, per-emit config.
// Used for hit sparks, block impacts, KO burst.

export class ParticleSystem {
  constructor() {
    this.parts = [];
    this.maxParts = 400;
  }

  emit(x, y, opts = {}) {
    const {
      count = 10,
      color = '#ffffff',
      speed = 240,
      spread = 1.0,       // 1.0 = full circle; smaller = tighter cone
      angle = 0,          // cone center in radians (used when spread < 1)
      gravity = 700,
      life = 0.5,
      size = 3,
      shape = 'circle',
    } = opts;
    for (let i = 0; i < count; i++) {
      const a = spread >= 1
        ? Math.random() * Math.PI * 2
        : angle + (Math.random() - 0.5) * Math.PI * 2 * spread;
      const s = speed * (0.5 + Math.random() * 0.9);
      const l = life * (0.6 + Math.random() * 0.8);
      this.parts.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        gravity,
        life: l, maxLife: l,
        color,
        size: size * (0.6 + Math.random() * 0.8),
        shape,
      });
    }
    if (this.parts.length > this.maxParts) {
      this.parts.splice(0, this.parts.length - this.maxParts);
    }
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy += p.gravity * dt;
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
    }
  }

  draw(ctx) {
    if (this.parts.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, t);
      ctx.fillStyle = p.color;
      const r = Math.max(0.5, p.size * t);
      if (p.shape === 'square') {
        const s = r * 2;
        ctx.fillRect(p.x - r, p.y - r, s, s);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
