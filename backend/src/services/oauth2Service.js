import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import pkceChallenge from 'pkce-challenge';
import { SmtpConfig } from '../models/SmtpConfig.js';
import { initializeDatabase } from '../database.js';

let db;

(async () => {
  db = await initializeDatabase();
})();

/**
 * Service OAuth 2.0 avec PKCE (Proof Key for Code Exchange)
 * Implémente la sécurité renforcée pour OAuth 2.0
 * 
 * PKCE (RFC 7636) protège contre les attaques par interception
 * en utilisant un code_verifier généré aléatoirement et un code_challenge
 * calculé avec SHA-256 (S256).
 */
export class OAuth2Service {
  constructor() {
    this.oauth2Client = null;
    this.config = null;
    this.initialized = false;
    this.pkceChallenge = null;
    this.pkceVerifier = null;
    this._pendingVerifier = null;
  }

  /**
   * Initialise le client OAuth 2.0 avec les credentials
   */
  async initialize() {
    if (this.initialized) return;

    const smtpConfig = new SmtpConfig(db);
    this.config = await smtpConfig.get();

    if (!this.config) {
      throw new Error('Configuration SMTP non trouvée. Veuillez d\'abord configurer SMTP avec OAuth 2.0.');
    }

    // Vérifier que c'est une configuration OAuth
    if (this.config.auth_type !== 'oauth2') {
      throw new Error('La configuration actuelle n\'utilise pas OAuth 2.0. Veuillez sélectionner OAuth 2.0.');
    }

    // Vérifier que les credentials sont présents
    if (!this.config.client_id || !this.config.client_secret) {
      throw new Error('Client ID et Client Secret requis. Veuillez les configurer dans l\'interface d\'administration.');
    }

    this.oauth2Client = new OAuth2Client({
      clientId: this.config.client_id,
      clientSecret: this.config.client_secret,
      redirectUri: this.config.redirect_uri || 'urn:ietf:wg:oauth:2.0:oob'
    });

    // Si des tokens existent, les définir
    if (this.config.access_token) {
      this.oauth2Client.setCredentials({
        refresh_token: this.config.refresh_token,
        access_token: this.config.access_token,
        expiry_date: this.config.expiry_date ? parseInt(this.config.expiry_date) : null
      });
      console.log('✅ Tokens OAuth chargés depuis la base de données');
    }

    this.initialized = true;
    console.log('✅ OAuth 2.0 client initialisé (PKCE activé)');
  }

  /**
   * Vérifie si la configuration OAuth est complète
   */
  async isConfigurationComplete() {
    try {
      const smtpConfig = new SmtpConfig(db);
      const config = await smtpConfig.get();
      
      if (!config) return false;
      if (config.auth_type !== 'oauth2') return false;
      if (!config.client_id || !config.client_secret) return false;
      if (!config.redirect_uri) return false;
      if (!config.from_email) return false;
      
      return true;
    } catch (error) {
      console.error('Erreur vérification configuration:', error);
      return false;
    }
  }

  /**
   * Génère un challenge PKCE pour la requête d'autorisation
   * 
   * PKCE flow:
   * 1. Générer un code_verifier aléatoire (128 caractères)
   * 2. Calculer le code_challenge = SHA-256(code_verifier)
   * 3. Envoyer le code_challenge dans la requête d'autorisation
   * 4. Plus tard, envoyer le code_verifier pour échanger le code
   */
  generatePKCEChallenge() {
    // Utiliser la bibliothèque pkce-challenge pour générer code_verifier et code_challenge
    // 128 caractères pour une sécurité maximale
    const challenge = pkceChallenge(128);
    
    // Sauvegarder pour usage ultérieur
    this.pkceVerifier = challenge.code_verifier;
    this.pkceChallenge = challenge.code_challenge;
    
    console.log('✅ PKCE challenge généré avec succès');
    console.log(`📝 Code Verifier: ${challenge.code_verifier.substring(0, 20)}... (${challenge.code_verifier.length} chars)`);
    console.log(`🔑 Code Challenge: ${challenge.code_challenge.substring(0, 20)}... (Méthode: S256)`);
    
    return {
      codeVerifier: challenge.code_verifier,
      codeChallenge: challenge.code_challenge,
      codeChallengeMethod: 'S256' // SHA-256
    };
  }

