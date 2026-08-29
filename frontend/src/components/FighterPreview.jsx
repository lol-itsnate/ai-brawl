import React from 'react';

/**
 * Static SVG portrait of a generated fighter — silhouette + motif accents +
 * primary/secondary colors. Used in the roster card + forge result card.
 */
export default function FighterPreview({ fighterData, size = 130 }) {
  if (!fighterData) return null;
  const { visual, name } = fighterData;
  const primary = visual?.primaryColor || '#3ee8ff';
  const secondary = visual?.secondaryColor || '#ffe14a';
  const silhouette = visual?.silhouette || 'medium';
  const motif = visual?.motif || 'blades';
  return (
    <svg
      viewBox="0 0 100 130"
      width={size}
      height={size * 1.3}
      className={`brawl-fighter-preview sil-${silhouette}`}
      role="img"
      aria-label={name}
      style={{ filter: `drop-shadow(0 0 10px ${secondary})` }}
    >
      <BaseSilhouette silhouette={silhouette} primary={primary} secondary={secondary} />
      <MotifOverlay motif={motif} primary={primary} secondary={secondary} silhouette={silhouette} />
    </svg>
  );
}

function BaseSilhouette({ silhouette, primary, secondary }) {
  // Body proportions per silhouette
  const cfg = {
    slim:   { headR: 12, torsoW: 22, torsoH: 40, hipY: 90,  shoulderY: 40 },
    medium: { headR: 14, torsoW: 30, torsoH: 42, hipY: 92,  shoulderY: 42 },
    bulky:  { headR: 15, torsoW: 40, torsoH: 46, hipY: 94,  shoulderY: 44 },
  }[silhouette] || {};
  const cx = 50;
  const torsoTop = cfg.shoulderY;
  const torsoBottom = torsoTop + cfg.torsoH;
  const headCy = torsoTop - cfg.headR - 2;
  return (
    <g>
      {/* Legs */}
      <rect x={cx - cfg.torsoW * 0.32} y={torsoBottom - 4} width={cfg.torsoW * 0.22} height={cfg.hipY - torsoBottom + 4} fill={secondary} opacity={0.55}/>
      <rect x={cx + cfg.torsoW * 0.10} y={torsoBottom - 4} width={cfg.torsoW * 0.22} height={cfg.hipY - torsoBottom + 4} fill={secondary} opacity={0.55}/>
      {/* Torso */}
      <polygon
        points={`${cx - cfg.torsoW/2},${torsoBottom} ${cx + cfg.torsoW/2},${torsoBottom} ${cx + cfg.torsoW/2 + 4},${torsoTop} ${cx - cfg.torsoW/2 - 4},${torsoTop}`}
        fill={primary}
      />
      {/* Head */}
      <circle cx={cx} cy={headCy} r={cfg.headR} fill={primary} />
      {/* Visor */}
      <rect x={cx - cfg.headR * 0.75} y={headCy - 2} width={cfg.headR * 1.5} height={4} fill={secondary} />
    </g>
  );
}

function MotifOverlay({ motif, primary, secondary, silhouette }) {
  const cfg = { slim: 22, medium: 30, bulky: 40 }[silhouette] || 30;
  const cx = 50;
  const torsoCy = 60;
  switch (motif) {
    case 'blades':
      return (
        <g stroke={secondary} strokeWidth="1.8" fill="none">
          <line x1={cx - cfg} y1={70} x2={cx - cfg * 1.7} y2={45} />
          <line x1={cx + cfg} y1={70} x2={cx + cfg * 1.7} y2={45} />
        </g>
      );
    case 'orbs':
      return (
        <g fill={secondary}>
          <circle cx={cx - cfg * 0.9} cy={torsoCy} r="3.5" />
          <circle cx={cx + cfg * 0.9} cy={torsoCy} r="3.5" />
          <circle cx={cx} cy={torsoCy + cfg * 0.5} r="3" opacity={0.7}/>
        </g>
      );
    case 'spikes':
      return (
        <g fill={secondary}>
          <polygon points={`${cx-cfg},${torsoCy-8} ${cx-cfg-6},${torsoCy-14} ${cx-cfg-2},${torsoCy-2}`} />
          <polygon points={`${cx+cfg},${torsoCy-8} ${cx+cfg+6},${torsoCy-14} ${cx+cfg+2},${torsoCy-2}`} />
          <polygon points={`${cx},${40} ${cx-4},${28} ${cx+4},${28}`} />
        </g>
      );
    case 'wings':
      return (
        <g fill={secondary} opacity={0.65}>
          <polygon points={`${cx-cfg},${45} ${cx-cfg-14},${60} ${cx-cfg-4},${75}`} />
          <polygon points={`${cx+cfg},${45} ${cx+cfg+14},${60} ${cx+cfg+4},${75}`} />
        </g>
      );
    case 'armor':
      return (
        <g fill={secondary}>
          <polygon points={`${cx-8},${50} ${cx+8},${50} ${cx+6},${70} ${cx-6},${70}`} />
          <rect x={cx - cfg * 0.85} y={70} width={cfg * 1.7} height="3" />
        </g>
      );
    case 'flames':
      return (
        <g fill={secondary} opacity={0.85}>
          <path d={`M${cx-cfg-2},${80} Q${cx-cfg-8},${65} ${cx-cfg-3},${55} Q${cx-cfg},${68} ${cx-cfg+2},${80} Z`} />
          <path d={`M${cx+cfg+2},${80} Q${cx+cfg+8},${65} ${cx+cfg+3},${55} Q${cx+cfg},${68} ${cx+cfg-2},${80} Z`} />
          <path d={`M${cx},${34} Q${cx-4},${24} ${cx},${18} Q${cx+4},${24} ${cx},${34} Z`} fill={primary}/>
        </g>
      );
    case 'frost':
      return (
        <g stroke={secondary} strokeWidth="1.5" fill="none">
          <line x1={cx} y1={50} x2={cx} y2={78} />
          <line x1={cx-8} y1={55} x2={cx+8} y2={73} />
          <line x1={cx+8} y1={55} x2={cx-8} y2={73} />
        </g>
      );
    case 'shadow':
      return (
        <g fill={secondary} opacity={0.55}>
          <ellipse cx={cx} cy={torsoCy + 15} rx={cfg * 0.9} ry="6" />
          <ellipse cx={cx} cy={torsoCy + 22} rx={cfg * 0.7} ry="4" opacity={0.7}/>
        </g>
      );
    default:
      return null;
  }
}
