import { ARENA } from './constants.js';

// All rendering happens on the 2D canvas at the logical (1200x600) resolution.
// The React component sets canvas.width/height and applies CSS scale.

export function renderScene(ctx, engine) {
  // Backdrop
  drawBackdrop(ctx);
  drawGround(ctx);

  // Fighters (draw back one first based on y? both feet at same y, but attacker overlay on top of defender if hit-flashing)
  const order = [engine.ai, engine.player];
  // Player on top for visual priority when overlapped
  for (const f of order) drawFighter(ctx, f);

  // Draw active hitboxes only when debug enabled
  // (kept off for release)
}

function drawBackdrop(ctx) {
  // Dark synthwave arena backdrop with horizon glow + grid
  const w = ARENA.width, h = ARENA.height;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0a0518');
  grad.addColorStop(0.55, '#160a2b');
  grad.addColorStop(1, '#050210');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Distant sun glow
  const sunX = w / 2, sunY = ARENA.groundY - 30;
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 20, sunX, sunY, 320);
  sunGrad.addColorStop(0, 'rgba(255, 90, 170, 0.55)');
  sunGrad.addColorStop(0.5, 'rgba(160, 60, 200, 0.15)');
  sunGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, w, h);

  // Horizon line
  ctx.strokeStyle = 'rgba(255, 90, 170, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, ARENA.groundY);
  ctx.lineTo(w, ARENA.groundY);
  ctx.stroke();

  // Perspective grid on the "floor"
  ctx.save();
  ctx.strokeStyle = 'rgba(120, 90, 220, 0.35)';
  ctx.lineWidth = 1;
  // Horizontal lines shrinking spacing near horizon (below groundY into "floor area")
  const rows = 12;
  for (let i = 1; i <= rows; i++) {
    const t = i / rows;
    const y = ARENA.groundY + Math.pow(t, 1.5) * (h - ARENA.groundY);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // Vanishing point vertical lines
  const vpX = w / 2;
  const cols = 22;
  for (let i = 0; i <= cols; i++) {
    const x0 = (i / cols) * w;
    ctx.beginPath();
    ctx.moveTo(x0, ARENA.groundY);
    ctx.lineTo(vpX + (x0 - vpX) * 4.5, h);
    ctx.stroke();
  }
  ctx.restore();

  // Silhouette skyline (bars)
  ctx.fillStyle = '#0b0620';
  for (let i = 0; i < 24; i++) {
    const bx = (i / 24) * w;
    const bh = 30 + (Math.sin(i * 12.9898) * 0.5 + 0.5) * 80;
    ctx.fillRect(bx, ARENA.groundY - bh, w/24 - 2, bh);
  }
}

