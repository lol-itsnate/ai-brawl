// Map a server-produced FighterData → engine character shape (same as VOLT/TITAN/WRAITH).
// All new specials map to real engine mechanics; visuals derive from silhouette/motif/colors.

const NAME_MAP = {
  dash:         'PLASMA DASH',
  teleport:     'PHASE STRIKE',
  projectile:   'ARC BOLT',
  aoe:          'SHOCKWAVE',
  stun:         'STUN BURST',
  shield:       'AEGIS SHIELD',
  heal:         'MEND',
  lifesteal:    'DRAIN STRIKE',
  damage_boost: 'BERSERK',
};

export const PASSIVE_LABELS = {
  low_health_damage_boost:  'Berserker Rage',
  damage_taken_speed_boost: 'Adrenaline',
  lifesteal:                'Vampiric',
  damage_reduction:         'Fortified',
  combo_damage_boost:       'Momentum',
};

export const PASSIVE_DESCRIPTIONS = {
  low_health_damage_boost:  (v) => `Below 30% HP, +${Math.round((v-1)*100)}% outgoing damage.`,
  damage_taken_speed_boost: (v) => `Move speed +${Math.round((v-1)*100)}% for 2s after being hit.`,
  lifesteal:                (v) => `Heals ${Math.round(v*100)}% of damage dealt.`,
  damage_reduction:         (v) => `Incoming damage reduced by ${Math.round(v*100)}%.`,
  combo_damage_boost:       (v) => `+${Math.round(v*100)}% damage per stack (max 4, 1.5s window).`,
};

export const SPECIAL_LABELS = {
  dash: 'Dash Strike', teleport: 'Teleport Strike', projectile: 'Projectile Bolt',
  aoe: 'Shockwave Slam', stun: 'Stun Burst', shield: 'Barrier Shield',
  heal: 'Mend Wounds', lifesteal: 'Life Drain', damage_boost: 'Berserker Mode',
};

const SILHOUETTE_BODY = {
  slim:   { bodyW: 52, bodyH: 122 },
  medium: { bodyW: 62, bodyH: 122 },
  bulky:  { bodyW: 78, bodyH: 128 },
};

// Move speed: stat 40 → 200 px/s, stat 100 → 380 px/s
function mapMoveSpeed(speedStat) {
  return Math.round(200 + (speedStat - 40) * 3);
}

// Attack damage scale from the power stat.
function mapAttackDamages(powerStat) {
  const p = Math.max(0, Math.min(1, (powerStat - 40) / 60));
  return {
    lightDmg: Math.round(5 + p * 6),   // 5-11
    heavyDmg: Math.round(11 + p * 8),  // 11-19
  };
}

function deriveSpecial(fd) {
  const { type, damage, cooldown } = fd.special;
  const shared = { name: NAME_MAP[type] || type.toUpperCase(), cooldown, damage };
  // Note: we alias 'aoe' → engine kind 'slam' so it reuses the existing shockwave code.
  const per = {
    dash:         { kind: 'dash',         startup: 0.10, active: 0.30, recovery: 0.22, reach: 80,  hbW: 90,  hbH: 90,  knockback: 260, hitstun: 0.32, dashSpeed: 780 },
    teleport:     { kind: 'teleport',     startup: 0.18, active: 0.12, recovery: 0.30, reach: 74,  hbW: 70,  hbH: 60,  knockback: 260, hitstun: 0.34, teleportOffset: 90 },
    projectile:   { kind: 'projectile',   startup: 0.14, active: 0.05, recovery: 0.32, reach: 40,  hbW: 0,   hbH: 0,   knockback: 220, hitstun: 0.30, projSpeed: 620, projLife: 1.2, projRadius: 22 },
    aoe:          { kind: 'slam',         startup: 0.28, active: 0.22, recovery: 0.45, reach: 110, hbW: 220, hbH: 90,  knockback: 420, hitstun: 0.42, liftVelocity: -520 },
    stun:         { kind: 'stun',         startup: 0.14, active: 0.10, recovery: 0.32, reach: 60,  hbW: 70,  hbH: 60,  knockback: 100, hitstun: 0.24, stunDuration: 1.0 },
    shield:       { kind: 'shield',       startup: 0.08, active: 0.04, recovery: 0.20, reach: 0,   hbW: 0,   hbH: 0,   knockback: 0,   hitstun: 0,    shieldDuration: 3.0, shieldAmount: 30 },
    heal:         { kind: 'heal',         startup: 0.20, active: 0.08, recovery: 0.28, reach: 0,   hbW: 0,   hbH: 0,   knockback: 0,   hitstun: 0 },
    lifesteal:    { kind: 'lifesteal',    startup: 0.12, active: 0.10, recovery: 0.30, reach: 76,  hbW: 70,  hbH: 58,  knockback: 220, hitstun: 0.30, lifestealFraction: 0.6 },
    damage_boost: { kind: 'damage_boost', startup: 0.08, active: 0.04, recovery: 0.20, reach: 0,   hbW: 0,   hbH: 0,   knockback: 0,   hitstun: 0,    boostDuration: 4.0, boostMult: 1.5 },
  };
  return { ...shared, ...(per[type] || per.dash) };
}

/**
 * Convert a validated FighterData (from the /api/forge/generate response)
 * into a game-ready character object with the same shape as the built-in
 * VOLT/TITAN/WRAITH entries in `characters.js`.
 */
export function deriveEngineCharacter(fd) {
  if (!fd || !fd.stats || !fd.visual || !fd.special || !fd.passive) {
    throw new Error('deriveEngineCharacter: invalid FighterData');
  }
  const body = SILHOUETTE_BODY[fd.visual.silhouette] || SILHOUETTE_BODY.medium;
  const moveSpeed = mapMoveSpeed(fd.stats.speed);
  const { lightDmg, heavyDmg } = mapAttackDamages(fd.stats.power);
  return {
    id: fd.id,
    name: fd.name,
    description: fd.description,
    color:  fd.visual.primaryColor,
    accent: fd.visual.secondaryColor,
    trail:  fd.visual.secondaryColor,
    maxHp:  fd.stats.hp,
    moveSpeed,
    body,
    silhouette: fd.visual.silhouette,
    motif:      fd.visual.motif,
    passive:    fd.passive,   // {type, value}
    stats:      fd.stats,     // preserved for UI
    isGenerated: true,
    light:   { startup: 0.06, active: 0.08, recovery: 0.10, damage: lightDmg, reach: 70, hbW: 55, hbH: 42, knockback: 140, hitstun: 0.22 },
    heavy:   { startup: 0.30, active: 0.10, recovery: 0.42, damage: heavyDmg, reach: 78, hbW: 72, hbH: 58, knockback: 340, hitstun: 0.40 },
    special: deriveSpecial(fd),
  };
}
