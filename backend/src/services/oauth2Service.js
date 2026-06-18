import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import { SmtpConfig } from '../models/SmtpConfig.js';
import { initializeDatabase } from '../database.js';

let db;

(async () => {
  db = await initializeDatabase();
})();

/**
 * Service OAuth 2.0 avec PKCE (Proof Key for Code Exchange)
 * Implémente PKCE manuellement sans dépendance externe
 * Utilise le module crypto de Node.js
 */
export class OAuth2Service {
  constructor() {
    this.oauth2Client = null;
    this.config = null;
    this.initialized = false;
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
      throw new Error('Configuration SMTP non trouvée.');
    }

    if (this.config.auth_type !== 'oauth2') {
      throw new Error('La configuration n\'utilise pas OAuth 2.0.');
    }

    if (!this.config.client_id || !this.config.client_secret) {
      throw new Error('Client ID et Client Secret requis.');
    }

    this.oauth2Client = new OAuth2Client({
      clientId: this.config.client_id,
      clientSecret: this.config.client_secret,
      redirectUri: this.config.redirect_uri || 'urn:ietf:wg:oauth:2.0:oob'
    });

    // Si des tokens existent, les définir
    if (this.config.access_token) {
      const credentials = {
        access_token: this.config.access_token
      };
      
      // Ajouter le refresh token s'il existe
      if (this.config.refresh_token) {
        credentials.refresh_token = this.config.refresh_token;
      }
      
      if (this.config.expiry_date) {
        credentials.expiry_date = parseInt(this.config.expiry_date);
      }
      
      this.oauth2Client.setCredentials(credentials);
      console.log('✅ Tokens OAuth chargés depuis la base de données');
      
      // Vérifier si un refresh token est présent
      if (!this.config.refresh_token) {
        console.warn('⚠️ Aucun refresh token trouvé. Une ré-authentification sera nécessaire.');
      }
    } else {
      console.log('ℹ️ Aucun token OAuth trouvé.');
    }

    this.initialized = true;
    console.log('✅ OAuth 2.0 client initialisé (PKCE manuel)');
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
   * Vérifie si un refresh token est disponible
   */
  hasRefreshToken() {
    return !!(this.config?.refresh_token);
  }

  /**
   * Génère une chaîne aléatoire sécurisée pour PKCE
   */
  generateCodeVerifier() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    const randomBytes = crypto.randomBytes(128);
    
