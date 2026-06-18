import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { SmtpConfig } from '../models/SmtpConfig.js';
import { initializeDatabase } from '../database.js';

let db;

(async () => {
  db = await initializeDatabase();
})();

/**
 * Service OAuth 2.0 avec PKCE (Proof Key for Code Exchange)
 * Implémente PKCE manuellement sans dépendance externe
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

    if (this.config.access_token) {
      this.oauth2Client.setCredentials({
        refresh_token: this.config.refresh_token,
        access_token: this.config.access_token,
        expiry_date: this.config.expiry_date ? parseInt(this.config.expiry_date) : null
      });
    }

    this.initialized = true;
    console.log('✅ OAuth 2.0 client initialisé (PKCE manuel)');
  }

  /**
   * Génère une chaîne aléatoire sécurisée pour PKCE
   * Code verifier: 128 caractères aléatoires (A-Z, a-z, 0-9, -._~)
   */
  generateCodeVerifier() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    const array = new Uint8Array(128);
    crypto.getRandomValues(array);
    
    for (let i = 0; i < 128; i++) {
      result += chars[array[i] % chars.length];
    }
    return result;
  }

  /**
   * Calcule le SHA-256 d'une chaîne et retourne en base64url
   */
  async sha256Base64(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const base64 = btoa(String.fromCharCode(...hashArray));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Génère un challenge PKCE (code_verifier + code_challenge)
   */
  async generatePKCEChallenge() {
    try {
      // 1. Générer le code_verifier
      const verifier = this.generateCodeVerifier();
      
      // 2. Calculer le code_challenge (SHA-256)
      const challenge = await this.sha256Base64(verifier);
      
      // Stocker le verifier pour l'échange
      this.pkceVerifier = verifier;
      
      console.log('✅ PKCE challenge généré (manuel)');
      
      return {
        codeVerifier: verifier,
        codeChallenge: challenge,
        codeChallengeMethod: 'S256'
      };
    } catch (error) {
      console.error('❌ Erreur génération PKCE:', error);
      throw new Error('Impossible de générer le challenge PKCE');
    }
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

      const now = Date.now();
      const expiryDate = this.oauth2Client.credentials.expiry_date || 0;
      
      if (expiryDate && (expiryDate - now) > 5 * 60 * 1000) {
        console.log('✅ Token OAuth encore valide');
        return this.oauth2Client.credentials.access_token;
      }

      console.log('🔄 Rafraîchissement du token OAuth...');
      
      const response = await this.oauth2Client.refreshAccessToken();
      const credentials = response.credentials;

      this.oauth2Client.setCredentials(credentials);

      const smtpConfig = new SmtpConfig(db);
      await smtpConfig.updateOAuthTokens(
        credentials.access_token,
        credentials.refresh_token || this.config.refresh_token,
        credentials.expiry_date
      );

      this.config.access_token = credentials.access_token;
      this.config.refresh_token = credentials.refresh_token || this.config.refresh_token;
      this.config.expiry_date = credentials.expiry_date;

      console.log('✅ Token OAuth rafraîchi avec succès');
      return credentials.access_token;
    } catch (error) {
      console.error('❌ Erreur rafraîchissement token:', error);
      
      if (error.message.includes('invalid_grant') || 
          error.message.includes('invalid refresh token')) {
        throw new Error('REAUTHENTICATION_REQUIRED: Le refresh token est invalide.');
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
      
      if (error.message.includes('invalid_grant') || 
          error.message.includes('REAUTHENTICATION_REQUIRED')) {
        await this.refreshAccessToken();
        return this.sendEmail(to, subject, html, text);
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

      // Générer le challenge PKCE
      const pkce = await this.generatePKCEChallenge();
      
      const scopes = [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.compose'
      ];

      const url = this.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        include_granted_scopes: true,
        prompt: 'consent',
        code_challenge: pkce.codeChallenge,
        code_challenge_method: pkce.codeChallengeMethod
      });

      // Stocker le verifier pour l'échange
      this._pendingVerifier = pkce.codeVerifier;

      console.log('✅ URL d\'autorisation générée');
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

      const response = await this.oauth2Client.getToken({
        code: code,
        code_verifier: verifier
      });

      const tokens = response.tokens;

      if (!tokens.access_token) {
        throw new Error('Access token non reçu');
      }

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

      console.log('✅ Tokens OAuth obtenus');
      return tokens;
    } catch (error) {
      console.error('❌ Erreur échange code:', error);
      
      if (error.message.includes('invalid_grant')) {
        throw new Error('Code invalide ou expiré. Générez une nouvelle URL.');
      } else if (error.message.includes('redirect_uri_mismatch')) {
        throw new Error('Redirect URI ne correspond pas.');
      } else if (error.message.includes('invalid_client')) {
        throw new Error('Client ID ou Client Secret invalide.');
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

      await this.refreshAccessToken();
      
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
        email: profile.data.emailAddress
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
      hasTokens: !!(this.config?.access_token && this.config?.refresh_token)
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
