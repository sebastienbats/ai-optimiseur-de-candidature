export class SmtpConfig {
  constructor(db) {
    this.db = db;
  }

  async save(config) {
    const { host, port, secure, user, pass, from } = config;
    
    // Vérifier si une config existe déjà
    const existing = await this.db.get('SELECT * FROM smtp_config LIMIT 1');
    
    if (existing) {
      await this.db.run(
        `UPDATE smtp_config 
         SET host = ?, port = ?, secure = ?, user = ?, pass = ?, from_email = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [host, port, secure ? 1 : 0, user, pass, from, existing.id]
      );
      return existing.id;
    } else {
      const result = await this.db.run(
        `INSERT INTO smtp_config (host, port, secure, user, pass, from_email) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [host, port, secure ? 1 : 0, user, pass, from]
      );
      return result.lastID;
    }
  }

  async get() {
    return await this.db.get('SELECT * FROM smtp_config LIMIT 1');
  }

  async delete() {
    await this.db.run('DELETE FROM smtp_config');
  }

  async testConnection(config) {
    // Cette méthode sera utilisée pour tester la connexion SMTP
    // sans sauvegarder la configuration
    return { success: true };
  }
}
