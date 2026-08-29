import React, { useState } from 'react';
import FighterPreview from './FighterPreview.jsx';
import { addFighter } from '../game/roster.js';
import { PASSIVE_LABELS, PASSIVE_DESCRIPTIONS, SPECIAL_LABELS } from '../game/forge.js';

const EXAMPLE = 'A fast assassin with low health who teleports behind enemies and becomes stronger when nearly defeated.';

const API = process.env.REACT_APP_BACKEND_URL;

export default function ForgeScreen({ onBack, onTestFighter }) {
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('idle');   // idle | loading | ok | error
  const [error, setError] = useState(null);
  const [fighter, setFighter] = useState(null);   // FighterData
  const [balanceAdjusted, setBalanceAdjusted] = useState(false);
  const [savedIds, setSavedIds] = useState(new Set());

  const trimmed = (description || '').trim();
  const canGenerate = status !== 'loading' && trimmed.length > 0 && trimmed.length <= 500;

  const generate = async () => {
    if (!canGenerate) return;
    setStatus('loading');
    setError(null);
    setFighter(null);
    setBalanceAdjusted(false);
    try {
      const res = await fetch(`${API}/api/forge/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success || !body.fighter) {
        throw new Error(body.error || 'The forge is unavailable right now.');
      }
      setFighter(body.fighter);
      setBalanceAdjusted(!!body.balance_adjusted);
      setStatus('ok');
    } catch (e) {
      setError(e.message || 'Fighter generation failed.');
      setStatus('error');
    }
  };

  const handleSave = () => {
    if (!fighter) return;
    addFighter(fighter);
    setSavedIds((prev) => {
      const next = new Set(prev);
      next.add(fighter.id);
      return next;
    });
  };

  const handleTest = () => {
    if (!fighter) return;
    // Auto-save on test if not already
    if (!savedIds.has(fighter.id)) addFighter(fighter);
    onTestFighter(fighter);
  };

  return (
    <div className="brawl-forge" data-testid="forge-screen">
      <button
        className="brawl-icon-btn brawl-corner-back"
        onClick={onBack}
        data-testid="forge-back-btn"
      >
        ← BACK
      </button>

      <header className="brawl-forge-header">
        <h1 className="brawl-forge-title" data-testid="forge-title">
          FIGHTER <span className="brawl-forge-title-accent">FORGE</span>
        </h1>
        <p className="brawl-forge-subtitle">
          Describe a fighter. The AI forges stats, passive, special, and look.
        </p>
      </header>

      <div className="brawl-forge-body">
        <div className="brawl-forge-input-col">
          <label className="brawl-forge-label" htmlFor="forge-input">
            DESCRIBE YOUR FIGHTER
          </label>
          <textarea
            id="forge-input"
            className="brawl-forge-textarea"
            placeholder={EXAMPLE}
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 500))}
            maxLength={500}
            rows={5}
            data-testid="forge-input"
            disabled={status === 'loading'}
          />
          <div className="brawl-forge-counter" data-testid="forge-counter">
            {trimmed.length} / 500
          </div>

          <div className="brawl-forge-actions">
            <button
              className="brawl-btn brawl-btn-primary brawl-forge-generate-btn"
              onClick={generate}
              disabled={!canGenerate}
              data-testid="forge-generate-btn"
            >
              {status === 'loading' ? 'FORGING…' : 'GENERATE FIGHTER'}
            </button>
          </div>

          {status === 'loading' && (
            <div className="brawl-forge-loading" data-testid="forge-loading">
              <div className="brawl-forge-loading-orbs">
                <span/><span/><span/>
              </div>
              <div className="brawl-forge-loading-text">
                Molding neon into flesh… synthesizing stats… choosing a special…
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="brawl-forge-error" data-testid="forge-error">
              <div className="brawl-forge-error-title">FORGE FAILURE</div>
              <div className="brawl-forge-error-msg">{error}</div>
              <button
                className="brawl-btn brawl-btn-ghost"
                onClick={generate}
                data-testid="forge-retry-btn"
              >
                RETRY
              </button>
            </div>
          )}
        </div>

        <div className="brawl-forge-result-col">
          {status === 'ok' && fighter && (
            <ResultCard
              fighter={fighter}
              balanceAdjusted={balanceAdjusted}
              saved={savedIds.has(fighter.id)}
              onSave={handleSave}
              onTest={handleTest}
            />
          )}
          {status !== 'ok' && (
            <div className="brawl-forge-result-empty" data-testid="forge-result-empty">
              <FighterPreview
                fighterData={{
                  visual: { silhouette: 'medium', motif: 'orbs', primaryColor: '#3ee8ff', secondaryColor: '#b56bff' },
                  name: '???',
                }}
                size={140}
              />
              <div className="brawl-forge-hint">
                Your fighter will appear here after generation.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultCard({ fighter, balanceAdjusted, saved, onSave, onTest }) {
  const p = fighter.passive;
  const s = fighter.special;
  const passiveLabel = PASSIVE_LABELS[p.type] || p.type;
  const passiveDesc  = (PASSIVE_DESCRIPTIONS[p.type] || (() => ''))(p.value);
  const specialLabel = SPECIAL_LABELS[s.type] || s.type;
  return (
    <div className="brawl-forge-card" data-testid="forge-result-card">
      <div className="brawl-forge-card-head">
        <FighterPreview fighterData={fighter} size={140} />
        <div className="brawl-forge-card-heading">
          <div className="brawl-forge-card-name" data-testid="forge-card-name">{fighter.name}</div>
          {balanceAdjusted && (
            <div className="brawl-forge-card-balanced" data-testid="forge-card-balanced" title="Stats were scaled to keep the fighter within the fair-play budget">
              ⚖ BALANCED
            </div>
          )}
          <div className="brawl-forge-card-desc" data-testid="forge-card-desc">{fighter.description}</div>
        </div>
      </div>

      <div className="brawl-forge-card-stats" data-testid="forge-card-stats">
        <StatBar label="HP"      value={fighter.stats.hp}      lo={60} hi={160} />
        <StatBar label="SPEED"   value={fighter.stats.speed}   lo={40} hi={100} />
        <StatBar label="POWER"   value={fighter.stats.power}   lo={40} hi={100} />
        <StatBar label="DEFENSE" value={fighter.stats.defense} lo={40} hi={100} />
      </div>

      <div className="brawl-forge-card-abilities">
        <div className="brawl-forge-ability" data-testid="forge-card-passive">
          <div className="brawl-forge-ability-tag">PASSIVE</div>
          <div className="brawl-forge-ability-name">{passiveLabel}</div>
          <div className="brawl-forge-ability-desc">{passiveDesc}</div>
        </div>
        <div className="brawl-forge-ability" data-testid="forge-card-special">
          <div className="brawl-forge-ability-tag">SPECIAL</div>
          <div className="brawl-forge-ability-name">{specialLabel}</div>
          <div className="brawl-forge-ability-desc">
            {s.damage} damage · {s.cooldown}s cooldown
          </div>
        </div>
      </div>

      <div className="brawl-forge-card-actions">
        <button
          className="brawl-btn brawl-btn-primary"
          onClick={onTest}
          data-testid="forge-test-btn"
        >
          TEST FIGHTER
        </button>
        <button
          className="brawl-btn brawl-btn-ghost"
          onClick={onSave}
          disabled={saved}
          data-testid="forge-save-btn"
        >
          {saved ? '✓ SAVED' : 'SAVE'}
        </button>
      </div>
    </div>
  );
}

function StatBar({ label, value, lo, hi }) {
  const pct = Math.max(0, Math.min(100, Math.round(((value - lo) / (hi - lo)) * 100)));
  return (
    <div className="brawl-forge-stat">
      <span className="brawl-forge-stat-label">{label}</span>
      <div className="brawl-forge-stat-track">
        <div className="brawl-forge-stat-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="brawl-forge-stat-val">{value}</span>
    </div>
  );
}
