// 报表任务数据访问。

import { query, queryOne, execute } from '../db/pool.js';

export const reportRepo = {
  async create({ id, type, campaignId, params, createdBy }) {
    await execute(
      `INSERT INTO report_task (id, type, campaign_id, params, status, created_by)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [id, type, campaignId || null, JSON.stringify(params || {}), createdBy]
    );
  },

  async markDone(id, { fileName, filePath }) {
    await execute(
      `UPDATE report_task SET status = 'success', file_name = ?, file_path = ?, finished_at = NOW() WHERE id = ?`,
      [fileName, filePath, id]
    );
  },

  async markFailed(id) {
    await execute(`UPDATE report_task SET status = 'failed', finished_at = NOW() WHERE id = ?`, [id]);
  },

  async findById(id) {
    const row = await queryOne('SELECT * FROM report_task WHERE id = ?', [id]);
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      campaignId: row.campaign_id ? String(row.campaign_id) : null,
      params: row.params,
      status: row.status,
      fileName: row.file_name,
      filePath: row.file_path,
      createdBy: String(row.created_by),
      createdAt: row.created_at,
      finishedAt: row.finished_at,
    };
  },

  async list({ createdBy, offset, limit }) {
    const where = createdBy ? 'WHERE created_by = ?' : '';
    const params = createdBy ? [createdBy] : [];
    const rows = await query(
      `SELECT id, type, campaign_id, status, file_name, created_at, finished_at
         FROM report_task ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const totalRow = await queryOne(`SELECT COUNT(*) AS total FROM report_task ${where}`, params);
    return {
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        campaignId: r.campaign_id ? String(r.campaign_id) : null,
        status: r.status,
        fileName: r.file_name,
        createdAt: r.created_at,
        finishedAt: r.finished_at,
      })),
      total: Number(totalRow.total),
    };
  },
};
