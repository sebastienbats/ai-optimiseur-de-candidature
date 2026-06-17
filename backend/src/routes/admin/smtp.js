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
  resetPKCE,
  isConfigurationComplete
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
      if (!host || !port || !from) {
        return res.status(400).json({ 
          error: 'Pour OAuth 2.0: host, port et from sont requis' 
        });
      }
      if (!client_id || !client_secret) {
        return res.status(400).json({ 
          error: 'Pour OAuth 2.0: client_id et client_secret sont requis' 
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
      client_id: client_id || null,
      client_secret: client_secret || null,
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
    console.error('Erreur sauvegarde config:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Tester la configuration SMTP
router.post('/test', async (req, res) => {
  try {
    const { host, port, secure, user, pass, from, testEmail, auth_type = 'password' } = req.body;
    const adminId = req.userId;
    
    if (auth_type === 'oauth2') {
      // Vérifier que la configuration est complète
      const isComplete = await isConfigurationComplete();
      if (!isComplete) {
        return res.status(400).json({ 
          error: 'Configuration OAuth 2.0 incomplète. Veuillez configurer Client ID, Client Secret et Redirect URI.' 
        });
      }

      // Test OAuth 2.0 avec PKCE
      const result = await verifyOAuth2Config();
      if (!result.valid) {
        return res.status(401).json({ 
          error: `Échec de l'authentification OAuth 2.0: ${result.error}` 
        });
      }
      
      // Envoyer un email de test
      if (testEmail) {
        try {
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
        } catch (emailError) {
          return res.status(500).json({ 
            error: `Erreur lors de l'envoi de l'email de test: ${emailError.message}` 
          });
        }
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
        message: testEmail ? '✅ Email de test envoyé avec OAuth 2.0 + PKCE' : '✅ Authentification OAuth 2.0 réussie (PKCE activé)' 
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
    // Vérifier que la configuration existe
    const smtpConfig = new SmtpConfig(db);
    const config = await smtpConfig.get();
    
    if (!config) {
      return res.status(400).json({ 
        error: 'Aucune configuration SMTP trouvée. Veuillez d\'abord configurer SMTP avec OAuth 2.0.',
        details: 'Sauvegardez d\'abord une configuration avec OAuth 2.0 avant de générer l\'URL d\'autorisation.'
      });
    }

    if (config.auth_type !== 'oauth2') {
      return res.status(400).json({ 
        error: 'La configuration actuelle n\'utilise pas OAuth 2.0.',
        details: 'Veuillez sélectionner OAuth 2.0 dans le type d\'authentification.'
      });
    }

    // Vérifier que les credentials sont présents
    if (!config.client_id || !config.client_secret) {
      return res.status(400).json({ 
        error: 'Client ID et Client Secret requis.',
        details: 'Veuillez configurer Client ID et Client Secret dans l\'interface d\'administration.'
      });
    }

    // Réinitialiser l'état PKCE avant de générer une nouvelle URL
    resetPKCE();
    
    const url = await getAuthUrl();
    const pkceStatus = getPKCEStatus();
    
    res.json({ 
      success: true,
      url,
      pkce: {
        enabled: true,
        method: 'S256',
        status: pkceStatus
      },
      message: 'URL d\'autorisation générée avec succès. Ouvrez-la dans votre navigateur.'
    });
  } catch (error) {
    console.error('Erreur génération URL OAuth:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la génération de l\'URL d\'autorisation',
      details: error.message,
      suggestion: 'Vérifiez que Client ID et Client Secret sont correctement configurés.'
    });
  }
});

// Échanger le code d'autorisation OAuth contre des tokens (avec PKCE)
router.post('/oauth/exchange', async (req, res) => {
  try {
    const { code } = req.body;
    const adminId = req.userId;
    
    if (!code) {
      return res.status(400).json({ 
        error: 'Code d\'autorisation requis',
        details: 'Le code d\'autorisation est nécessaire pour échanger contre des tokens.'
      });
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
      details: error.message,
      suggestion: 'Vérifiez que le code d\'autorisation est valide et non expiré.'
    });
  }
});

// Vérifier l'état de l'authentification OAuth
router.get('/oauth/status', async (req, res) => {
  try {
    const smtpConfig = new SmtpConfig(db);
    const config = await smtpConfig.get();
    
    let status = 'not_configured';
    let isConfigured = false;
    let details = null;
    let pkceStatus = null;
    
    if (config) {
      isConfigured = true;
      if (config.auth_type === 'oauth2') {
        status = 'oauth_configured';
        if (config.client_id && config.client_secret) {
          const result = await verifyOAuth2Config();
          status = result.valid ? 'valid' : 'invalid';
          details = result.error || null;
          pkceStatus = getPKCEStatus();
        } else {
          status = 'incomplete_credentials';
          details = 'Client ID ou Client Secret manquant';
        }
      } else {
        status = 'password_configured';
        details = 'Configuration SMTP avec mot de passe';
      }
    }
    
    res.json({ 
      status,
      isConfigured,
      details,
      authType: config?.auth_type || 'none',
      pkce: {
        enabled: true,
        method: 'S256',
        status: pkceStatus
      },
      hasClientId: !!(config?.client_id),
      hasClientSecret: !!(config?.client_secret)
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
