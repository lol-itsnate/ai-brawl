import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine } from '../game/engine.js';
import { ARENA } from '../game/constants.js';
import ControlsOverlay from './ControlsOverlay.jsx';

export default function GameCanvas({ playerCharId, aiCharId, onExit }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const [snap, setSnap] = useState(null);
  const [showControls, setShowControls] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = ARENA.width;
    canvas.height = ARENA.height;

    const engine = new GameEngine({
      canvas, playerCharId, aiCharId,
      onStateChange: setSnap,
    });
    engineRef.current = engine;
    engine.start();
    return () => engine.stop();
  }, [playerCharId, aiCharId]);

  // Pause engine while the controls overlay is open
  useEffect(() => {
    engineRef.current?.setPaused(showControls);
  }, [showControls]);

  // Global Escape closes overlay
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setShowControls(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleRestart = useCallback(() => {
    engineRef.current?.restart();
  }, []);

  return (
    <div className="brawl-stage" data-testid="game-stage">
      <TopHud
        snap={snap}
        onOpenControls={() => setShowControls(true)}
        onExit={onExit}
      />

      <div className="brawl-canvas-wrap">
        <canvas ref={canvasRef} className="brawl-canvas" data-testid="game-canvas" />

        {snap?.phase === 'intro' && (
          <IntroOverlay introT={snap.introT} />
        )}

        {snap?.phase === 'ko' && (
          <KoBanner cause={snap.koCause} />
        )}

        {snap?.phase === 'ended' && (
          <ResultOverlay snap={snap} onRestart={handleRestart} onExit={onExit} />
        )}
      </div>

      <ControlsHint />

      {showControls && (
        <ControlsOverlay onClose={() => setShowControls(false)} />
      )}
    </div>
  );
}

function TopHud({ snap, onOpenControls, onExit }) {
  if (!snap) return null;
  const { player, ai, time } = snap;
  return (
    <div className="brawl-hud" data-testid="hud">
      <FighterBar side="left" data={player} testid="player-hud" />
      <div className="brawl-timer-col">
        <div
          className={`brawl-timer ${time <= 10 ? 'urgent' : ''}`}
          data-testid="round-timer"
        >
          {Math.ceil(time).toString().padStart(2, '0')}
        </div>
        <div className="brawl-topbar-actions">
          <button
            className="brawl-icon-btn"
            onClick={onOpenControls}
            data-testid="topbar-controls"
          >
            CONTROLS
          </button>
          <button
            className="brawl-icon-btn"
            onClick={onExit}
            data-testid="topbar-exit"
          >
            EXIT
          </button>
        </div>
      </div>
      <FighterBar side="right" data={ai} testid="ai-hud" />
    </div>
  );
}

