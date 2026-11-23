// 计划路由：CRUD、状态流转、发布、厂商多选。

import { ok, paged } from '../utils/response.js';
import { campaignService } from '../services/campaign.service.js';
import { requireAdmin } from '../plugins/auth.js';
import { idParams, pagingQuery, security } from '../schemas/common.js';

const channelEnum = ['douyin', 'wechat', 'xiaohongshu', 'kuaishou', 'baidu', 'other'];

const createBody = {
  type: 'object',
  required: ['projectId', 'name', 'channel', 'startDate', 'endDate'],
  properties: {
    projectId: { type: 'string' },
    name: { type: 'string', minLength: 2, maxLength: 40 },
    channel: { type: 'string', enum: channelEnum },
    objective: { type: 'string', enum: ['impression', 'click', 'lead'], default: 'impression' },
    budget: { type: 'number', minimum: 0 },
    targetImpressions: { type: 'integer', minimum: 0 },
    startDate: { type: 'string', description: 'YYYY-MM-DD' },
    endDate: { type: 'string', description: 'YYYY-MM-DD' },
    targeting: { type: 'object', additionalProperties: true },
    remark: { type: 'string', maxLength: 255 },
    vendorIds: { type: 'array', items: { type: 'string' }, maxItems: 5 },
  },
};

const updateBody = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 40 },
    channel: { type: 'string', enum: channelEnum },
    objective: { type: 'string', enum: ['impression', 'click', 'lead'] },
    budget: { type: 'number', minimum: 0 },
    targetImpressions: { type: 'integer', minimum: 0 },
    startDate: { type: 'string' },
    endDate: { type: 'string' },
    targeting: { type: 'object', additionalProperties: true },
    remark: { type: 'string', maxLength: 255 },
    vendorIds: { type: 'array', items: { type: 'string' }, maxItems: 5 },
  },
};

const transitions = [
  ['submit', '提交审核', '草稿提交后进入待审核状态，创建人或管理员可操作。', null],
  ['withdraw', '撤回申请', '待审核状态下撤回，回到草稿。', null],
  ['approve', '审核通过', '仅管理员，通过后进入已排期。', requireAdmin],
  ['reject', '审核驳回', '仅管理员，驳回后回到草稿并记录意见。', requireAdmin],
  ['pause', '暂停投放', '投放中暂停，创建人或管理员可操作。', null],
  ['resume', '恢复投放', '已暂停恢复为投放中。', null],
  ['finish', '结束投放', '投放中或已暂停可结束。', null],
  ['close', '结案归档', '仅管理员，结束后结案转为只读。', requireAdmin],
];

export default async function campaignRoutes(app) {
  app.get(
    '',
    {
      schema: {
        tags: ['投放计划'],
        summary: '计划分页列表',
        description: '普通用户只能看到本人创建的计划，管理员可查看全部。',
        security,
        querystring: {
          type: 'object',
          properties: {
            projectId: { type: 'string' },
            keyword: { type: 'string' },
            code: { type: 'string' },
            channel: { type: 'string' },
            status: {
              type: 'string',
              enum: ['draft', 'pending', 'scheduled', 'running', 'paused', 'finished', 'closed'],
            },
            from: { type: 'string' },
            to: { type: 'string' },
            vendorId: { type: 'string' },
            createdBy: { type: 'string' },
            ...pagingQuery.properties,
          },
        },
      },
    },
    async (request) => {
      const { items, total, page, pageSize } = await campaignService.list(request.query, request.user);
      return paged(items, total, page, pageSize);
    }
  );

  app.post(
    '',
    {
      schema: { tags: ['投放计划'], summary: '创建计划（草稿）', security, body: createBody },
    },
    async (request) => ok(await campaignService.create(request.body, request.user, request.ip))
  );

  app.get(
    '/:id',
    { schema: { tags: ['投放计划'], summary: '计划详情', security, params: idParams } },
    async (request) => ok(await campaignService.detail(request.params.id, request.user))
  );

  app.put(
    '/:id',
    {
      schema: {
        tags: ['投放计划'],
        summary: '修改计划',
        description: '仅草稿状态可修改，可同时覆盖厂商选择。',
        security,
        params: idParams,
        body: updateBody,
      },
    },
    async (request) => ok(await campaignService.update(request.params.id, request.body, request.user, request.ip))
  );

  app.delete(
    '/:id',
    {
      schema: { tags: ['投放计划'], summary: '删除计划', description: '仅草稿状态可删除（软删除）。', security, params: idParams },
    },
    async (request) => ok(await campaignService.remove(request.params.id, request.user, request.ip))
  );

  app.post(
    '/:id/publish',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['投放计划'],
        summary: '发布并生成投放单号',
        description: '仅管理员；行锁保证并发安全，单号格式 DCYYYYMMDD-XXXX。',
        security,
        params: idParams,
        body: {
          type: 'object',
          properties: {
            publishMode: { type: 'string', enum: ['schedule', 'immediate'], default: 'schedule' },
            comment: { type: 'string', maxLength: 255 },
          },
        },
      },
    },
    async (request) => ok(await campaignService.publish(request.params.id, request.user, request.ip, request.body || {}))
  );

  app.get(
    '/:id/vendors',
    { schema: { tags: ['投放计划'], summary: '计划已选厂商', security, params: idParams } },
    async (request) => ok(await campaignService.vendorsOf(request.params.id, request.user))
  );

  app.put(
    '/:id/vendors',
    {
      schema: {
        tags: ['投放计划'],
        summary: '设置计划厂商（多选覆盖）',
        description: '草稿、待审核、已排期可调整；厂商须为启用状态，最多五个。',
        security,
        params: idParams,
        body: {
          type: 'object',
          required: ['vendorIds'],
          properties: {
            vendorIds: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
          },
        },
      },
    },
    async (request) =>
      ok(await campaignService.setVendors(request.params.id, request.body.vendorIds, request.user, request.ip))
  );

  for (const [event, summary, description, preHandler] of transitions) {
    const config = {
      schema: {
        tags: ['投放计划'],
        summary,
        description,
        security,
        params: idParams,
        body:
          event === 'reject' || event === 'approve' || event === 'withdraw'
            ? { type: 'object', properties: { comment: { type: 'string', maxLength: 255 } } }
            : undefined,
      },
    };
    if (preHandler) config.preHandler = preHandler;
    if (!config.schema.body) delete config.schema.body;
    app.post(`/:id/${event}`, config, async (request) =>
      ok(await campaignService.transition(request.params.id, event, request.user, request.ip, request.body || {}))
    );
  }
}
