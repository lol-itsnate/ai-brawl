import React, { useState } from 'react';
import { CHARACTERS } from '../game/characters.js';

// Minimal dev select screen: pick player + AI, then FIGHT.
// Phase-2 will replace with a polished character-select flow.

const ROSTER = ['volt', 'titan', 'wraith'];

export default function SelectScreen({ onStart }) {
  const [player, setPlayer] = useState('volt');
  const [ai, setAi] = useState('titan');

  return (
    <div className="brawl-select" data-testid="select-screen">
      <header className="brawl-select-header">
        <h1 className="brawl-title" data-testid="app-title">
          <span className="brawl-title-accent">AI</span> BRAWL
        </h1>
        <p className="brawl-subtitle" data-testid="app-subtitle">
          Phase 1 · Core Fight Engine
        </p>
      </header>

      <div className="brawl-select-panels">
        <RosterPanel
          heading="PLAYER"
          side="left"
          selected={player}
          onSelect={setPlayer}
          testid="player-roster"
        />
        <div className="brawl-vs">
          <span className="brawl-vs-x">VS</span>
        </div>
        <RosterPanel
          heading="AI OPPONENT"
          side="right"
          selected={ai}
          onSelect={setAi}
          testid="ai-roster"
        />
      </div>

      <div className="brawl-select-footer">
        <button
          className="brawl-btn brawl-btn-primary brawl-fight-btn"
          onClick={() => onStart(player, ai)}
          data-testid="fight-button"
        >
          FIGHT
        </button>
        <div className="brawl-mirror-note" data-testid="mirror-hint">
          Mirror matches are allowed — the AI copy will be tinted.
        </div>
      </div>
    </div>
  );
}

function RosterPanel({ heading, side, selected, onSelect, testid }) {
  return (
    <div className={`brawl-roster ${side}`} data-testid={testid}>
      <div className="brawl-roster-heading">{heading}</div>
      <div className="brawl-roster-cards">
        {ROSTER.map((id) => {
          const c = CHARACTERS[id];
          const isSel = id === selected;
          return (
            <button
              key={id}
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
                <span className="brawl-card-special-label">SPECIAL</span>
                <span className="brawl-card-special-val">{c.special.name}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatRow({ label, value, max }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="brawl-stat-row">
      <span className="brawl-stat-label">{label}</span>
      <div className="brawl-stat-track">
        <div className="brawl-stat-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* Tiny stylized SVG portrait mirroring the canvas silhouettes. */
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
