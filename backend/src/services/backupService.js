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
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export async function backupDatabase(type = 'full') {
  const db = await initializeDatabase();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup_${type}_${timestamp}.db`;
  const filepath = path.join(BACKUP_DIR, filename);
  
  // Sauvegarder la base de données
  await db.exec(`VACUUM INTO '${filepath}'`);
  
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
  
  return filename;
}

export async function restoreDatabase(filename) {
  const filepath = path.join(BACKUP_DIR, filename);
  
  if (!fs.existsSync(filepath)) {
    throw new Error(`Fichier de sauvegarde non trouvé: ${filename}`);
  }
  
  // Vérifier l'intégrité de la sauvegarde
  try {
    const db = await initializeDatabase();
    // Tester l'ouverture du fichier de backup
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
    throw new Error('Impossible de lire le fichier de sauvegarde: ' + error.message);
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
  
  return true;
}

export async function listBackups() {
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
        } catch (e) {}
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
}

export async function deleteBackup(filename) {
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
  
  return true;
}
