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
// ROUTES DE CONFIGURATION SMTP
// ============================================

// Récupérer la configuration SMTP
router.get('/config', async (req, res) => {
  try {
    const smtpConfig = new SmtpConfig(db);
    const config = await smtpConfig.get();
    
    if (!config) {
      return res.status(404).json({ error: 'Aucune configuration SMTP trouvée' });
    }
    
    // Ne pas renvoyer les données sensibles
    const { pass, refresh_token, access_token, ...safeConfig } = config;
    res.json(safeConfig);
  } catch (error) {
    console.error('Erreur récupération config:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

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
    
    console.log('📧 Sauvegarde configuration SMTP:', { host, port, auth_type, from });
    
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
      console.log('🔄 PKCE réinitialisé après sauvegarde OAuth');
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
    
    console.log(`🔍 Test configuration ${auth_type}...`);
    
    if (auth_type === 'oauth2') {
      // Vérifier que la configuration est complète
      const isComplete = await isConfigurationComplete();
      if (!isComplete) {
        return res.status(400).json({ 
          error: 'Configuration OAuth 2.0 incomplète',
          details: 'Veuillez configurer Client ID, Client Secret et Redirect URI dans l\'interface d\'administration.',
          solution: '1. Remplissez Client ID, Client Secret et Redirect URI\n2. Sauvegardez la configuration\n3. Générez l\'URL d\'autorisation\n4. Échangez le code'
        });
      }

      // Test OAuth 2.0 avec PKCE
      console.log('🔄 Vérification de l\'authentification OAuth...');
      const result = await verifyOAuth2Config();
      
      if (!result.valid) {
        return res.status(401).json({ 
          error: 'Échec de l\'authentification OAuth 2.0',
          details: result.error,
          solution: '1. Vérifiez que Client ID et Client Secret sont corrects\n2. Générez une nouvelle URL d\'autorisation\n3. Obtenez un nouveau code\n4. Échangez le code'
        });
      }
      
      console.log('✅ Authentification OAuth valide');
      
      // Envoyer un email de test
      if (testEmail) {
        try {
          console.log(`📧 Envoi d'un email de test à ${testEmail}...`);
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
             </ul>
             <p>Votre configuration SMTP fonctionne parfaitement !</p>`
          );
          console.log('✅ Email de test envoyé avec succès');
        } catch (emailError) {
          console.error('❌ Erreur envoi email de test:', emailError);
          return res.status(500).json({ 
            error: 'Erreur lors de l\'envoi de l\'email de test',
            details: emailError.message,
            solution: 'Vérifiez que le compte Gmail est correct et que les tokens OAuth sont valides'
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
      
      console.log('🔄 Test de connexion SMTP...');
      
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
      console.log('✅ Connexion SMTP réussie');
      
      if (testEmail) {
        console.log(`📧 Envoi d'un email de test à ${testEmail}...`);
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
        console.log('✅ Email de test envoyé avec succès');
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
    console.error('❌ Erreur test SMTP:', error);
    res.status(500).json({ 
      error: 'Erreur de connexion SMTP',
      details: error.message,
      solution: 'Vérifiez vos identifiants et paramètres de connexion'
    });
  }
});

// ============================================
// ROUTES OAuth 2.0 avec PKCE
// ============================================

// Obtenir l'URL d'autorisation OAuth 2.0 avec PKCE
router.get('/oauth/auth-url', async (req, res) => {
  try {
    console.log('🔐 Génération URL OAuth...');
    
    // 1. Vérifier que la configuration existe
    const smtpConfig = new SmtpConfig(db);
    const config = await smtpConfig.get();
    
    if (!config) {
      return res.status(400).json({ 
        error: 'Configuration SMTP non trouvée',
        details: 'Veuillez d\'abord sauvegarder une configuration avec OAuth 2.0',
        solution: '1. Remplissez tous les champs (Client ID, Client Secret, Redirect URI)\n2. Cliquez sur "Sauvegarder"\n3. Revenez générer l\'URL'
      });
    }

    console.log('✅ Configuration trouvée:', {
      auth_type: config.auth_type,
      hasClientId: !!config.client_id,
      hasClientSecret: !!config.client_secret,
      hasRedirectUri: !!config.redirect_uri
    });

    // 2. Vérifier le type d'authentification
    if (config.auth_type !== 'oauth2') {
      return res.status(400).json({ 
        error: 'Le type d\'authentification n\'est pas OAuth 2.0',
        details: `Type actuel: ${config.auth_type}`,
        solution: 'Sélectionnez "OAuth 2.0 + PKCE" dans le type d\'authentification'
      });
    }

    // 3. Vérifier que les credentials sont présents
    if (!config.client_id) {
      return res.status(400).json({ 
        error: 'Client ID manquant',
        details: 'Le Client ID est requis pour l\'authentification OAuth 2.0',
        solution: '1. Obtenez votre Client ID depuis Google Cloud Console\n2. API et services → Identifiants → ID client OAuth 2.0'
      });
    }

    if (!config.client_secret) {
      return res.status(400).json({ 
        error: 'Client Secret manquant',
        details: 'Le Client Secret est requis pour l\'authentification OAuth 2.0',
        solution: '1. Obtenez votre Client Secret depuis Google Cloud Console\n2. API et services → Identifiants → Afficher le secret'
      });
    }

    // 4. Vérifier le Redirect URI
    if (!config.redirect_uri) {
      return res.status(400).json({ 
        error: 'Redirect URI manquant',
        details: 'L\'URI de redirection est requis pour l\'authentification OAuth 2.0',
        solution: 'Utilisez "urn:ietf:wg:oauth:2.0:oob" pour le mode test'
      });
    }

    console.log('✅ Credentials vérifiés, génération du challenge PKCE...');

    // 5. Réinitialiser l'état PKCE
    resetPKCE();
    
    // 6. Générer l'URL
    const url = await getAuthUrl();
    const pkceStatus = getPKCEStatus();
    
    console.log('✅ URL générée avec succès');
    
    res.json({ 
      success: true,
      url,
      pkce: {
        enabled: true,
        method: 'S256',
        status: pkceStatus
      },
      message: 'URL d\'autorisation générée avec succès. Ouvrez-la dans votre navigateur et autorisez l\'accès.',
      instructions: '1. Ouvrez l\'URL dans un navigateur\n2. Connectez-vous avec votre compte Google\n3. Autorisez l\'accès\n4. Copiez le code affiché\n5. Revenez et collez le code dans "Code d\'autorisation"'
    });
  } catch (error) {
    console.error('❌ Erreur génération URL OAuth:', error);
    
    // Messages d'erreur plus précis
    let errorMessage = 'Erreur lors de la génération de l\'URL d\'autorisation';
    let solution = 'Vérifiez votre configuration';
    let details = error.message;
    
    if (error.message.includes('Configuration SMTP non trouvée')) {
      errorMessage = 'Configuration SMTP non trouvée';
      solution = 'Sauvegardez d\'abord une configuration avec OAuth 2.0 dans l\'interface d\'administration';
      details = 'Aucune configuration SMTP n\'existe en base de données';
    } else if (error.message.includes('Client ID')) {
      errorMessage = 'Client ID invalide ou manquant';
      solution = 'Vérifiez que vous avez copié le Client ID correctement depuis la Google Cloud Console';
      details = 'Le Client ID ne doit pas être vide et doit être au format correct (ex: xxx.apps.googleusercontent.com)';
    } else if (error.message.includes('Client Secret')) {
      errorMessage = 'Client Secret invalide ou manquant';
      solution = 'Vérifiez que vous avez copié le Client Secret correctement depuis la Google Cloud Console';
      details = 'Le Client Secret doit commencer par "GOCSPX-"';
    } else if (error.message.includes('redirect')) {
      errorMessage = 'Redirect URI invalide';
      solution = 'Vérifiez que le Redirect URI correspond à celui enregistré dans la Google Cloud Console';
      details = 'Le Redirect URI doit être "urn:ietf:wg:oauth:2.0:oob" ou une URL HTTPS valide';
    } else if (error.message.includes('API non activée')) {
      errorMessage = 'Gmail API non activée';
      solution = 'Activez la Gmail API dans la Google Cloud Console (API et services → Bibliothèque)';
      details = 'L\'API Gmail doit être activée pour utiliser OAuth 2.0';
    } else if (error.message.includes('consent screen')) {
      errorMessage = 'Écran de consentement OAuth non configuré';
      solution = 'Configurez l\'écran de consentement OAuth dans la Google Cloud Console';
      details = 'L\'écran de consentement doit être configuré avec les scopes gmail.send et gmail.compose';
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: details,
      solution: solution,
      suggestion: 'Vérifiez les logs du serveur pour plus de détails'
    });
  }
});

// Échanger le code d'autorisation OAuth contre des tokens (avec PKCE)
router.post('/oauth/exchange', async (req, res) => {
  try {
    const { code } = req.body;
    const adminId = req.userId;
    
    console.log('🔄 Échange du code OAuth...');
    
    if (!code) {
      return res.status(400).json({ 
        error: 'Code d\'autorisation requis',
        details: 'Le code d\'autorisation est nécessaire pour échanger contre des tokens',
        solution: '1. Générez l\'URL d\'autorisation\n2. Autorisez l\'accès dans Google\n3. Copiez le code affiché\n4. Collez-le ici'
      });
    }
    
    // Vérifier la longueur du code
    if (code.length < 10) {
      return res.status(400).json({ 
        error: 'Code d\'autorisation invalide',
        details: 'Le code semble trop court. Le code doit contenir environ 100 caractères.',
        solution: 'Assurez-vous d\'avoir copié le code complet de la page Google'
      });
    }
    
    console.log(`📝 Code reçu (${code.length} caractères)`);
    
    const tokens = await exchangeOAuthCode(code);
    
    console.log('✅ Tokens OAuth obtenus avec succès');
    
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
      message: '✅ Tokens OAuth obtenus avec succès (PKCE)',
      tokens: {
        access_token: tokens.access_token ? '***' : null,
        refresh_token: tokens.refresh_token ? '***' : null,
        expiry_date: tokens.expiry_date
      },
      nextSteps: '1. Cliquez sur "Tester la configuration" pour vérifier\n2. Envoyez un email de test pour confirmer'
    });
  } catch (error) {
    console.error('❌ Erreur échange code OAuth:', error);
    
    let errorMessage = 'Erreur lors de l\'échange du code OAuth';
    let solution = 'Vérifiez le code et réessayez';
    
    if (error.message.includes('PKCE verifier')) {
      errorMessage = 'Verifier PKCE manquant ou expiré';
      solution = 'Générez une nouvelle URL d\'autorisation (le verifier est automatiquement généré)';
    } else if (error.message.includes('invalid_grant')) {
      errorMessage = 'Code invalide ou expiré';
      solution = '1. Le code expire après 10 minutes\n2. Générez une nouvelle URL\n3. Obtenez un nouveau code\n4. Réessayez';
    } else if (error.message.includes('redirect_uri')) {
      errorMessage = 'Redirect URI ne correspond pas';
      solution = 'Vérifiez que le Redirect URI configuré correspond à celui de la Google Cloud Console';
    } else if (error.message.includes('client_id')) {
      errorMessage = 'Client ID invalide';
      solution = 'Vérifiez que le Client ID est correctement configuré';
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: error.message,
      solution: solution
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
    let authType = 'none';
    let hasTokens = false;
    let hasClientId = false;
    let hasClientSecret = false;
    let hasRedirectUri = false;
    
    if (config) {
      isConfigured = true;
      authType = config.auth_type;
      hasClientId = !!config.client_id;
      hasClientSecret = !!config.client_secret;
      hasRedirectUri = !!config.redirect_uri;
      hasTokens = !!(config.access_token && config.refresh_token);
      
      if (config.auth_type === 'oauth2') {
        if (!hasClientId || !hasClientSecret) {
          status = 'incomplete_credentials';
          details = 'Client ID ou Client Secret manquant';
        } else if (!hasTokens) {
          status = 'no_tokens';
          details = 'Tokens OAuth non obtenus. Générez l\'URL et échangez le code.';
        } else {
          const result = await verifyOAuth2Config();
          status = result.valid ? 'valid' : 'invalid';
          details = result.error || null;
          pkceStatus = getPKCEStatus();
        }
      } else {
        status = 'password_configured';
        details = 'Configuration SMTP avec mot de passe';
      }
    }
    
    res.json({ 
      status,
      isConfigured,
      authType,
      details,
      hasClientId,
      hasClientSecret,
      hasRedirectUri,
      hasTokens,
      pkce: {
        enabled: true,
        method: 'S256',
        status: pkceStatus || {
          hasChallenge: false,
          hasVerifier: false,
          hasStoredVerifier: false
        }
      },
      nextSteps: status === 'valid' ? '✅ Configuration OAuth 2.0 prête à être utilisée' :
                 status === 'no_tokens' ? '🔄 Générez l\'URL d\'autorisation et échangez le code' :
                 status === 'incomplete_credentials' ? '📝 Complétez Client ID et Client Secret' :
                 status === 'not_configured' ? '📝 Configurez d\'abord le SMTP avec OAuth 2.0' :
                 status === 'password_configured' ? '📝 Changez le type d\'authentification vers OAuth 2.0' :
                 '❌ Vérifiez votre configuration'
    });
  } catch (error) {
    console.error('❌ Erreur vérification statut OAuth:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la vérification',
      details: error.message
    });
  }
});

// Réinitialiser l'état PKCE
router.post('/oauth/reset-pkce', async (req, res) => {
  try {
    resetPKCE();
    res.json({ 
      success: true, 
      message: 'État PKCE réinitialisé avec succès',
      nextSteps: 'Vous pouvez maintenant générer une nouvelle URL d\'autorisation'
    });
  } catch (error) {
    console.error('❌ Erreur réinitialisation PKCE:', error);
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
    
    res.json({ 
      message: 'Configuration SMTP supprimée avec succès',
      nextSteps: 'Vous pouvez maintenant créer une nouvelle configuration'
    });
  } catch (error) {
    console.error('❌ Erreur suppression config:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// ROUTE POUR LES MODÈLES D'EMAIL
// ============================================

// Récupérer les modèles d'email (déplacé depuis email.js pour centralisation)
router.get('/email/templates', async (req, res) => {
  try {
    const templates = [
      {
        id: 'welcome',
        name: 'Bienvenue',
        subject: 'Bienvenue sur AI Optimiseur ! 🎯',
        message: `Bonjour [NOM],

Bienvenue sur AI Optimiseur, votre assistant intelligent pour optimiser vos candidatures !

Pour commencer, connectez-vous et entrez votre clé API pour utiliser tous nos outils d'optimisation.

L'équipe AI Optimiseur`
      },
      {
        id: 'newsletter',
        name: 'Newsletter - Nouvelles fonctionnalités',
        subject: 'Nouvelles fonctionnalités disponibles !',
        message: `Bonjour [NOM],

Nous sommes ravis de vous annoncer les dernières améliorations de AI Optimiseur :

- Nouvel outil de détection de signaux d'alarme
- Amélioration de l'analyse ATS
- Interface plus intuitive

Découvrez toutes ces nouveautés en vous connectant dès maintenant !

L'équipe AI Optimiseur`
      },
      {
        id: 'inactive',
        name: 'Utilisateur inactif',
        subject: 'Nous vous avons manqué ?',
        message: `Bonjour [NOM],

Nous avons remarqué que vous n'avez pas utilisé AI Optimiseur depuis un certain temps.

Nous avons ajouté de nouvelles fonctionnalités qui pourraient vous intéresser :
- Réécriture complète du CV
- Préparation aux entretiens
- Lettres de motivation personnalisées

Revenez nous voir !

L'équipe AI Optimiseur`
      },
      {
        id: 'maintenance',
        name: 'Maintenance planifiée',
        subject: 'Maintenance planifiée',
        message: `Bonjour [NOM],

Nous vous informons qu'une maintenance du service AI Optimiseur est prévue le [DATE].

Le service sera indisponible pendant environ 2 heures.

Nous vous remercions de votre compréhension.

L'équipe AI Optimiseur`
      }
    ];
    
    res.json(templates);
  } catch (error) {
    console.error('❌ Erreur récupération templates:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
