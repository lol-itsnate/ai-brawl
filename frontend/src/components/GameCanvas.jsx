import React, { useEffect, useRef, useState } from 'react';
import { GameEngine } from '../game/engine.js';
import { ARENA } from '../game/constants.js';

// Renders the canvas + HUD overlay. React state mirrors engine state via onStateChange.

export default function GameCanvas({ playerCharId, aiCharId, onExit }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const [snap, setSnap] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = ARENA.width;
    canvas.height = ARENA.height;

    const engine = new GameEngine({
      canvas,
      playerCharId,
      aiCharId,
      onStateChange: setSnap,
    });
    engineRef.current = engine;
    engine.start();

    return () => engine.stop();
  }, [playerCharId, aiCharId]);

  const handleRestart = () => {
    engineRef.current?.restart();
  };

  return (
    <div
      className="brawl-stage"
      data-testid="game-stage"
    >
      <TopHud snap={snap} />

      <div className="brawl-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="brawl-canvas"
          data-testid="game-canvas"
        />
        {snap && snap.status !== 'playing' && (
          <ResultOverlay
            status={snap.status}
            onRestart={handleRestart}
            onExit={onExit}
          />
        )}
      </div>

      <ControlsHint />
    </div>
  );
}

function TopHud({ snap }) {
  if (!snap) return null;
  const { player, ai, time } = snap;
  return (
    <div className="brawl-hud" data-testid="hud">
      <FighterBar side="left" data={player} testid="player-hud" />
      <div className="brawl-timer" data-testid="round-timer">
        {Math.ceil(time).toString().padStart(2, '0')}
      </div>
      <FighterBar side="right" data={ai} testid="ai-hud" />
    </div>
  );
}

function FighterBar({ side, data, testid }) {
  const pct = Math.max(0, (data.hp / data.maxHp) * 100);
  const cdPct = data.specialMax > 0 ? (1 - data.specialCd / data.specialMax) * 100 : 100;
  const ready = data.specialCd <= 0;
  return (
    <div className={`brawl-fighter-hud ${side}`} data-testid={testid}>
      <div className="brawl-fighter-name" data-testid={`${testid}-name`}>{data.name}</div>
      <div className="brawl-hp-track" aria-hidden>
        <div
          className="brawl-hp-fill"
          style={{ width: `${pct}%` }}
          data-testid={`${testid}-hp-fill`}
        />
      </div>
      <div className="brawl-hp-num" data-testid={`${testid}-hp-num`}>
        {Math.max(0, Math.ceil(data.hp))} / {data.maxHp}
      </div>
      <div className={`brawl-special ${ready ? 'ready' : ''}`} data-testid={`${testid}-special`}>
        <span className="brawl-special-label">SPECIAL</span>
        <div className="brawl-special-track">
          <div className="brawl-special-fill" style={{ width: `${cdPct}%` }} />
        </div>
        <span className="brawl-special-val">
          {ready ? 'READY' : `${data.specialCd.toFixed(1)}s`}
        </span>
      </div>
    </div>
  );
}

function ResultOverlay({ status, onRestart, onExit }) {
  const label =
    status === 'win'  ? 'VICTORY' :
    status === 'lose' ? 'DEFEAT'  : 'DRAW';
  const cls =
    status === 'win'  ? 'result-win'  :
    status === 'lose' ? 'result-lose' : 'result-draw';
  return (
    <div className="brawl-overlay" data-testid="result-overlay">
      <div className={`brawl-overlay-card ${cls}`}>
        <div className="brawl-overlay-label" data-testid="result-label">{label}</div>
        <div className="brawl-overlay-actions">
          <button
            className="brawl-btn brawl-btn-primary"
            onClick={onRestart}
            data-testid="restart-button"
          >
            REMATCH
          </button>
          <button
            className="brawl-btn brawl-btn-ghost"
            onClick={onExit}
            data-testid="exit-button"
          >
            CHANGE FIGHTERS
          </button>
        </div>
      </div>
    </div>
  );
}

function ControlsHint() {
  return (
    <div className="brawl-controls" data-testid="controls-hint">
      <span><kbd>A</kbd><kbd>D</kbd> MOVE</span>
      <span><kbd>W</kbd> JUMP</span>
      <span><kbd>S</kbd> BLOCK</span>
      <span><kbd>J</kbd> LIGHT</span>
      <span><kbd>K</kbd> HEAVY</span>
      <span><kbd>L</kbd> SPECIAL</span>
    </div>
  );
}
