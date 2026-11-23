// 报表任务数据访问。
import { query, queryOne, execute } from '../db/pool.js';

const mapTask = (row) => ({
  id: row.id,
  type: row.type,
  format: row.format,
  campaignId: row.campaign_id ? String(row.campaign_id) : null,
  campaignIds: row.params?.campaignIds || (row.campaign_id ? [String(row.campaign_id)] : []),
  params: row.params,
  status: row.status,
  fileName: row.file_name,
  fileSize: row.file_size === null || row.file_size === undefined ? null : Number(row.file_size),
  filePath: row.file_path,
  createdBy: String(row.created_by),
  createdAt: row.created_at,
  finishedAt: row.finished_at,
});

export const reportRepo = {
  async create({ id, type, format, campaignId, params, createdBy }) {
    await execute(
      `INSERT INTO report_task (id, type, format, campaign_id, params, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [id, type, format, campaignId || null, JSON.stringify(params || {}), createdBy]
    );
  },

  async markDone(id, { fileName, filePath, fileSize }) {
    await execute(
      `UPDATE report_task
          SET status = 'success', file_name = ?, file_path = ?, file_size = ?, finished_at = NOW()
        WHERE id = ?`,
      [fileName, filePath, fileSize || null, id]
    );
  },

  async markFailed(id) {
    await execute(`UPDATE report_task SET status = 'failed', finished_at = NOW() WHERE id = ?`, [id]);
  },

  async findById(id) {
    const row = await queryOne('SELECT * FROM report_task WHERE id = ?', [id]);
    return row ? mapTask(row) : null;
  },

  async list({ createdBy, offset, limit }) {
    const where = createdBy ? 'WHERE created_by = ?' : '';
    const params = createdBy ? [createdBy] : [];
    const rows = await query(
      `SELECT id, type, format, campaign_id, params, status, file_name, file_size,
              created_at, finished_at
         FROM report_task ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const totalRow = await queryOne(`SELECT COUNT(*) AS total FROM report_task ${where}`, params);
    return {
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        format: r.format,
        campaignId: r.campaign_id ? String(r.campaign_id) : null,
        campaignIds: r.params?.campaignIds || (r.campaign_id ? [String(r.campaign_id)] : []),
        status: r.status,
        fileName: r.file_name,
        fileSize: r.file_size === null ? null : Number(r.file_size),
        createdAt: r.created_at,
        finishedAt: r.finished_at,
      })),
      total: Number(totalRow.total),
    };
  },
};
