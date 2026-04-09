import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'react-toastify';

// Hard-coded upload URL so large uploads bypass the shared axios timeout.
const UPLOAD_URL = 'http://localhost:5000/api/import/file';

const DataImport = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState(null);
  const [xhrRef] = useState({ current: null });

  const onDrop = useCallback((acceptedFiles) => {
    const selected = acceptedFiles[0];
    if (!selected) return;

    if (!selected.name.toLowerCase().endsWith('.json')) {
      toast.error('Invalid file. Please upload a .json file.');
      return;
    }

    setFile(selected);
    setStats(null);
    setProgress(0);
    toast.info(`${selected.name} (${(selected.size / 1024 / 1024).toFixed(1)} MB)`);
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
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      setLoading(false);
      toast.dismiss('import');

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          setStats(data.summary);
          setProgress(0);
          toast.success('Import completed successfully.');
        } catch {
          toast.error('Server returned invalid JSON.');
        }
      } else {
        try {
          const errorResponse = JSON.parse(xhr.responseText);
          toast.error(errorResponse.message || `Server error ${xhr.status}`);
        } catch {
          toast.error(`Request failed with status ${xhr.status}`);
        }
        setProgress(0);
      }
    };

    xhr.onerror = () => {
      setLoading(false);
      setProgress(0);
      toast.dismiss('import');
      toast.error('Network error. Check that the backend is running on port 5000.');
    };

    xhr.open('POST', UPLOAD_URL);
    xhr.timeout = 0;
    xhr.send(formData);

    toast.loading('Uploading... do not close this tab.', { toastId: 'import' });
  };

  const handleCancel = () => {
    xhrRef.current?.abort();
    setLoading(false);
    setProgress(0);
    toast.info('Upload cancelled.');
  };

  return (
    <div className="import-container">
      <h2 className="import-title">Batch Import</h2>
      <p className="import-description">Upload a JSON file to process imported records.</p>

      <div
        {...getRootProps()}
        className={`upload-area ${isDragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="upload-icon">JS</div>

        {file ? (
          <>
            <p className="upload-text">{file.name}</p>
            <div
              className="file-info"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                marginTop: '1rem',
                padding: '0.9rem 1rem',
                borderRadius: 10,
                background: '#e2e8f0'
              }}
            >
              <span
                className="file-size-badge"
                style={{
                  display: 'inline-flex',
                  padding: '0.3rem 0.7rem',
                  borderRadius: 999,
                  background: '#ffffff',
                  color: '#475569',
                  fontSize: '0.875rem',
                  fontWeight: 600
                }}
              >
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </span>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setFile(null);
                  setStats(null);
                  setProgress(0);
                }}
                className="remove-file"
                style={{
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.55rem 0.9rem',
                  background: '#fee2e2',
                  color: '#b91c1c',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Remove
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="upload-text">Drag and drop a JSON file</p>
            <p className="upload-subtext" style={{ marginBottom: 0 }}>
              or click to browse. Any file size is allowed.
            </p>
          </>
        )}
      </div>

      {loading && (
        <div
          className="progress-container"
          style={{
            marginBottom: '1rem',
            padding: '1rem',
            borderRadius: 12,
            background: '#eff6ff',
            border: '1px solid #bfdbfe'
          }}
        >
          <div
            className="progress-bar-track"
            style={{
              width: '100%',
              height: 12,
              borderRadius: 999,
              background: '#dbeafe',
              overflow: 'hidden'
            }}
          >
            <div
              className="progress-bar-fill"
              style={{
                width: `${progress}%`,
                transition: 'width 0.3s ease',
                height: '100%',
                background: 'linear-gradient(to right, #2563eb, #4f46e5)'
              }}
            />
          </div>
          <p className="progress-label" style={{ marginTop: '0.75rem', marginBottom: 0, fontWeight: 600 }}>
            {progress < 100
              ? `Uploading... ${progress}%`
              : 'Processing imported records on the server...'}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleImport}
          disabled={!file || loading}
          className="import-button"
          style={{ flex: 1 }}
        >
          <div className="button-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
              padding: '0 20px',
              borderRadius: 8,
              border: 'none',
              background: '#fee2e2',
              color: '#dc2626',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        )}
      </div>

      {stats && (
        <div
          className="results-container"
          style={{
            marginTop: '1.5rem',
            padding: '1.5rem',
            borderRadius: 16,
            background: '#f8fafc',
            border: '1px solid #cbd5e1'
          }}
        >
          <div
            className="results-header"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}
          >
            <div
              className="results-icon"
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#dcfce7',
                color: '#166534',
                fontWeight: 800
              }}
            >
              OK
            </div>
            <h3 className="results-title" style={{ margin: 0, color: '#0f172a' }}>Import Complete</h3>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.totalReceived?.toLocaleString() ?? '-'}</div>
              <div className="stat-label">Total</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#10b981' }}>
                {stats.newlyInserted?.toLocaleString() ?? '-'}
              </div>
              <div className="stat-label">Inserted</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#f59e0b' }}>
                {stats.existingUpdated?.toLocaleString() ?? '-'}
              </div>
              <div className="stat-label">Updated</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#ef4444' }}>
                {stats.failedToProcess?.toLocaleString() ?? '-'}
              </div>
              <div className="stat-label">Failed</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#3b82f6' }}>
                {stats.speed ?? '-'}
              </div>
              <div className="stat-label">Speed</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#8b5cf6' }}>
                {stats.processingTime ?? '-'}
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
