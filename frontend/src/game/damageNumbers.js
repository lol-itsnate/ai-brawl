// Pooled floating damage numbers. Instances are recycled to avoid GC churn.
// Draws directly on the canvas so it inherits screen shake + composited FX.

const STYLE_MAP = {
  light:   { font: 'bold 22px "Bungee", "Rubik Mono One", monospace', color: '#ffffff', stroke: 'rgba(0,0,0,0.85)' },
  heavy:   { font: 'bold 34px "Bungee", "Rubik Mono One", monospace', color: '#ffb84a', stroke: 'rgba(80,20,0,0.9)' },
  special: { font: 'bold 34px "Bungee", "Rubik Mono One", monospace', color: '#ffe14a', stroke: 'rgba(60,20,80,0.9)' },
  blocked: { font: 'bold 18px "Bungee", "Rubik Mono One", monospace', color: '#a7c7d9', stroke: 'rgba(20,30,40,0.85)' },
};

export class DamageNumbers {
  constructor() {
    this.items = [];
    this.pool = [];
    this.max = 40;
  }

  spawn(x, y, value, style = 'light', accent = null) {
    let it = this.pool.pop();
    if (!it) it = {};
    it.x = x + (Math.random() - 0.5) * 14;
    it.y = y - 10;
    it.vx = (Math.random() - 0.5) * 40;
    it.vy = -170 + (Math.random() - 0.5) * 20;
    it.life = 0.7;
    it.maxLife = 0.7;
    it.value = Math.max(0, Math.round(value));
    it.style = style;
    it.accent = accent; // used only for special: overrides color
    this.items.push(it);
    if (this.items.length > this.max) {
      this.pool.push(this.items.shift());
    }
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) {
        this.pool.push(it);
        this.items.splice(i, 1);
        continue;
      }
      it.vy += 140 * dt; // gentle deceleration → floats up then slows
      it.x += it.vx * dt;
      it.y += it.vy * dt;
    }
  }

  draw(ctx) {
    if (this.items.length === 0) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const it of this.items) {
      const t = it.life / it.maxLife;
      ctx.globalAlpha = Math.min(1, t * 1.5);
      const s = STYLE_MAP[it.style] || STYLE_MAP.light;
      ctx.font = s.font;
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = 3.5;
      ctx.fillStyle = (it.style === 'special' && it.accent) ? it.accent : s.color;
      const text = String(it.value);
      ctx.strokeText(text, it.x, it.y);
      ctx.fillText(text, it.x, it.y);
    }
    ctx.restore();
  }

  reset() {
    for (const it of this.items) this.pool.push(it);
    this.items.length = 0;
  }
}
