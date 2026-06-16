import { User } from '../models/User.js';
import { initializeDatabase } from '../database.js';

let db;

(async () => {
  db = await initializeDatabase();
})();

export async function isAdmin(req, res, next) {
  try {
    const userModel = new User(db);
    const user = await userModel.findById(req.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'Utilisateur non trouvé' });
    }
    
    if (!user.is_admin) {
      return res.status(403).json({ error: 'Accès administrateur requis' });
    }
    
    if (!user.is_active) {
      return res.status(403).json({ error: 'Compte désactivé' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}
