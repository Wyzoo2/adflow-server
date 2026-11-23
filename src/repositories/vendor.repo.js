// 厂商数据访问（含关联计划数、软删除）。

import { query, queryOne, execute } from '../db/pool.js';

const mapVendor = (row) => ({
  id: String(row.id),
  code: row.code,
  name: row.name,
  platform: row.platform,
  contactName: row.contact_name,
  contactPhone: row.contact_phone,
  status: Number(row.status),
  remark: row.remark,
  campaignCount: row.campaign_count === undefined ? undefined : Number(row.campaign_count),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const vendorRepo = {
  async list({ keyword, platform, status, offset, limit }) {
    const where = ['v.deleted_at IS NULL'];
    const params = [];
    if (keyword) {
      where.push('(v.name LIKE ? OR v.code LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (platform) {
      where.push('v.platform = ?');
      params.push(platform);
    }
    if (status !== undefined && status !== null && status !== '') {
      where.push('v.status = ?');
      params.push(Number(status));
    }
    const clause = `WHERE ${where.join(' AND ')}`;
    const rows = await query(
      `SELECT v.*, (SELECT COUNT(*) FROM campaign_vendor cv WHERE cv.vendor_id = v.id) AS campaign_count
         FROM vendor v ${clause}
        ORDER BY v.id ASC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const totalRow = await queryOne(`SELECT COUNT(*) AS total FROM vendor v ${clause}`, params);
    return { items: rows.map(mapVendor), total: Number(totalRow.total) };
  },

  async listActive() {
    const rows = await query(
      `SELECT id, code, name, platform, status FROM vendor
        WHERE status = 1 AND deleted_at IS NULL ORDER BY id ASC`
    );
    return rows.map((r) => ({
      id: String(r.id),
      code: r.code,
      name: r.name,
      platform: r.platform,
      status: Number(r.status),
    }));
  },

  async findById(id) {
    const row = await queryOne('SELECT * FROM vendor WHERE id = ? AND deleted_at IS NULL', [id]);
    return row ? mapVendor(row) : null;
  },

  async findByCode(code) {
    return queryOne('SELECT * FROM vendor WHERE code = ?', [code]);
  },

  async create(payload) {
    const result = await execute(
      `INSERT INTO vendor (code, name, platform, contact_name, contact_phone, status, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.code,
        payload.name,
        payload.platform,
        payload.contactName || null,
        payload.contactPhone || null,
        payload.status === undefined ? 1 : payload.status,
        payload.remark || null,
      ]
    );
    return String(result.insertId);
  },

  async update(id, payload) {
    const sets = [];
    const params = [];
    const map = {
      name: 'name',
      platform: 'platform',
      contactName: 'contact_name',
      contactPhone: 'contact_phone',
      status: 'status',
      remark: 'remark',
    };
    for (const [key, column] of Object.entries(map)) {
      if (payload[key] !== undefined) {
        sets.push(`${column} = ?`);
        params.push(payload[key]);
      }
    }
    if (!sets.length) return;
    params.push(id);
    await execute(`UPDATE vendor SET ${sets.join(', ')} WHERE id = ?`, params);
  },

  async countCampaigns(id) {
    const row = await queryOne('SELECT COUNT(*) AS total FROM campaign_vendor WHERE vendor_id = ?', [id]);
    return Number(row.total);
  },

  async softDelete(id) {
    await execute('UPDATE vendor SET deleted_at = NOW(), status = 0 WHERE id = ?', [id]);
  },
};
