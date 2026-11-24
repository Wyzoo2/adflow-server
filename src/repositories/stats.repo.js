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
  (campaign_id, stat_date, dim_type, dim_value, impressions, reach, clicks)
  VALUES ? AS new
  ON DUPLICATE KEY UPDATE
    impressions = new.impressions,
    reach       = new.reach,
    clicks      = new.clicks`;

function dateFilter(alias, { from, to }) {
  const where = [];
  const params = [];
  if (from) {
    where.push(`${alias} >= ?`);
    params.push(from);
  }
  if (to) {
    where.push(`${alias} <= ?`);
    params.push(to);
  }
  return { where, params };
}

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
    const f = dateFilter('stat_date', { from, to });
    const where = ['campaign_id = ?', ...f.where];
    const rows = await query(
      `SELECT stat_date, impressions, reach, clicks, cost, updated_at
         FROM daily_stat WHERE ${where.join(' AND ')} ORDER BY stat_date ASC`,
      [campaignId, ...f.params]
    );
    return rows.map((r) => ({
      statDate: r.stat_date,
      impressions: String(r.impressions),
      reach: String(r.reach),
      clicks: String(r.clicks),
      cost: r.cost,
      updatedAt: r.updated_at,
    }));
  },

  async totals(campaignId, { from, to } = {}) {
    const f = dateFilter('stat_date', { from, to });
    const where = ['campaign_id = ?', ...f.where];
    const row = await queryOne(
      `SELECT COALESCE(SUM(impressions),0) AS impressions,
              COALESCE(SUM(reach),0) AS reach,
              COALESCE(SUM(clicks),0) AS clicks,
              COALESCE(SUM(cost),0) AS cost,
              MAX(updated_at) AS data_updated_at
         FROM daily_stat WHERE ${where.join(' AND ')}`,
      [campaignId, ...f.params]
    );
    return {
      impressions: String(row.impressions),
      reach: String(row.reach),
      clicks: String(row.clicks),
      cost: row.cost,
      dataUpdatedAt: row.data_updated_at,
    };
  },

  async listDims(campaignId, { type, from, to } = {}) {
    const where = ['campaign_id = ?'];
    const params = [campaignId];
    if (type) {
      where.push('dim_type = ?');
      params.push(type);
    }
    const f = dateFilter('stat_date', { from, to });
    where.push(...f.where);
    params.push(...f.params);
    const rows = await query(
      `SELECT stat_date, dim_type, dim_value, impressions, reach, clicks
         FROM dim_stat WHERE ${where.join(' AND ')}
        ORDER BY stat_date ASC, dim_type, CAST(impressions AS UNSIGNED) DESC`,
      params
    );
    return rows.map((r) => ({
      statDate: r.stat_date,
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

  async existingDates(campaignId, { from, to } = {}) {
    const f = dateFilter('stat_date', { from, to });
    const where = ['campaign_id = ?', ...f.where];
    const rows = await query(
      `SELECT stat_date FROM daily_stat WHERE ${where.join(' AND ')}`,
      [campaignId, ...f.params]
    );
    return rows.map((r) => r.stat_date);
  },

  /** 清空单个计划的全部分日与人群数据，返回删除的分日行数 */
  async clearCampaign(campaignId) {
    const row = await queryOne('SELECT COUNT(*) AS total FROM daily_stat WHERE campaign_id = ?', [campaignId]);
    await query('DELETE FROM dim_stat WHERE campaign_id = ?', [campaignId]);
    await query('DELETE FROM daily_stat WHERE campaign_id = ?', [campaignId]);
    return Number(row.total);
  },
};
