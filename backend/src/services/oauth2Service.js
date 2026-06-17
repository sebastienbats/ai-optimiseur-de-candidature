import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { SmtpConfig } from '../models/SmtpConfig.js';
import { initializeDatabase } from '../database.js';

let db;

(async () => {
  db = await initializeDatabase();
})();

/**
 * Service OAuth 2.0 pour Gmail
 * Gère l'authentification, le rafraîchissement des tokens et l'envoi d'emails
 */
export class OAuth2Service {
  constructor() {
    this.oauth2Client = null;
    this.config = null;
    this.initialized = false;
  }

  /**
   * Initialise le client OAuth 2.0 avec les credentials
   */
  async initialize() {
    if (this.initialized) return;

    const smtpConfig = new SmtpConfig(db);
    this.config = await smtpConfig.get();

    if (!this.config) {
      throw new Error('Configuration SMTP non trouvée');
    }

    // Vérifier que c'est une configuration OAuth
    if (this.config.auth_type !== 'oauth2') {
      throw new Error('La configuration actuelle n\'utilise pas OAuth 2.0');
    }

    this.oauth2Client = new OAuth2Client(
      this.config.client_id,
      this.config.client_secret,
      this.config.redirect_uri || 'urn:ietf:wg:oauth:2.0:oob'
    );

    // Définir les credentials
    this.oauth2Client.setCredentials({
      refresh_token: this.config.refresh_token,
      access_token: this.config.access_token,
      expiry_date: this.config.expiry_date
    });

    this.initialized = true;
    console.log('✅ OAuth 2.0 client initialisé');
  }

  /**
   * Rafraîchit le token d'accès si nécessaire
   */
  async refreshAccessToken() {
    try {
      if (!this.oauth2Client) {
        await this.initialize();
      }

      // Vérifier si le token est expiré ou va expirer dans les 5 minutes
      const now = Date.now();
      const expiryDate = this.oauth2Client.credentials.expiry_date || 0;
      
      if (expiryDate && (expiryDate - now) > 5 * 60 * 1000) {
        // Token encore valide
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
      return credentials.access_token;
    } catch (error) {
      console.error('❌ Erreur rafraîchissement token:', error);
      throw new Error('Impossible de rafraîchir le token OAuth');
    }
  }

  /**
   * Envoie un email via Gmail API avec OAuth 2.0
   */
  async sendEmail(to, subject, html, text = null) {
    try {
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

      console.log(`✅ Email envoyé à ${to} (OAuth 2.0)`);
      return response.data;
    } catch (error) {
      console.error('❌ Erreur envoi email OAuth:', error);
      
      // Si erreur d'authentification, essayer de rafraîchir
      if (error.message.includes('invalid_grant') || error.message.includes('auth')) {
        await this.refreshAccessToken();
        // Réessayer une fois
        return this.sendEmail(to, subject, html, text);
      }
      
      throw error;
    }
  }

  /**
   * Génère l'URL d'autorisation OAuth 2.0
   */
  async getAuthUrl() {
    await this.initialize();
    
    const scopes = [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.compose'
    ];

    const url = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      include_granted_scopes: true,
      prompt: 'consent'
    });

    return url;
  }

  /**
   * Échange le code d'autorisation contre des tokens
   */
  async exchangeCode(code) {
    await this.initialize();
    
    const response = await this.oauth2Client.getToken(code);
    const tokens = response.tokens;

    // Sauvegarder les tokens
    const smtpConfig = new SmtpConfig(db);
    await smtpConfig.updateOAuthTokens(
      tokens.access_token,
      tokens.refresh_token,
      tokens.expiry_date
    );

    // Mettre à jour la configuration en mémoire
    this.config.access_token = tokens.access_token;
    this.config.refresh_token = tokens.refresh_token;
    this.config.expiry_date = tokens.expiry_date;

    return tokens;
  }

  /**
   * Vérifie si l'authentification OAuth est valide
   */
  async verifyAuth() {
    try {
      await this.initialize();
      await this.refreshAccessToken();
      
      // Tester avec un appel simple
      const gmail = google.gmail({
        version: 'v1',
        auth: this.oauth2Client
      });

      await gmail.users.getProfile({
        userId: 'me'
      });

      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: error.message 
      };
    }
  }
}

// Export d'une instance unique
export const oauth2Service = new OAuth2Service();

// Export des fonctions utilitaires
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

export default oauth2Service;
