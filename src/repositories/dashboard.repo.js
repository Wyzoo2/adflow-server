// 看板聚合查询（汇总、趋势、人群、渠道）。

import { query, queryOne } from '../db/pool.js';

function campaignFilter({ projectId, createdBy, from, to }) {
  const where = ['c.deleted_at IS NULL'];
  const params = [];
  if (projectId) {
    where.push('c.project_id = ?');
    params.push(projectId);
  }
  if (createdBy) {
    where.push('c.created_by = ?');
    params.push(createdBy);
  }
  if (from) {
    where.push('c.end_date >= ?');
    params.push(from);
  }
  if (to) {
    where.push('c.start_date <= ?');
    params.push(to);
  }
  return { clause: `WHERE ${where.join(' AND ')}`, params };
}

function statDateFilter({ from, to }) {
  const where = [];
  const params = [];
  if (from) {
    where.push('d.stat_date >= ?');
    params.push(from);
  }
  if (to) {
    where.push('d.stat_date <= ?');
    params.push(to);
  }
  return { clause: where.length ? `AND ${where.join(' AND ')}` : '', params };
}

export const dashboardRepo = {
  async summary(filter) {
    const cf = campaignFilter(filter);
    const sf = statDateFilter(filter);
    const row = await queryOne(
      `SELECT COALESCE(SUM(d.impressions),0) AS impressions,
              COALESCE(SUM(d.reach),0) AS reach,
              COALESCE(SUM(d.clicks),0) AS clicks,
              COALESCE(SUM(d.cost),0) AS cost,
              MAX(d.updated_at) AS data_updated_at
         FROM daily_stat d JOIN campaign c ON c.id = d.campaign_id
         ${cf.clause} ${sf.clause}`,
      [...cf.params, ...sf.params]
    );
    const targetRow = await queryOne(
      `SELECT COALESCE(SUM(c.target_impressions),0) AS target,
              SUM(CASE WHEN c.status = 'running' THEN 1 ELSE 0 END) AS running
         FROM campaign c ${cf.clause}
          AND c.status IN ('running','paused','finished','closed')`,
      cf.params
    );
    return {
      targetImpressions: String(targetRow.target),
      impressions: String(row.impressions),
      reach: String(row.reach),
      clicks: String(row.clicks),
      cost: row.cost,
      runningCampaigns: Number(targetRow.running || 0),
      dataUpdatedAt: row.data_updated_at,
    };
  },

  async trend(filter) {
    const cf = campaignFilter(filter);
    const sf = statDateFilter(filter);
    const rows = await query(
      `SELECT d.stat_date,
              SUM(d.impressions) AS impressions,
              SUM(d.reach) AS reach,
              SUM(d.clicks) AS clicks,
              SUM(d.cost) AS cost
         FROM daily_stat d JOIN campaign c ON c.id = d.campaign_id
         ${cf.clause} ${sf.clause}
        GROUP BY d.stat_date ORDER BY d.stat_date ASC`,
      [...cf.params, ...sf.params]
    );
    return rows.map((r) => ({
      statDate: r.stat_date,
      impressions: String(r.impressions),
      reach: String(r.reach),
      clicks: String(r.clicks),
      cost: r.cost,
    }));
  },

  async dimensions(filter) {
    const cf = campaignFilter(filter);
    const rows = await query(
      `SELECT ds.dim_type, ds.dim_value,
              SUM(ds.impressions) AS impressions,
              SUM(ds.reach) AS reach,
              SUM(ds.clicks) AS clicks
         FROM dim_stat ds JOIN campaign c ON c.id = ds.campaign_id
         ${cf.clause}
        GROUP BY ds.dim_type, ds.dim_value
        ORDER BY ds.dim_type, CAST(SUM(ds.impressions) AS UNSIGNED) DESC`,
      cf.params
    );
    return rows.map((r) => ({
      dimType: r.dim_type,
      dimValue: r.dim_value,
      impressions: String(r.impressions),
      reach: String(r.reach),
      clicks: String(r.clicks),
    }));
  },

  async channelShare(filter) {
    const cf = campaignFilter(filter);
    const sf = statDateFilter(filter);
    const rows = await query(
      `SELECT c.channel, SUM(d.impressions) AS impressions
         FROM daily_stat d JOIN campaign c ON c.id = d.campaign_id
         ${cf.clause} ${sf.clause}
        GROUP BY c.channel ORDER BY impressions DESC`,
      [...cf.params, ...sf.params]
    );
    return rows.map((r) => ({ channel: r.channel, impressions: String(r.impressions) }));
  },
};
