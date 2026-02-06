const prisma = require('../lib/prisma');

class ImportService {
  /**
   * Create import log
   */
  async createImportLog(importId, fileName, totalRecords) {
    try {
      const importLog = await prisma.importLog.create({
        data: {
          import_id: importId,
          file_name: fileName,
          total_records: totalRecords,
          status: 'processing'
        }
      });
      
      return { success: true, data: importLog };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Update import log
   */
  async updateImportLog(importId, data) {
    try {
      const importLog = await prisma.importLog.update({
        where: { import_id: importId },
        data: {
          ...data,
          completed_at: new Date()
        }
      });
      
      return { success: true, data: importLog };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get import history
   */
  async getImportHistory(page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;
      
      const [imports, total] = await Promise.all([
        prisma.importLog.findMany({
          skip: skip,
          take: limit,
          orderBy: { started_at: 'desc' }
        }),
        prisma.importLog.count()
      ]);
      
      return {
        success: true,
        data: {
          imports,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get import statistics
   */
  async getImportStats() {
    try {
      const totalImports = await prisma.importLog.count();
      const successfulImports = await prisma.importLog.count({
        where: { status: 'completed' }
      });
      const failedImports = await prisma.importLog.count({
        where: { status: 'failed' }
      });
      
      const recentImports = await prisma.importLog.findMany({
        take: 10,
        orderBy: { started_at: 'desc' }
      });
      
      return {
        success: true,
        data: {
          totalImports,
          successfulImports,
          failedImports,
          successRate: totalImports > 0 ? Math.round((successfulImports / totalImports) * 100) : 0,
          recentImports
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new ImportService();