  /**
   * Récupère le code_verifier stocké
   */
  getPKCEVerifier() {
    if (!this.pkceVerifier && !this._pendingVerifier) {
      throw new Error('Aucun PKCE verifier disponible. Veuillez générer un challenge.');
    }
    return this.pkceVerifier || this._pendingVerifier;
  }

  /**
   * Vérifie si un challenge PKCE est disponible
   */
  hasPKCEChallenge() {
    return !!(this.pkceVerifier || this._pendingVerifier);
  }

  /**
   * Rafraîchit le token d'accès si nécessaire
   * 
   * Vérifie si le token est expiré ou va expirer dans les 5 minutes
   * Si c'est le cas, utilise le refresh_token pour en obtenir un nouveau
   */
  async refreshAccessToken() {
    try {
      if (!this.oauth2Client) {
        await this.initialize();
      }

      if (!this.oauth2Client) {
        throw new Error('Client OAuth non initialisé');
      }

      // Vérifier si le token est expiré ou va expirer dans les 5 minutes
      const now = Date.now();
      const expiryDate = this.oauth2Client.credentials.expiry_date || 0;
      
      if (expiryDate && (expiryDate - now) > 5 * 60 * 1000) {
        // Token encore valide
        console.log('✅ Token OAuth encore valide');
        return this.oauth2Client.credentials.access_token;
      }

      console.log('🔄 Rafraîchissement du token OAuth...');
      
      // Rafraîchir le token
      const response = await this.oauth2Client.refreshAccessToken();
      const credentials = response.credentials;

      // Mettre à jour les credentials
      this.oauth2Client.setCredentials(credentials);

      // Sauvegarder les nouveaux tokens en base de données
      const smtpConfig = new SmtpConfig(db);
      await smtpConfig.updateOAuthTokens(
        credentials.access_token,
        credentials.refresh_token || this.config.refresh_token,
        credentials.expiry_date
      );

      // Mettre à jour la configuration en mémoire
      this.config.access_token = credentials.access_token;
      this.config.refresh_token = credentials.refresh_token || this.config.refresh_token;
      this.config.expiry_date = credentials.expiry_date;

      console.log('✅ Token OAuth rafraîchi avec succès');
      console.log(`📅 Expire le: ${new Date(credentials.expiry_date).toLocaleString()}`);
      return credentials.access_token;
    } catch (error) {
      console.error('❌ Erreur rafraîchissement token:', error);
      
      // Si l'erreur est due à un refresh token invalide, forcer une nouvelle authentification
      if (error.message.includes('invalid_grant') || 
          error.message.includes('invalid refresh token') ||
          error.message.includes('refresh token not found')) {
        throw new Error('REAUTHENTICATION_REQUIRED: Le refresh token est invalide ou a été révoqué. Veuillez ré-authentifier.');
      }
      
      throw new Error(`Impossible de rafraîchir le token OAuth: ${error.message}`);
    }
  }

