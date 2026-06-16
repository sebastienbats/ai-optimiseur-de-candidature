import express from 'express';
import nodemailer from 'nodemailer';
import { SmtpConfig } from '../../models/SmtpConfig.js';
import { AdminLog } from '../../models/AdminLog.js';
import { initializeDatabase } from '../../database.js';

const router = express.Router();
let db;

(async () => {
  db = await initializeDatabase();
})();

// Récupérer la configuration SMTP
router.get('/config', async (req, res) => {
  try {
    const smtpConfig = new SmtpConfig(db);
    const config = await smtpConfig.get();
    
    if (!config) {
      return res.status(404).json({ error: 'Aucune configuration SMTP trouvée' });
    }
    
    // Ne pas renvoyer le mot de passe
    const { pass, ...safeConfig } = config;
    res.json(safeConfig);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Sauvegarder la configuration SMTP
router.post('/config', async (req, res) => {
  try {
    const { host, port, secure, user, pass, from } = req.body;
    const adminId = req.userId;
    
    // Validation
    if (!host || !port || !user || !pass || !from) {
      return res.status(400).json({ 
        error: 'Tous les champs sont requis: host, port, user, pass, from' 
      });
    }
    
    const smtpConfig = new SmtpConfig(db);
    await smtpConfig.save({
      host,
      port: parseInt(port),
      secure: secure === true || secure === 'true',
      user,
      pass,
      from
    });
    
    const adminLog = new AdminLog(db);
    await adminLog.create(
      adminId,
      'SMTP_CONFIG_UPDATED',
      { host, port, from },
      req.ip
    );
    
    res.json({ message: 'Configuration SMTP sauvegardée avec succès' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Tester la configuration SMTP
router.post('/test', async (req, res) => {
  try {
    const { host, port, secure, user, pass, from, testEmail } = req.body;
    const adminId = req.userId;
    
    if (!host || !port || !user || !pass || !from) {
      return res.status(400).json({ 
        error: 'Tous les champs sont requis pour le test' 
      });
    }
    
    // Créer un transporteur pour le test
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port),
      secure: secure === true || secure === 'true',
      auth: {
        user,
        pass
      },
      // Timeout pour ne pas bloquer trop longtemps
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000
    });
    
    // Vérifier la connexion
    await transporter.verify();
    
    // Si un email de test est fourni, envoyer un email de test
    if (testEmail) {
      await transporter.sendMail({
        from,
        to: testEmail,
        subject: '🔧 Test de configuration SMTP - Skill Claude',
        html: `
          <h2>✅ Configuration SMTP réussie !</h2>
          <p>Ceci est un email de test envoyé depuis Skill Claude.</p>
          <p>Configuration :</p>
          <ul>
            <li>Hôte : ${host}</li>
            <li>Port : ${port}</li>
            <li>Secure : ${secure ? 'Oui' : 'Non'}</li>
            <li>From : ${from}</li>
          </ul>
          <p>L'administration de Skill Claude est maintenant prête à envoyer des emails.</p>
        `,
        text: `Test de configuration SMTP - Skill Claude\n\nConfiguration:\nHôte: ${host}\nPort: ${port}\nSecure: ${secure ? 'Oui' : 'Non'}\nFrom: ${from}\n\nL'administration de Skill Claude est maintenant prête à envoyer des emails.`
      });
    }
    
    const adminLog = new AdminLog(db);
    await adminLog.create(
      adminId,
      'SMTP_TESTED',
      { host, port, from, testEmail },
      req.ip
    );
    
    res.json({ 
      success: true, 
      message: testEmail ? 'Email de test envoyé avec succès' : 'Connexion SMTP réussie' 
    });
  } catch (error) {
    console.error('Erreur test SMTP:', error);
    res.status(500).json({ 
      error: 'Erreur de connexion SMTP: ' + error.message 
    });
  }
});

// Supprimer la configuration SMTP
router.delete('/config', async (req, res) => {
  try {
    const adminId = req.userId;
    const smtpConfig = new SmtpConfig(db);
    await smtpConfig.delete();
    
    const adminLog = new AdminLog(db);
    await adminLog.create(
      adminId,
      'SMTP_CONFIG_DELETED',
      {},
      req.ip
    );
    
    res.json({ message: 'Configuration SMTP supprimée' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
