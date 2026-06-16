import bcrypt from 'bcrypt';

export class User {
  constructor(db) {
    this.db = db;
  }

  async create(email, password, isAdmin = false) {
    const password_hash = await bcrypt.hash(password, 12);
    const result = await this.db.run(
      'INSERT INTO users (email, password_hash, is_admin) VALUES (?, ?, ?)',
      [email, password_hash, isAdmin ? 1 : 0]
    );
    return result.lastID;
  }

  async findByEmail(email) {
    return await this.db.get(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
  }

  async findById(id) {
    return await this.db.get(
      'SELECT id, email, is_admin, is_active, created_at FROM users WHERE id = ?',
      [id]
    );
  }

  async validatePassword(user, password) {
    return await bcrypt.compare(password, user.password_hash);
  }

  async getAllUsers(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const users = await this.db.all(
      `SELECT id, email, is_admin, is_active, created_at 
       FROM users 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    
    const total = await this.db.get('SELECT COUNT(*) as count FROM users');
    
    return {
      users,
      total: total.count,
      page,
      totalPages: Math.ceil(total.count / limit)
    };
  }

  async toggleActive(id, isActive) {
    await this.db.run(
      'UPDATE users SET is_active = ? WHERE id = ?',
      [isActive ? 1 : 0, id]
    );
  }

  async deleteUser(id) {
    await this.db.run('DELETE FROM users WHERE id = ?', [id]);
  }

  async updateAdminStatus(id, isAdmin) {
    await this.db.run(
      'UPDATE users SET is_admin = ? WHERE id = ?',
      [isAdmin ? 1 : 0, id]
    );
  }

  async getUserStats() {
    return await this.db.get(`
      SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_users,
        SUM(CASE WHEN is_admin = 1 THEN 1 ELSE 0 END) as admin_users,
        COUNT(DISTINCT date(created_at)) as days_with_signups
      FROM users
    `);
  }

  async getRecentSignups(days = 7) {
    return await this.db.all(
      `SELECT date(created_at) as date, COUNT(*) as count 
       FROM users 
       WHERE created_at >= datetime('now', '-' || ? || ' days')
       GROUP BY date(created_at)
       ORDER BY date(created_at) ASC`,
      [days]
    );
  }
}
