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

  const normalizeField = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'object') return null;

    const text = String(value).trim();
    if (!text || text === '-') return null;
    return text;
  };

  const getNestedValue = (source, path) => {
    if (!source || !path) return null;

    return path.split('.').reduce((current, key) => {
      if (!current || typeof current !== 'object') return null;
      return current[key];
    }, source);
  };

  const firstMeaningful = (...values) => {
    for (const value of values) {
      const normalized = normalizeField(value);
      if (normalized) return normalized;
    }

    return null;
  };

  const getMetadata = (client) => (
    client?.metadata && typeof client.metadata === 'object' ? client.metadata : {}
  );

  const normalizeClient = (client) => {
    const metadata = getMetadata(client);
    const billingAddress1 = getNestedValue(client, 'billingAddress.address1');
    const billingAddress2 = getNestedValue(client, 'billingAddress.address2');
    const shippingAddress1 = getNestedValue(client, 'shippingAddress.address1');
    const shippingAddress2 = getNestedValue(client, 'shippingAddress.address2');
    const firstName = firstMeaningful(
      client.first_name,
      client.firstName,
      client.firstname,
      metadata.first_name,
      metadata.firstName
    );
    const lastName = firstMeaningful(
      client.last_name,
      client.lastName,
      client.lastname,
      metadata.last_name,
      metadata.lastName
    );
    const splitName = [firstName, lastName].filter(Boolean).join(' ').trim();

    const addressParts = [
      firstMeaningful(client.address1, metadata.address1, billingAddress1, shippingAddress1),
      firstMeaningful(client.address2, metadata.address2, billingAddress2, shippingAddress2)
    ].filter(Boolean);

    return {
      ...client,
      name: firstMeaningful(
        client.name,
        metadata.name,
        metadata.customerName,
        client.full_name,
        client.fullName,
        client.customer_name,
        client.customerName,
        client.client_name,
        client.displayName,
        client.contact_name,
        metadata.contactName,
        metadata.contact_name,
        splitName
      ) || client.name,
      address: firstMeaningful(
        client.address,
        metadata.address,
        addressParts.join(', '),
        billingAddress1 && billingAddress2 ? `${billingAddress1}, ${billingAddress2}` : billingAddress1,
        shippingAddress1 && shippingAddress2 ? `${shippingAddress1}, ${shippingAddress2}` : shippingAddress1
      ) || client.address,
      email: firstMeaningful(
        client.email,
        metadata.email,
        client.email_address,
        client.emailAddress,
        client.mail
      ) || client.email,
      phone: firstMeaningful(
        client.phone,
        metadata.phone,
        client.phone_number,
        client.phoneNumber,
        client.telephone,
        client.mobile,
        client.cell,
        client.contact
      ) || client.phone,
      city: firstMeaningful(
        client.city,
        metadata.city,
        client.town,
        client.locality,
        getNestedValue(client, 'billingAddress.city'),
        getNestedValue(client, 'shippingAddress.city')
      ) || client.city,
      state: firstMeaningful(
        client.state,
        metadata.state,
        client.province,
        client.region,
        getNestedValue(client, 'billingAddress.state'),
        getNestedValue(client, 'shippingAddress.state')
      ) || client.state,
      company: firstMeaningful(
        client.company,
        metadata.company,
        client.organization,
        client.org,
        client.business
      ) || client.company
    };
  };

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
    overflow: 'visible',
    textOverflow: 'clip',
    whiteSpace: 'normal',
    verticalAlign: 'top',
    wordBreak: 'break-word',
    lineHeight: 1.4
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
        <table className="data-table" style={{ width: '100%', minWidth: '1500px', tableLayout: 'fixed' }}>
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
              <th style={{ width: '7%' }}>ID</th>
              <th style={{ width: '12%' }}>Name</th>
              <th style={{ width: '20%' }}>Address</th>
              <th style={{ width: '15%' }}>Email</th>
              <th style={{ width: '10%' }}>Phone</th>
              <th style={{ width: '9%' }}>City</th>
              <th style={{ width: '7%' }}>State</th>
              <th style={{ width: '10%' }}>Company</th>
              <th style={{ width: '5%' }}>Score</th>
              <th style={{ width: '5%' }}>Band</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="10" className="text-center p-6">Loading...</td>
              </tr>
            ) : results.length > 0 ? (
              results.map((client, index) => {
                const displayClient = normalizeClient(client);
                return (
                  <tr key={client.client_id || client.id || index}>
                    <td>
                      <span className="badge">{getDisplayId(client)}</span>
                    </td>
                    <td style={{ fontWeight: 600, ...cellStyle }} title={displayValue(displayClient.name)}>
                      {displayValue(displayClient.name)}
                    </td>
                    <td style={cellStyle} title={displayValue(displayClient.address)}>
                      {displayValue(displayClient.address)}
                    </td>
                    <td style={cellStyle} title={displayValue(displayClient.email)}>
                      {displayValue(displayClient.email)}
                    </td>
                    <td style={cellStyle} title={displayValue(displayClient.phone)}>
                      {displayValue(displayClient.phone)}
                    </td>
                    <td style={cellStyle} title={displayValue(displayClient.city)}>
                      {displayValue(displayClient.city)}
                    </td>
                    <td style={cellStyle} title={displayValue(displayClient.state)}>
                      {displayValue(displayClient.state)}
                    </td>
                    <td style={cellStyle} title={displayValue(displayClient.company)}>
                      {displayValue(displayClient.company)}
                    </td>
                    <td style={{ ...cellStyle, fontWeight: 700 }} title={displayValue(client.qualityScore)}>
                      {displayValue(client.qualityScore)}
                    </td>
                    <td style={{ ...cellStyle, textTransform: 'capitalize' }} title={displayValue(client.qualityBand)}>
                      {displayValue(client.qualityBand)}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="10" className="text-center p-6">No results found</td>
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










































