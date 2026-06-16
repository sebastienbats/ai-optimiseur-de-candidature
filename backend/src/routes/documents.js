import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { Document } from '../models/Document.js';
import { initializeDatabase } from '../database.js';
import { encrypt, decrypt } from '../services/encryption.js';
import { callClaude } from '../services/claudeService.js';

const router = express.Router();
let db;

(async () => {
  db = await initializeDatabase();
})();

// Sauvegarder un document
router.post('/save', authenticate, async (req, res) => {
  try {
    const { title, content, type } = req.body;
    const userId = req.userId;

    if (!title || !content || !type) {
      return res.status(400).json({ error: 'Titre, contenu et type requis' });
    }

    const documentModel = new Document(db);
    const docId = await documentModel.save(userId, title, content, type);

    res.status(201).json({ id: docId, message: 'Document sauvegardé' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les documents d'un utilisateur
router.get('/user', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const documentModel = new Document(db);
    const documents = await documentModel.getByUser(userId);
    res.json(documents);
  } catch (error) {
    console.error(error);
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
    res.json({ message: 'Document supprimé' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Sauvegarder la clé API
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

    res.json({ message: 'Clé API sauvegardée' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer la clé API
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
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Appeler Claude
router.post('/claude', authenticate, async (req, res) => {
  try {
    const { prompt } = req.body;
    const userId = req.userId;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt requis' });
    }

    // Récupérer la clé API de l'utilisateur
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
    console.error(error);
    res.status(500).json({ error: error.message || 'Erreur lors de l\'appel à Claude' });
  }
});

export default router;
