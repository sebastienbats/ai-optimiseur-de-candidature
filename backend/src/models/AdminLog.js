export class AdminLog {
  constructor(db) {
    this.db = db;
  }

  async create(adminId, action, details = null, ipAddress = null) {
    const result = await this.db.run(
      `INSERT INTO admin_logs (admin_id, action, details, ip_address) 
       VALUES (?, ?, ?, ?)`,
      [adminId, action, details ? JSON.stringify(details) : null, ipAddress]
    );
    return result.lastID;
  }

  async getLogs(limit = 100, offset = 0) {
    return await this.db.all(
      `SELECT l.*, u.email as admin_email 
       FROM admin_logs l
       JOIN users u ON u.id = l.admin_id
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
  }

  async getLogsByAction(action, limit = 50) {
    return await this.db.all(
      `SELECT l.*, u.email as admin_email 
       FROM admin_logs l
       JOIN users u ON u.id = l.admin_id
       WHERE l.action = ?
       ORDER BY l.created_at DESC
       LIMIT ?`,
      [action, limit]
    );
  }

  async getLogsByUser(userId, limit = 50) {
    return await this.db.all(
      `SELECT * FROM admin_logs 
       WHERE admin_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, limit]
    );
  }
}
