// 投放数据自动变化：按时间滚动生成投放中的计划数据。
// 累计曝光最终落在发布目标的 90%-110%，手工录入/导入的数据不被覆盖。
import { pool, query, withTransaction } from '../db/pool.js';
import { statsRepo } from '../repositories/stats.repo.js';
import { campaignRepo } from '../repositories/campaign.repo.js';
import { generateSeries, splitExact, DEFAULT_DIM_RATIO } from '../adapters/media/mock.js';
import { formatDate } from '../utils/date.js';
import { errors } from '../utils/errors.js';

const LOCK_NAME = 'adflow_auto_data_tick';
const DAY_MS = 24 * 60 * 60 * 1000;

/** 由计划 ID 得到稳定的 0.90-1.10 系数，保证同一计划的最终总量固定 */
function factorOf(id) {
  const text = String(id);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 100003;
  return 0.9 + 0.2 * (hash / 100003);
}

async function readProfile(campaignId) {
  const rows = await query('SELECT * FROM mock_profile WHERE campaign_id = ?', [campaignId]);
  if (!rows.length) return null;
  const row = rows[0];
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

/** 今天已过去的比例；当天发布的从发布时刻开始算 */
function elapsedToday(campaign, today) {
  const now = new Date();
  const dayStart = new Date(`${today}T00:00:00+08:00`);
  const dayEnd = new Date(`${today}T23:59:59+08:00`);
  let start = dayStart;
  if (campaign.published_at) {
    const published = new Date(campaign.published_at);
    if (formatDate(published) === today && published > start) start = published;
  }
  return Math.max(0, Math.min(1, (now - start) / (dayEnd - dayStart)));
}

function buildDimRows(campaignId, day, values, ratio) {
  const rows = [];
  for (const [dimType, mapping] of Object.entries(ratio || DEFAULT_DIM_RATIO)) {
    const names = Object.keys(mapping);
    const weights = Object.values(mapping).map(Number);
    if (!names.length) continue;
    const impSplit = splitExact(values.impressions, weights);
    const reachSplit = splitExact(values.reach, weights);
    const clickSplit = splitExact(values.clicks, weights);
    names.forEach((name, i) => {
      rows.push([
        campaignId,
        day.statDate,
        dimType,
        name,
        impSplit[i],
        reachSplit[i],
        clickSplit[i],
      ]);
    });
  }
  return rows;
}

async function syncCampaign(campaign, today) {
  const startDate = formatDate(new Date(campaign.start_date));
  const endDate = formatDate(new Date(campaign.end_date));
  if (today < startDate) return 0;
  // 排期结束且今天已过，补齐全周期；否则只生成到今天
  const end = endDate < today ? endDate : today;
  const profile = await readProfile(campaign.id);
  const baseTarget = Number(profile?.totalImpressions || campaign.target_impressions || 0);
  if (!Number.isFinite(baseTarget) || baseTarget <= 0) return 0;

  const finalTotal = Math.round(baseTarget * factorOf(campaign.id));
  const series = generateSeries({
    campaign: {
      startDate,
      endDate,
      targetImpressions: finalTotal,
    },
    profile: { ...(profile || {}), totalImpressions: finalTotal },
    from: startDate,
    to: endDate,
  });
  const days = series.daily.filter((d) => d.statDate <= end);
  if (!days.length) return 0;

  const existingRows = await query(
    'SELECT stat_date, source, impressions FROM daily_stat WHERE campaign_id = ? AND stat_date <= ?',
    [campaign.id, end]
  );
  const existing = new Map(
    existingRows.map((r) => [formatDate(new Date(r.stat_date)), { source: r.source, impressions: Number(r.impressions) }])
  );

  const dailyRows = [];
  const dimRows = [];
  const frequency = Math.max(1, Number(profile?.frequency || 65));
  const ctr = Math.min(0.2, Math.max(0, Number(profile?.ctr ?? 0.01)));
  const cpm = Math.max(0, Number(profile?.cpm ?? 12));
  const ratio = profile?.dimRatio || DEFAULT_DIM_RATIO;
  const todayFraction = elapsedToday(campaign, today);

  for (const day of days) {
    const prev = existing.get(day.statDate);
    // 手工录入/导入的数据优先，不被自动覆盖
    if (prev && (prev.source === 'manual' || prev.source === 'excel')) continue;

    let scale = 1;
    if (day.statDate === today && endDate >= today) scale = Math.max(todayFraction, 0.001);
    // 过去日期已按全天生成过则跳过，避免每分钟重复写历史数据
    if (day.statDate < today && prev && prev.source === 'auto' && prev.impressions >= day.impressions) {
      continue;
    }
    if (scale <= 0) continue;

    // 当天至少写入 1 次曝光，避免目标较小时首次数据被四舍五入成 0
    const impressions =
      day.statDate === today
        ? Math.max(1, Math.round(day.impressions * scale))
        : Math.round(day.impressions * scale);
    if (impressions <= 0) continue;
    // 同步接口可能已经写入了更大的值，自动更新不回退
    const finalImpressions =
      day.statDate === today && prev && prev.source === 'auto'
        ? Math.max(impressions, prev.impressions)
        : impressions;
    const reach = Math.max(1, Math.round(finalImpressions / frequency));
    const clicks = Math.max(0, Math.round(reach * ctr));
    const cost = Number(((finalImpressions / 1000) * cpm).toFixed(2));
    dailyRows.push([
      campaign.id,
      day.statDate,
      finalImpressions,
      reach,
      clicks,
      cost,
      'auto',
      null,
    ]);
    dimRows.push(
      ...buildDimRows(
        campaign.id,
        day,
        { impressions: finalImpressions, reach, clicks },
        ratio
      )
    );
  }

  if (!dailyRows.length) return 0;
  await withTransaction(async (conn) => {
    await statsRepo.upsertDaily(dailyRows, conn);
    if (dimRows.length) await statsRepo.upsertDims(dimRows, conn);
  });
  return dailyRows.length;
}

export const autoDataService = {
  /**
   * 同步接口：只按当前时间补齐应产生的数据，不做额外增量，重复调用不会加速增长。
   */
  async sync(id, user) {
    const campaign = await campaignRepo.findById(id, user.role === 'admin' ? {} : { createdBy: user.id });
    if (!campaign) throw errors.notFound('投放计划不存在');

    const today = formatDate(new Date());
    const startDate = formatDate(new Date(campaign.startDate));
    const endDate = formatDate(new Date(campaign.endDate));
    // 已排期计划还没发布，不能同步出数据
    if (!['running', 'paused', 'finished', 'closed'].includes(campaign.status)) {
      return { campaignId: id, updatedDays: 0, totalImpressions: 0, message: '计划尚未开始' };
    }
    if (today < startDate) {
      return { campaignId: id, updatedDays: 0, totalImpressions: 0, message: '计划尚未开始' };
    }

    const raw = {
      id: campaign.id,
      start_date: startDate,
      end_date: endDate,
      target_impressions: campaign.targetImpressions,
      published_at: campaign.publishedAt,
    };
    // 只按当前时间补齐，不做任何额外增量；重复点击不会加速增长
    const updatedDays = await syncCampaign(raw, today);
    const totalRow = await query(
      'SELECT COALESCE(SUM(impressions), 0) AS total FROM daily_stat WHERE campaign_id = ?',
      [id]
    );
    return {
      campaignId: id,
      updatedDays,
      totalImpressions: Number(totalRow[0].total),
      syncedAt: new Date().toISOString(),
    };
  },

  /**
   * 执行一次滚动更新：加数据库锁，避免多实例重复跑。
   * 返回 { skipped, campaigns, updated }
   */
  async tick() {
    const conn = await pool.getConnection();
    try {
      const [locks] = await conn.query('SELECT GET_LOCK(?, 0) AS ok', [LOCK_NAME]);
      if (Number(locks[0].ok) !== 1) return { skipped: true, campaigns: 0, updated: 0 };

      const campaigns = await query(
        `SELECT id, start_date, end_date, target_impressions, published_at
           FROM campaign
          WHERE status = 'running' AND deleted_at IS NULL AND start_date <= CURDATE()
          ORDER BY id ASC`
      );
      const today = formatDate(new Date());
      let updated = 0;
      for (const campaign of campaigns) {
        try {
          updated += await syncCampaign(campaign, today);
        } catch (err) {
          console.error(`[auto-data] 计划 ${campaign.id} 更新失败：${err.message}`);
        }
      }
      return { skipped: false, campaigns: campaigns.length, updated };
    } finally {
      try {
        await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
      } catch {
        // 释放失败交给连接回收
      }
      conn.release();
    }
  },
};
