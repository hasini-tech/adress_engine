const pool = require('../config/database');

class Client {
    /**
     * Bulk Upsert - Update if exists, Insert if new
     * @param {Array} clients - Array of client objects
     * @param {Number} batchSize - Batch size for processing
     * @returns {Object} Import statistics
     */
    static async bulkUpsert(clients, batchSize = 1000) {
        if (!Array.isArray(clients) || clients.length === 0) {
            throw new Error('No clients data provided');
        }

        const connection = await pool.getConnection();
        let insertedCount = 0;
        let updatedCount = 0;
        let failedCount = 0;
        const failedRecords = [];

        try {
            await connection.beginTransaction();

            // Prepare the UPSERT query
            const upsertQuery = `
                INSERT INTO clients 
                (client_id, name, email, phone, company, address, city, state, country, postal_code)
                VALUES ?
                ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                email = VALUES(email),
                phone = VALUES(phone),
                company = VALUES(company),
                address = VALUES(address),
                city = VALUES(city),
                state = VALUES(state),
                country = VALUES(country),
                postal_code = VALUES(postal_code),
                updated_at = CURRENT_TIMESTAMP
            `;

            // Process in batches
            for (let i = 0; i < clients.length; i += batchSize) {
                const batch = clients.slice(i, i + batchSize);
                const values = [];
                const validBatch = [];

                for (const client of batch) {
                    try {
                        // Validate and transform client data
                        const transformedClient = this.transformClient(client);
                        
                        // Check if client exists (for statistics)
                        const exists = await this.checkClientExists(connection, transformedClient.client_id);
                        
                        values.push([
                            transformedClient.client_id,
                            transformedClient.name,
                            transformedClient.email,
                            transformedClient.phone,
                            transformedClient.company,
                            transformedClient.address,
                            transformedClient.city,
                            transformedClient.state,
                            transformedClient.country,
                            transformedClient.postal_code
                        ]);
                        
                        validBatch.push({
                            ...transformedClient,
                            isUpdate: exists
                        });
                    } catch (error) {
                        console.warn(`Invalid client data skipped: ${error.message}`);
                        failedCount++;
                        failedRecords.push({
                            data: client,
                            error: error.message
                        });
                    }
                }

                if (values.length > 0) {
                    try {
                        const [result] = await connection.query(upsertQuery, [values]);
                        
                        // Count inserts vs updates
                        for (const client of validBatch) {
                            if (client.isUpdate) {
                                updatedCount++;
                            } else {
                                insertedCount++;
                            }
                        }
                        
                        console.log(`Batch ${Math.floor(i/batchSize) + 1}: Processed ${values.length} records`);
                    } catch (error) {
                        console.error(`Batch ${Math.floor(i/batchSize) + 1} failed:`, error.message);
                        
                        // Fallback to individual upserts
                        for (const client of validBatch) {
                            try {
                                const result = await this.singleUpsert(connection, client);
                                if (result.affectedRows > 0) {
                                    if (result.wasUpdate) {
                                        updatedCount++;
                                    } else {
                                        insertedCount++;
                                    }
                                }
                            } catch (singleError) {
                                failedCount++;
                                failedRecords.push({
                                    data: client,
                                    error: singleError.message
                                });
                            }
                        }
                    }
                }
            }

            await connection.commit();

            return {
                totalReceived: clients.length,
                processed: insertedCount + updatedCount + failedCount,
                inserted: insertedCount,
                updated: updatedCount,
                failed: failedCount,
                failedRecords: failedRecords.slice(0, 10) // Limit returned failed records
            };

        } catch (error) {
            await connection.rollback();
            console.error('Transaction failed:', error);
            throw new Error(`Bulk upsert failed: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * Check if client exists
     */
    static async checkClientExists(connection, clientId) {
        const [rows] = await connection.query(
            'SELECT COUNT(*) as count FROM clients WHERE client_id = ?',
            [clientId]
        );
        return rows[0].count > 0;
    }

    /**
     * Single record upsert
     */
    static async singleUpsert(connection, client) {
        const query = `
            INSERT INTO clients 
            (client_id, name, email, phone, company, address, city, state, country, postal_code)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            email = VALUES(email),
            phone = VALUES(phone),
            company = VALUES(company),
            address = VALUES(address),
            city = VALUES(city),
            state = VALUES(state),
            country = VALUES(country),
            postal_code = VALUES(postal_code),
            updated_at = CURRENT_TIMESTAMP
        `;

        const values = [
            client.client_id,
            client.name,
            client.email,
            client.phone,
            client.company,
            client.address,
            client.city,
            client.state,
            client.country,
            client.postal_code
        ];

        const [result] = await connection.query(query, values);
        
        // Check if it was an update or insert
        return {
            affectedRows: result.affectedRows,
            wasUpdate: result.affectedRows === 2, // MySQL returns 2 for updates, 1 for inserts
            insertId: result.insertId
        };
    }

    /**
     * Transform and validate client data
     */
    static transformClient(client) {
        // Required fields
        if (!client.client_id && !client.id) {
            throw new Error('Client ID is required');
        }

        if (!client.name || typeof client.name !== 'string') {
            throw new Error('Client name is required and must be a string');
        }

        // Generate client_id if not provided but id exists
        const client_id = client.client_id || client.id || 
                         `CLIENT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Email validation
        if (client.email && !/\S+@\S+\.\S+/.test(client.email)) {
            console.warn(`Invalid email format: ${client.email}`);
        }

        return {
            client_id: client_id.substring(0, 100),
            name: client.name.substring(0, 255),
            email: client.email ? client.email.substring(0, 255) : null,
            phone: client.phone ? client.phone.substring(0, 50) : null,
            company: client.company ? client.company.substring(0, 255) : null,
            address: client.address ? client.address.substring(0, 65535) : null,
            city: client.city ? client.city.substring(0, 100) : null,
            state: client.state ? client.state.substring(0, 100) : null,
            country: client.country ? client.country.substring(0, 100) : null,
            postal_code: client.postal_code || client.zipCode || client.postal || null
        };
    }

    /**
     * Get client by ID
     */
    static async getClientById(clientId) {
        const [rows] = await pool.query(
            'SELECT * FROM clients WHERE client_id = ?',
            [clientId]
        );
        return rows[0];
    }

    /**
     * Get all clients with pagination
     */
    static async getAllClients(page = 1, limit = 50) {
        const offset = (page - 1) * limit;
        
        const [rows] = await pool.query(
            'SELECT * FROM clients ORDER BY created_at DESC LIMIT ? OFFSET ?',
            [limit, offset]
        );
        
        const [countRows] = await pool.query('SELECT COUNT(*) as total FROM clients');
        
        return {
            clients: rows,
            total: countRows[0].total,
            page: page,
            limit: limit,
            totalPages: Math.ceil(countRows[0].total / limit)
        };
    }

    /**
     * Update single client
     */
    static async updateClient(clientId, updateData) {
        const validFields = ['name', 'email', 'phone', 'company', 'address', 'city', 'state', 'country', 'postal_code'];
        const updates = [];
        const values = [];

        // Build dynamic update query
        for (const field of validFields) {
            if (updateData[field] !== undefined) {
                updates.push(`${field} = ?`);
                values.push(updateData[field]);
            }
        }

        if (updates.length === 0) {
            throw new Error('No valid fields to update');
        }

        values.push(clientId);
        
        const query = `
            UPDATE clients 
            SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE client_id = ?
        `;

        const [result] = await pool.query(query, values);
        
        if (result.affectedRows === 0) {
            throw new Error('Client not found');
        }

        return result;
    }
}

module.exports = Client;