// 看板路由：汇总、趋势、人群、渠道。

import { ok } from '../utils/response.js';
import { dashboardService } from '../services/dashboard.service.js';
import { security, dateRangeQuery } from '../schemas/common.js';

export default async function dashboardRoutes(app) {
  app.get(
    '/summary',
    {
      schema: {
        tags: ['数据看板'],
        summary: '汇总指标',
        description: '返回目标曝光、实际曝光、完成率、曝光人数、点击率、在投计划数与数据更新时间。',
        security,
        querystring: dateRangeQuery,
      },
    },
    async (request) => ok(await dashboardService.summary(request.query, request.user))
  );

  app.get(
    '/trend',
    {
      schema: { tags: ['数据看板'], summary: '按日趋势', security, querystring: dateRangeQuery },
    },
    async (request) => ok(await dashboardService.trend(request.query, request.user))
  );

  app.get(
    '/dimensions',
    {
      schema: {
        tags: ['数据看板'],
        summary: '人群分布（地域/性别/年龄）',
        security,
        querystring: dateRangeQuery,
      },
    },
    async (request) => ok(await dashboardService.dimensions(request.query, request.user))
  );

  app.get(
    '/channels',
    {
      schema: { tags: ['数据看板'], summary: '渠道曝光占比', security, querystring: dateRangeQuery },
    },
    async (request) => ok(await dashboardService.channels(request.query, request.user))
  );
}
