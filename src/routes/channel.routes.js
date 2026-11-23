// 渠道管理路由：管理员维护投放渠道。
import { ok, paged } from '../utils/response.js';
import { channelService } from '../services/channel.service.js';
import { requireAdmin } from '../plugins/auth.js';
import { CHANNEL_PATTERN, idParams, pagingQuery, security } from '../schemas/common.js';

const createBody = {
  type: 'object',
  required: ['code', 'name'],
  properties: {
    code: {
      type: 'string',
      minLength: 2,
      maxLength: 32,
      pattern: CHANNEL_PATTERN,
      description: '渠道编码，小写字母开头，仅含小写字母、数字、下划线或短横线，全局唯一，创建后不可改',
    },
    name: { type: 'string', minLength: 1, maxLength: 64, description: '渠道名称，如 抖音' },
    bidType: { type: 'string', enum: ['cpm', 'cpc'], default: 'cpm', description: '默认出价方式' },
    status: { type: 'integer', enum: [0, 1], default: 1, description: '1 启用，0 停用' },
    sortNo: { type: 'integer', minimum: 0, default: 0, description: '排序，越小越靠前' },
    remark: { type: 'string', maxLength: 255, description: '备注' },
  },
};

const updateBody = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 64, description: '渠道名称' },
    bidType: { type: 'string', enum: ['cpm', 'cpc'], description: '默认出价方式' },
    status: { type: 'integer', enum: [0, 1], description: '1 启用，0 停用' },
    sortNo: { type: 'integer', minimum: 0, description: '排序' },
    remark: { type: 'string', maxLength: 255, description: '备注' },
  },
};

export default async function channelRoutes(app) {
  app.get(
    '',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['渠道管理'],
        summary: '渠道分页列表',
        security,
        querystring: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '渠道名称或编码模糊搜索' },
            status: { type: 'string', enum: ['0', '1'], description: '1 启用，0 停用' },
            ...pagingQuery.properties,
          },
        },
      },
    },
    async (request) => {
      const { items, total, page, pageSize } = await channelService.list(request.query);
      return paged(items, total, page, pageSize);
    }
  );

  app.get(
    '/active',
    {
      schema: {
        tags: ['渠道管理'],
        summary: '启用中的渠道（发布向导用）',
        description: '只返回启用且未删除的渠道，供计划创建时选择。',
        security,
      },
    },
    async () => ok(await channelService.active())
  );

  app.get(
    '/:id',
    {
      schema: { tags: ['渠道管理'], summary: '渠道详情', description: '含关联计划数', security, params: idParams },
    },
    async (request) => ok(await channelService.detail(request.params.id))
  );

  app.post(
    '',
    {
      preHandler: requireAdmin,
      schema: { tags: ['渠道管理'], summary: '新增渠道', security, body: createBody },
    },
    async (request) => ok(await channelService.create(request.body, request.user, request.ip))
  );

  app.put(
    '/:id',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['渠道管理'],
        summary: '修改渠道',
        description: '渠道编码创建后不可修改，避免影响历史计划。',
        security,
        params: idParams,
        body: updateBody,
      },
    },
    async (request) =>
      ok(await channelService.update(request.params.id, request.body, request.user, request.ip))
  );

  app.delete(
    '/:id',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['渠道管理'],
        summary: '删除渠道',
        description: '软删除；已引用的计划仍保留渠道名称，但新计划不能再选择该渠道。',
        security,
        params: idParams,
      },
    },
    async (request) => ok(await channelService.remove(request.params.id, request.user, request.ip))
  );
}
