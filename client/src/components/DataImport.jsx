import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'react-toastify';

// ─── Hard-coded upload URL — do NOT go through the axios instance.
//    The shared api.js has a 5-min timeout that kills 1.3 GB uploads.
//    XHR gives us: no timeout + real upload progress + full error detail.
const UPLOAD_URL = 'http://localhost:5000/api/import/file';

const DataImport = () => {
  const [file, setFile]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats]       = useState(null);
  const [xhrRef]                = useState({ current: null });

  const onDrop = useCallback((acceptedFiles) => {
    const selected = acceptedFiles[0];
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith('.json')) {
      toast.error('❌ Invalid file. Please upload a .json file.');
      return;
    }
    setFile(selected);
    setStats(null);
    setProgress(0);
    toast.info(`📄 ${selected.name} (${(selected.size / 1024 / 1024).toFixed(1)} MB)`);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { 'application/json': ['.json'] }
  });

  const handleImport = () => {
    if (!file || loading) return;

    setLoading(true);
    setProgress(0);

    const formData = new FormData();
    formData.append('file', file); // raw File object — NEVER FileReader/readAsText

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    // Real-time upload progress (bytes sent / total bytes)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      setLoading(false);
      toast.dismiss('import');

      // Log exact response so you can see what server returns
      console.log(`[Import] Status: ${xhr.status}`);
      console.log(`[Import] Response: ${xhr.responseText.slice(0, 500)}`);

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          setStats(data.summary);
          setProgress(0);
          toast.success('✅ Import completed successfully!');
        } catch {
          toast.error('❌ Server returned invalid JSON');
        }
      } else {
        // Parse error message from server
        try {
          const err = JSON.parse(xhr.responseText);
          toast.error(`❌ ${err.message || `Server error ${xhr.status}`}`);
        } catch {
          toast.error(`❌ Request failed with status ${xhr.status}`);
        }
        setProgress(0);
      }
    };

    xhr.onerror = () => {
      setLoading(false);
      setProgress(0);
      toast.dismiss('import');
      toast.error('❌ Network error — is the backend running on port 5000?');
      console.error('[Import] Network error. Check that server is running: node server.js');
    };

    // Log the exact URL being called — check this in browser console
    console.log(`[Import] POST → ${UPLOAD_URL}`);
    xhr.open('POST', UPLOAD_URL);
    xhr.timeout = 0; // no timeout — 1.3 GB needs unlimited time
    // DO NOT set Content-Type — browser auto-sets multipart/form-data with boundary
    xhr.send(formData);

    toast.loading('🚀 Uploading... (do not close this tab)', { toastId: 'import' });
  };

  const handleCancel = () => {
    xhrRef.current?.abort();
    setLoading(false);
    setProgress(0);
    toast.info('Upload cancelled');
  };

  return (
    <div className="import-container">
      <h2 className="import-title">Batch Import</h2>
      <p className="import-description">Upload JSON file to process records.</p>

      {/* Drop Zone */}
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
              <span className="file-size-badge">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  setStats(null);
                  setProgress(0);
                }}
                className="remove-file"
              >
                Remove
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="upload-text">Drag & drop JSON file</p>
            <p className="upload-subtext">or click to browse — any file size</p>
          </>
        )}
      </div>

      {/* Progress Bar */}
      {loading && (
        <div className="progress-container">
          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{ width: `${progress}%`, transition: 'width 0.3s ease' }}
            />
          </div>
          <p className="progress-label">
            {progress < 100
              ? `Uploading... ${progress}%`
              : '⚙️ Processing records on server — please wait...'}
          </p>
        </div>
      )}

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleImport}
          disabled={!file || loading}
          className="import-button"
          style={{ flex: 1 }}
        >
          <div className="button-content">
            {loading && <div className="spinner" />}
            <span>
              {loading
                ? progress < 100 ? `Uploading ${progress}%` : 'Processing...'
                : 'Start Import'}
            </span>
          </div>
        </button>

        {loading && (
          <button
            onClick={handleCancel}
            style={{
              padding: '0 20px', borderRadius: 8, border: 'none',
              background: '#fee2e2', color: '#dc2626',
              fontWeight: 600, cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        )}
      </div>

      {/* Results */}
      {stats && (
        <div className="results-container">
          <div className="results-header">
            <div className="results-icon">✓</div>
            <h3 className="results-title">Import Complete</h3>
          </div>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.totalReceived?.toLocaleString() ?? '—'}</div>
              <div className="stat-label">Total</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#10b981' }}>
                {stats.newlyInserted?.toLocaleString() ?? '—'}
              </div>
              <div className="stat-label">Inserted</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#f59e0b' }}>
                {stats.existingUpdated?.toLocaleString() ?? '—'}
              </div>
              <div className="stat-label">Updated</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#ef4444' }}>
                {stats.failedToProcess?.toLocaleString() ?? '—'}
              </div>
              <div className="stat-label">Failed</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#3b82f6' }}>
                {stats.speed ?? '—'}
              </div>
              <div className="stat-label">Speed</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#8b5cf6' }}>
                {stats.processingTime ?? '—'}
              </div>
              <div className="stat-label">Duration</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataImport;