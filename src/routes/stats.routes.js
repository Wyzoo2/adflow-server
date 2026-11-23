// 数据回收路由：分日数据、人群维度、单日调节、同步。

import { ok } from '../utils/response.js';
import { statsService } from '../services/stats.service.js';
import { requireAdmin } from '../plugins/auth.js';
import { idParams, security } from '../schemas/common.js';

const statBody = {
  type: 'object',
  properties: {
    impressions: { type: 'integer', minimum: 0 },
    reach: { type: 'integer', minimum: 0 },
    clicks: { type: 'integer', minimum: 0 },
    cost: { type: 'number', minimum: 0 },
  },
};

export default async function statsRoutes(app) {
  app.get(
    '/:id/stats',
    {
      schema: {
        tags: ['数据回收'],
        summary: '计划分日数据',
        security,
        params: idParams,
        querystring: {
          type: 'object',
          properties: { from: { type: 'string' }, to: { type: 'string' } },
        },
      },
    },
    async (request) => ok(await statsService.daily(request.params.id, request.query, request.user))
  );

  app.post(
    '/:id/stats',
    {
      schema: {
        tags: ['数据回收'],
        summary: '手工录入单日数据',
        description: '曝光人数不得大于曝光量，点击人数不得大于曝光人数。',
        security,
        params: idParams,
        body: {
          type: 'object',
          required: ['statDate', 'impressions', 'reach', 'clicks'],
          properties: { statDate: { type: 'string', description: 'YYYY-MM-DD' }, ...statBody.properties },
        },
      },
    },
    async (request) => ok(await statsService.upsert(request.params.id, request.body, request.user, request.ip))
  );

  app.patch(
    '/:id/stats/:date',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['数据回收'],
        summary: '调节单日数据（管理员）',
        description: '必须填写不少于 10 个字的调节原因，前后值写入审计日志。',
        security,
        params: {
          type: 'object',
          properties: { id: { type: 'string' }, date: { type: 'string' } },
          required: ['id', 'date'],
        },
        body: {
          type: 'object',
          required: ['impressions', 'reach', 'clicks', 'reason'],
          properties: { ...statBody.properties, reason: { type: 'string', minLength: 10, maxLength: 255 } },
        },
      },
    },
    async (request) =>
      ok(await statsService.adjust(request.params.id, request.params.date, request.body, request.user, request.ip))
  );

  app.get(
    '/:id/dimensions',
    {
      schema: {
        tags: ['数据回收'],
        summary: '计划人群分布',
        security,
        params: idParams,
        querystring: {
          type: 'object',
          properties: { type: { type: 'string', enum: ['region', 'gender', 'age'] } },
        },
      },
    },
    async (request) => ok(await statsService.dimensions(request.params.id, request.query, request.user))
  );

  app.post(
    '/:id/sync',
    {
      schema: {
        tags: ['数据回收'],
        summary: '触发数据同步',
        description: '当前阶段使用模拟数据源，等价于按模拟参数重新生成该计划数据。',
        security,
        params: idParams,
      },
    },
    async (request) => ok(await statsService.sync(request.params.id, request.user, request.ip))
  );
}
