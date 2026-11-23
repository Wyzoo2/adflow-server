// 看板业务：聚合查询与派生指标。

import { dashboardRepo } from '../repositories/dashboard.repo.js';
import { clickRate, completionRate, costPerMille } from '../domain/metrics.js';

function filterOf(query, user) {
  return {
    projectId: query.projectId,
    from: query.from,
    to: query.to,
    createdBy: user.role === 'admin' ? undefined : user.id,
  };
}

export const dashboardService = {
  /** 看板汇总：数据库聚合后补充完成率、点击率与 CPM */
  async summary(query, user) {
    const filter = filterOf(query, user);
    const summary = await dashboardRepo.summary(filter);
    return {
      ...summary,
      completionRate: completionRate(summary.impressions, summary.targetImpressions),
      clickRate: clickRate(summary.clicks, summary.reach),
      cpm: costPerMille(summary.cost, summary.impressions),
    };
  },

  trend: (query, user) => dashboardRepo.trend(filterOf(query, user)),

  async dimensions(query, user) {
    const items = await dashboardRepo.dimensions(filterOf(query, user));
    const grouped = items.reduce((acc, row) => {
      acc[row.dimType] = acc[row.dimType] || [];
      acc[row.dimType].push(row);
      return acc;
    }, {});
    return { items, grouped };
  },

  channels: (query, user) => dashboardRepo.channelShare(filterOf(query, user)),
};
