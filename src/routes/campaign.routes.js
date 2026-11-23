// 计划路由：CRUD、状态流转、发布、厂商多选。
import { ok, paged } from '../utils/response.js';
import { campaignService } from '../services/campaign.service.js';
import { requireAdmin } from '../plugins/auth.js';
import { CAMPAIGN_STATUS, CHANNEL_PATTERN, idParams, pagingQuery, security } from '../schemas/common.js';

const targetingSchema = {
  type: 'object',
  description: '人群定向',
  properties: {
    regions: { type: 'array', items: { type: 'string' }, description: '地域名称列表，如 ["江苏省"]' },
    gender: { type: 'string', enum: ['all', 'male', 'female'], description: '性别：all 不限' },
    ages: {
      type: 'array',
      items: { type: 'string' },
      description: '年龄段，如 ["18-24","25-29"]',
    },
    interests: { type: 'array', items: { type: 'string' }, description: '兴趣标签编码' },
  },
};

const campaignFields = {
  name: { type: 'string', minLength: 2, maxLength: 40, description: '计划名称，同项目内唯一' },
  channel: {
    type: 'string',
    minLength: 1,
    maxLength: 32,
    pattern: CHANNEL_PATTERN,
    description: '投放渠道编码，须为已启用的渠道',
  },
  objective: { type: 'string', enum: ['impression', 'click', 'lead'], description: '投放目标' },
  bidType: { type: 'string', enum: ['cpm', 'cpc'], description: '出价方式' },
  budget: { type: 'number', minimum: 0, description: '总预算' },
  dailyBudget: { type: 'number', minimum: 0, description: '日预算，不能大于总预算' },
  contractNo: { type: 'string', maxLength: 32, description: '关联合同号' },
  targetImpressions: { type: 'integer', minimum: 0, description: '目标曝光量' },
  startDate: { type: 'string', description: '开始日期，格式 YYYY-MM-DD' },
  endDate: { type: 'string', description: '结束日期，格式 YYYY-MM-DD' },
  targeting: targetingSchema,
  remark: { type: 'string', maxLength: 255, description: '备注' },
  vendorIds: { type: 'array', items: { type: 'string' }, maxItems: 5, description: '投放厂商 ID，最多 5 个' },
};

const createBody = {
  type: 'object',
  required: ['projectId', 'name', 'channel', 'startDate', 'endDate'],
  properties: {
    projectId: { type: 'string', description: '所属项目 ID' },
    ...campaignFields,
  },
};

const updateBody = {
  type: 'object',
  properties: campaignFields,
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
        description: '普通用户只能看到本人创建的计划，管理员可查看全部；列表带实际曝光、人数、点击、消耗与完成率。',
        security,
        querystring: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: '项目 ID' },
            keyword: { type: 'string', description: '计划名称或单号模糊搜索' },
            code: { type: 'string', description: '投放单号，精确匹配' },
            channel: { type: 'string', description: '渠道编码，精确匹配' },
            status: { type: 'string', enum: CAMPAIGN_STATUS, description: '计划状态' },
            from: { type: 'string', description: '排期开始日期下限，YYYY-MM-DD' },
            to: { type: 'string', description: '排期结束日期上限，YYYY-MM-DD' },
            vendorId: { type: 'string', description: '按关联厂商筛选' },
            createdBy: { type: 'string', description: '创建人 ID，仅管理员生效' },
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
    {
      schema: {
        tags: ['投放计划'],
        summary: '计划详情',
        description:
          '含计划字段、渠道名称、创建人、厂商、实际曝光/人数/点击/消耗、完成率、点击率、数据更新时间与提交/结束/结案时间。',
        security,
        params: idParams,
      },
    },
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
      schema: {
        tags: ['投放计划'],
        summary: '删除计划',
        description: '仅草稿状态可删除（软删除）。',
        security,
        params: idParams,
      },
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
            publishMode: {
              type: 'string',
              enum: ['schedule', 'immediate'],
              default: 'schedule',
              description: '发布方式：按排期/立即',
            },
            comment: { type: 'string', maxLength: 255, description: '发布备注' },
          },
        },
      },
    },
    async (request) => ok(await campaignService.publish(request.params.id, request.user, request.ip, request.body || {}))
  );

  app.get(
    '/:id/vendors',
    {
      schema: { tags: ['投放计划'], summary: '计划已选厂商', security, params: idParams },
    },
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
            vendorIds: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              maxItems: 5,
              description: '厂商 ID 列表，整体覆盖',
            },
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
        body: {
          type: 'object',
          properties: {
            comment: { type: 'string', maxLength: 255, description: '操作备注，写入审计日志' },
          },
        },
      },
    };
    if (preHandler) config.preHandler = preHandler;
    app.post(`/:id/${event}`, config, async (request) =>
      ok(await campaignService.transition(request.params.id, event, request.user, request.ip, request.body || {}))
    );
  }
}
