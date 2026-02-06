import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../api';

const SearchEngine = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 50;

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await api.get(`/clients/search?q=${query}&page=${page}&limit=${limit}`);
        setResults(response.data.clients || []);
        setTotal(response.data.total || 0);
      } catch (err) {
        toast.error('Search failed');
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [query, page]);

  return (
    <div className="search-container">
      <h2 className="import-title">Record Search</h2>
      <p className="import-description" style={{marginBottom: '1.5rem'}}>
        Live search across {total.toLocaleString()} records.
      </p>

      <input 
        type="text" 
        className="search-input"
        placeholder="Search Name, Email, or Company..." 
        value={query}
        onChange={(e) => { setQuery(e.target.value); setPage(1); }}
      />

      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Company</th>
              <th>City</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" className="text-center p-6">Loading...</td></tr>
            ) : results.length > 0 ? (
              results.map((client) => (
                <tr key={client.client_id || client.id}>
                  <td><span className="badge">{String(client.client_id).substring(0, 8)}</span></td>
                  <td style={{fontWeight: '600'}}>{client.name}</td>
                  <td>{client.email}</td>
                  <td>{client.company}</td>
                  <td>{client.city}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="5" className="text-center p-6">No results found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <span className="file-size">Showing {results.length} results</span>
        <div style={{display: 'flex', gap: '10px'}}>
          <button 
            className="btn-outline" 
            disabled={page === 1} 
            onClick={() => setPage(p => p - 1)}
          >
            Previous
          </button>
          <button 
            className="btn-outline" 
            disabled={page * limit >= total} 
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default SearchEngine;