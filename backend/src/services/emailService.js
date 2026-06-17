import nodemailer from 'nodemailer';
import { SmtpConfig } from '../models/SmtpConfig.js';
import { initializeDatabase } from '../database.js';
import { oauth2Service } from './oauth2Service.js';

let transporter = null;
let db;

export async function initializeEmail() {
  if (!db) {
    db = await initializeDatabase();
  }
  
  const smtpConfig = new SmtpConfig(db);
  const config = await smtpConfig.get();
  
  if (!config) {
    console.warn('⚠️ Aucune configuration SMTP trouvée en base de données');
    return null;
  }

  // Si OAuth 2.0, utiliser le service OAuth
  if (config.auth_type === 'oauth2') {
    return oauth2Service;
  }

  // Sinon, SMTP standard avec mot de passe
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure === 1,
      auth: {
        user: config.user,
        pass: config.pass
      }
    });
  }
  
  return transporter;
}

export async function sendEmail(to, subject, html, text = null) {
  try {
    const mailer = await initializeEmail();
    
    if (!mailer) {
      console.log('📧 SMTP non configuré - Email simulé:', { to, subject });
      return { messageId: 'simulated-' + Date.now() };
    }

    const config = await new SmtpConfig(db).get();
    const from = config.from_email;

    // Si c'est le service OAuth 2.0
    if (mailer.oauth2Client) {
      return mailer.sendEmail(to, subject, html, text);
    }

    // SMTP standard
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text: text || html.replace(/<[^>]*>/g, ''),
      html
    });
    
    return info;
  } catch (error) {
    console.error('Erreur d\'envoi d\'email:', error);
    throw error;
  }
}

export async function sendBulkEmail(recipients, subject, message, batchSize = 100) {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };
  
  const mailer = await initializeEmail();
  if (!mailer) {
    results.success = recipients.length;
    console.log(`📧 Simulation d'envoi à ${recipients.length} destinataires`);
    return results;
  }
  
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    const promises = batch.map(email => 
      sendEmail(email, subject, message)
        .then(() => results.success++)
        .catch(err => {
          results.failed++;
          results.errors.push({ email, error: err.message });
        })
    );
    
    await Promise.all(promises);
    
    if (i + batchSize < recipients.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
}

export function formatTemplate(template, variables = {}) {
  let message = template;
  for (const [key, value] of Object.entries(variables)) {
    message = message.replace(new RegExp(`\\[${key}\\]`, 'g'), value);
  }
  return message;
}
