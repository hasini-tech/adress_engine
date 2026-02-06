import React, { useState, useEffect } from 'react';
import DataImport from './components/DataImport';
import SearchEngine from './components/SearchEngine';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import api from './api';
import './App.css'; // Import your custom CSS

function App() {
  const [activeTab, setActiveTab] = useState('import');
  const [serverStatus, setServerStatus] = useState(false);

  useEffect(() => {
    api.get('/').then(() => setServerStatus(true)).catch(() => setServerStatus(false));
  }, []);

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
          <button 
            className={`nav-tab ${activeTab === 'import' ? 'active' : ''}`}
            onClick={() => setActiveTab('import')}
          >
            📥 Import Data
          </button>
          <button 
            className={`nav-tab ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
          >
            🔍 Database Search
          </button>
        </div>

        {/* View Content */}
        {activeTab === 'import' ? <DataImport /> : <SearchEngine />}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-content">
          <p className="footer-text">© {new Date().getFullYear()} Address Engine. Built for Scale.</p>
        </div>
      </footer>

      <ToastContainer position="top-right" autoClose={3000} theme="light" />
    </div>
  );
}

export default App;