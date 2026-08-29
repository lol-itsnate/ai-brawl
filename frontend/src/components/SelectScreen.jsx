import React, { useState, useEffect, useMemo } from 'react';
import { CHARACTERS } from '../game/characters.js';
import { loadRoster } from '../game/roster.js';
import { SPECIAL_LABELS, PASSIVE_LABELS } from '../game/forge.js';
import FighterPreview from './FighterPreview.jsx';
import ControlsOverlay from './ControlsOverlay.jsx';

const DEFAULT_ROSTER = ['volt', 'titan', 'wraith'];

const SPECIAL_DESC = {
  volt:   'Electric dash — closes distance and shocks on contact.',
  titan:  'Shockwave slam — heavy AOE with strong knockback.',
  wraith: 'Phase strike — teleports behind the foe and strikes.',
};

// Auto-revert delay for the "confirm delete" state — a stray click never nukes a saved fighter.
const CONFIRM_REVERT_MS = 2000;

export default function SelectScreen({ onStart, onOpenForge, onDeleteGenerated, rosterVersion = 0 }) {
  const [player, setPlayer] = useState(null);
  const [ai, setAi] = useState(null);
  const [showControls, setShowControls] = useState(false);
  const [generated, setGenerated] = useState([]);

  // Reload roster whenever App bumps rosterVersion (post-save / post-delete)
  useEffect(() => { setGenerated(loadRoster()); }, [rosterVersion]);

  // If a selected fighter was just deleted, drop it from selection
  useEffect(() => {
    const ids = new Set([...DEFAULT_ROSTER, ...generated.map(g => g.id)]);
    if (player && !ids.has(player)) setPlayer(null);
    if (ai && !ids.has(ai))         setAi(null);
  }, [generated, player, ai]);

  const ready = !!(player && ai);

  return (
    <div className="brawl-select" data-testid="select-screen">
      <button
        className="brawl-icon-btn brawl-corner-controls"
        onClick={() => setShowControls(true)}
        data-testid="select-controls-btn"
      >
        CONTROLS
      </button>

      <button
        className="brawl-forge-open-btn"
        onClick={onOpenForge}
        data-testid="open-forge-btn"
      >
        <span className="brawl-forge-open-plus">+</span>
        <span className="brawl-forge-open-label">FIGHTER FORGE</span>
      </button>

      <header className="brawl-select-header">
        <h1 className="brawl-title" data-testid="app-title">
          <span className="brawl-title-accent">AI</span> BRAWL
        </h1>
        <p className="brawl-subtitle" data-testid="app-subtitle">
          Pick your fighter · Pick your opponent · Brawl
        </p>
      </header>

      <div className="brawl-select-panels">
        <RosterPanel
          step={1}
          heading="YOUR FIGHTER"
          side="left"
          selected={player}
          onSelect={setPlayer}
          testid="player-roster"
          generated={generated}
          onDeleteGenerated={onDeleteGenerated}
        />
        <div className="brawl-vs">
          <span className="brawl-vs-x">VS</span>
        </div>
        <RosterPanel
          step={2}
          heading="OPPONENT"
          side="right"
          selected={ai}
          onSelect={setAi}
          testid="ai-roster"
          generated={generated}
          onDeleteGenerated={onDeleteGenerated}
        />
      </div>

      <div className="brawl-select-footer">
        <button
          className={`brawl-btn brawl-btn-primary brawl-fight-btn ${ready ? '' : 'is-disabled'}`}
          onClick={() => { if (ready) onStart(player, ai); }}
          disabled={!ready}
          data-testid="fight-button"
        >
          {ready ? 'FIGHT' : 'PICK BOTH FIGHTERS'}
        </button>
        <div className="brawl-mirror-note" data-testid="mirror-hint">
          Mirror matches are allowed — the AI copy will be tinted.
        </div>
      </div>

      {showControls && <ControlsOverlay onClose={() => setShowControls(false)} />}
    </div>
  );
}

function RosterPanel({ step, heading, side, selected, onSelect, testid, generated, onDeleteGenerated }) {
  const cards = useMemo(() => {
    return [
      ...DEFAULT_ROSTER.map(id => ({ kind: 'default', id, data: CHARACTERS[id] })),
      ...generated.map(fd => ({ kind: 'generated', id: fd.id, data: fd })),
    ];
  }, [generated]);
  return (
    <div className={`brawl-roster ${side}`} data-testid={testid}>
      <div className="brawl-roster-step" data-testid={`${testid}-step`}>STEP {step}</div>
      <div className="brawl-roster-heading">{heading}</div>
      <div className={`brawl-roster-cards ${cards.length > 3 ? 'wide' : ''}`}>
        {cards.map(({ kind, id, data }) => (
          kind === 'default'
            ? <DefaultCard
                key={id}
                id={id}
                c={data}
                isSel={id === selected}
                onSelect={onSelect}
                testid={testid}
              />
            : <GeneratedCard
                key={id}
                fd={data}
                isSel={id === selected}
                onSelect={onSelect}
                onDelete={onDeleteGenerated}
                testid={testid}
              />
        ))}
      </div>
    </div>
  );
}

