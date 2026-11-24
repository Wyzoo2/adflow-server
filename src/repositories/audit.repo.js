// 审计日志的写入与查询。

import { pool, query, queryOne } from '../db/pool.js';

export const auditRepo = {
  async insert(entry, conn = null) {
    const runner = conn || pool;
    await runner.query(
      `INSERT INTO audit_log
         (object_type, object_id, action, before_data, after_data, operator_id, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.objectType,
        entry.objectId,
        entry.action,
        entry.before ? JSON.stringify(entry.before) : null,
        entry.after ? JSON.stringify(entry.after) : null,
        entry.operatorId,
        entry.ip || null,
      ]
    );
  },

  async list({ objectType, objectId, operatorId, action, from, to, offset, limit }) {
    const where = [];
    const params = [];
    if (objectType) {
      where.push('object_type = ?');
      params.push(objectType);
    }
    if (objectId) {
      where.push('object_id = ?');
      params.push(objectId);
    }
    if (operatorId) {
      where.push('operator_id = ?');
      params.push(operatorId);
    }
    if (action) {
      where.push('action = ?');
      params.push(action);
    }
    if (from) {
      where.push('created_at >= ?');
      params.push(`${from} 00:00:00`);
    }
    if (to) {
      where.push('created_at <= ?');
      params.push(`${to} 23:59:59`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await query(
      `SELECT a.*, u.display_name AS operator_name
         FROM audit_log a LEFT JOIN sys_user u ON u.id = a.operator_id
         ${clause} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const totalRow = await queryOne(`SELECT COUNT(*) AS total FROM audit_log a ${clause}`, params);
    const systemActions = new Set(['auto_publish', 'auto_finish_expired']);
    return {
      items: rows.map((r) => ({
        id: String(r.id),
        objectType: r.object_type,
        objectId: String(r.object_id),
        action: r.action,
        before: r.before_data,
        after: r.after_data,
        operatorId: r.operator_id == null ? null : String(r.operator_id),
        operatorName: systemActions.has(r.action) ? '系统' : r.operator_name,
        ip: r.ip,
        createdAt: r.created_at,
      })),
      total: Number(totalRow.total),
    };
  },
};
