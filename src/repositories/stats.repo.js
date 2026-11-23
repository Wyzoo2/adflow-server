// 分日指标与人群维度的幂等写入、查询。

import { pool, query, queryOne } from '../db/pool.js';

const DAILY_SQL = `INSERT INTO daily_stat
  (campaign_id, stat_date, impressions, reach, clicks, cost, source, updated_by)
  VALUES ? AS new
  ON DUPLICATE KEY UPDATE
    impressions = new.impressions,
    reach       = new.reach,
    clicks      = new.clicks,
    cost        = new.cost,
    source      = new.source,
    updated_by  = new.updated_by`;

const DIM_SQL = `INSERT INTO dim_stat
  (campaign_id, dim_type, dim_value, impressions, reach, clicks)
  VALUES ? AS new
  ON DUPLICATE KEY UPDATE
    impressions = new.impressions,
    reach       = new.reach,
    clicks      = new.clicks`;

export const statsRepo = {
  async upsertDaily(rows, conn = null) {
    if (!rows.length) return 0;
    const runner = conn || pool;
    await runner.query(DAILY_SQL, [rows]);
    return rows.length;
  },

  async upsertDims(rows, conn = null) {
    if (!rows.length) return 0;
    const runner = conn || pool;
    await runner.query(DIM_SQL, [rows]);
    return rows.length;
  },

  async listDaily(campaignId, { from, to } = {}) {
    const where = ['campaign_id = ?'];
    const params = [campaignId];
    if (from) {
      where.push('stat_date >= ?');
      params.push(from);
    }
    if (to) {
      where.push('stat_date <= ?');
      params.push(to);
    }
    const rows = await query(
      `SELECT stat_date, impressions, reach, clicks, cost, source, updated_at
         FROM daily_stat WHERE ${where.join(' AND ')} ORDER BY stat_date ASC`,
      params
    );
    return rows.map((r) => ({
      statDate: r.stat_date,
      impressions: String(r.impressions),
      reach: String(r.reach),
      clicks: String(r.clicks),
      cost: r.cost,
      source: r.source,
      updatedAt: r.updated_at,
    }));
  },

  async totals(campaignId, { from, to } = {}) {
    const where = ['campaign_id = ?'];
    const params = [campaignId];
    if (from) {
      where.push('stat_date >= ?');
      params.push(from);
    }
    if (to) {
      where.push('stat_date <= ?');
      params.push(to);
    }
    const row = await queryOne(
      `SELECT COALESCE(SUM(impressions),0) AS impressions,
              COALESCE(SUM(reach),0) AS reach,
              COALESCE(SUM(clicks),0) AS clicks,
              COALESCE(SUM(cost),0) AS cost
         FROM daily_stat WHERE ${where.join(' AND ')}`,
      params
    );
    return {
      impressions: String(row.impressions),
      reach: String(row.reach),
      clicks: String(row.clicks),
      cost: row.cost,
    };
  },

  async listDims(campaignId, type) {
    const where = ['campaign_id = ?'];
    const params = [campaignId];
    if (type) {
      where.push('dim_type = ?');
      params.push(type);
    }
    const rows = await query(
      `SELECT dim_type, dim_value, impressions, reach, clicks
         FROM dim_stat WHERE ${where.join(' AND ')}
        ORDER BY dim_type, CAST(impressions AS UNSIGNED) DESC`,
      params
    );
    return rows.map((r) => ({
      dimType: r.dim_type,
      dimValue: r.dim_value,
      impressions: String(r.impressions),
      reach: String(r.reach),
      clicks: String(r.clicks),
    }));
  },

  async findDaily(campaignId, statDate) {
    return queryOne('SELECT * FROM daily_stat WHERE campaign_id = ? AND stat_date = ?', [
      campaignId,
      statDate,
    ]);
  },
};
