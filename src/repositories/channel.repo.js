// 投放渠道数据访问。
import { query, queryOne, execute } from '../db/pool.js';

const mapChannel = (row) => ({
  id: String(row.id),
  code: row.code,
  name: row.name,
  bidType: row.bid_type,
  status: Number(row.status),
  sortNo: row.sort_no,
  remark: row.remark,
  campaignCount: row.campaign_count === undefined ? undefined : Number(row.campaign_count),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const channelRepo = {
  async list({ keyword, status, offset, limit }) {
    const where = ['deleted_at IS NULL'];
    const params = [];
    if (keyword) {
      where.push('(name LIKE ? OR code LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (status !== undefined && status !== null && status !== '') {
      where.push('status = ?');
      params.push(Number(status));
    }
    const clause = `WHERE ${where.join(' AND ')}`;
    const rows = await query(
      `SELECT ch.*, (SELECT COUNT(*) FROM campaign c WHERE c.channel = ch.code AND c.deleted_at IS NULL) AS campaign_count
         FROM channel ch ${clause}
        ORDER BY ch.sort_no ASC, ch.id ASC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const totalRow = await queryOne(`SELECT COUNT(*) AS total FROM channel ch ${clause}`, params);
    return { items: rows.map(mapChannel), total: Number(totalRow.total) };
  },

  async listActive() {
    const rows = await query(
      `SELECT id, code, name, status, sort_no FROM channel
        WHERE status = 1 AND deleted_at IS NULL ORDER BY sort_no ASC, id ASC`
    );
    return rows.map((r) => ({ id: String(r.id), code: r.code, name: r.name, status: Number(r.status) }));
  },

  /** 包含停用但未删除的渠道，供字典与历史名称展示 */
  async listAll() {
    const rows = await query(
      `SELECT id, code, name, bid_type, status, sort_no FROM channel
        WHERE deleted_at IS NULL ORDER BY sort_no ASC, id ASC`
    );
    return rows.map((r) => ({
      id: String(r.id),
      code: r.code,
      name: r.name,
      bidType: r.bid_type,
      status: Number(r.status),
    }));
  },

  async findById(id) {
    const row = await queryOne('SELECT * FROM channel WHERE id = ?', [id]);
    return row ? mapChannel(row) : null;
  },

  async findByCode(code) {
    return queryOne('SELECT * FROM channel WHERE code = ?', [code]);
  },

  async countCampaigns(code) {
    const row = await queryOne('SELECT COUNT(*) AS total FROM campaign WHERE channel = ? AND deleted_at IS NULL', [code]);
    return Number(row.total);
  },

  async create({ code, name, bidType = 'cpm', status = 1, sortNo = 0, remark }) {
    const result = await execute(
      `INSERT INTO channel (code, name, bid_type, status, sort_no, remark) VALUES (?, ?, ?, ?, ?, ?)`,
      [code, name, bidType, status, sortNo, remark || null]
    );
    return String(result.insertId);
  },

  async update(id, payload) {
    const sets = [];
    const params = [];
    const map = { name: 'name', bidType: 'bid_type', status: 'status', sortNo: 'sort_no', remark: 'remark' };
    for (const [key, column] of Object.entries(map)) {
      if (payload[key] !== undefined) {
        sets.push(`${column} = ?`);
        params.push(payload[key]);
      }
    }
    if (!sets.length) return;
    params.push(id);
    await execute(`UPDATE channel SET ${sets.join(', ')} WHERE id = ?`, params);
  },

  async version() {
    const row = await queryOne('SELECT MAX(updated_at) AS v FROM channel');
    return row?.v || null;
  },

  async softDelete(id) {
    await execute('UPDATE channel SET status = 0, deleted_at = NOW() WHERE id = ?', [id]);
  },
};