function FighterBar({ side, data, testid }) {
  const pct = Math.max(0, (data.hp / data.maxHp) * 100);
  const cdPct = data.specialMax > 0 ? (1 - data.specialCd / data.specialMax) * 100 : 100;
  const ready = data.specialCd <= 0;
  const lowHp = pct < 25 && pct > 0;
  const prevReady = useRef(true);
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (prevReady.current && !ready) {
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 700);
      prevReady.current = ready;
      return () => clearTimeout(t);
    }
    prevReady.current = ready;
  }, [ready]);
  const showShield = data.shieldHp > 0;
  const showBoost  = data.dmgBoostT > 0;
  const showStun   = data.stunT > 0;
  return (
    <div className={`brawl-fighter-hud ${side} ${lowHp ? 'low-hp' : ''}`} data-testid={testid}>
      <div className="brawl-fighter-name" data-testid={`${testid}-name`}>
        {data.name}
        {(showShield || showBoost || showStun) && (
          <span className="brawl-buff-badges" data-testid={`${testid}-buffs`}>
            {showShield && (
              <span className="brawl-buff-badge brawl-buff-shield" data-testid={`${testid}-shield`}>
                SHIELD {Math.ceil(data.shieldHp)}
              </span>
            )}
            {showBoost && (
              <span className="brawl-buff-badge brawl-buff-boost" data-testid={`${testid}-boost`}>
                BOOST {data.dmgBoostT.toFixed(1)}s
              </span>
            )}
            {showStun && (
              <span className="brawl-buff-badge brawl-buff-stun" data-testid={`${testid}-stun`}>
                STUNNED
              </span>
            )}
          </span>
        )}
      </div>
      <div className="brawl-hp-track" aria-hidden>
        {/* Delayed ghost bar — CSS transition lags behind the actual HP */}
        <div className="brawl-hp-ghost" style={{ width: `${pct}%` }} data-testid={`${testid}-hp-ghost`} />
        <div className="brawl-hp-fill" style={{ width: `${pct}%` }} data-testid={`${testid}-hp-fill`} />
      </div>
      <div className="brawl-hp-num" data-testid={`${testid}-hp-num`}>
        {Math.max(0, Math.ceil(data.hp))} / {data.maxHp}
      </div>
      <div
        className={`brawl-special ${ready ? 'ready' : ''} ${flashing ? 'just-used' : ''}`}
        data-testid={`${testid}-special`}
      >
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

function KoBanner({ cause }) {
  const label = cause === 'timeup' ? 'TIME UP' : 'K.O.!';
  return (
    <div className="brawl-ko-banner" data-testid="ko-banner">
      <div className="brawl-ko-label" data-testid="ko-banner-label">{label}</div>
    </div>
  );
}

function IntroOverlay({ introT }) {
  // First ~1.0s show READY, remaining ~0.8s show FIGHT!
  const isFight = introT <= 0.9;
  const label = isFight ? 'FIGHT!' : 'READY';
  const cls = isFight ? 'intro-fight' : 'intro-ready';
  // key changes when label changes → CSS keyframes restart cleanly
  return (
    <div className={`brawl-intro ${cls}`} data-testid="intro-overlay" key={label}>
      <div className="brawl-intro-label" data-testid="intro-label">{label}</div>
    </div>
  );
}

function ResultOverlay({ snap, onRestart, onExit }) {
  const { status, player, ai, time } = snap;
  const label = status === 'win'  ? 'VICTORY'
              : status === 'lose' ? 'DEFEAT'
              :                     'DRAW';
  const cls   = status === 'win'  ? 'result-win'
              : status === 'lose' ? 'result-lose'
              :                     'result-draw';
  const winnerName = status === 'win'  ? player.name
                   : status === 'lose' ? ai.name
                   : null;

  return (
    <div className="brawl-overlay" data-testid="result-overlay">
      <div className={`brawl-overlay-card ${cls}`}>
        <div className="brawl-overlay-label" data-testid="result-label">{label}</div>

        {winnerName ? (
          <div className="brawl-winner-name" data-testid="result-winner-name">
            {winnerName} <span className="brawl-winner-wins">WINS</span>
          </div>
        ) : (
          <div className="brawl-winner-name" data-testid="result-winner-name">
            NO WINNER
          </div>
        )}

        <div className="brawl-result-stats" data-testid="result-stats">
          <StatBox label="TIME LEFT" value={`${Math.max(0, Math.ceil(time))}s`} />
          <StatBox label={`${player.name} HP`} value={`${Math.max(0, Math.ceil(player.hp))} / ${player.maxHp}`} />
          <StatBox label={`${ai.name} HP`}     value={`${Math.max(0, Math.ceil(ai.hp))} / ${ai.maxHp}`} />
        </div>

        <div className="brawl-overlay-actions">
          <button className="brawl-btn brawl-btn-primary" onClick={onRestart} data-testid="restart-button">
            REMATCH
          </button>
          <button className="brawl-btn brawl-btn-ghost" onClick={onExit} data-testid="exit-button">
            CHANGE FIGHTERS
          </button>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }) {
  return (
    <div className="brawl-stat-box">
      <div className="brawl-stat-box-label">{label}</div>
      <div className="brawl-stat-box-value">{value}</div>
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
