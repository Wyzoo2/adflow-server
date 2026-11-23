// 用户数据访问。

import { query, queryOne, execute } from '../db/pool.js';

const mapUser = (row) =>
  row
    ? {
        id: String(row.id),
        username: row.username,
        displayName: row.display_name,
        role: row.role,
        status: Number(row.status),
        lastLoginAt: row.last_login_at,
        createdAt: row.created_at,
      }
    : null;

export const userRepo = {
  async findByUsername(username) {
    return queryOne('SELECT * FROM sys_user WHERE username = ?', [username]);
  },

  async findById(id) {
    return mapUser(
      await queryOne(
        `SELECT id, username, display_name, role, status, last_login_at, created_at
           FROM sys_user WHERE id = ?`,
        [id]
      )
    );
  },

  async list({ keyword, role, status, offset, limit }) {
    const where = [];
    const params = [];
    if (keyword) {
      where.push('(username LIKE ? OR display_name LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (role) {
      where.push('role = ?');
      params.push(role);
    }
    if (status !== undefined && status !== null && status !== '') {
      where.push('status = ?');
      params.push(Number(status));
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await query(
      `SELECT id, username, display_name, role, status, last_login_at, created_at
         FROM sys_user ${clause}
        ORDER BY id ASC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const totalRow = await queryOne(`SELECT COUNT(*) AS total FROM sys_user ${clause}`, params);
    return { items: rows.map(mapUser), total: Number(totalRow.total) };
  },

  async create({ username, passwordHash, displayName, role, status = 1 }) {
    const result = await execute(
      `INSERT INTO sys_user (username, password_hash, display_name, role, status)
       VALUES (?, ?, ?, ?, ?)`,
      [username, passwordHash, displayName, role, status]
    );
    return String(result.insertId);
  },

  async update(id, fields) {
    const sets = [];
    const params = [];
    if (fields.displayName !== undefined) {
      sets.push('display_name = ?');
      params.push(fields.displayName);
    }
    if (fields.role !== undefined) {
      sets.push('role = ?');
      params.push(fields.role);
    }
    if (fields.status !== undefined) {
      sets.push('status = ?');
      params.push(fields.status);
    }
    if (!sets.length) return;
    params.push(id);
    await execute(`UPDATE sys_user SET ${sets.join(', ')} WHERE id = ?`, params);
  },

  async updatePassword(id, passwordHash) {
    await execute('UPDATE sys_user SET password_hash = ? WHERE id = ?', [passwordHash, id]);
  },

  async touchLogin(id) {
    await execute('UPDATE sys_user SET last_login_at = NOW() WHERE id = ?', [id]);
  },
};
