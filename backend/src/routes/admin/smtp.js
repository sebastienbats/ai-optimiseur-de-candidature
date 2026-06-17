import express from 'express';
import nodemailer from 'nodemailer';
import { SmtpConfig } from '../../models/SmtpConfig.js';
import { AdminLog } from '../../models/AdminLog.js';
import { initializeDatabase } from '../../database.js';
import { 
  oauth2Service, 
  getAuthUrl, 
  exchangeOAuthCode, 
  verifyOAuth2Config,
  getPKCEStatus,
  resetPKCE
} from '../../services/oauth2Service.js';
import { sendEmail } from '../../services/emailService.js';

const router = express.Router();
let db;

(async () => {
  db = await initializeDatabase();
})();

// ============================================
// CONFIGURATION SMTP (PASSWORD)
// ============================================

// Sauvegarder la configuration SMTP
router.post('/config', async (req, res) => {
  try {
    const { 
      host, 
      port, 
      secure, 
      user, 
      pass, 
      from,
      auth_type = 'password',
      client_id = null,
      client_secret = null,
      redirect_uri = null
    } = req.body;
    const adminId = req.userId;
    
    // Validation selon le type d'authentification
    if (auth_type === 'password') {
      if (!host || !port || !user || !pass || !from) {
        return res.status(400).json({ 
          error: 'Tous les champs sont requis: host, port, user, pass, from' 
        });
      }
    } else if (auth_type === 'oauth2') {
      if (!host || !port || !from || !client_id || !client_secret) {
        return res.status(400).json({ 
          error: 'Pour OAuth 2.0: host, port, from, client_id et client_secret sont requis' 
        });
      }
    } else {
      return res.status(400).json({ error: 'Type d\'authentification non supporté' });
    }
    
    const smtpConfig = new SmtpConfig(db);
    await smtpConfig.save({
      host,
      port: parseInt(port),
      secure: secure === true || secure === 'true',
      user: user || null,
      pass: pass || null,
      from,
      auth_type,
      client_id,
      client_secret,
      redirect_uri: redirect_uri || 'urn:ietf:wg:oauth:2.0:oob'
    });
    
    // Si OAuth, réinitialiser PKCE après la sauvegarde
    if (auth_type === 'oauth2') {
      resetPKCE();
    }
    
    const adminLog = new AdminLog(db);
    await adminLog.create(
      adminId,
      'SMTP_CONFIG_UPDATED',
      { host, port, from, auth_type },
      req.ip
    );
    
    res.json({ 
      message: `Configuration SMTP (${auth_type}) sauvegardée avec succès`,
      auth_type
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Tester la configuration SMTP
router.post('/test', async (req, res) => {
  try {
    const { host, port, secure, user, pass, from, testEmail, auth_type = 'password' } = req.body;
    const adminId = req.userId;
    
    if (auth_type === 'oauth2') {
      // Test OAuth 2.0 avec PKCE
      const result = await verifyOAuth2Config();
      if (!result.valid) {
        return res.status(401).json({ 
          error: `Échec de l'authentification OAuth 2.0: ${result.error}` 
        });
      }
      
      // Envoyer un email de test
      if (testEmail) {
        await oauth2Service.sendEmail(
          testEmail,
          'Test OAuth 2.0 + PKCE - AI Optimiseur',
          `<h2>✅ Test OAuth 2.0 avec PKCE réussi</h2>
           <p>Ceci est un email de test envoyé avec OAuth 2.0 et PKCE.</p>
           <p>Configuration :</p>
           <ul>
             <li>Hôte : ${host}</li>
             <li>Port : ${port}</li>
             <li>From : ${from}</li>
             <li>Authentification : OAuth 2.0</li>
             <li>PKCE : Activé ✅</li>
           </ul>`
        );
      }
      
      const adminLog = new AdminLog(db);
      await adminLog.create(
        adminId,
        'SMTP_OAUTH_TESTED',
        { host, port, from, testEmail },
        req.ip
      );
      
      res.json({ 
        success: true, 
        message: '✅ Authentification OAuth 2.0 réussie (PKCE activé)' 
      });
      
    } else {
      // Test SMTP standard (password)
      if (!host || !port || !user || !pass || !from) {
        return res.status(400).json({ 
          error: 'Tous les champs sont requis pour le test' 
        });
      }
      
      const transporter = nodemailer.createTransport({
        host,
        port: parseInt(port),
        secure: secure === true || secure === 'true',
        auth: {
          user,
          pass
        },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 5000
      });
      
      await transporter.verify();
      
      if (testEmail) {
        await transporter.sendMail({
          from,
          to: testEmail,
          subject: 'Test SMTP - AI Optimiseur',
          html: `<h2>✅ Test SMTP réussi</h2>
                 <p>Ceci est un email de test envoyé avec SMTP standard.</p>
                 <p>Configuration :</p>
                 <ul>
                   <li>Hôte : ${host}</li>
                   <li>Port : ${port}</li>
                   <li>From : ${from}</li>
                   <li>Authentification : Mot de passe</li>
                 </ul>`
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
    }
  } catch (error) {
    console.error('Erreur test SMTP:', error);
    res.status(500).json({ 
      error: `Erreur de connexion: ${error.message}` 
    });
  }
});

// ============================================
// ROUTES OAuth 2.0 avec PKCE
// ============================================

// Obtenir l'URL d'autorisation OAuth 2.0 avec PKCE
router.get('/oauth/auth-url', async (req, res) => {
  try {
    // Réinitialiser l'état PKCE avant de générer une nouvelle URL
    resetPKCE();
    
    const url = await getAuthUrl();
    const pkceStatus = getPKCEStatus();
    
    res.json({ 
      url,
      pkce: {
        enabled: true,
        method: 'S256',
        status: pkceStatus
      }
    });
  } catch (error) {
    console.error('Erreur génération URL OAuth:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la génération de l\'URL d\'autorisation',
      details: error.message
    });
  }
});

// Échanger le code d'autorisation OAuth contre des tokens (avec PKCE)
router.post('/oauth/exchange', async (req, res) => {
  try {
    const { code } = req.body;
    const adminId = req.userId;
    
    if (!code) {
      return res.status(400).json({ error: 'Code d\'autorisation requis' });
    }
    
    const tokens = await exchangeOAuthCode(code);
    
    const adminLog = new AdminLog(db);
    await adminLog.create(
      adminId,
      'OAUTH_EXCHANGE_COMPLETED',
      { 
        success: true,
        pkceEnabled: true
      },
      req.ip
    );
    
    res.json({ 
      success: true, 
      message: 'Tokens OAuth obtenus avec succès (PKCE)',
      tokens: {
        access_token: tokens.access_token ? '***' : null,
        refresh_token: tokens.refresh_token ? '***' : null,
        expiry_date: tokens.expiry_date
      }
    });
  } catch (error) {
    console.error('Erreur échange code OAuth:', error);
    res.status(500).json({ 
      error: 'Erreur lors de l\'échange du code OAuth',
      details: error.message
    });
  }
});

// Vérifier l'état de l'authentification OAuth
router.get('/oauth/status', async (req, res) => {
  try {
    const smtpConfig = new SmtpConfig(db);
    const isConfigured = await smtpConfig.isOAuthConfigured();
    let status = 'not_configured';
    let details = null;
    let pkceStatus = null;
    
    if (isConfigured) {
      const result = await verifyOAuth2Config();
      status = result.valid ? 'valid' : 'invalid';
      details = result.error || null;
      pkceStatus = getPKCEStatus();
    }
    
    res.json({ 
      status,
      isConfigured,
      details,
      pkce: {
        enabled: true,
        method: 'S256',
        status: pkceStatus
      }
    });
  } catch (error) {
    console.error('Erreur vérification statut OAuth:', error);
    res.status(500).json({ error: 'Erreur lors de la vérification' });
  }
});

// Réinitialiser l'état PKCE
router.post('/oauth/reset-pkce', async (req, res) => {
  try {
    resetPKCE();
    res.json({ 
      success: true, 
      message: 'État PKCE réinitialisé avec succès' 
    });
  } catch (error) {
    console.error('Erreur réinitialisation PKCE:', error);
    res.status(500).json({ error: 'Erreur lors de la réinitialisation' });
  }
});

// Supprimer la configuration SMTP
router.delete('/config', async (req, res) => {
  try {
    const adminId = req.userId;
    const smtpConfig = new SmtpConfig(db);
    await smtpConfig.delete();
    
    // Réinitialiser PKCE
    resetPKCE();
    
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
