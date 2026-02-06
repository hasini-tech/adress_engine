const { v4: uuidv4 } = require('uuid');
const prisma = require('../lib/prisma');
const clientService = require('../services/clientService');
const FileProcessor = require('../services/fileProcessor');

class ImportController {
  
  /**
   * Upload and import JSON file
   */
  async importFile(req, res) {
    const importId = `IMP_${uuidv4().split('-')[0]}_${Date.now()}`;
    let filePath = null;

    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded. Please upload a JSON file.'
        });
      }

      filePath = req.file.path;
      console.log(`[${importId}] Starting import of file: ${req.file.originalname}`);

      // Analyze file first
      console.log(`[${importId}] Analyzing file structure...`);
      const analysis = await FileProcessor.analyzeFile(filePath);
      
      console.log(`[${importId}] File analysis complete:`);
      console.log(`  - Total records: ${analysis.totalRecords}`);
      console.log(`  - Detected fields: ${analysis.fieldMappings.detectedFields.join(', ')}`);
      console.log(`  - Field mappings:`, analysis.fieldMappings.mappings);

      // Create import log
      await prisma.importLog.create({
        data: {
          import_id: importId,
          file_name: req.file.originalname,
          file_size: BigInt(analysis.fileSize),
          total_records: analysis.totalRecords,
          status: 'processing',
          detected_schema: analysis.fieldMappings.detectedFields,
          field_mappings: analysis.fieldMappings.mappings
        }
      });

      // Process the import
      console.log(`[${importId}] Starting bulk import...`);
      const result = await clientService.processBulkImport(
        filePath, 
        importId, 
        analysis.fieldMappings
      );

      // Cleanup file
      await FileProcessor.cleanupFile(filePath);

      console.log(`[${importId}] Import completed successfully`);
      
      res.json({
        success: true,
        importId,
        message: 'Import completed successfully',
        summary: {
          ...result,
          fileName: req.file.originalname,
          detectedSchema: analysis.fieldMappings
        }
      });

    } catch (error) {
      console.error(`[${importId}] Import failed:`, error);

      // Update import log with error
      try {
        await prisma.importLog.update({
          where: { import_id: importId },
          data: {
            status: 'failed',
            error_message: error.message,
            completed_at: new Date()
          }
        });
      } catch (e) {
        console.error('Failed to update import log:', e.message);
      }

      // Cleanup file on error
      if (filePath) {
        await FileProcessor.cleanupFile(filePath);
      }

      res.status(500).json({
        success: false,
        importId,
        message: error.message || 'Import failed'
      });
    }
  }

  /**
   * Import from JSON body (for smaller datasets)
   */
  async importJson(req, res) {
    const importId = `IMP_${uuidv4().split('-')[0]}_${Date.now()}`;

    try {
      const { clients, data, records } = req.body;
      const rawData = clients || data || records;

      if (!rawData || !Array.isArray(rawData)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid data format. Expected an array of records.'
        });
      }

      console.log(`[${importId}] Starting JSON body import: ${rawData.length} records`);

      // Detect schema from sample
      const sample = rawData.slice(0, 10);
      const fieldMappings = require('../utils/validators').detectFieldMappings(sample);

      // Create import log
      await prisma.importLog.create({
        data: {
          import_id: importId,
          file_name: 'API_Upload',
          total_records: rawData.length,
          status: 'processing',
          detected_schema: fieldMappings.detectedFields,
          field_mappings: fieldMappings.mappings
        }
      });

      // Process in batches
      const BATCH_SIZE = 2000;
      let inserted = 0;
      let updated = 0;
      let failed = 0;
      const startTime = Date.now();

      for (let i = 0; i < rawData.length; i += BATCH_SIZE) {
        const batch = rawData.slice(i, i + BATCH_SIZE);
        const result = await clientService.processBatch(batch, importId, fieldMappings);
        
        inserted += result.inserted;
        updated += result.updated;
        failed += result.failed;

        // Update progress
        await prisma.importLog.update({
          where: { import_id: importId },
          data: {
            processed: i + batch.length,
            inserted_records: inserted,
            updated_records: updated,
            failed_records: failed
          }
        });
      }

      const duration = Date.now() - startTime;

      // Final update
      await prisma.importLog.update({
        where: { import_id: importId },
        data: {
          status: 'completed',
          completed_at: new Date(),
          duration_ms: duration,
          inserted_records: inserted,
          updated_records: updated,
          failed_records: failed
        }
      });

      res.json({
        success: true,
        importId,
        summary: {
          totalReceived: rawData.length,
          inserted,
          updated,
          failed,
          duration: `${(duration / 1000).toFixed(2)}s`,
          recordsPerSecond: Math.round(rawData.length / (duration / 1000))
        }
      });

    } catch (error) {
      console.error(`[${importId}] Import failed:`, error);

      try {
        await prisma.importLog.update({
          where: { import_id: importId },
          data: {
            status: 'failed',
            error_message: error.message,
            completed_at: new Date()
          }
        });
      } catch (e) {}

      res.status(500).json({
        success: false,
        importId,
        message: error.message
      });
    }
  }

  /**
   * Search clients
   */
  async search(req, res) {
    try {
      const { q, query, page = 1, limit = 50 } = req.query;
      const searchQuery = q || query;

      if (!searchQuery) {
        return res.json({
          clients: [],
          total: 0,
          page: 1,
          limit: 50,
          message: 'Please provide a search query'
        });
      }

      const results = await clientService.searchClients(
        searchQuery,
        parseInt(page),
        parseInt(limit)
      );

      res.json(results);

    } catch (error) {
      console.error('Search error:', error);
      res.status(500).json({
        success: false,
        message: 'Search failed: ' + error.message
      });
    }
  }

  /**
   * Get all clients with pagination
   */
  async getClients(req, res) {
    try {
      const { page = 1, limit = 50, city, country, company, active } = req.query;

      const filters = {};
      if (city) filters.city = city;
      if (country) filters.country = country;
      if (company) filters.company = company;
      if (active !== undefined) filters.isActive = active === 'true';

      const results = await clientService.getAllClients(
        parseInt(page),
        parseInt(limit),
        filters
      );

      res.json(results);

    } catch (error) {
      console.error('Get clients error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get single client
   */
  async getClient(req, res) {
    try {
      const { id } = req.params;
      const client = await clientService.getClientById(id);

      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Client not found'
        });
      }

      res.json({ success: true, client });

    } catch (error) {
      console.error('Get client error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get import history
   */
  async getImportHistory(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [imports, total] = await Promise.all([
        prisma.importLog.findMany({
          skip,
          take: parseInt(limit),
          orderBy: { started_at: 'desc' }
        }),
        prisma.importLog.count()
      ]);

      res.json({
        success: true,
        imports,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      });

    } catch (error) {
      console.error('Get import history error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get import status
   */
  async getImportStatus(req, res) {
    try {
      const { importId } = req.params;

      const importLog = await prisma.importLog.findUnique({
        where: { import_id: importId }
      });

      if (!importLog) {
        return res.status(404).json({
          success: false,
          message: 'Import not found'
        });
      }

      // Get errors for this import
      const errors = await prisma.importError.findMany({
        where: { import_id: importId },
        take: 100,
        orderBy: { created_at: 'desc' }
      });

      res.json({
        success: true,
        import: importLog,
        errors,
        progress: importLog.total_records > 0 
          ? Math.round((importLog.processed / importLog.total_records) * 100)
          : 0
      });

    } catch (error) {
      console.error('Get import status error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get statistics
   */
  async getStats(req, res) {
    try {
      const stats = await clientService.getStats();
      res.json({ success: true, ...stats });
    } catch (error) {
      console.error('Get stats error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new ImportController();