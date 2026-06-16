import express from 'express';
import { User } from '../../models/User.js';
import { AdminLog } from '../../models/AdminLog.js';
import { initializeDatabase } from '../../database.js';
import { sendBulkEmail, formatTemplate } from '../../services/emailService.js';

const router = express.Router();
let db;

(async () => {
  db = await initializeDatabase();
})();

// Envoyer un email à une sélection d'utilisateurs
router.post('/send', async (req, res) => {
  try {
    const { 
      subject, 
      message, 
      userIds = [], 
      sendToAll = false
    } = req.body;
    
    const adminId = req.userId;
    
    if (!subject || !message) {
      return res.status(400).json({ error: 'Sujet et message requis' });
    }
    
    let recipients = [];
    const userModel = new User(db);
    
    if (sendToAll) {
      // Récupérer tous les utilisateurs actifs
      const result = await userModel.getAllUsers(1, 999999);
      recipients = result.users.filter(u => u.is_active);
    } else if (userIds.length > 0) {
      // Récupérer les utilisateurs sélectionnés
      const placeholders = userIds.map(() => '?').join(',');
      recipients = await db.all(
        `SELECT id, email FROM users WHERE id IN (${placeholders}) AND is_active = 1`,
        userIds
      );
    } else {
      return res.status(400).json({ error: 'Aucun destinataire spécifié' });
    }
    
    if (recipients.length === 0) {
      return res.status(400).json({ error: 'Aucun destinataire valide' });
    }
    
    // Envoyer les emails avec personnalisation
    const emailPromises = recipients.map(recipient => {
      const personalizedMessage = formatTemplate(message, { 
        NOM: recipient.email.split('@')[0] 
      });
      const personalizedSubject = formatTemplate(subject, { 
        NOM: recipient.email.split('@')[0] 
      });
      
      return sendBulkEmail(
        [recipient.email],
        personalizedSubject,
        personalizedMessage
      );
    });
    
    const results = await Promise.all(emailPromises);
    const successCount = results.reduce((sum, r) => sum + r.success, 0);
    const failedCount = results.reduce((sum, r) => sum + r.failed, 0);
    
    const adminLog = new AdminLog(db);
    await adminLog.create(
      adminId,
      'BULK_EMAIL_SENT',
      {
        recipients: recipients.length,
        sent: successCount,
        failed: failedCount,
        subject
      },
      req.ip
    );
    
    res.json({
      message: `${successCount} emails envoyés avec succès`,
      total: recipients.length,
      success: successCount,
      failed: failedCount
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi des emails' });
  }
});

// Modèles d'email prédéfinis
router.get('/templates', async (req, res) => {
  try {
    const templates = [
      {
        id: 'welcome',
        name: 'Bienvenue',
        subject: 'Bienvenue sur Skill Claude ! 🎯',
        message: `Bonjour [NOM],

Bienvenue sur Skill Claude, votre assistant pour optimiser vos candidatures !

Pour commencer, connectez-vous et entrez votre clé API Anthropic pour utiliser tous nos outils d'optimisation.

L'équipe Skill Claude`
      },
      {
        id: 'newsletter',
        name: 'Newsletter - Nouvelles fonctionnalités',
        subject: 'Nouvelles fonctionnalités disponibles !',
        message: `Bonjour [NOM],

Nous sommes ravis de vous annoncer les dernières améliorations de Skill Claude :

- Nouvel outil de détection de signaux d'alarme
- Amélioration de l'analyse ATS
- Interface plus intuitive

Découvrez toutes ces nouveautés en vous connectant dès maintenant !

L'équipe Skill Claude`
      },
      {
        id: 'inactive',
        name: 'Utilisateur inactif',
        subject: 'Nous vous avons manqué ?',
        message: `Bonjour [NOM],

Nous avons remarqué que vous n'avez pas utilisé Skill Claude depuis un certain temps.

Nous avons ajouté de nouvelles fonctionnalités qui pourraient vous intéresser :
- Réécriture complète du CV
- Préparation aux entretiens
- Lettres de motivation personnalisées

Revenez nous voir !

L'équipe Skill Claude`
      },
      {
        id: 'maintenance',
        name: 'Maintenance planifiée',
        subject: 'Maintenance planifiée',
        message: `Bonjour [NOM],

Nous vous informons qu'une maintenance du service Skill Claude est prévue le [DATE].

Le service sera indisponible pendant environ 2 heures.

Nous vous remercions de votre compréhension.

L'équipe Skill Claude`
      }
    ];
    
    res.json(templates);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