  /**
   * Envoie un email via Gmail API avec OAuth 2.0
   */
  async sendEmail(to, subject, html, text = null) {
    try {
      console.log(`📧 Envoi d'email à ${to} via Gmail API...`);
      
      await this.initialize();
      await this.refreshAccessToken();

      const gmail = google.gmail({
        version: 'v1',
        auth: this.oauth2Client
      });

      // Construire l'email
      const emailLines = [
        `From: ${this.config.from_email}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset="UTF-8"',
        '',
        html
      ];

      const email = emailLines.join('\r\n');
      const encodedEmail = Buffer.from(email)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      // Envoyer l'email via Gmail API
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail
        }
      });

      console.log(`✅ Email envoyé avec succès à ${to} (OAuth 2.0 + PKCE)`);
      console.log(`📧 Message ID: ${response.data.id}`);
      return response.data;
    } catch (error) {
      console.error('❌ Erreur envoi email OAuth:', error);
      
      // Si erreur d'authentification, essayer de rafraîchir
      if (error.message.includes('invalid_grant') || 
          error.message.includes('auth') ||
          error.message.includes('REAUTHENTICATION_REQUIRED') ||
          error.message.includes('invalid refresh token')) {
        console.log('🔄 Tentative de rafraîchissement du token...');
        await this.refreshAccessToken();
        // Réessayer une fois
        console.log('🔄 Réessai d\'envoi avec nouveau token...');
        return this.sendEmail(to, subject, html, text);
      }
      
      throw new Error(`Échec envoi email: ${error.message}`);
    }
  }

  /**
   * Génère l'URL d'autorisation OAuth 2.0 avec PKCE
   * 
   * Cette URL doit être ouverte dans un navigateur pour que l'utilisateur
   * autorise l'application à accéder à son compte Gmail.
   */
  async getAuthUrl() {
    try {
      console.log('🔐 Début génération URL OAuth avec PKCE...');
      
      // Vérifier que la configuration est complète
      const isComplete = await this.isConfigurationComplete();
      console.log('📋 Configuration complète:', isComplete);
      
      if (!isComplete) {
        const config = await new SmtpConfig(db).get();
        console.log('📋 État de la configuration:', {
          exists: !!config,
          auth_type: config?.auth_type,
          hasClientId: !!config?.client_id,
          hasClientSecret: !!config?.client_secret,
          hasRedirectUri: !!config?.redirect_uri,
          hasFromEmail: !!config?.from_email
        });
        throw new Error('Configuration OAuth 2.0 incomplète. Veuillez configurer Client ID, Client Secret, Redirect URI et From Email dans l\'interface d\'administration.');
      }

      await this.initialize();
      
      if (!this.oauth2Client) {
        throw new Error('Client OAuth non initialisé');
      }

      // Générer le challenge PKCE
      const pkce = this.generatePKCEChallenge();
      
      const scopes = [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.compose'
      ];

      console.log('📧 Scopes configurés:', scopes);
      console.log('🔄 Redirect URI:', this.config.redirect_uri);

      const url = this.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        include_granted_scopes: true,
        prompt: 'consent',
        // PKCE parameters
        code_challenge: pkce.codeChallenge,
        code_challenge_method: pkce.codeChallengeMethod
      });

      // Stocker le verifier pour l'échange du code
      this._pendingVerifier = pkce.codeVerifier;

      console.log('✅ URL d\'autorisation OAuth 2.0 générée avec PKCE');
      console.log(`🔗 URL: ${url.substring(0, 100)}...`);
      console.log('📝 Instructions:');
      console.log('  1. Ouvrez l\'URL dans un navigateur');
      console.log('  2. Connectez-vous avec votre compte Google');
      console.log('  3. Autorisez l\'accès');
      console.log('  4. Copiez le code affiché');
      console.log('  5. Revenez et collez le code');

      return url;
    } catch (error) {
      console.error('❌ Erreur génération URL OAuth:', error);
      throw new Error(`Erreur lors de la génération de l'URL: ${error.message}`);
    }
  }

  /**
   * Échange le code d'autorisation contre des tokens (avec PKCE)
   * 
   * Utilise le code_verifier stocké pour valider l'échange
   * et obtenir les tokens access_token et refresh_token
   */
  async exchangeCode(code) {
    try {
      console.log('🔄 Début échange du code OAuth avec PKCE...');
      
      // Vérifier que la configuration est complète
      const isComplete = await this.isConfigurationComplete();
      if (!isComplete) {
        throw new Error('Configuration OAuth 2.0 incomplète. Veuillez configurer Client ID, Client Secret, Redirect URI et From Email.');
      }

      await this.initialize();
      
      if (!this.oauth2Client) {
        throw new Error('Client OAuth non initialisé');
      }

      // Récupérer le verifier stocké
      const verifier = this._pendingVerifier || this.pkceVerifier;
      
      if (!verifier) {
        throw new Error('Aucun PKCE verifier disponible. Veuillez générer une nouvelle URL d\'autorisation.');
      }

      console.log(`📝 Code reçu: ${code.substring(0, 20)}... (${code.length} chars)`);
      console.log(`🔑 Verifier utilisé: ${verifier.substring(0, 20)}... (${verifier.length} chars)`);

      // Échanger le code avec le code_verifier (PKCE)
      const response = await this.oauth2Client.getToken({
        code: code,
        code_verifier: verifier // PKCE code_verifier
      });

      const tokens = response.tokens;

      if (!tokens.access_token) {
        throw new Error('Access token non reçu');
      }

      console.log('✅ Tokens OAuth reçus avec succès');
      console.log(`📅 Expire le: ${tokens.expiry_date ? new Date(tokens.expiry_date).toLocaleString() : 'Non spécifié'}`);
      console.log(`🔄 Refresh token: ${tokens.refresh_token ? '✅ Présent' : '❌ Non reçu'}`);

      // Sauvegarder les tokens
      const smtpConfig = new SmtpConfig(db);
      await smtpConfig.updateOAuthTokens(
        tokens.access_token,
        tokens.refresh_token || null,
        tokens.expiry_date || null
      );

      // Mettre à jour la configuration en mémoire
      this.config.access_token = tokens.access_token;
      this.config.refresh_token = tokens.refresh_token || this.config.refresh_token;
      this.config.expiry_date = tokens.expiry_date || this.config.expiry_date;

      // Nettoyer le verifier
      this._pendingVerifier = null;
      this.pkceVerifier = null;
      this.pkceChallenge = null;

      console.log('✅ Tokens OAuth sauvegardés avec succès (PKCE)');
      return tokens;
    } catch (error) {
      console.error('❌ Erreur échange code OAuth:', error);
      
      // Messages d'erreur plus précis
      if (error.message.includes('invalid_grant')) {
        throw new Error('Code OAuth invalide ou expiré. Les codes expirent après 10 minutes. Générez une nouvelle URL.');
      } else if (error.message.includes('redirect_uri_mismatch')) {
        throw new Error('Redirect URI ne correspond pas. Vérifiez que l\'URI configuré correspond à celui de la Google Cloud Console.');
      } else if (error.message.includes('invalid_client')) {
        throw new Error('Client ID ou Client Secret invalide. Vérifiez vos identifiants.');
      } else if (error.message.includes('access_denied')) {
        throw new Error('Accès refusé par l\'utilisateur. Veuillez autoriser l\'accès dans Google.');
      } else if (error.message.includes('PKCE verifier')) {
        throw new Error('Verifier PKCE manquant. Générez une nouvelle URL d\'autorisation.');
      }
      
      throw new Error(`Échec de l'échange du code OAuth: ${error.message}`);
    }
  }

  /**
   * Vérifie si l'authentification OAuth est valide
   * 
   * Teste la connexion en faisant un appel à l'API Gmail
   * pour récupérer le profil de l'utilisateur
   */
  async verifyAuth() {
    try {
      console.log('🔐 Vérification de l\'authentification OAuth...');
      
      const isComplete = await this.isConfigurationComplete();
      if (!isComplete) {
        return { 
          valid: false, 
          error: 'Configuration OAuth 2.0 incomplète',
          pkceEnabled: true,
          details: 'Client ID, Client Secret, Redirect URI et From Email requis'
        };
      }

      await this.initialize();
      
      if (!this.oauth2Client) {
        return { 
          valid: false, 
          error: 'Client OAuth non initialisé',
          pkceEnabled: true
        };
      }

      // Rafraîchir le token si nécessaire
      await this.refreshAccessToken();
      
      // Tester avec un appel simple à l'API Gmail
      const gmail = google.gmail({
        version: 'v1',
        auth: this.oauth2Client
      });

      console.log('🔄 Test de l\'API Gmail...');
      const profile = await gmail.users.getProfile({
        userId: 'me'
      });

      console.log(`✅ Authentification OAuth valide pour ${profile.data.emailAddress}`);
      console.log(`📊 Emails: ${profile.data.messagesTotal} messages, ${profile.data.threadsTotal} threads`);
      
      return { 
        valid: true,
        pkceEnabled: true,
        email: profile.data.emailAddress,
        messagesTotal: profile.data.messagesTotal
      };
    } catch (error) {
      console.error('❌ Erreur vérification OAuth:', error);
      
      let errorMessage = 'Erreur de vérification OAuth';
      if (error.message.includes('invalid_grant')) {
        errorMessage = 'Token OAuth invalide ou expiré. Veuillez ré-authentifier.';
      } else if (error.message.includes('auth')) {
        errorMessage = 'Erreur d\'authentification. Vérifiez vos identifiants.';
      } else if (error.message.includes('API non activée')) {
        errorMessage = 'Gmail API non activée dans la Google Cloud Console.';
      }
      
      return { 
        valid: false, 
        error: errorMessage,
        pkceEnabled: true,
        details: error.message
      };
    }
  }

  /**
   * Réinitialise l'état PKCE
   * 
   * Utile pour nettoyer l'état entre différentes tentatives
   * d'authentification ou en cas d'erreur
   */
  resetPKCE() {
    this.pkceVerifier = null;
    this.pkceChallenge = null;
    this._pendingVerifier = null;
    console.log('🔄 État PKCE réinitialisé');
  }

  /**
   * Obtient l'état actuel du challenge PKCE
   */
  getPKCEStatus() {
    const status = {
      hasChallenge: this.hasPKCEChallenge(),
      hasVerifier: !!this._pendingVerifier,
      hasStoredVerifier: !!this.pkceVerifier,
      hasStoredChallenge: !!this.pkceChallenge,
      isConfigured: this.config !== null,
      authType: this.config?.auth_type || 'none',
      hasTokens: !!(this.config?.access_token && this.config?.refresh_token)
    };
    
    console.log('📊 Statut PKCE:', status);
    return status;
  }

  /**
   * Récupère les informations du compte Gmail connecté
   */
  async getAccountInfo() {
    try {
      await this.initialize();
      await this.refreshAccessToken();

      const gmail = google.gmail({
        version: 'v1',
        auth: this.oauth2Client
      });

      const profile = await gmail.users.getProfile({
        userId: 'me'
      });

      return {
        email: profile.data.emailAddress,
        messagesTotal: profile.data.messagesTotal,
        threadsTotal: profile.data.threadsTotal
      };
    } catch (error) {
      console.error('❌ Erreur récupération compte:', error);
      throw new Error(`Impossible de récupérer les informations du compte: ${error.message}`);
    }
  }
}

// ============================================
// EXPORT D'UNE INSTANCE UNIQUE
// ============================================

export const oauth2Service = new OAuth2Service();

// ============================================
// EXPORT DES FONCTIONS UTILITAIRES
// ============================================

export async function sendEmailOAuth2(to, subject, html, text = null) {
  return oauth2Service.sendEmail(to, subject, html, text);
}

export async function verifyOAuth2Config() {
  return oauth2Service.verifyAuth();
}

export async function getAuthUrl() {
  return oauth2Service.getAuthUrl();
}

export async function exchangeOAuthCode(code) {
  return oauth2Service.exchangeCode(code);
}

export async function getPKCEStatus() {
  return oauth2Service.getPKCEStatus();
}

export async function resetPKCE() {
  return oauth2Service.resetPKCE();
}

export async function isConfigurationComplete() {
  return oauth2Service.isConfigurationComplete();
}

export async function getAccountInfo() {
  return oauth2Service.getAccountInfo();
}

// ============================================
// EXPORT PAR DÉFAUT
// ============================================

export default oauth2Service;
