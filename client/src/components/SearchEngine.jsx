import React, { useEffect, useState } from 'react';
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
      } catch (error) {
        toast.error('Search failed');
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [query, page]);

  const getDisplayId = (client) => {
    let id = client.client_id || client._id || client.id || '';
    if (typeof id === 'object' && id !== null) {
      id = id.$oid || Object.values(id)[0] || id.toString();
    }
    return String(id).substring(0, 8);
  };

  const cellStyle = {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    verticalAlign: 'top'
  };

  const displayValue = (value) => {
    if (value === undefined || value === null) return '-';
    const text = String(value).trim();
    return text || '-';
  };

  return (
    <div className="search-container">
      <h2 className="import-title">Record Search</h2>
      <p className="import-description" style={{ marginBottom: '1.5rem' }}>
        Live search across {total.toLocaleString()} records.
      </p>

      <input
        type="text"
        className="search-input"
        placeholder="Search ID, Name, Address, Email, Phone, City, State, or Company..."
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setPage(1);
        }}
      />

      <div className="table-responsive" style={{ maxHeight: '500px', overflowY: 'auto', overflowX: 'auto' }}>
        <table className="data-table" style={{ width: '100%', minWidth: '1280px', tableLayout: 'fixed' }}>
          <thead
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              backgroundColor: '#f8fafc',
              boxShadow: '0 2px 2px -1px rgba(0,0,0,0.1)'
            }}
          >
            <tr>
              <th style={{ width: '8%' }}>ID</th>
              <th style={{ width: '14%' }}>Name</th>
              <th style={{ width: '22%' }}>Address</th>
              <th style={{ width: '18%' }}>Email</th>
              <th style={{ width: '10%' }}>Phone</th>
              <th style={{ width: '10%' }}>City</th>
              <th style={{ width: '8%' }}>State</th>
              <th style={{ width: '10%' }}>Company</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" className="text-center p-6">Loading...</td>
              </tr>
            ) : results.length > 0 ? (
              results.map((client, index) => {
                return (
                  <tr key={client.client_id || client.id || index}>
                    <td>
                      <span className="badge">{getDisplayId(client)}</span>
                    </td>
                    <td style={{ fontWeight: 600, ...cellStyle }} title={displayValue(client.name)}>
                      {displayValue(client.name)}
                    </td>
                    <td style={cellStyle} title={displayValue(client.address)}>
                      {displayValue(client.address)}
                    </td>
                    <td style={cellStyle} title={displayValue(client.email)}>
                      {displayValue(client.email)}
                    </td>
                    <td style={cellStyle} title={displayValue(client.phone)}>
                      {displayValue(client.phone)}
                    </td>
                    <td style={cellStyle} title={displayValue(client.city)}>
                      {displayValue(client.city)}
                    </td>
                    <td style={cellStyle} title={displayValue(client.state)}>
                      {displayValue(client.state)}
                    </td>
                    <td style={cellStyle} title={displayValue(client.company)}>
                      {displayValue(client.company)}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="8" className="text-center p-6">No results found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <span className="file-size">Showing {results.length} results</span>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn-outline"
            disabled={page === 1}
            onClick={() => setPage((currentPage) => currentPage - 1)}
          >
            Previous
          </button>
          <button
            className="btn-outline"
            disabled={page * limit >= total}
            onClick={() => setPage((currentPage) => currentPage + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default SearchEngine;













































