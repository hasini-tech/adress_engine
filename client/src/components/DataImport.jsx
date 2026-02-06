import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'react-toastify';
import api from '../api';

const DataImport = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);

  const onDrop = useCallback((acceptedFiles) => {
    // 1. Take the first file uploaded
    const selected = acceptedFiles[0];

    // 2. Manual Validation: Check if filename ends with .json
    // This bypasses strict MIME type checks that fail on some Windows machines
    if (selected && !selected.name.toLowerCase().endsWith('.json')) {
      toast.error('❌ Invalid file. Please upload a .json file.');
      return;
    }

    if (selected) {
      setFile(selected);
      setStats(null);
      toast.info(`📄 File selected: ${selected.name}`);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    // 3. CRITICAL FIX: We removed the 'accept' prop. 
    // This allows the file to be dropped, and we validate the extension manually above.
    multiple: false
  });

  const handleImport = () => {
    if (!file) return;
    setLoading(true);

    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        // 4. Validate Content: Try to parse JSON
        let jsonData;
        try {
          jsonData = JSON.parse(e.target.result);
        } catch (parseError) {
          throw new Error("File content is not valid JSON. Please check syntax.");
        }

        // 5. Validate Structure: Must be an Array
        if (!Array.isArray(jsonData)) {
          throw new Error("JSON format error: Data must be an array of objects [{}, {}]");
        }

        toast.loading("🚀 Uploading and processing records...");

        // Send to backend
        const response = await api.post('/import', { clients: jsonData });
        
        toast.dismiss();
        setStats(response.data.summary);
        toast.success('✅ Import completed successfully!');
      } catch (err) {
        console.error(err);
        toast.dismiss();
        toast.error(err.response?.data?.message || err.message || 'Import failed');
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
      toast.error("Failed to read file");
      setLoading(false);
    };

    reader.readAsText(file);
  };

  return (
    <div className="import-container">
      <h2 className="import-title">Batch Import</h2>
      <p className="import-description">Upload JSON file to process records.</p>

      {/* Upload Area */}
      <div 
        {...getRootProps()} 
        className={`upload-area ${isDragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="upload-icon">📁</div>
        
        {file ? (
          <>
            <p className="upload-text">{file.name}</p>
            <div className="file-info">
              <span className="file-size-badge">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
              <button 
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                className="remove-file"
              >
                Remove
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="upload-text">Drag & drop JSON file</p>
            <p className="upload-subtext">or click to browse</p>
          </>
        )}
      </div>

      {/* Button */}
      <button 
        onClick={handleImport} 
        disabled={!file || loading}
        className="import-button"
      >
        <div className="button-content">
          {loading && <div className="spinner"></div>}
          <span>{loading ? 'Processing...' : 'Start Import'}</span>
        </div>
      </button>

      {/* Stats Results */}
      {stats && (
        <div className="results-container">
          <div className="results-header">
            <div className="results-icon">✓</div>
            <h3 className="results-title">Import Complete</h3>
          </div>
          
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.totalReceived}</div>
              <div className="stat-label">Total</div>
            </div>
            <div className="stat-card success-stat">
              <div className="stat-value" style={{color: '#10b981'}}>{stats.newlyInserted}</div>
              <div className="stat-label">Success</div>
            </div>
            <div className="stat-card time-stat">
              <div className="stat-value" style={{color: '#3b82f6'}}>{stats.speed}</div>
              <div className="stat-label">Speed</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataImport;