// 看板业务：聚合查询与派生指标。
import { dashboardRepo } from '../repositories/dashboard.repo.js';
import { campaignRepo } from '../repositories/campaign.repo.js';
import { channelRepo } from '../repositories/channel.repo.js';
import { clickRate, completionRate, costPerMille } from '../domain/metrics.js';
import { channelName } from '../domain/dicts.js';
import { addDays, daysBetween, eachDay } from '../utils/date.js';

const ACTIVE_STATUSES = ['running', 'paused', 'finished', 'closed'];

function filterOf(query, user) {
  return {
    projectId: query.projectId,
    from: query.from,
    to: query.to,
    createdBy: user.role === 'admin' ? undefined : user.id,
  };
}

function withRates(summary) {
  return {
    ...summary,
    completionRate: completionRate(summary.impressions, summary.targetImpressions),
    clickRate: clickRate(summary.clicks, summary.reach),
    cpm: costPerMille(summary.cost, summary.impressions),
  };
}

/** 把每个计划的目标曝光按排期均摊到天，超出区间的日期不计入 */
function splitTargets(campaigns, from, to) {
  const map = new Map();
  for (const campaign of campaigns) {
    const days = eachDay(campaign.start_date, campaign.end_date);
    if (!days.length) continue;
    const total = Number(campaign.target_impressions);
    const base = Math.floor(total / days.length);
    const rest = total - base * days.length;
    days.forEach((date, index) => {
      if (date < from || date > to) return;
      map.set(date, (map.get(date) || 0) + base + (index < rest ? 1 : 0));
    });
  }
  return map;
}

export const dashboardService = {
  /** 看板汇总：数据库聚合后补充完成率、点击率与 CPM，可选返回上一周期环比 */
  async summary(query, user) {
    const filter = filterOf(query, user);
    const summary = withRates(await dashboardRepo.summary(filter));

    let compare = null;
    if (query.compare === 'previous' && query.from && query.to) {
      const days = daysBetween(query.from, query.to);
      if (days > 0) {
        const previousTo = addDays(query.from, -1);
        const previousFrom = addDays(previousTo, -(days - 1));
        const previous = await dashboardRepo.summary({
          ...filter,
          from: previousFrom,
          to: previousTo,
        });
        if (Number(previous.impressions) > 0) {
          compare = { ...withRates(previous), from: previousFrom, to: previousTo };
        }
      }
    }
    return { ...summary, compare };
  },

  async trend(query, user) {
    const filter = filterOf(query, user);
    const rows = await dashboardRepo.trend(filter);
    if (!query.from || !query.to) return rows;

    const campaigns = await campaignRepo.listForTarget(filter, ACTIVE_STATUSES);
    const targets = splitTargets(campaigns, query.from, query.to);
    const byDate = new Map(rows.map((row) => [row.statDate, row]));

    return eachDay(query.from, query.to).map((date) => {
      const row = byDate.get(date) || {
        statDate: date,
        impressions: '0',
        reach: '0',
        clicks: '0',
        cost: '0.00',
      };
      return { ...row, target: String(targets.get(date) || 0) };
    });
  },

  async dimensions(query, user) {
    const items = await dashboardRepo.dimensions({ ...filterOf(query, user), type: query.type });
    const grouped = items.reduce((acc, row) => {
      acc[row.dimType] = acc[row.dimType] || [];
      acc[row.dimType].push(row);
      return acc;
    }, {});
    return { items, grouped };
  },

  async channels(query, user) {
    const rows = await dashboardRepo.channelShare(filterOf(query, user));
    const channels = await channelRepo.listAll();
    const nameMap = new Map(channels.map((c) => [c.code, c.name]));
    return rows.map((row) => ({
      ...row,
      channelName: nameMap.get(row.channel) || channelName(row.channel),
    }));
  },
};
