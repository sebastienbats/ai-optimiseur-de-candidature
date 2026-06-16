import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { AdminLog } from '../../models/AdminLog.js';
import { initializeDatabase } from '../../database.js';
import { 
  backupDatabase, 
  restoreDatabase, 
  listBackups,
  deleteBackup 
} from '../../services/backupService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const router = express.Router();
let db;

(async () => {
  db = await initializeDatabase();
})();

// Créer une sauvegarde
router.post('/backup', async (req, res) => {
  try {
    const { type = 'full' } = req.body;
    const adminId = req.userId;
    
    const filename = await backupDatabase(type);
    
    const adminLog = new AdminLog(db);
    await adminLog.create(
      adminId,
      'BACKUP_CREATED',
      { filename, type },
      req.ip
    );
    
    res.json({
      message: 'Sauvegarde créée avec succès',
      filename
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde' });
  }
});

// Liste des sauvegardes
router.get('/backups', async (req, res) => {
  try {
    const backups = await listBackups();
    res.json({ backups });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la liste des sauvegardes' });
  }
});

// Télécharger une sauvegarde
router.get('/backups/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const backupDir = path.join(__dirname, '../../../backups');
    const filePath = path.join(backupDir, filename);
    
    // Vérification de sécurité : empêcher le path traversal
    if (!filePath.startsWith(backupDir)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Fichier non trouvé' });
    }
    
    res.download(filePath);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors du téléchargement' });
  }
});

// Restaurer une sauvegarde
router.post('/restore', async (req, res) => {
  try {
    const { filename } = req.body;
    const adminId = req.userId;
    
    if (!filename) {
      return res.status(400).json({ error: 'Nom de fichier requis' });
    }
    
    await restoreDatabase(filename);
    
    const adminLog = new AdminLog(db);
    await adminLog.create(
      adminId,
      'DATABASE_RESTORED',
      { filename },
      req.ip
    );
    
    res.json({
      message: 'Base de données restaurée avec succès',
      filename
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erreur lors de la restauration' });
  }
});

// Supprimer une sauvegarde
router.delete('/backups/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const adminId = req.userId;
    
    await deleteBackup(filename);
    
    const adminLog = new AdminLog(db);
    await adminLog.create(
      adminId,
      'BACKUP_DELETED',
      { filename },
      req.ip
    );
    
    res.json({ message: 'Sauvegarde supprimée avec succès' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erreur lors de la suppression' });
  }
});

// Exporter la base de données en format JSON
router.get('/export/json', async (req, res) => {
  try {
    const adminId = req.userId;
    
    const tables = await db.all(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `);
    
    const exportData = {};
    for (const table of tables) {
      exportData[table.name] = await db.all(`SELECT * FROM ${table.name}`);
    }
    
    const adminLog = new AdminLog(db);
    await adminLog.create(
      adminId,
      'DATABASE_EXPORTED',
      { format: 'json' },
      req.ip
    );
    
    res.json({
      exported_at: new Date().toISOString(),
      data: exportData
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de l\'export' });
  }
});

// Importer des données JSON
router.post('/import/json', async (req, res) => {
  try {
    const { data } = req.body;
    const adminId = req.userId;
    
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Données JSON invalides' });
    }
    
    // Commencer une transaction
    await db.exec('BEGIN TRANSACTION');
    
    try {
      for (const [tableName, rows] of Object.entries(data)) {
        if (!Array.isArray(rows)) continue;
        
        for (const row of rows) {
          const columns = Object.keys(row);
          const placeholders = columns.map(() => '?').join(',');
          const values = columns.map(col => row[col]);
          
          await db.run(
            `INSERT OR REPLACE INTO ${tableName} (${columns.join(',')}) 
             VALUES (${placeholders})`,
            values
          );
        }
      }
      
      await db.exec('COMMIT');
      
      const adminLog = new AdminLog(db);
      await adminLog.create(
        adminId,
        'DATABASE_IMPORTED',
        { format: 'json', tables: Object.keys(data) },
        req.ip
      );
      
      res.json({
        message: 'Données importées avec succès',
        tables: Object.keys(data)
      });
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de l\'import' });
  }
});

export default router;
