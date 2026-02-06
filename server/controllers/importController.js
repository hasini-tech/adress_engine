// controllers/importController.js
const prisma = require('../lib/prisma');
const clientService = require('../services/clientService');

/**
 * Import clients from JSON body
 */
const importClients = async (req, res) => {
  const importId = `IMP_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  
  try {
    // Get clients array from request body
    const { clients, data, records } = req.body;
    const clientsArray = clients || data || records;

    // Validate
    if (!clientsArray) {
      return res.status(400).json({ 
        success: false,
        message: 'No data provided. Expected: { "clients": [...] }' 
      });
    }

    if (!Array.isArray(clientsArray)) {
      return res.status(400).json({ 
        success: false,
        message: 'Data must be an array of objects' 
      });
    }

    if (clientsArray.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Array is empty' 
      });
    }

    console.log(`\n📦 [${importId}] Starting import: ${clientsArray.length} records`);

    // Create import log
    await prisma.importLog.create({
      data: {
        import_id: importId,
        file_name: 'API_Upload',
        total_records: clientsArray.length,
        status: 'processing',
        started_at: new Date()
      }
    });

    // Process import
    const summary = await clientService.processBulkImport(clientsArray, importId);

    res.json({
      success: true,
      importId,
      message: 'Import completed',
      summary
    });

  } catch (error) {
    console.error(`❌ [${importId}] Error:`, error.message);

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
};

/**
 * Search clients
 */
const search = async (req, res) => {
  try {
    const { q, query, page = 1, limit = 50 } = req.query;
    const searchQuery = q || query || '';

    const results = await clientService.searchClients(
      searchQuery,
      parseInt(page) || 1,
      parseInt(limit) || 50
    );

    res.json(results);

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Search failed',
      clients: [],
      total: 0 
    });
  }
};

/**
 * Get all clients
 */
const getClients = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const results = await clientService.getAllClients(
      parseInt(page) || 1,
      parseInt(limit) || 50
    );
    res.json(results);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get import history
 */
const getImportHistory = async (req, res) => {
  try {
    const imports = await prisma.importLog.findMany({
      take: 20,
      orderBy: { started_at: 'desc' }
    });
    res.json({ success: true, imports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get stats
 */
const getStats = async (req, res) => {
  try {
    const [totalClients, recentImports] = await Promise.all([
      prisma.client.count(),
      prisma.importLog.findMany({
        take: 5,
        orderBy: { started_at: 'desc' }
      })
    ]);

    res.json({ success: true, totalClients, recentImports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  importClients,
  search,
  getClients,
  getImportHistory,
  getStats
};