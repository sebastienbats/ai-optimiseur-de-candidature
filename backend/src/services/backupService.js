import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initializeDatabase } from '../database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BACKUP_DIR = path.join(__dirname, '../../backups');

// Créer le dossier de sauvegarde s'il n'existe pas
if (!fs.existsSync(BACKUP_DIR)) {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`✅ Dossier backups créé: ${BACKUP_DIR}`);
  } catch (error) {
    console.error(`❌ Erreur création dossier backups: ${error.message}`);
  }
}

/**
 * Sauvegarde complète de la base de données
 */
export async function backupDatabase(type = 'full') {
  try {
    const db = await initializeDatabase();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${type}_${timestamp}.db`;
    const filepath = path.join(BACKUP_DIR, filename);
    
    console.log(`🔄 Sauvegarde ${type} en cours...`);
    
    // Sauvegarder la base de données avec VACUUM INTO
    await db.exec(`VACUUM INTO '${filepath}'`);
    
    // Vérifier que le fichier a été créé
    if (!fs.existsSync(filepath)) {
      throw new Error('Le fichier de sauvegarde n\'a pas été créé');
    }
    
    // Créer un fichier de métadonnées
    const stats = fs.statSync(filepath);
    const metadata = {
      timestamp: new Date().toISOString(),
      type,
      size: stats.size,
      version: process.env.npm_package_version || '1.0.0'
    };
    
    fs.writeFileSync(
      filepath + '.meta.json',
      JSON.stringify(metadata, null, 2)
    );
    
    // Enregistrer dans l'historique
    await db.run(
      `INSERT INTO backup_history (filename, type, size, metadata) 
       VALUES (?, ?, ?, ?)`,
      [filename, type, stats.size, JSON.stringify(metadata)]
    );
    
    console.log(`✅ Sauvegarde créée: ${filename} (${(stats.size / 1024).toFixed(1)} KB)`);
    
    return filename;
  } catch (error) {
    console.error('❌ Erreur lors de la sauvegarde:', error);
    throw new Error(`Erreur sauvegarde: ${error.message}`);
  }
}

/**
 * Restaure une sauvegarde
 */
export async function restoreDatabase(filename) {
  try {
    const filepath = path.join(BACKUP_DIR, filename);
    
    if (!fs.existsSync(filepath)) {
      throw new Error(`Fichier de sauvegarde non trouvé: ${filename}`);
    }
    
    console.log(`🔄 Restauration de ${filename}...`);
    
    // Vérifier l'intégrité de la sauvegarde
    const { default: open } = await import('sqlite');
    const { default: sqlite3 } = await import('sqlite3');
    
    try {
      const testDb = await open({
        filename: filepath,
        driver: sqlite3.Database
      });
      const result = await testDb.get('PRAGMA integrity_check');
      await testDb.close();
      
      if (result.integrity_check !== 'ok') {
        throw new Error('Le fichier de sauvegarde est corrompu');
      }
    } catch (error) {
      throw new Error(`Impossible de lire le fichier de sauvegarde: ${error.message}`);
    }
    
    // Restaurer la base de données
    const dbPath = path.join(__dirname, '../../database.sqlite');
    
    // Fermer la connexion actuelle
    const db = await initializeDatabase();
    await db.close();
    
    // Remplacer le fichier
    fs.copyFileSync(filepath, dbPath);
    
    // Réinitialiser la connexion
    const newDb = await initializeDatabase();
    
    // Vérifier l'intégrité
    const result = await newDb.get('PRAGMA integrity_check');
    if (result.integrity_check !== 'ok') {
      throw new Error('La base de données restaurée est corrompue');
    }
    
    console.log(`✅ Base de données restaurée avec succès: ${filename}`);
    
    return true;
  } catch (error) {
    console.error('❌ Erreur lors de la restauration:', error);
    throw new Error(`Erreur restauration: ${error.message}`);
  }
}

/**
 * Liste toutes les sauvegardes disponibles
 */
export async function listBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      return [];
    }
    
    const files = fs.readdirSync(BACKUP_DIR);
    
    const backups = files
      .filter(f => f.endsWith('.db'))
      .map(filename => {
        const filepath = path.join(BACKUP_DIR, filename);
        const stats = fs.statSync(filepath);
        const metaFile = filepath + '.meta.json';
        let metadata = {};
        
        if (fs.existsSync(metaFile)) {
          try {
            metadata = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
          } catch (e) {
            console.warn(`⚠️ Impossible de lire les métadonnées de ${filename}`);
          }
        }
        
        return {
          filename,
          size: stats.size,
          created: stats.mtime,
          type: metadata.type || 'full',
          metadata
        };
      })
      .sort((a, b) => b.created - a.created);
    
    return backups;
  } catch (error) {
    console.error('❌ Erreur liste sauvegardes:', error);
    return [];
  }
}

/**
 * Supprime une sauvegarde
 */
export async function deleteBackup(filename) {
  try {
    const filepath = path.join(BACKUP_DIR, filename);
    
    if (!fs.existsSync(filepath)) {
      throw new Error('Fichier non trouvé');
    }
    
    fs.unlinkSync(filepath);
    
    // Supprimer les métadonnées associées
    const metaFile = filepath + '.meta.json';
    if (fs.existsSync(metaFile)) {
      fs.unlinkSync(metaFile);
    }
    
    // Supprimer de l'historique
    const db = await initializeDatabase();
    await db.run(
      'DELETE FROM backup_history WHERE filename = ?',
      [filename]
    );
    
    console.log(`✅ Sauvegarde supprimée: ${filename}`);
    
    return true;
  } catch (error) {
    console.error('❌ Erreur suppression sauvegarde:', error);
    throw new Error(`Erreur suppression: ${error.message}`);
  }
}
