import React, { useState, useEffect } from 'react';
import './App.css';
import SelectScreen from './components/SelectScreen.jsx';
import GameCanvas from './components/GameCanvas.jsx';

const MIN_WIDTH = 760;

export default function App() {
  const [screen, setScreen] = useState('select');
  const [players, setPlayers] = useState({ player: null, ai: null });
  const [tooSmall, setTooSmall] = useState(
    typeof window !== 'undefined' && window.innerWidth < MIN_WIDTH
  );

  useEffect(() => {
    const check = () => setTooSmall(window.innerWidth < MIN_WIDTH);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const startFight = (playerId, aiId) => {
    setPlayers({ player: playerId, ai: aiId });
    setScreen('fight');
  };
  const backToSelect = () => setScreen('select');

  if (tooSmall) return <SmallViewportGate />;

  return (
    <div className="brawl-app" data-testid="app-root">
      {screen === 'select' && (<SelectScreen onStart={startFight} />)}
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
