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

  // Helper function to safely extract the ID
  const getDisplayId = (client) => {
    let id = client.client_id || client._id || client.id || '';
    if (typeof id === 'object' && id !== null) {
       id = id.$oid || Object.values(id)[0] || id.toString();
    }
    return String(id).substring(0, 8);
  };

  // Reusable style for table cells so they truncate text neatly with "..."
  const cellStyle = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

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

      {/* Added overflowX: 'auto' to allow horizontal scrolling for all the new columns */}
      <div className="table-responsive" style={{ maxHeight: '500px', overflowY: 'auto', overflowX: 'auto' }}>
        {/* Set minWidth to 1200px so the columns aren't completely squished together */}
        <table className="data-table" style={{ width: '100%', minWidth: '1200px', tableLayout: 'fixed' }}>
          
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#f8fafc', boxShadow: '0 2px 2px -1px rgba(0,0,0,0.1)' }}>
            <tr>
              {/* Adjusted percentages to add up to 100% with the new columns */}
              <th style={{ width: '8%' }}>ID</th>
              <th style={{ width: '12%' }}>Name</th>
              <th style={{ width: '16%' }}>Email</th>
              <th style={{ width: '10%' }}>Phone</th>
              <th style={{ width: '12%' }}>Company</th>
              <th style={{ width: '16%' }}>Address</th>
              <th style={{ width: '10%' }}>City</th>
              <th style={{ width: '8%' }}>State</th>
              <th style={{ width: '8%' }}>Country</th>
            </tr>
          </thead>
          
          <tbody>
            {loading ? (
              /* Updated colSpan from 5 to 9 */
              <tr><td colSpan="9" className="text-center p-6">Loading...</td></tr>
            ) : results.length > 0 ? (
              results.map((client, index) => (
                <tr key={client.client_id || client.id || index}>
                  <td>
                    <span className="badge">{getDisplayId(client)}</span>
                  </td>
                  <td style={{ fontWeight: '600', ...cellStyle }} title={client.name}>
                    {client.name}
                  </td>
                  <td style={cellStyle} title={client.email}>
                    {client.email}
                  </td>
                  <td style={cellStyle} title={client.phone}>
                    {client.phone}
                  </td>
                  <td style={cellStyle} title={client.company}>
                    {client.company}
                  </td>
                  <td style={cellStyle} title={client.address}>
                    {client.address}
                  </td>
                  <td style={cellStyle} title={client.city}>
                    {client.city}
                  </td>
                  <td style={cellStyle} title={client.state}>
                    {client.state}
                  </td>
                  <td style={cellStyle} title={client.country}>
                    {client.country}
                  </td>
                </tr>
              ))
            ) : (
              /* Updated colSpan from 5 to 9 */
              <tr><td colSpan="9" className="text-center p-6">No results found</td></tr>
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