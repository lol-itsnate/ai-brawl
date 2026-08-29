// Projectile entity for the "projectile" special. Travels horizontally, damages
// the non-owner on overlap, despawns at arena edge or after its life expires.

export class Projectile {
  constructor({ owner, x, y, vx, damage, def, radius, life, color, secondary }) {
    this.owner = owner;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.damage = damage;
    this.def = def;
    this.radius = radius;
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this.secondary = secondary || '#ffffff';
    this.dead = false;
    this.hitOnce = false;
    this.spin = 0;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.life -= dt;
    this.spin += dt * 12;
    if (this.life <= 0) this.dead = true;
  }

  getHitbox() {
    return {
      x: this.x - this.radius,
      y: this.y - this.radius,
      w: this.radius * 2,
      h: this.radius * 2,
    };
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Outer glow
    const rad = this.radius * 2.2;
    const grad = ctx.createRadialGradient(this.x, this.y, 2, this.x, this.y, rad);
    grad.addColorStop(0, this.color);
    grad.addColorStop(0.55, this.color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(this.x, this.y, rad, 0, Math.PI * 2);
    ctx.fill();
    // Solid core (rotated diamond for a bit of shape)
    ctx.globalAlpha = 1;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.spin);
    ctx.fillStyle = this.secondary;
    ctx.beginPath();
    const r = this.radius;
    ctx.moveTo(0, -r);
    ctx.lineTo(r,  0);
    ctx.lineTo(0,  r);
    ctx.lineTo(-r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
