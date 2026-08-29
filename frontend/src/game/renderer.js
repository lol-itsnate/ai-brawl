import { ARENA } from './constants.js';

// All rendering happens on the 2D canvas at the logical (1200x600) resolution.
// The React component sets canvas.width/height and applies CSS scale.

export function renderScene(ctx, engine) {
  // Apply screen shake (canvas-only; HUD is HTML)
  const shaking = engine.shakeT > 0 && engine.shakeMag > 0;
  const sx = shaking ? (Math.random() - 0.5) * engine.shakeMag : 0;
  const sy = shaking ? (Math.random() - 0.5) * engine.shakeMag : 0;
  ctx.save();
  ctx.translate(sx, sy);

  // Backdrop
  drawBackdrop(ctx);
  drawGround(ctx);

  // Fighters — draw AI first so player renders on top when overlapped
  const order = [engine.ai, engine.player];
  for (const f of order) drawFighter(ctx, f);

  // Particles overlaid on scene
  if (engine.particles) engine.particles.draw(ctx);

  // KO flash overlay — brief white pop
  if (engine.koFlashT > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, engine.koFlashT * 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, engine.canvas.width, engine.canvas.height);
    ctx.restore();
  }

  ctx.restore();
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

  // WRAITH teleport fades body opacity out during startup, in during strike
  let alpha = 1;
  if (f.attack?.type === 'special' && char.special.kind === 'teleport' && f.specialFx) {
    if (f.attack.phase === 'startup') {
      alpha = Math.max(0.15, f.attack.t / char.special.startup);
    } else if (f.attack.phase === 'active' && f.specialFx.phase === 'strike') {
      const p = 1 - (f.attack.t / char.special.active);
      alpha = Math.min(1, p * 2.5);
    }
  }

  // Ground shadow (fades with body)
  ctx.save();
  ctx.globalAlpha = 0.35 * alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.beginPath();
  ctx.ellipse(cx, ARENA.groundY + 4, f.width * 0.55, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Special FX behind body (dash trail, teleport afterimages)
  drawSpecialFxBehind(ctx, f);

  const primary = f.tint || char.color;
  const glow = char.trail;
  const flash = f.flashT > 0;
  const pose = computeAttackPose(f);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, feetY);
  ctx.scale(f.facing, 1);
  if (char.id === 'volt')       drawVolt(ctx, f, primary, glow, flash, pose);
  else if (char.id === 'titan') drawTitan(ctx, f, primary, glow, flash, pose);
  else                          drawWraith(ctx, f, primary, glow, flash, pose);
  ctx.restore();

  // Block shield glyph in front of blocking fighters
  if (f.blocking) drawBlockShield(ctx, f);

  // Special FX in front (slam shockwave, teleport arrival flash)
  drawSpecialFxFront(ctx, f);

  // Active attack impact swoosh
  drawAttackFx(ctx, f);
}

// Compute the animation pose for the attacking arm/weapon.
// Returns armReach in body-width units: negative = arm pulled back (windup),
// positive = arm extended forward (strike). Recovery relaxes back toward 0.
function computeAttackPose(f) {
  const pose = { attacking: false, armReach: 0, armY: -0.55, isHeavy: false, isSpecial: false, phase: null };
  if (!f.attack) return pose;
  const a = f.attack;
  const def = a.def;
  pose.attacking = true;
  pose.isHeavy = a.type === 'heavy';
  pose.isSpecial = a.type === 'special';
  pose.phase = a.phase;
  const forwardExtend = pose.isSpecial ? 1.35 : pose.isHeavy ? 1.25 : 1.00;
  const windupBack    = pose.isSpecial ? -0.35 : pose.isHeavy ? -0.55 : -0.35;
  if (a.phase === 'startup') {
    const p = 1 - (a.t / def.startup); // 0..1 as windup progresses
    pose.armReach = windupBack * p;
    pose.armY = -0.55 - (pose.isHeavy ? 0.10 * p : 0.04 * p);
  } else if (a.phase === 'active') {
    pose.armReach = forwardExtend;
    pose.armY = -0.55;
  } else if (a.phase === 'recovery') {
    const p = a.t / def.recovery;
    pose.armReach = forwardExtend * p * 0.75;
    pose.armY = -0.55;
  }
  return pose;
}

/* Draw helpers use local coords: origin at feet, +x = forward (facing direction). */

function drawVolt(ctx, f, color, glow, flash, pose) {
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

  // Dynamic arm/hand — lightning fist
  drawArmVolt(ctx, f, pose, color);

  ctx.restore();

  // Flash overlay
  if (flash) overlayFlash(ctx, f);
}

