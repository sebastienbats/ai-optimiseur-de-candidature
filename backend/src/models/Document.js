export class Document {
  constructor(db) {
    this.db = db;
  }

  async save(userId, title, content, type) {
    const result = await this.db.run(
      `INSERT INTO documents (user_id, title, content, type) 
       VALUES (?, ?, ?, ?)`,
      [userId, title, content, type]
    );
    return result.lastID;
  }

  async getByUser(userId) {
    return await this.db.all(
      'SELECT * FROM documents WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
  }

  async update(id, userId, content) {
    await this.db.run(
      `UPDATE documents SET content = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND user_id = ?`,
      [content, id, userId]
    );
  }

  async delete(id, userId) {
    await this.db.run(
      'DELETE FROM documents WHERE id = ? AND user_id = ?',
      [id, userId]
    );
  }

  async getByType(userId, type) {
    return await this.db.all(
      'SELECT * FROM documents WHERE user_id = ? AND type = ? ORDER BY created_at DESC',
      [userId, type]
    );
  }
}
