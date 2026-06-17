import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import bcrypt from 'bcrypt';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function initializeDatabase() {
  // S'assurer que le dossier existe
  const dbDir = join(__dirname, '../');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = await open({
    filename: join(__dirname, '../database.sqlite'),
    driver: sqlite3.Database
  });

  // Activer les clés étrangères
  await db.exec('PRAGMA foreign_keys = ON');

  // ============================================
  // CRÉATION DE TOUTES LES TABLES
  // ============================================

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
    -- Supporte: gemini, groq, mistral, claude
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
  // VÉRIFICATION : Table user_provider_keys existe-t-elle ?
  // ============================================
  
  const tables = await db.all(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='user_provider_keys'
  `);

  if (tables.length === 0) {
    console.warn('⚠️ Table user_provider_keys manquante, création...');
    await db.exec(`
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
      )
    `);
    console.log('✅ Table user_provider_keys créée avec succès');
  } else {
    console.log('✅ Table user_provider_keys existe déjà');
  }

  // ============================================
  // MIGRATIONS : Ajout des colonnes manquantes
  // ============================================

  // Vérifier et ajouter la colonne is_active à users
  const tableInfo = await db.all('PRAGMA table_info(users)');
  
  const hasIsActive = tableInfo.some(col => col.name === 'is_active');
  if (!hasIsActive) {
    await db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1');
    console.log('✅ Colonne is_active ajoutée à users');
  }

  const hasIsAdmin = tableInfo.some(col => col.name === 'is_admin');
  if (!hasIsAdmin) {
    await db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
    console.log('✅ Colonne is_admin ajoutée à users');
  }

  // ============================================
  // MIGRATION : Ajout de la colonne auth_tag si manquante
  // ============================================
  
  const providerTableInfo = await db.all('PRAGMA table_info(user_provider_keys)');
  const hasAuthTag = providerTableInfo.some(col => col.name === 'auth_tag');
  if (!hasAuthTag) {
    await db.exec('ALTER TABLE user_provider_keys ADD COLUMN auth_tag TEXT');
    console.log('✅ Colonne auth_tag ajoutée à user_provider_keys');
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
    CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
    CREATE INDEX IF NOT EXISTS idx_user_provider_keys_user_id ON user_provider_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_provider_keys_provider ON user_provider_keys(provider);
    CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id);
    CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_backup_history_created_at ON backup_history(created_at);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);
  `);

  console.log('✅ Base de données initialisée avec succès');
  console.log(`📁 Chemin: ${join(__dirname, '../database.sqlite')}`);

  // ============================================
  // VÉRIFICATION FINALE : Afficher les tables
  // ============================================

  const finalTables = await db.all(`
    SELECT name FROM sqlite_master 
    WHERE type='table' 
    ORDER BY name
  `);

  console.log('📋 Tables disponibles:');
  finalTables.forEach(t => console.log(`  - ${t.name}`));

  // Vérification spécifique de user_provider_keys
  const providerKeysCheck = await db.get(`
    SELECT COUNT(*) as count FROM sqlite_master 
    WHERE type='table' AND name='user_provider_keys'
  `);

  if (providerKeysCheck && providerKeysCheck.count > 0) {
    console.log('✅ Table user_provider_keys vérifiée et présente');
  } else {
    console.error('❌ Table user_provider_keys manquante !');
  }

  return db;
}

// ============================================
// FONCTIONS UTILITAIRES POUR LA GESTION DES PROVIDERS
// ============================================

/**
 * Récupère toutes les clés API d'un utilisateur par provider
 */
export async function getUserProviderKeys(db, userId) {
  try {
    const results = await db.all(
      'SELECT provider, encrypted_key, iv, auth_tag FROM user_provider_keys WHERE user_id = ?',
      [userId]
    );
    return results;
  } catch (error) {
    console.error('Erreur récupération clés provider:', error);
    return [];
  }
}

/**
 * Vérifie si un provider est configuré pour un utilisateur
 */
export async function hasProviderKey(db, userId, provider) {
  try {
    const result = await db.get(
      'SELECT COUNT(*) as count FROM user_provider_keys WHERE user_id = ? AND provider = ?',
      [userId, provider]
    );
    return result && result.count > 0;
  } catch (error) {
    console.error('Erreur vérification clé provider:', error);
    return false;
  }
}

/**
 * Liste des providers supportés
 */
export const SUPPORTED_PROVIDERS = [
  { id: 'gemini', name: 'Google Gemini', free: true },
  { id: 'groq', name: 'Groq', free: true },
  { id: 'mistral', name: 'Mistral AI', free: true },
  { id: 'claude', name: 'Claude (Anthropic)', free: false }
];

// ============================================
// EXPORT PAR DÉFAUT
// ============================================

export default initializeDatabase;
