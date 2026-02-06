const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class ClientService {
  
  async processBulkImport(clients, importId) {
    const BATCH_SIZE = 2000; // Optimal batch size for MySQL
    let inserted = 0;
    let updated = 0; // Note: MySQL returns 2 for update, 1 for insert. Hard to track exactly in bulk, usually tracked as "processed"
    let failed = 0;
    const errors = [];
    
    const startTime = Date.now();

    // 1. Chunk the array to prevent memory overflow
    const chunks = [];
    for (let i = 0; i < clients.length; i += BATCH_SIZE) {
      chunks.push(clients.slice(i, i + BATCH_SIZE));
    }

    console.log(`[${importId}] Split ${clients.length} records into ${chunks.length} batches.`);

    // 2. Process batches sequentially (or Promise.all with concurrency limit)
    for (const [index, batch] of chunks.entries()) {
      try {
        const values = [];
        
        // Prepare data for Raw SQL
        for (const client of batch) {
          // Basic Validation
          if (!client.client_id && !client.id) continue;
          
          values.push([
            client.client_id || client.id,
            client.name || 'Unknown',
            client.email || null,
            client.phone || null,
            client.company || null,
            client.address || null,
            client.city || null,
            client.state || null,
            client.country || null,
            client.postal_code || null,
            new Date(), // created_at
            new Date()  // updated_at
          ]);
        }

        if (values.length === 0) continue;

        // 3. Execute High-Performance Raw SQL Upsert
        // We use Prisma's $executeRawUnsafe because parameterized query arrays 
        // are tricky with dynamic bulk inserts. Ensure inputs are sanitized if public facing.
        
        const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        
        const sql = `
          INSERT INTO clients 
            (client_id, name, email, phone, company, address, city, state, country, postal_code, created_at, updated_at)
          VALUES ${placeholders}
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
            updated_at = VALUES(updated_at)
        `;

        // Flatten array for parameters
        const flatValues = values.flat();

        await prisma.$executeRawUnsafe(sql, ...flatValues);
        
        // Update progress logging
        inserted += values.length; // Approximate for UI feedback
        
        if (index % 5 === 0) {
            console.log(`[${importId}] Processed batch ${index + 1}/${chunks.length}`);
        }

      } catch (err) {
        console.error(`Batch ${index} failed:`, err.message);
        failed += batch.length;
        errors.push(`Batch ${index}: ${err.message}`);
      }
    }

    const duration = Date.now() - startTime;

    // 4. Update Log
    await prisma.importLog.update({
      where: { import_id: importId },
      data: {
        status: failed === 0 ? 'completed' : 'partial_failure',
        completed_at: new Date(),
        duration_ms: duration,
        inserted_records: inserted, // In raw upsert, exact insert vs update count is hard to get without analyzing every row
        failed_records: failed
      }
    });

    return {
      totalReceived: clients.length,
      newlyInserted: inserted,
      existingUpdated: 0, // With raw bulk upsert, we treat all successes as processed
      failedToProcess: failed,
      processingTime: `${(duration / 1000).toFixed(2)}s`,
      speed: `${Math.round(clients.length / (duration / 1000))} records/sec`
    };
  }

  // Optimized Search for the UI
  async searchClients(query, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    // Use Full Text Search if supported, or standard Contains
    const results = await prisma.client.findMany({
      where: {
        OR: [
          { name: { contains: query } },
          { email: { contains: query } },
          { company: { contains: query } },
          { city: { contains: query } }
        ]
      },
      take: limit,
      skip: skip,
      orderBy: { updated_at: 'desc' }
    });
    
    const count = await prisma.client.count({
        where: {
            OR: [
              { name: { contains: query } },
              { email: { contains: query } }
            ]
        }
    });

    return { clients: results, total: count };
  }
}

module.exports = new ClientService();