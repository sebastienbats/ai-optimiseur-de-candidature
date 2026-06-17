import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { Document } from '../models/Document.js';
import { initializeDatabase } from '../database.js';
import { encrypt, decrypt } from '../services/encryption.js';
import { callClaude } from '../services/claudeService.js';
import { callGemini } from '../services/geminiService.js';
import { callGroq } from '../services/groqService.js';
import { callMistral } from '../services/mistralService.js';
import { callAIWithFallback, getProviderConfig } from '../services/aiProviders.js';

const router = express.Router();
let db;

(async () => {
  db = await initializeDatabase();
})();

// ============================================
// ROUTES DOCUMENTS
// ============================================

// Sauvegarder un document (CV, offre, résultats)
router.post('/save', authenticate, async (req, res) => {
  try {
    const { title, content, type } = req.body;
    const userId = req.userId;

    if (!title || !content || !type) {
      return res.status(400).json({ error: 'Titre, contenu et type requis' });
    }

    const documentModel = new Document(db);
    const docId = await documentModel.save(userId, title, content, type);

    res.status(201).json({ 
      id: docId, 
      message: 'Document sauvegardé avec succès' 
    });
  } catch (error) {
    console.error('Erreur sauvegarde document:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer tous les documents d'un utilisateur
router.get('/user', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const documentModel = new Document(db);
    const documents = await documentModel.getByUser(userId);
    res.json(documents);
  } catch (error) {
    console.error('Erreur récupération documents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les documents par type
router.get('/user/:type', authenticate, async (req, res) => {
  try {
    const { type } = req.params;
    const userId = req.userId;
    const documentModel = new Document(db);
    const documents = await documentModel.getByType(userId, type);
    res.json(documents);
  } catch (error) {
    console.error('Erreur récupération documents par type:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un document
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const documentModel = new Document(db);
    await documentModel.delete(id, userId);
    res.json({ message: 'Document supprimé avec succès' });
  } catch (error) {
    console.error('Erreur suppression document:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mettre à jour un document
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.userId;

    if (!content) {
      return res.status(400).json({ error: 'Contenu requis' });
    }

    const documentModel = new Document(db);
    await documentModel.update(id, userId, content);
    res.json({ message: 'Document mis à jour avec succès' });
  } catch (error) {
    console.error('Erreur mise à jour document:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// ROUTES GESTION DES CLÉS API (ANCIEN SYSTÈME)
// ============================================

// Sauvegarder une clé API (ancien système - gardé pour compatibilité)
router.post('/api-key', authenticate, async (req, res) => {
  try {
    const { apiKey } = req.body;
    const userId = req.userId;

    if (!apiKey) {
      return res.status(400).json({ error: 'Clé API requise' });
    }

    const encrypted = encrypt(apiKey);
    
    await db.run(
      `INSERT OR REPLACE INTO user_api_keys (user_id, encrypted_key, iv, auth_tag) 
       VALUES (?, ?, ?, ?)`,
      [userId, encrypted.encrypted, encrypted.iv, encrypted.authTag]
    );

    res.json({ message: 'Clé API sauvegardée avec succès' });
  } catch (error) {
    console.error('Erreur sauvegarde clé API:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer la clé API (ancien système)
router.get('/api-key', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    
    const result = await db.get(
      'SELECT encrypted_key, iv, auth_tag FROM user_api_keys WHERE user_id = ?',
      [userId]
    );

    if (!result) {
      return res.status(404).json({ error: 'Aucune clé API trouvée' });
    }

    const apiKey = decrypt(
      result.encrypted_key,
      result.iv,
      result.auth_tag
    );

    res.json({ apiKey });
  } catch (error) {
    console.error('Erreur récupération clé API:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer la clé API (ancien système)
router.delete('/api-key', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    await db.run(
      'DELETE FROM user_api_keys WHERE user_id = ?',
      [userId]
    );
    res.json({ message: 'Clé API supprimée avec succès' });
  } catch (error) {
    console.error('Erreur suppression clé API:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// ROUTES GESTION DES CLÉS API PAR PROVIDER (NOUVEAU)
// ============================================

// Sauvegarder une clé API pour un provider spécifique
router.post('/provider-keys', authenticate, async (req, res) => {
  try {
    const { provider, apiKey } = req.body;
    const userId = req.userId;

    if (!provider || !apiKey) {
      return res.status(400).json({ error: 'Provider et clé API requis' });
    }

    // Vérifier que le provider est supporté
    const providers = ['claude', 'gemini', 'groq', 'mistral'];
    if (!providers.includes(provider)) {
      return res.status(400).json({ error: 'Provider non supporté' });
    }

    const encrypted = encrypt(apiKey);
    
    await db.run(
      `INSERT OR REPLACE INTO user_provider_keys (user_id, provider, encrypted_key, iv, auth_tag) 
       VALUES (?, ?, ?, ?, ?)`,
      [userId, provider, encrypted.encrypted, encrypted.iv, encrypted.authTag]
    );

    res.json({ 
      message: `Clé API pour ${provider} sauvegardée avec succès` 
    });
  } catch (error) {
    console.error('Erreur sauvegarde clé provider:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer toutes les clés API d'un utilisateur (tous providers)
router.get('/provider-keys', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    
    const results = await db.all(
      'SELECT provider, encrypted_key, iv, auth_tag FROM user_provider_keys WHERE user_id = ?',
      [userId]
    );

    const keys = {};
    for (const row of results) {
      try {
        keys[row.provider] = decrypt(
          row.encrypted_key,
          row.iv,
          row.auth_tag
        );
      } catch (e) {
        console.error(`Erreur décryptage ${row.provider}:`, e);
      }
    }

    res.json({ keys });
  } catch (error) {
    console.error('Erreur récupération clés provider:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer la clé API d'un provider spécifique
router.get('/provider-keys/:provider', authenticate, async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.userId;

    const providers = ['claude', 'gemini', 'groq', 'mistral'];
    if (!providers.includes(provider)) {
      return res.status(400).json({ error: 'Provider non supporté' });
    }
    
    const result = await db.get(
      'SELECT encrypted_key, iv, auth_tag FROM user_provider_keys WHERE user_id = ? AND provider = ?',
      [userId, provider]
    );

    if (!result) {
      return res.status(404).json({ 
        error: `Aucune clé API trouvée pour ${provider}` 
      });
    }

    const apiKey = decrypt(
      result.encrypted_key,
      result.iv,
      result.auth_tag
    );

    res.json({ provider, apiKey });
  } catch (error) {
    console.error('Erreur récupération clé provider:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer la clé API d'un provider
router.delete('/provider-keys/:provider', authenticate, async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.userId;

    const providers = ['claude', 'gemini', 'groq', 'mistral'];
    if (!providers.includes(provider)) {
      return res.status(400).json({ error: 'Provider non supporté' });
    }

    await db.run(
      'DELETE FROM user_provider_keys WHERE user_id = ? AND provider = ?',
      [userId, provider]
    );
    
    res.json({ 
      message: `Clé API pour ${provider} supprimée avec succès` 
    });
  } catch (error) {
    console.error('Erreur suppression clé provider:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// ROUTES APPELS IA UNIFIÉS
// ============================================

// Appel à Claude (ancienne route - gardée pour compatibilité)
router.post('/claude', authenticate, async (req, res) => {
  try {
    const { prompt } = req.body;
    const userId = req.userId;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt requis' });
    }

    // Récupérer la clé API de l'utilisateur (ancien système)
    const result = await db.get(
      'SELECT encrypted_key, iv, auth_tag FROM user_api_keys WHERE user_id = ?',
      [userId]
    );

    if (!result) {
      return res.status(404).json({ 
        error: 'Aucune clé API trouvée. Veuillez enregistrer votre clé.' 
      });
    }

    const apiKey = decrypt(
      result.encrypted_key,
      result.iv,
      result.auth_tag
    );

    const response = await callClaude(prompt, apiKey);
    res.json({ response });
  } catch (error) {
    console.error('Erreur appel Claude:', error);
    res.status(500).json({ error: error.message || 'Erreur lors de l\'appel à Claude' });
  }
});

// NOUVEAU : Appel IA unifié avec fallback automatique
router.post('/ai/call', authenticate, async (req, res) => {
  try {
    const { 
      prompt, 
      preferredProvider = 'gemini', 
      model = null, 
      autoFallback = true 
    } = req.body;
    const userId = req.userId;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt requis' });
    }

    // Récupérer toutes les clés API de l'utilisateur (nouveau système)
    const results = await db.all(
      'SELECT provider, encrypted_key, iv, auth_tag FROM user_provider_keys WHERE user_id = ?',
      [userId]
    );

    const apiKeys = {};
    for (const row of results) {
      try {
        apiKeys[row.provider] = decrypt(
          row.encrypted_key,
          row.iv,
          row.auth_tag
        );
      } catch (e) {
        console.error(`Erreur décryptage ${row.provider}:`, e);
      }
    }

    // Vérifier qu'au moins une clé est disponible
    if (Object.keys(apiKeys).length === 0) {
      return res.status(400).json({ 
        error: 'Aucune clé API configurée. Veuillez ajouter au moins une clé pour un provider.' 
      });
    }

    // Vérifier que le provider préféré a une clé
    if (!apiKeys[preferredProvider]) {
      if (autoFallback) {
        console.log(`ℹ️  Provider ${preferredProvider} non configuré, fallback activé`);
      } else {
        return res.status(400).json({ 
          error: `Provider ${preferredProvider} non configuré. Veuillez ajouter une clé ou activer le fallback.` 
        });
      }
    }

    // Appeler l'IA avec fallback
    const response = await callAIWithFallback({
      prompt,
      preferredProvider,
      model,
      apiKeys,
      autoFallback
    });

    res.json({ 
      response,
      providerUsed: response.providerUsed || preferredProvider
    });
  } catch (error) {
    console.error('Erreur appel IA unifié:', error);
    res.status(500).json({ 
      error: error.message || 'Erreur lors de l\'appel IA. Vérifiez vos clés API.' 
    });
  }
});

// Récupérer la liste des providers supportés
router.get('/providers', authenticate, async (req, res) => {
  try {
    const config = getProviderConfig();
    res.json(config);
  } catch (error) {
    console.error('Erreur récupération providers:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// ROUTES UTILITAIRES
// ============================================

// Statistiques des documents d'un utilisateur
router.get('/stats', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    
    const stats = await db.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN type = 'cv' THEN 1 ELSE 0 END) as cv_count,
        SUM(CASE WHEN type = 'offer' THEN 1 ELSE 0 END) as offer_count,
        SUM(CASE WHEN type = 'result' THEN 1 ELSE 0 END) as result_count
      FROM documents 
      WHERE user_id = ?
    `, [userId]);

    res.json(stats);
  } catch (error) {
    console.error('Erreur statistiques:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
