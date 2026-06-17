export class SmtpConfig {
  constructor(db) {
    this.db = db;
  }

  async save(config) {
    const { 
      host, 
      port, 
      secure, 
      user, 
      pass, 
      from,
      auth_type = 'password', // 'password' ou 'oauth2'
      client_id = null,
      client_secret = null,
      redirect_uri = null,
      refresh_token = null,
      access_token = null,
      expiry_date = null
    } = config;
    
    const existing = await this.db.get('SELECT * FROM smtp_config LIMIT 1');
    
    if (existing) {
      await this.db.run(
        `UPDATE smtp_config 
         SET host = ?, port = ?, secure = ?, user = ?, pass = ?, 
             from_email = ?, auth_type = ?, client_id = ?, 
             client_secret = ?, redirect_uri = ?, 
             refresh_token = ?, access_token = ?, 
             expiry_date = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [host, port, secure ? 1 : 0, user, pass, from,
         auth_type, client_id, client_secret, redirect_uri,
         refresh_token, access_token, expiry_date, existing.id]
      );
      return existing.id;
    } else {
      const result = await this.db.run(
        `INSERT INTO smtp_config 
         (host, port, secure, user, pass, from_email, 
          auth_type, client_id, client_secret, redirect_uri,
          refresh_token, access_token, expiry_date) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [host, port, secure ? 1 : 0, user, pass, from,
         auth_type, client_id, client_secret, redirect_uri,
         refresh_token, access_token, expiry_date]
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

  async updateOAuthTokens(access_token, refresh_token, expiry_date) {
    await this.db.run(
      `UPDATE smtp_config 
       SET access_token = ?, refresh_token = ?, expiry_date = ?, 
           updated_at = CURRENT_TIMESTAMP
       WHERE auth_type = 'oauth2'`,
      [access_token, refresh_token, expiry_date]
    );
  }

  async getOAuthTokens() {
    const config = await this.get();
    if (!config || config.auth_type !== 'oauth2') {
      return null;
    }
    return {
      access_token: config.access_token,
      refresh_token: config.refresh_token,
      expiry_date: config.expiry_date
    };
  }

  async isOAuthConfigured() {
    const config = await this.get();
    return config && config.auth_type === 'oauth2' && 
           config.client_id && config.client_secret && 
           config.refresh_token;
  }

  async isPasswordConfigured() {
    const config = await this.get();
    return config && config.auth_type === 'password' && 
           config.user && config.pass;
  }
}
