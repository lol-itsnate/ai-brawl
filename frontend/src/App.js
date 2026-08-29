import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import SelectScreen from './components/SelectScreen.jsx';
import GameCanvas from './components/GameCanvas.jsx';
import ForgeScreen from './components/ForgeScreen.jsx';
import { loadRoster } from './game/roster.js';
import { deriveEngineCharacter } from './game/forge.js';
import { registerRuntimeCharacter, unregisterRuntimeCharacter, clearRuntimeRoster } from './game/characters.js';

const MIN_WIDTH = 760;

// Sync the runtime character registry with the persisted forge roster.
// Called on mount and after every save/delete so game code can just call getCharacter(id).
function syncRuntimeRoster() {
  const list = loadRoster();
  clearRuntimeRoster();
  const derived = [];
  for (const fd of list) {
    try {
      const ch = deriveEngineCharacter(fd);
      registerRuntimeCharacter(ch);
      derived.push(fd);
    } catch (e) {
      // Corrupt/hand-edited entry — skip silently (defense-in-depth clamp per plan)
      console.warn('[roster] skipping invalid fighter', e);
    }
  }
  return derived;
}

export default function App() {
  const [screen, setScreen] = useState('select');
  const [players, setPlayers] = useState({ player: null, ai: null });
  const [tooSmall, setTooSmall] = useState(
    typeof window !== 'undefined' && window.innerWidth < MIN_WIDTH
  );
  const [rosterVersion, setRosterVersion] = useState(0);

  useEffect(() => {
    syncRuntimeRoster();
  }, []);

  useEffect(() => {
    const check = () => setTooSmall(window.innerWidth < MIN_WIDTH);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const refreshRoster = useCallback(() => {
    syncRuntimeRoster();
    setRosterVersion((v) => v + 1);
  }, []);

  const startFight = (playerId, aiId) => {
    setPlayers({ player: playerId, ai: aiId });
    setScreen('fight');
  };
  const backToSelect = () => setScreen('select');
  const openForge   = () => setScreen('forge');

  // Called from ForgeScreen's TEST button — save + immediately fight vs a random default.
  const testGeneratedFighter = (fighterData) => {
    // roster.addFighter already ran inside ForgeScreen; just resync + jump into fight
    refreshRoster();
    const defaults = ['volt', 'titan', 'wraith'];
    const aiId = defaults[Math.floor(Math.random() * defaults.length)];
    setPlayers({ player: fighterData.id, ai: aiId });
    setScreen('fight');
  };

  const handleDeleteFromSelect = (id) => {
    unregisterRuntimeCharacter(id);
    // Also strip from localStorage
    import('./game/roster.js').then(({ removeFighter }) => {
      removeFighter(id);
      refreshRoster();
    });
  };

  if (tooSmall) return <SmallViewportGate />;

  return (
    <div className="brawl-app" data-testid="app-root">
      {screen === 'select' && (
        <SelectScreen
          onStart={startFight}
          onOpenForge={openForge}
          onDeleteGenerated={handleDeleteFromSelect}
          rosterVersion={rosterVersion}
        />
      )}
      {screen === 'forge' && (
        <ForgeScreen
          onBack={() => { refreshRoster(); backToSelect(); }}
          onTestFighter={testGeneratedFighter}
        />
      )}
      {screen === 'fight' && (
        <GameCanvas
          playerCharId={players.player}
          aiCharId={players.ai}
          onExit={backToSelect}
        />
      )}
    </div>
  );
}

function SmallViewportGate() {
  return (
    <div className="brawl-app" data-testid="small-viewport">
      <div className="brawl-smallvp-card">
        <h1 className="brawl-title">
          <span className="brawl-title-accent">AI</span> BRAWL
        </h1>
        <p className="brawl-smallvp-msg" data-testid="small-viewport-msg">
          Best played on desktop with a keyboard.
        </p>
        <p className="brawl-smallvp-sub">
          AI BRAWL is a real-time keyboard fighting game. Please open this on a screen at least 760px wide.
          Touch controls aren't supported yet.
        </p>
      </div>
    </div>
  );
}