function drawGround(ctx) {
  const w = ARENA.width;
  ctx.save();
  const grad = ctx.createLinearGradient(0, ARENA.groundY, 0, ARENA.height);
  grad.addColorStop(0, 'rgba(255, 90, 170, 0.10)');
  grad.addColorStop(1, 'rgba(20, 5, 40, 0.6)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, ARENA.groundY, w, ARENA.height - ARENA.groundY);
  ctx.restore();
}

/* ---------- Fighter draw dispatch ---------- */

function drawFighter(ctx, f) {
  const char = f.char;
  const cx = f.x;
  const feetY = f.y;
  const bodyTop = feetY - f.height;

  // Ground shadow
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.beginPath();
  ctx.ellipse(cx, ARENA.groundY + 4, f.width * 0.55, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Special FX behind body
  drawSpecialFxBehind(ctx, f);

  // Choose per-char draw
  const tint = f.tint;
  const primary = tint || char.color;
  const glow = char.trail;
  const flash = f.flashT > 0;

  ctx.save();
  ctx.translate(cx, feetY);
  ctx.scale(f.facing, 1);
  if (char.id === 'volt') drawVolt(ctx, f, primary, glow, flash);
  else if (char.id === 'titan') drawTitan(ctx, f, primary, glow, flash);
  else drawWraith(ctx, f, primary, glow, flash);
  ctx.restore();

  // Special FX in front (e.g., slam shockwave, teleport strike marker)
  drawSpecialFxFront(ctx, f);

  // Attack tell / active hitbox visualization (a bright arc)
  drawAttackFx(ctx, f);
}

/* Draw helpers use local coords: origin at feet, +x = forward (facing direction). */

function drawVolt(ctx, f, color, glow, flash) {
  const h = f.height;
  const w = f.width;
  const bodyH = h * 0.55;
  const legH = h - bodyH;
  const stateOffset = f.state === 'walk' ? Math.sin(performance.now() / 90) * 3 : 0;

  // Glow aura
  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = 18;

  // Legs (two thin angled shapes)
  ctx.fillStyle = darken(color, 0.4);
  ctx.beginPath();
  ctx.moveTo(-w*0.35, 0);
  ctx.lineTo(-w*0.10, 0);
  ctx.lineTo(-w*0.15, -legH);
  ctx.lineTo(-w*0.30, -legH);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w*0.08, 0);
  ctx.lineTo(w*0.28, 0);
  ctx.lineTo(w*0.32, -legH + stateOffset);
  ctx.lineTo(w*0.14, -legH + stateOffset);
  ctx.closePath(); ctx.fill();

  // Torso — lightning bolt shape
  ctx.fillStyle = color;
  ctx.beginPath();
  const torY = -legH;
  ctx.moveTo(-w*0.35, torY);
  ctx.lineTo(w*0.30, torY);
  ctx.lineTo(w*0.15, torY - bodyH*0.45);
  ctx.lineTo(w*0.35, torY - bodyH*0.45);
  ctx.lineTo(-w*0.10, torY - bodyH*0.95);
  ctx.lineTo(w*0.05, torY - bodyH*0.55);
  ctx.lineTo(-w*0.25, torY - bodyH*0.55);
  ctx.closePath();
  ctx.fill();

  // Head
  ctx.fillStyle = darken(color, -0.1);
  const headY = torY - bodyH*0.95 - 8;
  ctx.beginPath();
  ctx.arc(-w*0.05, headY, w*0.24, 0, Math.PI*2);
  ctx.fill();

  // Accent visor
  ctx.fillStyle = f.char.accent;
  ctx.fillRect(-w*0.15, headY - 3, w*0.22, 6);

  ctx.restore();

  // Flash overlay
  if (flash) overlayFlash(ctx, f);
}

function drawTitan(ctx, f, color, glow, flash) {
  const h = f.height;
  const w = f.width;
  const bodyH = h * 0.60;
  const legH = h - bodyH;

  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = 22;

  // Wide legs
  ctx.fillStyle = darken(color, 0.4);
  ctx.fillRect(-w*0.42, -legH, w*0.32, legH);
  ctx.fillRect(w*0.10, -legH, w*0.32, legH);

  // Torso — big trapezoid (broader shoulders)
  ctx.fillStyle = color;
  const torY = -legH;
  ctx.beginPath();
  ctx.moveTo(-w*0.40, torY);
  ctx.lineTo(w*0.40, torY);
  ctx.lineTo(w*0.55, torY - bodyH*0.85);
  ctx.lineTo(-w*0.55, torY - bodyH*0.85);
  ctx.closePath(); ctx.fill();

  // Chest plate accent
  ctx.fillStyle = f.char.accent;
  ctx.beginPath();
  ctx.moveTo(-w*0.20, torY - bodyH*0.15);
  ctx.lineTo(w*0.20, torY - bodyH*0.15);
  ctx.lineTo(w*0.10, torY - bodyH*0.55);
  ctx.lineTo(-w*0.10, torY - bodyH*0.55);
  ctx.closePath(); ctx.fill();

  // Arms — chunky forward fists
  ctx.fillStyle = darken(color, -0.05);
  ctx.beginPath();
  ctx.arc(w*0.55, torY - bodyH*0.55, w*0.18, 0, Math.PI*2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-w*0.55, torY - bodyH*0.55, w*0.18, 0, Math.PI*2);
  ctx.fill();

  // Head — small helmet on wide body
  ctx.fillStyle = darken(color, -0.15);
  const headR = w*0.22;
  const headY = torY - bodyH*0.85 - headR + 4;
  ctx.beginPath();
  ctx.arc(0, headY, headR, 0, Math.PI*2);
  ctx.fill();
  // Visor
  ctx.fillStyle = '#ffe27a';
  ctx.fillRect(-headR*0.75, headY - 2, headR*1.5, 6);

  ctx.restore();
  if (flash) overlayFlash(ctx, f);
}

function drawWraith(ctx, f, color, glow, flash) {
  const h = f.height;
  const w = f.width;
  const bodyH = h * 0.65;
  const legH = h - bodyH;

  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = 22;

  // Ghost trailing tail instead of legs — narrows toward ground
  ctx.fillStyle = darken(color, 0.2);
  ctx.beginPath();
  ctx.moveTo(-w*0.30, -legH);
  ctx.lineTo(w*0.30, -legH);
  const wobble = Math.sin(performance.now()/180) * 4;
  ctx.lineTo(w*0.08 + wobble, 0);
  ctx.quadraticCurveTo(0, 6, -w*0.08 - wobble, 0);
  ctx.closePath();
  ctx.fill();

  // Torso — tall slim
  ctx.fillStyle = color;
  const torY = -legH;
  ctx.beginPath();
  ctx.moveTo(-w*0.30, torY);
  ctx.lineTo(w*0.30, torY);
  ctx.lineTo(w*0.35, torY - bodyH*0.70);
  ctx.lineTo(-w*0.35, torY - bodyH*0.70);
  ctx.closePath();
  ctx.fill();

  // Cloak drape
  ctx.fillStyle = darken(color, 0.3);
  ctx.beginPath();
  ctx.moveTo(-w*0.35, torY - bodyH*0.70);
  ctx.lineTo(w*0.35, torY - bodyH*0.70);
  ctx.lineTo(w*0.20, torY - bodyH*0.20);
  ctx.lineTo(-w*0.20, torY - bodyH*0.20);
  ctx.closePath();
  ctx.fill();

  // Head — hooded skull
  const headR = w*0.26;
  const headY = torY - bodyH*0.70 - headR + 6;
  ctx.fillStyle = darken(color, -0.1);
  ctx.beginPath();
  ctx.arc(0, headY, headR, 0, Math.PI*2);
  ctx.fill();
  // Glowing eye slit
  ctx.fillStyle = '#ffb3ff';
  ctx.fillRect(-headR*0.5, headY - 2, headR*1.0, 5);

  ctx.restore();
  if (flash) overlayFlash(ctx, f);
}

function overlayFlash(ctx, f) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255,255,255,${Math.min(0.7, f.flashT * 4)})`;
  ctx.fillRect(-f.width/2 - 4, -f.height - 6, f.width + 8, f.height + 12);
  ctx.restore();
}

function darken(hex, amount) {
  // amount: negative brightens, positive darkens
  const c = hex.replace('#','');
  const r = parseInt(c.slice(0,2),16);
  const g = parseInt(c.slice(2,4),16);
  const b = parseInt(c.slice(4,6),16);
  const f = 1 - amount;
  const clamp = v => Math.max(0, Math.min(255, Math.round(v * f)));
  const toHex = v => v.toString(16).padStart(2,'0');
  return `#${toHex(clamp(r))}${toHex(clamp(g))}${toHex(clamp(b))}`;
}

