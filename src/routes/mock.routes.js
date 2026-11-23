// 模拟参数与数据生成路由。

import { ok } from '../utils/response.js';
import { mockService } from '../services/mock.service.js';
import { requireAdmin } from '../plugins/auth.js';
import { idParams, security } from '../schemas/common.js';

const profileBody = {
  type: 'object',
  properties: {
    totalImpressions: { type: 'integer', minimum: 0 },
    curveType: { type: 'string', enum: ['uniform', 'front_load', 'back_load', 'weekend'] },
    ctr: { type: 'number', minimum: 0, maximum: 0.2 },
    cpm: { type: 'number', minimum: 0.01 },
    frequency: { type: 'number', minimum: 1, maximum: 1000 },
    dimRatio: { type: 'object', additionalProperties: true },
    seed: { type: 'integer', minimum: 0 },
  },
};

export default async function mockRoutes(app) {
  app.get(
    '/:id/mock-profile',
    { schema: { tags: ['模拟投放'], summary: '读取模拟参数', security, params: idParams } },
    async (request) => ok(await mockService.getProfile(request.params.id, request.user))
  );

  app.put(
    '/:id/mock-profile',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['模拟投放'],
        summary: '保存模拟参数（管理员）',
        description: '目标曝光、投放曲线、点击率、千人成本、曝光频次、人群比例与随机种子。',
        security,
        params: idParams,
        body: profileBody,
      },
    },
    async (request) => ok(await mockService.saveProfile(request.params.id, request.body, request.user, request.ip))
  );

  app.post(
    '/:id/mock/generate',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['模拟投放'],
        summary: '生成模拟数据（管理员）',
        description: '按参数覆盖写入分日与人群数据，重复执行不会累加。',
        security,
        params: idParams,
        body: {
          type: 'object',
          properties: {
            from: { type: 'string', description: '默认取计划开始日期' },
            to: { type: 'string', description: '默认取计划结束日期' },
          },
        },
      },
    },
    async (request) => ok(await mockService.generate(request.params.id, request.body || {}, request.user, request.ip))
  );
}