    for (let i = 0; i < 128; i++) {
      result += chars[randomBytes[i] % chars.length];
    }
    return result;
  }

  /**
   * Calcule le SHA-256 d'une chaîne et retourne en base64url
   */
  sha256Base64(text) {
    const hash = crypto.createHash('sha256');
    hash.update(text);
    const digest = hash.digest();
    const base64 = digest.toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Génère un challenge PKCE (code_verifier + code_challenge)
   */
  generatePKCEChallenge() {
    try {
      console.log('🔄 Génération PKCE avec crypto Node.js...');
      
      const verifier = this.generateCodeVerifier();
      console.log(`📝 Code Verifier: ${verifier.substring(0, 20)}... (${verifier.length} chars)`);
      
      const challenge = this.sha256Base64(verifier);
      console.log(`🔑 Code Challenge: ${challenge.substring(0, 20)}... (${challenge.length} chars)`);
      
      this.pkceVerifier = verifier;
      
      console.log('✅ PKCE challenge généré (manuel avec crypto Node.js)');
      
      return {
        codeVerifier: verifier,
        codeChallenge: challenge,
        codeChallengeMethod: 'S256'
      };
    } catch (error) {
      console.error('❌ Erreur génération PKCE:', error);
      throw new Error(`Impossible de générer le challenge PKCE: ${error.message}`);
    }
  }

  /**
   * Rafraîchit le token d'accès si nécessaire
   */
  async refreshAccessToken() {
    try {
      if (!this.oauth2Client) {
        await this.initialize();
      }

      if (!this.oauth2Client) {
        throw new Error('Client OAuth non initialisé');
      }

      // Vérifier si un refresh token est disponible
      if (!this.hasRefreshToken()) {
        console.warn('⚠️ Aucun refresh token disponible.');
        throw new Error('REAUTHENTICATION_REQUIRED: Aucun refresh token trouvé. Veuillez ré-authentifier.');
      }

      // Vérifier si le token est expiré
      const now = Date.now();
      const expiryDate = this.oauth2Client.credentials.expiry_date || 0;
      
      if (expiryDate && (expiryDate - now) > 5 * 60 * 1000) {
        console.log('✅ Token OAuth encore valide');
        return this.oauth2Client.credentials.access_token;
      }

      console.log('🔄 Rafraîchissement du token OAuth...');
      
      // Rafraîchir le token
      const response = await this.oauth2Client.refreshAccessToken();
      const credentials = response.credentials;

      // Mettre à jour les credentials
      this.oauth2Client.setCredentials(credentials);

      // Sauvegarder les nouveaux tokens
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
      return credentials.access_token;
    } catch (error) {
      console.error('❌ Erreur rafraîchissement token:', error);
      
      if (error.message.includes('invalid_grant') || 
          error.message.includes('invalid refresh token') ||
          error.message.includes('No refresh token') ||
          error.message.includes('REAUTHENTICATION_REQUIRED')) {
        throw new Error('REAUTHENTICATION_REQUIRED: Veuillez ré-authentifier pour obtenir un nouveau refresh token.');
      }
      
      throw new Error(`Impossible de rafraîchir le token OAuth: ${error.message}`);
    }
  }

  /**
   * Envoie un email via Gmail API avec OAuth 2.0
   */
  async sendEmail(to, subject, html, text = null) {
    try {
      console.log(`📧 Envoi d'email à ${to}...`);
      
      await this.initialize();
      
      // Vérifier si un refresh token est disponible
      if (!this.hasRefreshToken()) {
        throw new Error('REAUTHENTICATION_REQUIRED: Aucun refresh token. Veuillez ré-authentifier.');
      }
      
      await this.refreshAccessToken();

      const gmail = google.gmail({
        version: 'v1',
        auth: this.oauth2Client
      });

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

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail
        }
      });

      console.log(`✅ Email envoyé à ${to}`);
      return response.data;
    } catch (error) {
      console.error('❌ Erreur envoi email:', error);
      
      if (error.message.includes('REAUTHENTICATION_REQUIRED') ||
          error.message.includes('invalid_grant')) {
        throw new Error('REAUTHENTICATION_REQUIRED: Veuillez ré-authentifier pour continuer.');
      }
      
      throw new Error(`Échec envoi email: ${error.message}`);
    }
  }

  /**
   * Génère l'URL d'autorisation OAuth 2.0 avec PKCE
   */
  async getAuthUrl() {
    try {
      console.log('🔐 Génération URL OAuth avec PKCE manuel...');
      
      const isComplete = await this.isConfigurationComplete();
      if (!isComplete) {
        throw new Error('Configuration OAuth 2.0 incomplète.');
      }

      await this.initialize();
      
      if (!this.oauth2Client) {
        throw new Error('Client OAuth non initialisé');
      }

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
        code_challenge: pkce.codeChallenge,
        code_challenge_method: pkce.codeChallengeMethod
      });

      this._pendingVerifier = pkce.codeVerifier;

      console.log('✅ URL d\'autorisation générée');
      console.log(`🔗 URL: ${url.substring(0, 100)}...`);
      console.log('📝 Instructions:');
      console.log('  1. Ouvrez l\'URL dans un navigateur');
      console.log('  2. Connectez-vous avec votre compte Google');
      console.log('  3. Autorisez l\'accès');
      console.log('  4. Copiez le code affiché');
      console.log('  5. Revenez et collez le code');

      return url;
    } catch (error) {
      console.error('❌ Erreur génération URL:', error);
      throw new Error(`Erreur: ${error.message}`);
    }
  }

  /**
   * Échange le code d'autorisation contre des tokens (avec PKCE)
   */
  async exchangeCode(code) {
    try {
      console.log('🔄 Échange du code OAuth...');
      
      const isComplete = await this.isConfigurationComplete();
      if (!isComplete) {
        throw new Error('Configuration OAuth 2.0 incomplète.');
      }

      await this.initialize();
      
      if (!this.oauth2Client) {
        throw new Error('Client OAuth non initialisé');
      }

      const verifier = this._pendingVerifier || this.pkceVerifier;
      
      if (!verifier) {
        throw new Error('Aucun PKCE verifier disponible.');
      }

      console.log(`📝 Code reçu: ${code.substring(0, 20)}... (${code.length} chars)`);
      console.log(`🔑 Verifier: ${verifier.substring(0, 20)}... (${verifier.length} chars)`);

      // IMPORTANT: Utiliser le code_verifier pour l'échange
      const response = await this.oauth2Client.getToken({
        code: code,
        code_verifier: verifier
      });

      const tokens = response.tokens;

      if (!tokens.access_token) {
        throw new Error('Access token non reçu');
      }

      console.log('✅ Tokens OAuth reçus');
      console.log(`📅 Expire le: ${tokens.expiry_date ? new Date(tokens.expiry_date).toLocaleString() : 'Non spécifié'}`);
      
      if (tokens.refresh_token) {
        console.log('✅ Refresh token obtenu');
      } else {
        console.warn('⚠️ Aucun refresh token reçu. Cela peut arriver si le redirect_uri est "urn:ietf:wg:oauth:2.0:oob".');
        console.warn('⚠️ Pour obtenir un refresh token, utilisez un redirect_uri HTTPS valide.');
      }

      // Sauvegarder les tokens
      const smtpConfig = new SmtpConfig(db);
      await smtpConfig.updateOAuthTokens(
        tokens.access_token,
        tokens.refresh_token || null,
        tokens.expiry_date || null
      );

      this.config.access_token = tokens.access_token;
      this.config.refresh_token = tokens.refresh_token || this.config.refresh_token;
      this.config.expiry_date = tokens.expiry_date || this.config.expiry_date;

      this._pendingVerifier = null;
      this.pkceVerifier = null;

      console.log('✅ Tokens OAuth sauvegardés');
      return tokens;
    } catch (error) {
      console.error('❌ Erreur échange code:', error);
      
      if (error.message.includes('invalid_grant')) {
        throw new Error('Code invalide ou expiré. Générez une nouvelle URL.');
      } else if (error.message.includes('redirect_uri_mismatch')) {
        throw new Error('Redirect URI ne correspond pas.');
      } else if (error.message.includes('invalid_client')) {
        throw new Error('Client ID ou Client Secret invalide.');
      } else if (error.message.includes('PKCE verifier')) {
        throw new Error('Verifier PKCE manquant. Générez une nouvelle URL.');
      }
      
      throw new Error(`Échec de l'échange: ${error.message}`);
    }
  }

  /**
   * Vérifie si l'authentification OAuth est valide
   */
  async verifyAuth() {
    try {
      console.log('🔐 Vérification OAuth...');
      
      const isComplete = await this.isConfigurationComplete();
      if (!isComplete) {
        return { valid: false, error: 'Configuration incomplète' };
      }

      await this.initialize();
      
      if (!this.oauth2Client) {
        return { valid: false, error: 'Client non initialisé' };
      }

      // Vérifier si un refresh token est disponible
      if (!this.hasRefreshToken()) {
        return { 
          valid: false, 
          error: 'Aucun refresh token disponible. Veuillez ré-authentifier.',
          reauthRequired: true
        };
      }

      try {
        await this.refreshAccessToken();
      } catch (refreshError) {
        if (refreshError.message.includes('REAUTHENTICATION_REQUIRED')) {
          return { 
            valid: false, 
            error: 'Refresh token invalide. Veuillez ré-authentifier.',
            reauthRequired: true
          };
        }
        throw refreshError;
      }
      
      const gmail = google.gmail({
        version: 'v1',
        auth: this.oauth2Client
      });

      const profile = await gmail.users.getProfile({
        userId: 'me'
      });

      console.log(`✅ OAuth valide pour ${profile.data.emailAddress}`);
      
      return { 
        valid: true,
        pkceEnabled: true,
        email: profile.data.emailAddress,
        messagesTotal: profile.data.messagesTotal,
        hasRefreshToken: this.hasRefreshToken()
      };
    } catch (error) {
      console.error('❌ Erreur vérification:', error);
      return { 
        valid: false, 
        error: error.message,
        pkceEnabled: true
      };
    }
  }

  /**
   * Réinitialise l'état PKCE
   */
  resetPKCE() {
    this.pkceVerifier = null;
    this._pendingVerifier = null;
    console.log('🔄 PKCE réinitialisé');
  }

  /**
   * Obtient l'état PKCE
   */
  getPKCEStatus() {
    return {
      hasVerifier: !!this.pkceVerifier,
      hasPendingVerifier: !!this._pendingVerifier,
      isConfigured: this.config !== null,
      authType: this.config?.auth_type || 'none',
      hasTokens: !!(this.config?.access_token && this.config?.refresh_token),
      hasRefreshToken: this.hasRefreshToken()
    };
  }
}

// ============================================
// EXPORT
// ============================================

export const oauth2Service = new OAuth2Service();

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

export default oauth2Service;
