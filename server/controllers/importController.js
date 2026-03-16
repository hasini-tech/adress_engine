const { v4: uuidv4 } = require('uuid');
const prisma = require('../lib/prisma');
const clientService = require('../services/clientService');

const importClients = async (req, res) => {
  const importId = `IMP_${uuidv4().split('-')[0]}_${Date.now()}`;
  try {
    const { clients, data, records } = req.body;
    const clientsArray = clients || data || records;
    if (!clientsArray || !Array.isArray(clientsArray) || clientsArray.length === 0) {
      return res.status(400).json({ success: false, message: 'No data provided. Expected: { "clients": [...] }' });
    }
    await prisma.importLog.create({
      data: { import_id: importId, file_name: 'API_Upload', file_size: BigInt(0), total_records: clientsArray.length, status: 'processing', started_at: new Date() }
    });
    const summary = await clientService.processBulkImport(clientsArray, importId);
    res.json({ success: true, importId, message: 'Import completed', summary });
  } catch (error) {
    prisma.importLog.update({ where: { import_id: importId }, data: { status: 'failed', error_message: error.message, completed_at: new Date() } }).catch(() => {});
    res.status(500).json({ success: false, importId, message: error.message });
  }
};

const importFile = async (req, res) => {
  const importId = `IMP_${uuidv4().split('-')[0]}_${Date.now()}`;
  const filePath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });
    await prisma.importLog.create({
      data: { import_id: importId, file_name: req.file.originalname, file_size: BigInt(req.file.size), total_records: 0, status: 'processing', started_at: new Date() }
    });
    const summary = await clientService.processBulkImport(filePath, importId);
    require('fs').unlink(filePath, () => {});
    res.json({ success: true, importId, message: 'Import completed', summary });
  } catch (error) {
    if (filePath) require('fs').unlink(filePath, () => {});
    prisma.importLog.update({ where: { import_id: importId }, data: { status: 'failed', error_message: error.message, completed_at: new Date() } }).catch(() => {});
    res.status(500).json({ success: false, importId, message: error.message });
  }
};

const search = async (req, res) => {
  try {
    const { q, query, page = 1, limit = 50 } = req.query;
    res.json(await clientService.searchClients(q || query || '', parseInt(page) || 1, parseInt(limit) || 50));
  } catch (error) { res.status(500).json({ success: false, message: 'Search failed' }); }
};

const getClients = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    res.json(await clientService.getAllClients(parseInt(page) || 1, parseInt(limit) || 50));
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

const getImportHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [imports, total] = await Promise.all([
      prisma.importLog.findMany({ skip, take: parseInt(limit), orderBy: { started_at: 'desc' } }),
      prisma.importLog.count()
    ]);
    res.json({ success: true, imports, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

const getStats = async (req, res) => {
  try {
    const [totalClients, recentImports] = await Promise.all([
      prisma.client.count(),
      prisma.importLog.findMany({ take: 5, orderBy: { started_at: 'desc' } })
    ]);
    res.json({ success: true, totalClients, recentImports });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

module.exports = { importClients, importFile, search, getClients, getImportHistory, getStats };