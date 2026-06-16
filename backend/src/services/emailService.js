import nodemailer from 'nodemailer';

let transporter = null;

export function initializeEmail() {
  if (!transporter) {
    const config = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    };

    // Vérifier si les identifiants sont configurés
    if (!config.auth.user || !config.auth.pass) {
      console.warn('⚠️ SMTP non configuré. Les emails ne seront pas envoyés.');
      return null;
    }

    transporter = nodemailer.createTransport(config);
  }
  return transporter;
}

export async function sendEmail(to, subject, html, text = null) {
  try {
    const transporter = initializeEmail();
    
    if (!transporter) {
      console.log('📧 SMTP non configuré - Email simulé:', { to, subject });
      return { messageId: 'simulated-' + Date.now() };
    }
    
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@skillclaude.com',
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
  
  // Si SMTP non configuré, simuler l'envoi
  const transporter = initializeEmail();
  if (!transporter) {
    results.success = recipients.length;
    return results;
  }
  
  // Diviser en batches
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
    
    // Attendre un peu entre les batches pour éviter le rate limiting
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
