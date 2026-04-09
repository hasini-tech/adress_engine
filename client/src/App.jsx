import React, { useState, useEffect } from 'react';
import DataImport from './components/DataImport';
import SearchEngine from './components/SearchEngine';

// ✅ FIXED: Using lowercase 'm' in the file path to match what Windows sees on disk
import WebhookManager from './components/Webhookmanager'; 

import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import api from './api';
import './App.css';

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  const [activeTab, setActiveTab]       = useState('import');
  const [serverStatus, setServerStatus] = useState(false);

  useEffect(() => {
    api.get('/').then(() => setServerStatus(true)).catch(() => setServerStatus(false));
  }, []);

  const tabs = [
    { id: 'import',   label: '📥 Import Data' },
    { id: 'search',   label: '🔍 Database Search' },
    { id: 'webhooks', label: '🔗 Webhooks' },
  ];

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div>
            <h1 className="app-title">Address Engine</h1>
            <p className="app-subtitle">High-Performance Batch Processing System</p>
          </div>
          <div className="status-indicator">
            <div className={`status-dot ${serverStatus ? 'connected' : ''}`}></div>
            <span className="status-text">{serverStatus ? 'System Online' : 'Connecting...'}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
        {/* Tab Navigation */}
        <div className="nav-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* View Content */}
        {activeTab === 'import'   && <DataImport />}
        {activeTab === 'search'   && <SearchEngine />}
        {activeTab === 'webhooks' && <WebhookManager />}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-content">
          <p className="footer-text">© {new Date().getFullYear()} Address Engine. Built for Scale.</p>
        </div>
      </footer>

      {/* Using React Toastify for notifications globally */}
      <ToastContainer position="top-right" autoClose={3000} theme="light" />
    </div>
  );
}

export default App;