/* ---------- Attack + Special FX ---------- */

function drawAttackFx(ctx, f) {
  if (!f.attack) return;
  const a = f.attack;
  if (a.phase !== 'active') {
    // Windup tell — small glow at hand
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = a.type === 'heavy' ? '#ff5a5a' : a.type === 'special' ? '#ffdc4a' : '#ffffff';
    const hbX = f.x + f.facing * (f.width/2 + 20);
    const hbY = f.y - f.height * 0.55;
    ctx.beginPath();
    ctx.arc(hbX, hbY, 8, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
    return;
  }
  // Active — bright arc slash
  const hb = f.getActiveHitbox();
  if (!hb) return;
  const cx = hb.x + hb.w/2;
  const cy = hb.y + hb.h/2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const color = a.type === 'heavy' ? '#ff6b6b' :
                a.type === 'special' ? f.char.trail : '#ffffff';
  const rGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(hb.w, hb.h)*0.6);
  rGrad.addColorStop(0, color);
  rGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, hb.w*0.55, hb.h*0.55, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function drawSpecialFxBehind(ctx, f) {
  if (!f.specialFx) return;
  const fx = f.specialFx;
  if (fx.kind === 'dash' && fx.trail) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < fx.trail.length; i++) {
      const p = fx.trail[i];
      const a = (i / fx.trail.length) * 0.7;
      ctx.fillStyle = `rgba(120, 200, 255, ${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18 + i*1.5, 0, Math.PI*2);
      ctx.fill();
    }
    // Lightning bolt lines
    ctx.strokeStyle = 'rgba(255, 255, 120, 0.7)';
    ctx.lineWidth = 2;
    for (let i = 0; i < fx.trail.length - 1; i++) {
      const p = fx.trail[i];
      const q = fx.trail[i+1];
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      const midY = (p.y + q.y)/2 + (Math.random() - 0.5) * 12;
      ctx.lineTo((p.x+q.x)/2, midY);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (fx.kind === 'teleport' && fx.pre && fx.phase === 'strike') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Vanishing wisp at original position
    ctx.fillStyle = 'rgba(180, 100, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(fx.pre.x, fx.pre.y - 60, 30, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}

function drawSpecialFxFront(ctx, f) {
  if (!f.specialFx) return;
  const fx = f.specialFx;
  if (fx.kind === 'slam' && fx.shockwave > 0 && f.onGround) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = fx.shockwave * 140;
    const grad = ctx.createRadialGradient(f.x, f.y - 4, r*0.4, f.x, f.y - 4, r);
    grad.addColorStop(0, 'rgba(255, 180, 100, 0.6)');
    grad.addColorStop(1, 'rgba(255, 180, 100, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(f.x, f.y - 4, r, r*0.35, 0, 0, Math.PI*2);
    ctx.fill();
    // Ring
    ctx.strokeStyle = `rgba(255, 220, 140, ${1 - fx.shockwave})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(f.x, f.y - 4, r, r*0.35, 0, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }
  if (fx.kind === 'teleport' && fx.phase === 'strike' && fx.postAt) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createRadialGradient(fx.postAt.x, fx.postAt.y - 60, 5, fx.postAt.x, fx.postAt.y - 60, 60);
    grad.addColorStop(0, 'rgba(220,150,255,0.8)');
    grad.addColorStop(1, 'rgba(220,150,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fx.postAt.x, fx.postAt.y - 60, 60, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}
