const clientService = require('../services/clientService');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Function 1: Handle Import
const importClients = async (req, res) => {
  const importId = `IMP_${Date.now()}`;
  
  try {
    const { clients } = req.body;

    if (!clients || !Array.isArray(clients)) {
      return res.status(400).json({ message: 'Invalid data format. Expected an array of clients.' });
    }

    // Initialize Log
    await prisma.importLog.create({
      data: {
        import_id: importId,
        file_name: 'API_Upload.json',
        total_records: clients.length,
        status: 'processing'
      }
    });

    // Process Data
    const summary = await clientService.processBulkImport(clients, importId);

    res.json({
      success: true,
      importId,
      summary
    });

  } catch (error) {
    console.error("Import Controller Error:", error);
    // Try to update log if possible
    try {
        await prisma.importLog.update({
            where: { import_id: importId },
            data: { status: 'failed', completed_at: new Date() }
        });
    } catch(e) {}
    
    res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
};

// Function 2: Handle Search
const search = async (req, res) => {
    try {
        const { q, page } = req.query;
        if (!q) return res.json({ clients: [], total: 0 });

        const results = await clientService.searchClients(q, Number(page) || 1);
        res.json(results);
    } catch (error) {
        console.error("Search Controller Error:", error);
        res.status(500).json({ message: "Search failed" });
    }
};

// IMPORTANT: Export them as an object
module.exports = {
    importClients,
    search
};