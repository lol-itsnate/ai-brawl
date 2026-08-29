import React, { useState } from 'react';
import './App.css';
import SelectScreen from './components/SelectScreen.jsx';
import GameCanvas from './components/GameCanvas.jsx';

// Simple screen state: 'select' → 'fight'. No routing needed for Phase 1.

export default function App() {
  const [screen, setScreen] = useState('select');
  const [players, setPlayers] = useState({ player: 'volt', ai: 'titan' });

  const startFight = (playerId, aiId) => {
    setPlayers({ player: playerId, ai: aiId });
    setScreen('fight');
  };
  const backToSelect = () => setScreen('select');

  return (
    <div className="brawl-app" data-testid="app-root">
      {screen === 'select' && (
        <SelectScreen onStart={startFight} />
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
