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

    -- Table des clés API par provider (multi-fournisseurs)
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

    -- Table de configuration SMTP (avec support OAuth 2.0 et PKCE)
    CREATE TABLE IF NOT EXISTS smtp_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host TEXT,
      port INTEGER,
      secure INTEGER DEFAULT 0,
      user TEXT,
      pass TEXT,
      from_email TEXT NOT NULL,
      auth_type TEXT DEFAULT 'password', -- 'password' ou 'oauth2'
      client_id TEXT,
      client_secret TEXT,
      redirect_uri TEXT,
      refresh_token TEXT,
      access_token TEXT,
      expiry_date INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ============================================
  // VÉRIFICATION DES TABLES
  // ============================================

  // Vérifier que la table user_provider_keys existe
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

  // Vérifier et ajouter les colonnes à users
  const userTableInfo = await db.all('PRAGMA table_info(users)');
  
  const hasIsActive = userTableInfo.some(col => col.name === 'is_active');
  if (!hasIsActive) {
    await db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1');
    console.log('✅ Colonne is_active ajoutée à users');
  }

  const hasIsAdmin = userTableInfo.some(col => col.name === 'is_admin');
  if (!hasIsAdmin) {
    await db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
    console.log('✅ Colonne is_admin ajoutée à users');
  }

  // Vérifier et ajouter les colonnes à user_provider_keys
  const providerTableInfo = await db.all('PRAGMA table_info(user_provider_keys)');
  const hasAuthTag = providerTableInfo.some(col => col.name === 'auth_tag');
  if (!hasAuthTag) {
    await db.exec('ALTER TABLE user_provider_keys ADD COLUMN auth_tag TEXT');
    console.log('✅ Colonne auth_tag ajoutée à user_provider_keys');
  }

  // Vérifier et ajouter les colonnes OAuth/PKCE à smtp_config
  const smtpTableInfo = await db.all('PRAGMA table_info(smtp_config)');
  const oauthColumns = [
    'auth_type', 'client_id', 'client_secret', 
    'redirect_uri', 'refresh_token', 'access_token', 'expiry_date'
  ];

  for (const col of oauthColumns) {
    const exists = smtpTableInfo.some(c => c.name === col);
    if (!exists) {
      await db.exec(`ALTER TABLE smtp_config ADD COLUMN ${col} TEXT`);
      console.log(`✅ Colonne ${col} ajoutée à smtp_config`);
    }
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
    -- Index pour les documents
    CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
    CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
    CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
    
    -- Index pour les clés API par provider
    CREATE INDEX IF NOT EXISTS idx_user_provider_keys_user_id ON user_provider_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_provider_keys_provider ON user_provider_keys(provider);
    
    -- Index pour les logs admin
    CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id);
    CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_logs(action);
    
    -- Index pour l'historique des sauvegardes
    CREATE INDEX IF NOT EXISTS idx_backup_history_created_at ON backup_history(created_at);
    
    -- Index pour les utilisateurs
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);
    CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
    
    -- Index pour les clés API (ancien système)
    CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id);
    
    -- Index pour la configuration SMTP
    CREATE INDEX IF NOT EXISTS idx_smtp_config_auth_type ON smtp_config(auth_type);
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

  // Vérification spécifique des tables importantes
  const importantTables = ['users', 'documents', 'user_provider_keys', 'smtp_config', 'admin_logs', 'backup_history'];
  for (const table of importantTables) {
    const check = await db.get(`
      SELECT COUNT(*) as count FROM sqlite_master 
      WHERE type='table' AND name='${table}'
    `);
    if (check && check.count > 0) {
      console.log(`✅ Table ${table} vérifiée et présente`);
    } else {
      console.error(`❌ Table ${table} manquante !`);
    }
  }

  // ============================================
  // VÉRIFICATION DE L'INTÉGRITÉ DE LA BASE
  // ============================================

  try {
    const integrityCheck = await db.get('PRAGMA integrity_check');
    if (integrityCheck.integrity_check === 'ok') {
      console.log('✅ Intégrité de la base de données vérifiée');
    } else {
      console.warn('⚠️ Problème d\'intégrité détecté:', integrityCheck.integrity_check);
    }
  } catch (error) {
    console.error('❌ Erreur lors de la vérification d\'intégrité:', error);
  }

  // ============================================
  // STATISTIQUES DE LA BASE
  // ============================================

  try {
    const stats = await db.get(`
      SELECT 
        (SELECT COUNT(*) FROM users) as user_count,
        (SELECT COUNT(*) FROM documents) as document_count,
        (SELECT COUNT(*) FROM admin_logs) as log_count,
        (SELECT COUNT(*) FROM user_provider_keys) as provider_keys_count
    `);
    console.log('📊 Statistiques de la base:');
    console.log(`  - Utilisateurs: ${stats.user_count}`);
    console.log(`  - Documents: ${stats.document_count}`);
    console.log(`  - Logs admin: ${stats.log_count}`);
    console.log(`  - Clés provider: ${stats.provider_keys_count}`);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des statistiques:', error);
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
 * Récupère une clé API spécifique d'un provider
 */
export async function getProviderKey(db, userId, provider) {
  try {
    const result = await db.get(
      'SELECT encrypted_key, iv, auth_tag FROM user_provider_keys WHERE user_id = ? AND provider = ?',
      [userId, provider]
    );
    return result;
  } catch (error) {
    console.error(`Erreur récupération clé ${provider}:`, error);
    return null;
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
 * Supprime la clé API d'un provider
 */
export async function deleteProviderKey(db, userId, provider) {
  try {
    await db.run(
      'DELETE FROM user_provider_keys WHERE user_id = ? AND provider = ?',
      [userId, provider]
    );
    return true;
  } catch (error) {
    console.error(`Erreur suppression clé ${provider}:`, error);
    return false;
  }
}

/**
 * Liste des providers supportés
 */
export const SUPPORTED_PROVIDERS = [
  { id: 'gemini', name: 'Google Gemini', free: true, models: ['gemini-2.5-flash', 'gemini-2.5-pro'] },
  { id: 'groq', name: 'Groq', free: true, models: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'] },
  { id: 'mistral', name: 'Mistral AI', free: true, models: ['mistral-small-latest', 'mistral-large-latest', 'codestral-latest'] },
  { id: 'claude', name: 'Claude (Anthropic)', free: false, models: ['claude-3-sonnet-20240229'] }
];

// ============================================
// FONCTIONS UTILITAIRES POUR OAuth 2.0 ET PKCE
// ============================================

/**
 * Récupère la configuration OAuth 2.0
 */
export async function getOAuthConfig(db) {
  try {
    const config = await db.get(`
      SELECT client_id, client_secret, redirect_uri, refresh_token, access_token, expiry_date 
      FROM smtp_config 
      WHERE auth_type = 'oauth2' 
      LIMIT 1
    `);
    return config;
  } catch (error) {
    console.error('Erreur récupération config OAuth:', error);
    return null;
  }
}

/**
 * Met à jour les tokens OAuth
 */
export async function updateOAuthTokens(db, accessToken, refreshToken, expiryDate) {
  try {
    await db.run(`
      UPDATE smtp_config 
      SET access_token = ?, refresh_token = ?, expiry_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE auth_type = 'oauth2'
    `, [accessToken, refreshToken, expiryDate]);
    return true;
  } catch (error) {
    console.error('Erreur mise à jour tokens OAuth:', error);
    return false;
  }
}

/**
 * Vérifie si OAuth 2.0 est configuré
 */
export async function isOAuthConfigured(db) {
  try {
    const result = await db.get(`
      SELECT COUNT(*) as count 
      FROM smtp_config 
      WHERE auth_type = 'oauth2' 
      AND client_id IS NOT NULL 
      AND client_secret IS NOT NULL 
      AND refresh_token IS NOT NULL
    `);
    return result && result.count > 0;
  } catch (error) {
    console.error('Erreur vérification OAuth:', error);
    return false;
  }
}

/**
 * Récupère la configuration SMTP complète
 */
export async function getSmtpConfig(db) {
  try {
    return await db.get('SELECT * FROM smtp_config LIMIT 1');
  } catch (error) {
    console.error('Erreur récupération config SMTP:', error);
    return null;
  }
}

/**
 * Sauvegarde ou met à jour la configuration SMTP
 */
export async function saveSmtpConfig(db, config) {
  try {
    const existing = await db.get('SELECT id FROM smtp_config LIMIT 1');
    
    if (existing) {
      await db.run(`
        UPDATE smtp_config 
        SET host = ?, port = ?, secure = ?, user = ?, pass = ?, 
            from_email = ?, auth_type = ?, client_id = ?, 
            client_secret = ?, redirect_uri = ?, 
            refresh_token = ?, access_token = ?, 
            expiry_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        config.host, config.port, config.secure || 0, 
        config.user || null, config.pass || null,
        config.from_email, config.auth_type || 'password',
        config.client_id || null, config.client_secret || null,
        config.redirect_uri || null,
        config.refresh_token || null, config.access_token || null,
        config.expiry_date || null, existing.id
      ]);
      return existing.id;
    } else {
      const result = await db.run(`
        INSERT INTO smtp_config 
        (host, port, secure, user, pass, from_email, 
         auth_type, client_id, client_secret, redirect_uri,
         refresh_token, access_token, expiry_date) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        config.host, config.port, config.secure || 0, 
        config.user || null, config.pass || null, config.from_email,
        config.auth_type || 'password',
        config.client_id || null, config.client_secret || null,
        config.redirect_uri || null,
        config.refresh_token || null, config.access_token || null,
        config.expiry_date || null
      ]);
      return result.lastID;
    }
  } catch (error) {
    console.error('Erreur sauvegarde config SMTP:', error);
    throw error;
  }
}

/**
 * Supprime la configuration SMTP
 */
export async function deleteSmtpConfig(db) {
  try {
    await db.run('DELETE FROM smtp_config');
    return true;
  } catch (error) {
    console.error('Erreur suppression config SMTP:', error);
    return false;
  }
}

// ============================================
// FONCTIONS POUR LES LOGS ADMIN
// ============================================

/**
 * Ajoute un log administrateur
 */
export async function addAdminLog(db, adminId, action, details = null, ipAddress = null) {
  try {
    await db.run(
      `INSERT INTO admin_logs (admin_id, action, details, ip_address) 
       VALUES (?, ?, ?, ?)`,
      [adminId, action, details ? JSON.stringify(details) : null, ipAddress]
    );
    return true;
  } catch (error) {
    console.error('Erreur ajout log admin:', error);
    return false;
  }
}

/**
 * Récupère les logs administrateur
 */
export async function getAdminLogs(db, limit = 100, offset = 0) {
  try {
    return await db.all(`
      SELECT l.*, u.email as admin_email 
      FROM admin_logs l
      JOIN users u ON u.id = l.admin_id
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);
  } catch (error) {
    console.error('Erreur récupération logs admin:', error);
    return [];
  }
}

// ============================================
// EXPORT PAR DÉFAUT
// ============================================

export default initializeDatabase;
