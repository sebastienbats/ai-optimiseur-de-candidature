import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function initializeDatabase() {
  const db = await open({
    filename: join(__dirname, '../database.sqlite'),
    driver: sqlite3.Database
  });

  // Activer les clés étrangères
  await db.exec('PRAGMA foreign_keys = ON');

  // Créer toutes les tables
  await db.exec(`
    -- Table des utilisateurs
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Table des documents (CV, offres, résultats)
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    -- Table des clés API (ancien système - gardé pour compatibilité)
    CREATE TABLE IF NOT EXISTS user_api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      encrypted_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    -- Table des clés API par provider (NOUVEAU - multi-fournisseurs)
    CREATE TABLE IF NOT EXISTS user_provider_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      UNIQUE(user_id, provider)
    );

    -- Table des logs administrateur
    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES users (id) ON DELETE CASCADE
    );

    -- Table de l'historique des sauvegardes
    CREATE TABLE IF NOT EXISTS backup_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      type TEXT NOT NULL,
      size INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      metadata TEXT
    );

    -- Table de configuration SMTP
    CREATE TABLE IF NOT EXISTS smtp_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      secure INTEGER DEFAULT 0,
      user TEXT NOT NULL,
      pass TEXT NOT NULL,
      from_email TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ============================================
  // MIGRATIONS : Ajout des colonnes manquantes pour compatibilité
  // ============================================

  // Vérifier et ajouter la colonne is_active à users
  const tableInfo = await db.all('PRAGMA table_info(users)');
  
  const hasIsActive = tableInfo.some(col => col.name === 'is_active');
  if (!hasIsActive) {
    await db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1');
    console.log('✅ Colonne is_active ajoutée');
  }

  const hasIsAdmin = tableInfo.some(col => col.name === 'is_admin');
  if (!hasIsAdmin) {
    await db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
    console.log('✅ Colonne is_admin ajoutée');
  }

  // ============================================
  // CRÉATION DE L'ADMIN PAR DÉFAUT
  // ============================================

  try {
    const adminExists = await db.get('SELECT * FROM users WHERE is_admin = 1 LIMIT 1');
    
    if (!adminExists) {
      const defaultPassword = process.env.ADMIN_PASSWORD || 'admin123';
      const defaultEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
      
      // Vérifier si l'email existe déjà
      const existingUser = await db.get('SELECT * FROM users WHERE email = ?', [defaultEmail]);
      
      if (existingUser) {
        // Mettre à jour l'utilisateur existant en admin
        await db.run(
          'UPDATE users SET is_admin = 1, is_active = 1 WHERE email = ?',
          [defaultEmail]
        );
        console.log(`✅ Utilisateur ${defaultEmail} promu administrateur`);
      } else {
        // Créer un nouvel admin
        const password_hash = await bcrypt.hash(defaultPassword, 12);
        await db.run(
          'INSERT INTO users (email, password_hash, is_admin, is_active) VALUES (?, ?, 1, 1)',
          [defaultEmail, password_hash]
        );
        console.log('✅ Administrateur par défaut créé avec succès');
        console.log(`📧 Email: ${defaultEmail}`);
        console.log(`🔑 Mot de passe: ${defaultPassword}`);
        console.log('⚠️  CHANGEZ CE MOT DE PASSE IMMÉDIATEMENT !');
      }
    } else {
      console.log('✅ Administrateur déjà existant');
    }
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') {
      console.log('ℹ️  Administrateur déjà existant (contrainte UNIQUE)');
    } else {
      console.error('❌ Erreur lors de la création/admin:', error);
    }
  }

  // ============================================
  // INDEX POUR OPTIMISATION DES PERFORMANCES
  // ============================================

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
    CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
    CREATE INDEX IF NOT EXISTS idx_user_provider_keys_user_id ON user_provider_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id);
    CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_backup_history_created_at ON backup_history(created_at);
  `);

  console.log('✅ Base de données initialisée avec succès');
  console.log(`📁 Chemin: ${join(__dirname, '../database.sqlite')}`);

  return db;
}

// ============================================
// EXPORT DE LA FONCTION POUR UTILISATION EXTERNE
// ============================================

export default initializeDatabase;
