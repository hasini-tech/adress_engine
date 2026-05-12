import React, { useState } from 'react';
import ApiKeyManager from './ApiKeyManager';
import ApiKeyScoring from './ApiKeyScoring/ApiKeyScoring';

const modes = [
  {
    id: 'address-engine',
    label: 'Address Engine Keys',
    description: 'Create and manage checkout lookup keys for your own integrations.'
  },
  {
    id: 'external-platform',
    label: 'Another Platform API Key',
    description: 'Use a separate UI for external platform API keys and future scoring workflows.'
  }
];

const ApiKeyHub = () => {
  const [activeMode, setActiveMode] = useState('address-engine');
  const currentMode = modes.find((mode) => mode.id === activeMode) || modes[0];

  return (
    <div>
      <div className="keys-mode-nav">
        <div className="keys-mode-copy">
          <div className="keys-mode-title">API Key Workspace</div>
          <p className="keys-mode-description">{currentMode.description}</p>
        </div>

        <div className="keys-mode-buttons" role="tablist" aria-label="API key modes">
          {modes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={activeMode === mode.id}
              className={`keys-mode-button ${activeMode === mode.id ? 'active' : ''}`}
              onClick={() => setActiveMode(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {activeMode === 'address-engine' ? (
        <ApiKeyManager />
      ) : (
        <ApiKeyScoring />
      )}
    </div>
  );
};

export default ApiKeyHub;
