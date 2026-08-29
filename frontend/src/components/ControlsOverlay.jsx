import React, { useEffect } from 'react';

// Shared Controls overlay — used on both select screen and mid-fight.
// Mid-fight, GameCanvas pauses the engine while this is open.

export default function ControlsOverlay({ onClose }) {
  // Close on Escape (parent also listens; harmless double-safety)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="brawl-controls-overlay"
      data-testid="controls-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="brawl-controls-card" role="dialog" aria-modal="true">
        <div className="brawl-controls-header">
          <div className="brawl-controls-title">CONTROLS</div>
          <button
            className="brawl-controls-close"
            onClick={onClose}
            data-testid="controls-overlay-close"
            aria-label="Close controls"
          >
            ×
          </button>
        </div>

        <div className="brawl-controls-grid">
          <Row keys={['A', 'D']} label="MOVE LEFT / RIGHT" />
          <Row keys={['W']}       label="JUMP" />
          <Row keys={['S']}       label="BLOCK · hold, ground only" />
          <Row keys={['J']}       label="LIGHT ATTACK · fast, low damage" />
          <Row keys={['K']}       label="HEAVY ATTACK · slow, high damage" />
          <Row keys={['L']}       label="SPECIAL · unique per fighter" />
        </div>

        <div className="brawl-controls-note">
          Attacks are ground-only. Blocking reduces damage by ~80% but can't be used mid-air.
          Fighters face each other automatically.
        </div>

        <div className="brawl-controls-footer">
          <button
            className="brawl-btn brawl-btn-primary"
            onClick={onClose}
            data-testid="controls-overlay-resume"
          >
            RESUME
          </button>
          <div className="brawl-controls-esc">
            Press <kbd>ESC</kbd> to close
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ keys, label }) {
  return (
    <div className="brawl-controls-row">
      <div className="brawl-controls-keys">
        {keys.map((k) => <kbd key={k}>{k}</kbd>)}
      </div>
      <div className="brawl-controls-label">{label}</div>
    </div>
  );
}