function drawArmVolt(ctx, f, pose, color) {
  const w = f.width, h = f.height;
  const shoulderX = w * 0.10;
  const shoulderY = -h * 0.68;
  if (!pose.attacking) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(w * 0.18, -h * 0.62, w * 0.13, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const handX = shoulderX + pose.armReach * w * 1.15;
  const handY = pose.armY * h;
  // Arm segment
  ctx.strokeStyle = color;
  ctx.lineWidth = w * (pose.isHeavy ? 0.22 : 0.18);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(handX, handY);
  ctx.stroke();
  // Hand / spark
  const handR = w * (pose.isHeavy ? 0.24 : 0.18);
  ctx.fillStyle = pose.phase === 'active'
    ? (pose.isSpecial ? '#fff7a3' : (pose.isHeavy ? '#ffe14a' : '#fff8b8'))
    : f.char.accent;
  ctx.beginPath();
  ctx.arc(handX, handY, handR, 0, Math.PI * 2);
  ctx.fill();
  if (pose.phase === 'active') {
    ctx.strokeStyle = 'rgba(255,240,120,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(handX, handY);
    ctx.lineTo(handX + w * 0.15, handY - h * 0.04);
    ctx.lineTo(handX + w * 0.35, handY + h * 0.02);
    ctx.stroke();
  }
}

function drawTitan(ctx, f, color, glow, flash, pose) {
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

  // Static rear fist (behind, non-animated)
  ctx.fillStyle = darken(color, -0.05);
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

  // Dynamic forward fist — pulls back on windup, drives forward on strike
  drawArmTitan(ctx, f, pose, color);

  ctx.restore();
  if (flash) overlayFlash(ctx, f);
}

function drawArmTitan(ctx, f, pose, color) {
  const w = f.width, h = f.height;
  const shoulderX = w * 0.18;
  const shoulderY = -h * 0.72;
  if (!pose.attacking) {
    ctx.fillStyle = darken(color, -0.05);
    ctx.beginPath();
    ctx.arc(w * 0.55, -h * 0.55, w * 0.18, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const handX = shoulderX + pose.armReach * w * 1.2;
  const handY = pose.armY * h + (pose.isHeavy ? -h*0.03 : 0);
  // Arm segment — thick
  ctx.strokeStyle = color;
  ctx.lineWidth = w * 0.28;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(handX, handY);
  ctx.stroke();
  // Fist
  const fistR = w * (pose.isHeavy ? 0.30 : 0.22);
  ctx.fillStyle = darken(color, -0.08);
  ctx.beginPath();
  ctx.arc(handX, handY, fistR, 0, Math.PI * 2);
  ctx.fill();
  // Knuckle plate accent
  ctx.fillStyle = f.char.accent;
  ctx.fillRect(handX - fistR*0.5, handY - fistR*0.3, fistR*1.0, fistR*0.6);
  // Impact star on active
  if (pose.phase === 'active') {
    ctx.fillStyle = 'rgba(255,220,120,0.85)';
    ctx.beginPath();
    ctx.arc(handX + fistR * 0.8, handY, fistR * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWraith(ctx, f, color, glow, flash, pose) {
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

  // Dynamic ghost blade
  drawArmWraith(ctx, f, pose, color);

  ctx.restore();
  if (flash) overlayFlash(ctx, f);
}

function drawArmWraith(ctx, f, pose, color) {
  const w = f.width, h = f.height;
  if (!pose.attacking) return;
  const shoulderX = w * 0.10;
  const shoulderY = -h * 0.70;
  const handX = shoulderX + pose.armReach * w * 1.15;
  const handY = pose.armY * h;
  // Ghostly arm
  ctx.strokeStyle = color;
  ctx.lineWidth = w * 0.14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(handX, handY);
  ctx.stroke();
  // Blade — narrow curved shape, longer on heavy
  ctx.save();
  ctx.translate(handX, handY);
  const bladeL = w * (pose.isHeavy ? 0.60 : 0.45);
  const bladeW = w * (pose.isHeavy ? 0.16 : 0.12);
  ctx.fillStyle = pose.phase === 'active' ? '#ffb3ff' : color;
  ctx.shadowColor = '#ffb3ff';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(0, -bladeW/2);
  ctx.lineTo(bladeL, -bladeW * 0.15);
  ctx.lineTo(bladeL * 0.9, bladeW * 0.5);
  ctx.lineTo(0, bladeW/2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function overlayFlash(ctx, f) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, f.flashT * 4)})`;
  ctx.fillRect(-f.width/2 - 6, -f.height - 10, f.width + 12, f.height + 20);
  ctx.restore();
}

// Guard-shield glyph drawn in front of a blocking fighter.
// Bright expanding pulse whenever a hit is just blocked (blockFlashT > 0).
function drawBlockShield(ctx, f) {
  const sx = f.x + f.facing * (f.width * 0.35);
  const sy = f.y - f.height * 0.55;
  const pulse = f.blockFlashT > 0 ? f.blockFlashT / 0.24 : 0;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const alpha = 0.55 + pulse * 0.4;
  const radius = 34 + pulse * 16;
  ctx.strokeStyle = `rgba(160, 220, 255, ${alpha})`;
  ctx.lineWidth = 3 + pulse * 3;
  ctx.beginPath();
  const start = f.facing > 0 ? -Math.PI * 0.55 : Math.PI * 0.45;
  const end   = f.facing > 0 ? Math.PI * 0.55  : Math.PI * 1.55;
  ctx.arc(sx, sy, radius, start, end);
  ctx.stroke();
  // Inner arc
  ctx.strokeStyle = `rgba(255,255,255, ${0.5 + pulse * 0.4})`;
  ctx.lineWidth = 1.5 + pulse * 2;
  ctx.beginPath();
  ctx.arc(sx, sy, Math.max(10, radius - 8), start, end);
  ctx.stroke();
  // Radial clank-pulse
  if (pulse > 0) {
    const grad = ctx.createRadialGradient(sx, sy, radius * 0.5, sx, sy, radius * 1.9);
    grad.addColorStop(0, `rgba(180, 230, 255, ${pulse * 0.55})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, radius * 1.9, 0, Math.PI * 2);
    ctx.fill();
  }
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
  // Windup is telegraphed by the arm pose now — no small circle overlay.
  if (f.attack.phase !== 'active') return;
  const hb = f.getActiveHitbox();
  if (!hb) return;
  const cx = hb.x + hb.w/2;
  const cy = hb.y + hb.h/2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const color = f.attack.type === 'heavy'   ? '#ff6b6b'
              : f.attack.type === 'special' ? f.char.trail
              :                                '#ffffff';
  const rGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(hb.w, hb.h)*0.65);
  rGrad.addColorStop(0, color);
  rGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, hb.w*0.6, hb.h*0.6, 0, 0, Math.PI*2);
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
      const a = (i / fx.trail.length) * 0.85;
      const rad = 38 + i * 2.2;
      const grad = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, rad);
      grad.addColorStop(0, `rgba(255, 235, 120, ${a})`);
      grad.addColorStop(0.55, `rgba(120, 200, 255, ${a * 0.5})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI*2);
      ctx.fill();
    }
    // Lightning zigzag along trail
    ctx.strokeStyle = 'rgba(255, 255, 150, 0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < fx.trail.length; i++) {
      const p = fx.trail[i];
      const jitter = (i % 2 === 0 ? 1 : -1) * 8;
      if (i === 0) ctx.moveTo(p.x, p.y + jitter);
      else         ctx.lineTo(p.x, p.y + jitter);
    }
    ctx.stroke();
    ctx.restore();
  }
  if (fx.kind === 'teleport' && fx.pre && fx.phase === 'strike') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createRadialGradient(fx.pre.x, fx.pre.y - f.height/2, 4, fx.pre.x, fx.pre.y - f.height/2, 60);
    grad.addColorStop(0, 'rgba(220, 150, 255, 0.7)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fx.pre.x, fx.pre.y - f.height/2, 60, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}

function drawSpecialFxFront(ctx, f) {
  if (!f.specialFx) return;
  const fx = f.specialFx;
  if (fx.kind === 'slam' && fx.shockwave > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = fx.shockwave * 220;
    const grad = ctx.createRadialGradient(f.x, ARENA.groundY - 4, r*0.35, f.x, ARENA.groundY - 4, r);
    grad.addColorStop(0, 'rgba(255, 200, 100, 0.75)');
    grad.addColorStop(0.6, 'rgba(255, 140, 60, 0.35)');
    grad.addColorStop(1, 'rgba(255, 100, 40, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(f.x, ARENA.groundY - 4, r, r*0.35, 0, 0, Math.PI*2);
    ctx.fill();
    // Outer expanding ring
    ctx.strokeStyle = `rgba(255, 230, 160, ${Math.max(0, 1 - fx.shockwave * 0.6)})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(f.x, ARENA.groundY - 4, r, r*0.35, 0, 0, Math.PI*2);
    ctx.stroke();
    // Inner ring
    ctx.strokeStyle = `rgba(255, 255, 200, ${Math.max(0, 0.8 - fx.shockwave * 0.5)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(f.x, ARENA.groundY - 4, r * 0.65, r * 0.22, 0, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }
  if (fx.kind === 'teleport' && fx.phase === 'strike' && fx.postAt) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Big purple arrival flash
    const grad = ctx.createRadialGradient(fx.postAt.x, fx.postAt.y - f.height/2, 5, fx.postAt.x, fx.postAt.y - f.height/2, 100);
    grad.addColorStop(0, 'rgba(230, 160, 255, 0.85)');
    grad.addColorStop(0.5, 'rgba(150, 80, 220, 0.4)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fx.postAt.x, fx.postAt.y - f.height/2, 100, 0, Math.PI*2);
    ctx.fill();
    // Diagonal slash line
    ctx.strokeStyle = 'rgba(255, 220, 255, 0.9)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(fx.postAt.x - f.facing * 40, fx.postAt.y - f.height * 0.20);
    ctx.lineTo(fx.postAt.x + f.facing * 60, fx.postAt.y - f.height * 0.80);
    ctx.stroke();
    ctx.restore();
  }
}
