// 模拟投放：参数保存、数据生成与覆盖写入。

import { withTransaction, queryOne, pool } from '../db/pool.js';
import { campaignRepo } from '../repositories/campaign.repo.js';
import { statsRepo } from '../repositories/stats.repo.js';
import { auditRepo } from '../repositories/audit.repo.js';
import { generateSeries } from '../adapters/media/mock.js';
import { errors } from '../utils/errors.js';

const CURVES = ['uniform', 'front_load', 'back_load', 'weekend'];

async function accessCampaign(id, user) {
  const campaign = await campaignRepo.findById(id, user.role === 'admin' ? {} : { createdBy: user.id });
  if (!campaign) throw errors.notFound('投放计划不存在');
  return campaign;
}

async function readProfile(campaignId) {
  const row = await queryOne('SELECT * FROM mock_profile WHERE campaign_id = ?', [campaignId]);
  if (!row) return null;
  return {
    totalImpressions: Number(row.total_impressions),
    curveType: row.curve_type,
    ctr: Number(row.ctr),
    cpm: Number(row.cpm),
    frequency: Number(row.frequency),
    dimRatio: row.dim_ratio,
    seed: row.seed,
  };
}

export const mockService = {
  async getProfile(id, user) {
    const campaign = await accessCampaign(id, user);
    const profile = await readProfile(id);
    return {
      campaignId: campaign.id,
      totalImpressions: profile ? String(profile.totalImpressions) : campaign.targetImpressions,
      curveType: profile?.curveType || 'uniform',
      ctr: profile?.ctr ?? 0.01,
      cpm: profile?.cpm ?? 12,
      frequency: profile?.frequency ?? 65,
      dimRatio: profile?.dimRatio || null,
      seed: profile?.seed ?? 20261101,
      saved: Boolean(profile),
    };
  },

  async saveProfile(id, payload, user, ip) {
    if (user.role !== 'admin') throw errors.forbidden('模拟参数仅管理员可配置');
    const campaign = await accessCampaign(id, user);

    const curveType = payload.curveType || 'uniform';
    if (!CURVES.includes(curveType)) throw errors.mockParam('投放曲线取值不合法');
    const ctr = Number(payload.ctr ?? 0.01);
    if (ctr < 0 || ctr > 0.2) throw errors.mockParam('点击率需在 0 到 20% 之间');
    const cpm = Number(payload.cpm ?? 12);
    if (cpm <= 0) throw errors.mockParam('千人成本必须大于零');
    const frequency = Number(payload.frequency ?? 65);
    if (frequency < 1 || frequency > 1000) throw errors.mockParam('曝光频次需在 1 到 1000 之间');
    const totalImpressions = Number(payload.totalImpressions ?? campaign.targetImpressions);
    if (!Number.isFinite(totalImpressions) || totalImpressions < 0) throw errors.mockParam('目标总曝光不合法');

    await pool.query(
      `INSERT INTO mock_profile
         (campaign_id, total_impressions, curve_type, ctr, cpm, frequency, dim_ratio, seed, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) AS new
       ON DUPLICATE KEY UPDATE
         total_impressions = new.total_impressions,
         curve_type = new.curve_type, ctr = new.ctr, cpm = new.cpm,
         frequency = new.frequency, dim_ratio = new.dim_ratio,
         seed = new.seed, updated_by = new.updated_by`,
      [
        id,
        totalImpressions,
        curveType,
        ctr,
        cpm,
        frequency,
        payload.dimRatio ? JSON.stringify(payload.dimRatio) : null,
        Number(payload.seed || 20261101),
        user.id,
      ]
    );
    await auditRepo.insert({
      objectType: 'campaign',
      objectId: id,
      action: 'save_mock_profile',
      after: { curveType, ctr, cpm, frequency, totalImpressions },
      operatorId: user.id,
      ip,
    });
    return this.getProfile(id, user);
  },

  /**
   * 生成模拟数据：按 mock_profile 生成逐日指标与人群维度，
   * 以覆盖方式写入（重复生成不会累加），并记录同步任务与审计。
   */
  async generate(id, options, user, ip) {
    if (user.role !== 'admin') throw errors.forbidden('生成模拟数据仅管理员可执行');
    const campaign = await accessCampaign(id, user);
    const profile = await readProfile(id);
    const from = options.from || campaign.startDate;
    const to = options.to || campaign.endDate;
    if (from > to) throw errors.badRequest('生成开始日期不能晚于结束日期');
    if (from < campaign.startDate || to > campaign.endDate) {
      throw errors.badRequest('生成日期需在计划排期范围内');
    }

    const series = generateSeries({ campaign, profile, from, to });
    const existing = await statsRepo.existingDates(id, { from, to });
    const existingSet = new Set(existing);
    const added = series.daily.filter((d) => !existingSet.has(d.statDate)).length;

    await withTransaction(async (conn) => {
      await statsRepo.upsertDaily(
        series.daily.map((d) => [
          id,
          d.statDate,
          d.impressions,
          d.reach,
          d.clicks,
          d.cost,
          'mock',
          user.id,
        ]),
        conn
      );
      await statsRepo.upsertDims(
        series.dims.map((d) => [
          id,
          d.statDate,
          d.dimType,
          d.dimValue,
          d.impressions,
          d.reach,
          d.clicks,
        ]),
        conn
      );
      await conn.query(
        `INSERT INTO sync_task (campaign_id, trigger_type, adapter, status, rows_affected, message, finished_at)
         VALUES (?, 'manual', 'mock', 'success', ?, ?, NOW())`,
        [id, series.daily.length, `生成 ${from} 至 ${to} 的模拟数据`]
      );
      await auditRepo.insert(
        {
          objectType: 'campaign',
          objectId: id,
          action: 'mock_generate',
          after: { from, to, days: series.daily.length, totals: series.totals },
          operatorId: user.id,
          ip,
        },
        conn
      );
    });

    return {
      campaignId: id,
      from,
      to,
      days: series.daily.length,
      added,
      totals: {
        impressions: String(series.totals.impressions),
        reach: String(series.totals.reach),
        clicks: String(series.totals.clicks),
        cost: series.totals.cost,
      },
    };
  },
};
