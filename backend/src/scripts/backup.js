import dotenv from 'dotenv';
import { backupDatabase } from '../services/backupService.js';
import { initializeDatabase } from '../database.js';

dotenv.config();

async function runBackup() {
  try {
    console.log('🔄 Début de la sauvegarde...');
    await initializeDatabase();
    const filename = await backupDatabase('full');
    console.log(`✅ Sauvegarde créée: ${filename}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de la sauvegarde:', error);
    process.exit(1);
  }
}

runBackup();