function DefaultCard({ id, c, isSel, onSelect, testid }) {
  return (
    <button
      className={`brawl-card ${isSel ? 'is-selected' : ''}`}
      onClick={() => onSelect(id)}
      data-testid={`${testid}-${id}`}
      style={{
        '--card-color': c.color,
        '--card-accent': c.accent,
        '--card-trail': c.trail,
      }}
    >
      <CharacterPortrait charId={id} />
      <div className="brawl-card-name">{c.name}</div>
      <div className="brawl-card-stats">
        <StatRow label="HP"    value={c.maxHp} max={140} />
        <StatRow label="SPEED" value={c.moveSpeed} max={340} />
        <StatRow label="POWER" value={c.heavy.damage} max={20} />
      </div>
      <div className="brawl-card-special">
        <span className="brawl-card-special-label">SPECIAL · {c.special.name}</span>
        <span className="brawl-card-special-desc">{SPECIAL_DESC[id]}</span>
      </div>
    </button>
  );
}

function GeneratedCard({ fd, isSel, onSelect, onDelete, testid }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), CONFIRM_REVERT_MS);
    return () => clearTimeout(t);
  }, [confirming]);

  const handleSelect = () => onSelect(fd.id);
  const handleKey = (e) => {
    // Space or Enter activates the card (matches native <button> semantics)
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleSelect();
    }
  };
  const handleDelete = (e) => {
    e.stopPropagation();
    if (!confirming) { setConfirming(true); return; }
    setConfirming(false);
    onDelete?.(fd.id);
  };

  // Note: rendered as a div (not <button>) because it hosts a nested delete
  // <button>. A <button> inside a <button> is invalid HTML5 and produces a
  // React hydration warning. role/tabIndex/onKeyDown restore full a11y.
  return (
    <div
      role="button"
      tabIndex={0}
      className={`brawl-card brawl-card-generated ${isSel ? 'is-selected' : ''}`}
      onClick={handleSelect}
      onKeyDown={handleKey}
      data-testid={`${testid}-${fd.id}`}
      style={{
        '--card-color':  fd.visual.primaryColor,
        '--card-accent': fd.visual.secondaryColor,
        '--card-trail':  fd.visual.secondaryColor,
      }}
    >
      <div className="brawl-card-forged-tag" data-testid={`${testid}-${fd.id}-tag`}>FORGED</div>
      <button
        type="button"
        className={`brawl-card-delete-btn ${confirming ? 'is-confirming' : ''}`}
        onClick={handleDelete}
        data-testid={`${testid}-${fd.id}-delete`}
        title={confirming ? 'Click again to confirm delete' : 'Delete fighter'}
      >
        {confirming ? '?' : '×'}
      </button>
      <div className="brawl-card-portrait-wrap">
        <FighterPreview fighterData={fd} size={92} />
      </div>
      <div className="brawl-card-name">{fd.name}</div>
      <div className="brawl-card-stats">
        <StatRow label="HP"    value={fd.stats.hp}    max={160} />
        <StatRow label="SPEED" value={fd.stats.speed} max={100} />
        <StatRow label="POWER" value={fd.stats.power} max={100} />
      </div>
      <div className="brawl-card-special">
        <span className="brawl-card-special-label">
          SPECIAL · {SPECIAL_LABELS[fd.special.type] || fd.special.type.toUpperCase()}
        </span>
        <span className="brawl-card-special-desc">
          {PASSIVE_LABELS[fd.passive.type] || fd.passive.type} · {fd.special.cooldown}s CD
        </span>
      </div>
    </div>
  );
}

function StatRow({ label, value, max }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div className="brawl-stat-row">
      <span className="brawl-stat-label">{label}</span>
      <div className="brawl-stat-track">
        <div className="brawl-stat-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CharacterPortrait({ charId }) {
  if (charId === 'volt') return (
    <svg viewBox="0 0 100 120" className="brawl-portrait">
      <circle cx="50" cy="30" r="16" fill="#3ab6ff" />
      <rect x="42" y="26" width="20" height="5" fill="#f9e94a" />
      <polygon points="35,50 65,50 50,78 62,78 40,110 50,80 38,80" fill="#3ab6ff" />
    </svg>
  );
  if (charId === 'titan') return (
    <svg viewBox="0 0 100 120" className="brawl-portrait">
      <circle cx="50" cy="28" r="14" fill="#c05a15" />
      <rect x="34" y="26" width="32" height="5" fill="#ffe27a" />
      <polygon points="20,50 80,50 90,95 10,95" fill="#ff8a3d" />
      <rect x="40" y="60" width="20" height="24" fill="#7a3a10" />
    </svg>
  );
  return (
    <svg viewBox="0 0 100 120" className="brawl-portrait">
      <circle cx="50" cy="32" r="15" fill="#9a4be0" />
      <rect x="38" y="30" width="24" height="4" fill="#ffb3ff" />
      <polygon points="30,52 70,52 78,90 22,90" fill="#b56bff" />
      <polygon points="22,90 78,90 60,115 40,115" fill="#2a0f4a" />
    </svg>
  );
}
