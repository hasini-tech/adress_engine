const crypto = require('crypto');

class DataValidator {
  
  /**
   * Validate email format
   */
  static isValidEmail(email) {
    if (!email) return true; // Optional field
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate phone format (flexible)
   */
  static isValidPhone(phone) {
    if (!phone) return true;
    const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
    return /^[\+]?[0-9]{7,15}$/.test(cleaned);
  }

  /**
   * Sanitize string input
   */
  static sanitizeString(str, maxLength = 255) {
    if (!str) return null;
    if (typeof str !== 'string') str = String(str);
    return str.trim().substring(0, maxLength);
  }

  /**
   * Generate unique client ID
   */
  static generateClientId(data) {
    const base = `${data.email || ''}${data.phone || ''}${data.name || ''}${Date.now()}`;
    return `CLI_${crypto.createHash('md5').update(base).digest('hex').substring(0, 16)}`;
  }

  /**
   * Detect and map fields from raw data
   */
  static detectFieldMappings(sampleRecords) {
    const fieldPatterns = {
      client_id: ['client_id', 'clientId', 'id', 'ID', 'customer_id', 'customerId', 'user_id', 'userId'],
      name: ['name', 'full_name', 'fullName', 'customer_name', 'customerName', 'client_name', 'displayName'],
      email: ['email', 'email_address', 'emailAddress', 'e_mail', 'mail'],
      phone: ['phone', 'phone_number', 'phoneNumber', 'telephone', 'tel', 'mobile', 'cell', 'contact'],
      company: ['company', 'company_name', 'companyName', 'organization', 'org', 'business'],
      address: ['address', 'street', 'street_address', 'streetAddress', 'address_line_1', 'address1'],
      city: ['city', 'town', 'locality'],
      state: ['state', 'province', 'region', 'state_province', 'emirates'],
      country: ['country', 'nation', 'country_name', 'countryName', 'uae'],
      postal_code: ['postal_code', 'postalCode', 'zip', 'zipCode', 'zip_code', 'postcode']
    };

    const mappings = {};
    const sampleKeys = new Set();
    
    // Collect all keys from samples
    sampleRecords.forEach(record => {
      Object.keys(record).forEach(key => sampleKeys.add(key));
    });

    // Map fields
    for (const [standardField, patterns] of Object.entries(fieldPatterns)) {
      for (const key of sampleKeys) {
        const lowerKey = key.toLowerCase();
        if (patterns.some(p => lowerKey === p.toLowerCase() || lowerKey.includes(p.toLowerCase()))) {
          mappings[standardField] = key;
          break;
        }
      }
    }

    // Detect additional fields for metadata
    const mappedFields = new Set(Object.values(mappings));
    const additionalFields = [...sampleKeys].filter(k => !mappedFields.has(k));

    return {
      mappings,
      additionalFields,
      detectedFields: [...sampleKeys]
    };
  }

  /**
   * Transform raw record to standard format
   */
  static transformRecord(rawRecord, fieldMappings, importId) {
    const getValue = (field) => {
      const sourceField = fieldMappings[field];
      return sourceField ? rawRecord[sourceField] : null;
    };

    // Build metadata from additional fields
    const metadata = {};
    if (fieldMappings.additionalFields) {
      fieldMappings.additionalFields.forEach(field => {
        if (rawRecord[field] !== undefined && rawRecord[field] !== null) {
          metadata[field] = rawRecord[field];
        }
      });
    }

    const clientId = getValue('client_id') || this.generateClientId(rawRecord);

    return {
      client_id: this.sanitizeString(clientId, 100),
      name: this.sanitizeString(getValue('name') || 'Unknown', 255),
      email: this.sanitizeString(getValue('email'), 255)?.toLowerCase(),
      phone: this.sanitizeString(getValue('phone'), 50),
      company: this.sanitizeString(getValue('company'), 255),
      address: this.sanitizeString(getValue('address'), 65535),
      city: this.sanitizeString(getValue('city'), 100),
      state: this.sanitizeString(getValue('state'), 100),
      country: this.sanitizeString(getValue('country'), 100),
      postal_code: this.sanitizeString(getValue('postal_code') || rawRecord.zipCode || rawRecord.zip, 50),
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
      import_id: importId,
      is_active: true
    };
  }

  /**
   * Validate transformed record
   */
  static validateRecord(record) {
    const errors = [];

    if (!record.client_id) {
      errors.push('Missing client ID');
    }

    if (!record.name || record.name === 'Unknown') {
      errors.push('Missing or invalid name');
    }

    if (record.email && !this.isValidEmail(record.email)) {
      errors.push(`Invalid email format: ${record.email}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = DataValidator;
