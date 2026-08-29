import { ARENA } from './constants.js';

// All rendering happens on the 2D canvas at the logical (1200x600) resolution.
// The React component sets canvas.width/height and applies CSS scale.
//
// Fighter dispatch (Phase F2):
//   char.id === 'volt' / 'titan' / 'wraith' → hand-drawn draw functions (UNCHANGED)
//   char.isGenerated === true               → drawGenerated (silhouette + motif)
// Buff FX (shield / damage_boost / heal / stun) draw for ALL fighters regardless of type.

export function renderScene(ctx, engine) {
  const shaking = engine.shakeT > 0 && engine.shakeMag > 0;
  const sx = shaking ? (Math.random() - 0.5) * engine.shakeMag : 0;
  const sy = shaking ? (Math.random() - 0.5) * engine.shakeMag : 0;
  ctx.save();
  ctx.translate(sx, sy);

  drawBackdrop(ctx);
  drawGround(ctx);

  const order = [engine.ai, engine.player];
  for (const f of order) drawFighter(ctx, f);

  // Projectiles float above fighters
  if (engine.projectiles?.length) {
    for (const p of engine.projectiles) p.draw(ctx);
  }

  if (engine.particles) engine.particles.draw(ctx);
  if (engine.damageNumbers) engine.damageNumbers.draw(ctx);

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
  const w = ARENA.width, h = ARENA.height;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0a0518');
  grad.addColorStop(0.55, '#160a2b');
  grad.addColorStop(1, '#050210');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const sunX = w / 2, sunY = ARENA.groundY - 30;
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 20, sunX, sunY, 320);
  sunGrad.addColorStop(0, 'rgba(255, 90, 170, 0.55)');
  sunGrad.addColorStop(0.5, 'rgba(160, 60, 200, 0.15)');
  sunGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255, 90, 170, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, ARENA.groundY);
  ctx.lineTo(w, ARENA.groundY);
  ctx.stroke();

  ctx.save();
  ctx.strokeStyle = 'rgba(120, 90, 220, 0.35)';
  ctx.lineWidth = 1;
  const rows = 12;
  for (let i = 1; i <= rows; i++) {
    const t = i / rows;
    const y = ARENA.groundY + Math.pow(t, 1.5) * (h - ARENA.groundY);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
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

  // WRAITH-style teleport fade — applies whenever a fighter uses teleport, generated or not.
  let alpha = 1;
  if (f.attack?.type === 'special' && char.special.kind === 'teleport' && f.specialFx) {
    if (f.attack.phase === 'startup') {
      alpha = Math.max(0.15, f.attack.t / char.special.startup);
    } else if (f.attack.phase === 'active' && f.specialFx.phase === 'strike') {
      const p = 1 - (f.attack.t / char.special.active);
      alpha = Math.min(1, p * 2.5);
    }
  }

  // Damage-boost aura BEHIND body
  drawDamageBoostAura(ctx, f);

  // Ground shadow (fades with body)
  ctx.save();
  ctx.globalAlpha = 0.35 * alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.beginPath();
  ctx.ellipse(cx, ARENA.groundY + 4, f.width * 0.55, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawSpecialFxBehind(ctx, f);

  const primary = f.tint || char.color;
  const glow = char.trail || char.color;
  const flash = f.flashT > 0;
  const pose = computeAttackPose(f);

  const flinchX = f.hitstunT > 0 ? -f.facing * 3 : 0;
  const flinchY = f.hitstunT > 0 ? -1 : 0;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx + flinchX, feetY + flinchY);
  ctx.scale(f.facing, 1);
  if (char.id === 'volt')       drawVolt(ctx, f, primary, glow, flash, pose);
  else if (char.id === 'titan') drawTitan(ctx, f, primary, glow, flash, pose);
  else if (char.id === 'wraith') drawWraith(ctx, f, primary, glow, flash, pose);
  else                          drawGenerated(ctx, f, primary, glow, flash, pose);
  ctx.restore();

  if (f.blocking)                       drawBlockShield(ctx, f);
  if (f.shieldT > 0 && f.shieldHp > 0)  drawShieldBubble(ctx, f);
  if (f.healFxT > 0)                    drawHealSparkle(ctx, f);
  if (f.stunT > 0)                      drawStunStars(ctx, f);

  drawSpecialFxFront(ctx, f);
  drawAttackFx(ctx, f);
}

