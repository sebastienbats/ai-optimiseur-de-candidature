import express from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { initializeDatabase } from '../database.js';

const router = express.Router();
let db;

(async () => {
  db = await initializeDatabase();
})();

// Inscription
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
    }

    const userModel = new User(db);
    const existingUser = await userModel.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Cet email est déjà utilisé' });
    }

    const userId = await userModel.create(email, password);
    const user = await userModel.findById(userId);
    
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, is_admin: !!user.is_admin }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Connexion
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const userModel = new User(db);
    const user = await userModel.findByEmail(email);
    
    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Compte désactivé' });
    }

    const isValid = await userModel.validatePassword(user, password);
    if (!isValid) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { 
        id: user.id, 
        email: user.email, 
        is_admin: !!user.is_admin,
        is_active: !!user.is_active
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
