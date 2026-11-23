// 数据回收路由：分日数据、人群维度、单日调节、同步。
import { ok } from '../utils/response.js';
import { statsService } from '../services/stats.service.js';
import { requireAdmin } from '../plugins/auth.js';
import { idParams, security } from '../schemas/common.js';

const statNumbers = {
  impressions: { type: 'integer', minimum: 0, description: '曝光量' },
  reach: { type: 'integer', minimum: 0, description: '曝光人数，不得大于曝光量' },
  clicks: { type: 'integer', minimum: 0, description: '点击人数，不得大于曝光人数' },
  cost: { type: 'number', minimum: 0, description: '消耗金额' },
};

const dimItem = {
  type: 'object',
  required: ['impressions'],
  properties: {
    key: { type: 'string', description: '维度编码，如 jiangsu/male/25-29' },
    name: { type: 'string', description: '维度名称，如 江苏省/男/25-29' },
    impressions: { type: 'integer', minimum: 0, description: '该维度曝光量' },
    reach: { type: 'integer', minimum: 0, description: '该维度曝光人数，可选' },
    clicks: { type: 'integer', minimum: 0, description: '该维度点击人数，可选' },
  },
};

const dimsSchema = {
  type: 'object',
  description: '人群维度；传入时每组合计必须等于当日曝光量',
  properties: {
    region: { type: 'array', items: dimItem, description: '地域维度' },
    gender: { type: 'array', items: dimItem, description: '性别维度' },
    age: { type: 'array', items: dimItem, description: '年龄维度' },
  },
};

export default async function statsRoutes(app) {
  app.get(
    '/:id/stats',
    {
      schema: {
        tags: ['数据回收'],
        summary: '计划分日数据',
        description: '返回区间内每日曝光/人数/点击/消耗、来源与合计；不传 from/to 返回全部日期。',
        security,
        params: idParams,
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string', description: '开始日期 YYYY-MM-DD' },
            to: { type: 'string', description: '结束日期 YYYY-MM-DD' },
          },
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
        description:
          '按计划+日期 UPSERT；可同时录入人群维度，三组合计分别等于曝光量，否则返回 1001。',
        security,
        params: idParams,
        body: {
          type: 'object',
          required: ['statDate', 'impressions', 'reach', 'clicks'],
          properties: {
            statDate: { type: 'string', description: '数据日期，格式 YYYY-MM-DD，需在计划排期内' },
            ...statNumbers,
            dims: dimsSchema,
          },
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
          properties: {
            id: { type: 'string', description: '计划 ID' },
            date: { type: 'string', description: '数据日期 YYYY-MM-DD' },
          },
          required: ['id', 'date'],
        },
        body: {
          type: 'object',
          required: ['impressions', 'reach', 'clicks', 'reason'],
          properties: {
            ...statNumbers,
            reason: { type: 'string', minLength: 10, maxLength: 255, description: '调节原因，至少 10 个字' },
          },
        },
      },
    },
    async (request) =>
      ok(await statsService.adjust(request.params.id, request.params.date, request.body, request.user, request.ip))
  );

  app.delete(
    '/:id/stats',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['数据回收'],
        summary: '清空计划数据（管理员）',
        description: '删除该计划的全部分日与人群数据，用于演示前重置，操作写入审计日志。',
        security,
        params: idParams,
      },
    },
    async (request) => ok(await statsService.clear(request.params.id, request.user, request.ip))
  );

  app.get(
    '/:id/dimensions',
    {
      schema: {
        tags: ['数据回收'],
        summary: '计划人群分布',
        description: '可按日期区间与维度类型过滤；不传 from/to 返回计划全周期累计。',
        security,
        params: idParams,
        querystring: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['region', 'gender', 'age'], description: '维度类型' },
            from: { type: 'string', description: '开始日期 YYYY-MM-DD' },
            to: { type: 'string', description: '结束日期 YYYY-MM-DD' },
          },
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
        body: {
          type: 'object',
          properties: {
            from: { type: 'string', description: '同步开始日期，默认计划开始日期' },
            to: { type: 'string', description: '同步结束日期，默认计划结束日期' },
          },
        },
      },
    },
    async (request) => ok(await statsService.sync(request.params.id, request.user, request.ip, request.body || {}))
  );
}
