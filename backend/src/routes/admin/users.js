import express from 'express';
import { User } from '../../models/User.js';
import { AdminLog } from '../../models/AdminLog.js';
import { initializeDatabase } from '../../database.js';

const router = express.Router();
let db;

(async () => {
  db = await initializeDatabase();
})();

// Liste des utilisateurs
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const userModel = new User(db);
    const result = await userModel.getAllUsers(parseInt(page), parseInt(limit));
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Statistiques utilisateurs
router.get('/users/stats', async (req, res) => {
  try {
    const userModel = new User(db);
    const stats = await userModel.getUserStats();
    const recentSignups = await userModel.getRecentSignups(7);
    res.json({ stats, recentSignups });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Activer/Désactiver un utilisateur
router.patch('/users/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body;
    const adminId = req.userId;
    
    const userModel = new User(db);
    await userModel.toggleActive(id, active);
    
    const adminLog = new AdminLog(db);
    await adminLog.create(
      adminId,
      active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      { userId: id, active },
      req.ip
    );
    
    res.json({ message: `Utilisateur ${active ? 'activé' : 'désactivé'} avec succès` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un utilisateur
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.userId;
    
    // Empêcher la suppression de son propre compte
    if (parseInt(id) === adminId) {
      return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
    }
    
    const userModel = new User(db);
    await userModel.deleteUser(id);
    
    const adminLog = new AdminLog(db);
    await adminLog.create(
      adminId,
      'USER_DELETED',
      { userId: id },
      req.ip
    );
    
    res.json({ message: 'Utilisateur supprimé avec succès' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mettre à jour le statut admin
router.patch('/users/:id/admin', async (req, res) => {
  try {
    const { id } = req.params;
    const { isAdmin } = req.body;
    const adminId = req.userId;
    
    // Empêcher la modification de son propre statut admin
    if (parseInt(id) === adminId) {
      return res.status(400).json({ error: 'Vous ne pouvez pas modifier votre propre statut admin' });
    }
    
    const userModel = new User(db);
    await userModel.updateAdminStatus(id, isAdmin);
    
    const adminLog = new AdminLog(db);
    await adminLog.create(
      adminId,
      isAdmin ? 'USER_PROMOTED' : 'USER_DEMOTED',
      { userId: id, isAdmin },
      req.ip
    );
    
    res.json({ message: `Statut admin ${isAdmin ? 'accordé' : 'retiré'} avec succès` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Journal d'administration
router.get('/logs', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const adminLog = new AdminLog(db);
    const logs = await adminLog.getLogs(
      parseInt(limit),
      parseInt(offset)
    );
    res.json(logs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