function computeAttackPose(f) {
  const pose = { attacking: false, armReach: 0, armY: -0.55, isHeavy: false, isSpecial: false, phase: null, castSpecial: false };
  if (!f.attack) return pose;
  const a = f.attack;
  const def = a.def;
  pose.attacking = true;
  pose.isHeavy = a.type === 'heavy';
  pose.isSpecial = a.type === 'special';
  pose.phase = a.phase;
  // Non-hitbox specials (shield/heal/damage_boost) get a "cast" pose (arms up)
  if (pose.isSpecial && (!def.hbW || !def.hbH)) {
    pose.castSpecial = true;
    return pose;
  }
  const forwardExtend = pose.isSpecial ? 1.35 : pose.isHeavy ? 1.25 : 1.00;
  const windupBack    = pose.isSpecial ? -0.35 : pose.isHeavy ? -0.55 : -0.35;
  if (a.phase === 'startup') {
    const p = 1 - (a.t / def.startup);
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

  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = 18;

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

  ctx.fillStyle = darken(color, -0.1);
  const headY = torY - bodyH*0.95 - 8;
  ctx.beginPath();
  ctx.arc(-w*0.05, headY, w*0.24, 0, Math.PI*2);
  ctx.fill();

  ctx.fillStyle = f.char.accent;
  ctx.fillRect(-w*0.15, headY - 3, w*0.22, 6);

  drawArmVolt(ctx, f, pose, color);
  ctx.restore();
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
  ctx.strokeStyle = color;
  ctx.lineWidth = w * (pose.isHeavy ? 0.22 : 0.18);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(handX, handY);
  ctx.stroke();
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

  ctx.fillStyle = darken(color, 0.4);
  ctx.fillRect(-w*0.42, -legH, w*0.32, legH);
  ctx.fillRect(w*0.10, -legH, w*0.32, legH);

  ctx.fillStyle = color;
  const torY = -legH;
  ctx.beginPath();
  ctx.moveTo(-w*0.40, torY);
  ctx.lineTo(w*0.40, torY);
  ctx.lineTo(w*0.55, torY - bodyH*0.85);
  ctx.lineTo(-w*0.55, torY - bodyH*0.85);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = f.char.accent;
  ctx.beginPath();
  ctx.moveTo(-w*0.20, torY - bodyH*0.15);
  ctx.lineTo(w*0.20, torY - bodyH*0.15);
  ctx.lineTo(w*0.10, torY - bodyH*0.55);
  ctx.lineTo(-w*0.10, torY - bodyH*0.55);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = darken(color, -0.05);
  ctx.beginPath();
  ctx.arc(-w*0.55, torY - bodyH*0.55, w*0.18, 0, Math.PI*2);
  ctx.fill();

  ctx.fillStyle = darken(color, -0.15);
  const headR = w*0.22;
  const headY = torY - bodyH*0.85 - headR + 4;
  ctx.beginPath();
  ctx.arc(0, headY, headR, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle = '#ffe27a';
  ctx.fillRect(-headR*0.75, headY - 2, headR*1.5, 6);

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
  ctx.strokeStyle = color;
  ctx.lineWidth = w * 0.28;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(handX, handY);
  ctx.stroke();
  const fistR = w * (pose.isHeavy ? 0.30 : 0.22);
  ctx.fillStyle = darken(color, -0.08);
  ctx.beginPath();
  ctx.arc(handX, handY, fistR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = f.char.accent;
  ctx.fillRect(handX - fistR*0.5, handY - fistR*0.3, fistR*1.0, fistR*0.6);
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

  ctx.fillStyle = darken(color, 0.2);
  ctx.beginPath();
  ctx.moveTo(-w*0.30, -legH);
  ctx.lineTo(w*0.30, -legH);
  const wobble = Math.sin(performance.now()/180) * 4;
  ctx.lineTo(w*0.08 + wobble, 0);
  ctx.quadraticCurveTo(0, 6, -w*0.08 - wobble, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = color;
  const torY = -legH;
  ctx.beginPath();
  ctx.moveTo(-w*0.30, torY);
  ctx.lineTo(w*0.30, torY);
  ctx.lineTo(w*0.35, torY - bodyH*0.70);
  ctx.lineTo(-w*0.35, torY - bodyH*0.70);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = darken(color, 0.3);
  ctx.beginPath();
  ctx.moveTo(-w*0.35, torY - bodyH*0.70);
  ctx.lineTo(w*0.35, torY - bodyH*0.70);
  ctx.lineTo(w*0.20, torY - bodyH*0.20);
  ctx.lineTo(-w*0.20, torY - bodyH*0.20);
  ctx.closePath();
  ctx.fill();

  const headR = w*0.26;
  const headY = torY - bodyH*0.70 - headR + 6;
  ctx.fillStyle = darken(color, -0.1);
  ctx.beginPath();
  ctx.arc(0, headY, headR, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle = '#ffb3ff';
  ctx.fillRect(-headR*0.5, headY - 2, headR*1.0, 5);

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
  ctx.strokeStyle = color;
  ctx.lineWidth = w * 0.14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(handX, handY);
  ctx.stroke();
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

/* ---------- Procedural generated-fighter draw ---------- */

const SILHOUETTE_PROPS = {
  slim:   { legRatio: 0.42, torsoW: 0.30, headR: 0.24, cloakDrape: false },
  medium: { legRatio: 0.45, torsoW: 0.38, headR: 0.24, cloakDrape: false },
  bulky:  { legRatio: 0.42, torsoW: 0.52, headR: 0.28, cloakDrape: false },
};

function drawGenerated(ctx, f, color, glow, flash, pose) {
  const h = f.height;
  const w = f.width;
  const sil = SILHOUETTE_PROPS[f.char.silhouette] || SILHOUETTE_PROPS.medium;
  const bodyH = h * (1 - sil.legRatio);
  const legH  = h * sil.legRatio;
  const tw    = w * sil.torsoW;
  const walkT = f.state === 'walk' ? Math.sin(performance.now() / 90) * 3 : 0;

  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = 20;

  // Legs — mirrored pair with a slight walk offset
  ctx.fillStyle = darken(color, 0.35);
  ctx.beginPath();
  ctx.moveTo(-tw * 0.75, 0);
  ctx.lineTo(-tw * 0.25, 0);
  ctx.lineTo(-tw * 0.35, -legH);
  ctx.lineTo(-tw * 0.85, -legH);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(tw * 0.25, 0);
  ctx.lineTo(tw * 0.75, 0);
  ctx.lineTo(tw * 0.85, -legH + walkT);
  ctx.lineTo(tw * 0.35, -legH + walkT);
  ctx.closePath(); ctx.fill();

  // Torso — trapezoidal with shoulder flare based on silhouette
  const torY = -legH;
  const shoulderFlare = f.char.silhouette === 'bulky' ? 1.20 : f.char.silhouette === 'slim' ? 0.95 : 1.08;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-tw, torY);
  ctx.lineTo( tw, torY);
  ctx.lineTo( tw * shoulderFlare, torY - bodyH * 0.75);
  ctx.lineTo(-tw * shoulderFlare, torY - bodyH * 0.75);
  ctx.closePath();
  ctx.fill();

  // Chest accent stripe
  ctx.fillStyle = f.char.accent || glow;
  const stripeH = Math.max(6, bodyH * 0.12);
  ctx.fillRect(-tw * 0.55, torY - bodyH * 0.55, tw * 1.10, stripeH);

  // Head
  const headR = w * sil.headR;
  const headY = torY - bodyH * 0.75 - headR + 4;
  ctx.fillStyle = darken(color, -0.1);
  ctx.beginPath();
  ctx.arc(0, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  // Visor
  ctx.fillStyle = f.char.accent || glow;
  ctx.fillRect(-headR * 0.75, headY - 2, headR * 1.5, 5);

  // Motif overlay
  drawMotif(ctx, f, tw, torY, bodyH, headY, headR);

  // Arm/animation
  if (pose.castSpecial) drawCastArms(ctx, f, color, tw, torY, bodyH);
  else                  drawGenericAttackArm(ctx, f, pose, color, tw, torY, bodyH);

  ctx.restore();
  if (flash) overlayFlash(ctx, f);
}

function drawMotif(ctx, f, tw, torY, bodyH, headY, headR) {
  const motif = f.char.motif;
  const accent = f.char.accent || f.char.trail || '#fff';
  const torsoCyY = torY - bodyH * 0.4;
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 8;
  switch (motif) {
    case 'blades': {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-tw * 1.05, torY - bodyH * 0.35);
      ctx.lineTo(-tw * 1.60, torY - bodyH * 0.90);
      ctx.moveTo( tw * 1.05, torY - bodyH * 0.35);
      ctx.lineTo( tw * 1.60, torY - bodyH * 0.90);
      ctx.stroke();
      break;
    }
    case 'orbs': {
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(-tw * 1.05, torsoCyY - 4, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc( tw * 1.05, torsoCyY - 4, 5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.arc(0, torY - bodyH * 0.15, 5, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'spikes': {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(-tw * 1.20, torY - bodyH * 0.5);
      ctx.lineTo(-tw * 1.60, torY - bodyH * 0.7);
      ctx.lineTo(-tw * 1.10, torY - bodyH * 0.3);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo( tw * 1.20, torY - bodyH * 0.5);
      ctx.lineTo( tw * 1.60, torY - bodyH * 0.7);
      ctx.lineTo( tw * 1.10, torY - bodyH * 0.3);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, headY - headR - 8);
      ctx.lineTo(-6, headY - headR + 4);
      ctx.lineTo( 6, headY - headR + 4);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'wings': {
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(-tw * 1.15, torY - bodyH * 0.55);
      ctx.quadraticCurveTo(-tw * 2.10, torY - bodyH * 0.85, -tw * 1.35, torY - bodyH * 0.10);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo( tw * 1.15, torY - bodyH * 0.55);
      ctx.quadraticCurveTo( tw * 2.10, torY - bodyH * 0.85,  tw * 1.35, torY - bodyH * 0.10);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'armor': {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(-tw * 0.35, torY - bodyH * 0.10);
      ctx.lineTo( tw * 0.35, torY - bodyH * 0.10);
      ctx.lineTo( tw * 0.25, torY - bodyH * 0.55);
      ctx.lineTo(-tw * 0.25, torY - bodyH * 0.55);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(-tw * 0.95, torY - bodyH * 0.06, tw * 1.90, 4);
      break;
    }
    case 'flames': {
      const bob = Math.sin(performance.now() / 160) * 3;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(-tw * 1.05, torY - bodyH * 0.10);
      ctx.quadraticCurveTo(-tw * 1.40, torY - bodyH * 0.55 + bob, -tw * 1.10, torY - bodyH * 0.65);
      ctx.quadraticCurveTo(-tw * 0.95, torY - bodyH * 0.30, -tw * 1.05, torY - bodyH * 0.10);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo( tw * 1.05, torY - bodyH * 0.10);
      ctx.quadraticCurveTo( tw * 1.40, torY - bodyH * 0.55 - bob,  tw * 1.10, torY - bodyH * 0.65);
      ctx.quadraticCurveTo( tw * 0.95, torY - bodyH * 0.30,  tw * 1.05, torY - bodyH * 0.10);
      ctx.closePath(); ctx.fill();
      // Head flame
      ctx.beginPath();
      ctx.moveTo(0, headY - headR - 4);
      ctx.quadraticCurveTo(-6, headY - headR - 18, 0, headY - headR - 28);
      ctx.quadraticCurveTo( 6, headY - headR - 18, 0, headY - headR - 4);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'frost': {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, torY - bodyH * 0.20);
      ctx.lineTo(0, torY - bodyH * 0.65);
      ctx.moveTo(-tw * 0.5, torY - bodyH * 0.30);
      ctx.lineTo( tw * 0.5, torY - bodyH * 0.55);
      ctx.moveTo( tw * 0.5, torY - bodyH * 0.30);
      ctx.lineTo(-tw * 0.5, torY - bodyH * 0.55);
      ctx.stroke();
      ctx.fillStyle = accent;
      for (const p of [[-0.75, 0.15], [0.75, 0.15], [0, 0.70]]) {
        ctx.beginPath();
        ctx.arc(tw * p[0], torY - bodyH * p[1], 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'shadow': {
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.ellipse(0, torY - bodyH * 0.20, tw * 1.20, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.30;
      ctx.beginPath();
      ctx.ellipse(0, torY - bodyH * 0.05, tw * 0.90, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

// Melee / dash / projectile / stun / lifesteal / teleport → single forward arm
function drawGenericAttackArm(ctx, f, pose, color, tw, torY, bodyH) {
  const w = f.width, h = f.height;
  const shoulderX = tw * 0.55;
  const shoulderY = torY - bodyH * 0.6;
  if (!pose.attacking) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(tw * 0.70, torY - bodyH * 0.45, w * 0.14, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const handX = shoulderX + pose.armReach * w * 1.15;
  const handY = pose.armY * h;
  ctx.strokeStyle = color;
  ctx.lineWidth = w * (pose.isHeavy ? 0.22 : 0.18);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(handX, handY);
  ctx.stroke();
  const fistR = w * (pose.isHeavy ? 0.24 : pose.isSpecial ? 0.22 : 0.18);
  ctx.fillStyle = pose.phase === 'active'
    ? (pose.isSpecial ? (f.char.trail || f.char.accent) : (pose.isHeavy ? '#ff6a6a' : '#fff8b8'))
    : (f.char.accent || color);
  ctx.beginPath();
  ctx.arc(handX, handY, fistR, 0, Math.PI * 2);
  ctx.fill();
  if (pose.phase === 'active' && pose.isSpecial) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(handX, handY, fistR * 1.6, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// Non-hitbox specials (shield/heal/damage_boost): both arms raised skyward
function drawCastArms(ctx, f, color, tw, torY, bodyH) {
  const w = f.width;
  const shoulderY = torY - bodyH * 0.6;
  const handY = torY - bodyH * 1.15;
  ctx.strokeStyle = color;
  ctx.lineWidth = w * 0.15;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-tw * 0.55, shoulderY);
  ctx.lineTo(-tw * 0.20, handY);
  ctx.moveTo( tw * 0.55, shoulderY);
  ctx.lineTo( tw * 0.20, handY);
  ctx.stroke();
  const kind = f.char.special.kind;
  const orbColor = kind === 'heal' ? '#7fff9a'
                 : kind === 'shield' ? '#8fd7ff'
                 : '#ff9a4a';
  ctx.fillStyle = orbColor;
  ctx.shadowColor = orbColor;
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.arc(0, handY - 4, w * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

/* ---------- Buff / debuff overlays (all fighters) ---------- */

// Persistent orange fringe when a fighter is damage-boosted
function drawDamageBoostAura(ctx, f) {
  if (f.dmgBoostT <= 0) return;
  const cx = f.x, cy = f.y - f.height / 2;
  const t = performance.now() / 220;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const r = f.width * 0.9 + Math.sin(t + i) * 6 + i * 8;
    const grad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
    grad.addColorStop(0, 'rgba(255, 154, 74, 0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Cyan bubble while shield is active
function drawShieldBubble(ctx, f) {
  const cx = f.x, cy = f.y - f.height / 2;
  const t = performance.now() / 200;
  const r = f.width * 1.0 + Math.sin(t) * 3;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(cx, cy, r * 0.75, cx, cy, r);
  grad.addColorStop(0, 'rgba(120, 200, 255, 0)');
  grad.addColorStop(0.6, 'rgba(120, 210, 255, 0.35)');
  grad.addColorStop(1, 'rgba(180, 240, 255, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(200, 240, 255, 0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // Hexagonal facets
  ctx.strokeStyle = 'rgba(140, 220, 255, 0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 * i) / 6 + t * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.restore();
}

// Brief green sparkle after a heal
function drawHealSparkle(ctx, f) {
  const cx = f.x, cy = f.y - f.height / 2;
  const t = 1 - (f.healFxT / 0.6);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(127, 255, 154, 0.9)';
  ctx.lineWidth = 3;
  const armCount = 4;
  const armLen = 24 + t * 24;
  for (let i = 0; i < armCount; i++) {
    const a = (Math.PI / 2) * i + t * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4);
    ctx.lineTo(cx + Math.cos(a) * armLen, cy + Math.sin(a) * armLen);
    ctx.stroke();
  }
  ctx.fillStyle = `rgba(180, 255, 210, ${1 - t})`;
  ctx.beginPath();
  ctx.arc(cx, cy, 6 + t * 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Small rotating stars over a stunned fighter's head
function drawStunStars(ctx, f) {
  const cx = f.x;
  const cy = f.y - f.height - 14;
  const t = performance.now() / 400;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const count = 3;
  for (let i = 0; i < count; i++) {
    const a = t + (Math.PI * 2 * i) / count;
    const px = cx + Math.cos(a) * 18;
    const py = cy + Math.sin(a) * 6;
    ctx.fillStyle = '#ffe14a';
    ctx.shadowColor = '#ffbd3d';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    for (let j = 0; j < 5; j++) {
      const aa = -Math.PI / 2 + (Math.PI * 2 * j) / 5;
      const r = j % 2 === 0 ? 6 : 2.6;
      const x = px + Math.cos(aa) * r;
      const y = py + Math.sin(aa) * r;
      if (j === 0) ctx.moveTo(x, y);
      else         ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function overlayFlash(ctx, f) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, f.flashT * 4)})`;
  ctx.fillRect(-f.width/2 - 6, -f.height - 10, f.width + 12, f.height + 20);
  ctx.restore();
}

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
  ctx.strokeStyle = `rgba(255,255,255, ${0.5 + pulse * 0.4})`;
  ctx.lineWidth = 1.5 + pulse * 2;
  ctx.beginPath();
  ctx.arc(sx, sy, Math.max(10, radius - 8), start, end);
  ctx.stroke();
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
  if (f.attack.phase !== 'active') return;
  const hb = f.getActiveHitbox();
  if (!hb) return;
  const cx = hb.x + hb.w/2;
  const cy = hb.y + hb.h/2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const color = f.attack.type === 'heavy'   ? '#ff6b6b'
              : f.attack.type === 'special' ? (f.char.trail || f.char.accent)
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
    ctx.strokeStyle = `rgba(255, 230, 160, ${Math.max(0, 1 - fx.shockwave * 0.6)})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(f.x, ARENA.groundY - 4, r, r*0.35, 0, 0, Math.PI*2);
    ctx.stroke();
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
    const grad = ctx.createRadialGradient(fx.postAt.x, fx.postAt.y - f.height/2, 5, fx.postAt.x, fx.postAt.y - f.height/2, 100);
    grad.addColorStop(0, 'rgba(230, 160, 255, 0.85)');
    grad.addColorStop(0.5, 'rgba(150, 80, 220, 0.4)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fx.postAt.x, fx.postAt.y - f.height/2, 100, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 220, 255, 0.9)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(fx.postAt.x - f.facing * 40, fx.postAt.y - f.height * 0.20);
    ctx.lineTo(fx.postAt.x + f.facing * 60, fx.postAt.y - f.height * 0.80);
    ctx.stroke();
    ctx.restore();
  }
}
