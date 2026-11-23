// 计划与计划-厂商关联的数据访问。

import { query, queryOne, execute } from '../db/pool.js';

const mapCampaign = (row) => ({
  id: String(row.id),
  projectId: String(row.project_id),
  projectName: row.project_name || undefined,
  code: row.code,
  name: row.name,
  channel: row.channel,
  objective: row.objective,
  status: row.status,
  budget: row.budget,
  targetImpressions: String(row.target_impressions),
  startDate: row.start_date,
  endDate: row.end_date,
  targeting: row.targeting || null,
  remark: row.remark,
  createdBy: String(row.created_by),
  publishedAt: row.published_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  vendors: row.vendors || [],
  actualImpressions: row.stat_impressions === undefined ? undefined : String(row.stat_impressions),
  actualReach: row.stat_reach === undefined ? undefined : String(row.stat_reach),
  actualClicks: row.stat_clicks === undefined ? undefined : String(row.stat_clicks),
  actualCost: row.stat_cost === undefined ? undefined : row.stat_cost,
});

function buildFilters(filters) {
  const where = ['c.deleted_at IS NULL'];
  const params = [];
  if (filters.projectId) {
    where.push('c.project_id = ?');
    params.push(filters.projectId);
  }
  if (filters.keyword) {
    where.push('(c.name LIKE ? OR c.code LIKE ?)');
    params.push(`%${filters.keyword}%`, `%${filters.keyword}%`);
  }
  if (filters.code) {
    where.push('c.code = ?');
    params.push(filters.code);
  }
  if (filters.channel) {
    where.push('c.channel = ?');
    params.push(filters.channel);
  }
  if (filters.status) {
    where.push('c.status = ?');
    params.push(filters.status);
  }
  if (filters.from) {
    where.push('c.end_date >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    where.push('c.start_date <= ?');
    params.push(filters.to);
  }
  if (filters.createdBy) {
    where.push('c.created_by = ?');
    params.push(filters.createdBy);
  }
  if (filters.vendorId) {
    where.push('EXISTS (SELECT 1 FROM campaign_vendor cv WHERE cv.campaign_id = c.id AND cv.vendor_id = ?)');
    params.push(filters.vendorId);
  }
  return { clause: `WHERE ${where.join(' AND ')}`, params };
}

async function attachVendors(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const links = await query(
    `SELECT cv.campaign_id, v.id, v.code, v.name, v.platform
       FROM campaign_vendor cv JOIN vendor v ON v.id = cv.vendor_id
      WHERE cv.campaign_id IN (?) ORDER BY v.id`,
    [ids]
  );
  const map = new Map();
  for (const link of links) {
    const key = String(link.campaign_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      id: String(link.id),
      code: link.code,
      name: link.name,
      platform: link.platform,
    });
  }
  for (const row of rows) row.vendors = map.get(String(row.id)) || [];
  return rows;
}

export const campaignRepo = {
  async list(filters, { offset, limit }) {
    const { clause, params } = buildFilters(filters);
    const rows = await query(
      `SELECT c.*, p.name AS project_name,
              s.impressions AS stat_impressions,
              s.reach       AS stat_reach,
              s.clicks      AS stat_clicks,
              s.cost        AS stat_cost
         FROM campaign c
         LEFT JOIN project p ON p.id = c.project_id
         LEFT JOIN (
           SELECT campaign_id,
                  SUM(impressions) AS impressions,
                  SUM(reach)       AS reach,
                  SUM(clicks)      AS clicks,
                  SUM(cost)        AS cost
             FROM daily_stat GROUP BY campaign_id
         ) s ON s.campaign_id = c.id
         ${clause}
        ORDER BY c.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const totalRow = await queryOne(`SELECT COUNT(*) AS total FROM campaign c ${clause}`, params);
    await attachVendors(rows);
    const items = rows.map(mapCampaign);
    return { items, total: Number(totalRow.total) };
  },

  async findById(id, scope = {}) {
    const where = ['c.deleted_at IS NULL', 'c.id = ?'];
    const params = [id];
    if (scope.createdBy) {
      where.push('c.created_by = ?');
      params.push(scope.createdBy);
    }
    const row = await queryOne(
      `SELECT c.*, p.name AS project_name
         FROM campaign c LEFT JOIN project p ON p.id = c.project_id
        WHERE ${where.join(' AND ')}`,
      params
    );
    if (!row) return null;
    const campaign = mapCampaign(row);
    const links = await query(
      `SELECT v.id, v.code, v.name, v.platform
         FROM campaign_vendor cv JOIN vendor v ON v.id = cv.vendor_id
        WHERE cv.campaign_id = ? ORDER BY v.id`,
      [id]
    );
    campaign.vendors = links.map((l) => ({
      id: String(l.id),
      code: l.code,
      name: l.name,
      platform: l.platform,
    }));
    return campaign;
  },

  async findByCode(code, scope = {}) {
    const where = ['deleted_at IS NULL', 'code = ?'];
    const params = [code];
    if (scope.createdBy) {
      where.push('created_by = ?');
      params.push(scope.createdBy);
    }
    const row = await queryOne(`SELECT * FROM campaign WHERE ${where.join(' AND ')}`, params);
    return row ? mapCampaign(row) : null;
  },

  async existsName(projectId, name, excludeId = null) {
    const params = [projectId, name];
    let sql = 'SELECT id FROM campaign WHERE project_id = ? AND name = ? AND deleted_at IS NULL';
    if (excludeId) {
      sql += ' AND id <> ?';
      params.push(excludeId);
    }
    return Boolean(await queryOne(sql, params));
  },

  async create(payload) {
    const result = await execute(
      `INSERT INTO campaign
         (project_id, name, channel, objective, status, budget, target_impressions,
          start_date, end_date, targeting, remark, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.projectId,
        payload.name,
        payload.channel,
        payload.objective || 'impression',
        payload.status || 'draft',
        payload.budget || 0,
        payload.targetImpressions || 0,
        payload.startDate,
        payload.endDate,
        payload.targeting ? JSON.stringify(payload.targeting) : null,
        payload.remark || null,
        payload.createdBy,
      ]
    );
    return String(result.insertId);
  },

  async update(id, payload) {
    const sets = [];
    const params = [];
    const fieldMap = {
      name: 'name',
      channel: 'channel',
      objective: 'objective',
      budget: 'budget',
      targetImpressions: 'target_impressions',
      startDate: 'start_date',
      endDate: 'end_date',
      remark: 'remark',
    };
    for (const [key, column] of Object.entries(fieldMap)) {
      if (payload[key] !== undefined) {
        sets.push(`${column} = ?`);
        params.push(payload[key]);
      }
    }
    if (payload.targeting !== undefined) {
      sets.push('targeting = ?');
      params.push(payload.targeting ? JSON.stringify(payload.targeting) : null);
    }
    if (!sets.length) return;
    params.push(id);
    await execute(`UPDATE campaign SET ${sets.join(', ')} WHERE id = ?`, params);
  },

  async softDelete(id) {
    await execute('UPDATE campaign SET deleted_at = NOW() WHERE id = ?', [id]);
  },

  async lockById(conn, id) {
    const [rows] = await conn.query('SELECT * FROM campaign WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [id]);
    return rows.length ? mapCampaign(rows[0]) : null;
  },

  async setStatus(id, status, extra = {}) {
    const sets = ['status = ?'];
    const params = [status];
    if (extra.publishedAt) {
      sets.push('published_at = ?');
      params.push(extra.publishedAt);
    }
    params.push(id);
    await execute(`UPDATE campaign SET ${sets.join(', ')} WHERE id = ?`, params);
  },

  async setVendors(conn, campaignId, vendorIds) {
    await conn.query('DELETE FROM campaign_vendor WHERE campaign_id = ?', [campaignId]);
    if (!vendorIds.length) return;
    await conn.query('INSERT INTO campaign_vendor (campaign_id, vendor_id) VALUES ?', [
      vendorIds.map((vendorId) => [campaignId, vendorId]),
    ]);
  },

  async findActiveVendors(conn, vendorIds) {
    const [rows] = await conn.query(
      'SELECT id FROM vendor WHERE id IN (?) AND status = 1 AND deleted_at IS NULL',
      [vendorIds]
    );
    return rows;
  },
};
