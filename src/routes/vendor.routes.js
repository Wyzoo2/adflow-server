// 厂商管理路由。
import { ok, paged } from '../utils/response.js';
import { vendorService } from '../services/vendor.service.js';
import { requireAdmin } from '../plugins/auth.js';
import { idParams, pagingQuery, security } from '../schemas/common.js';

const platformEnum = ['douyin', 'wechat', 'xiaohongshu', 'kuaishou', 'baidu', 'other'];

const createBody = {
  type: 'object',
  required: ['code', 'name', 'platform'],
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 32, description: '厂商编码，全局唯一' },
    name: { type: 'string', minLength: 1, maxLength: 120, description: '厂商名称' },
    platform: { type: 'string', enum: platformEnum, description: '所属平台' },
    contactName: { type: 'string', maxLength: 64, description: '商务联系人' },
    contactPhone: { type: 'string', maxLength: 32, description: '联系电话' },
    status: { type: 'integer', enum: [0, 1], default: 1, description: '1 启用，0 停用' },
    remark: { type: 'string', maxLength: 255, description: '合作范围与结算说明' },
  },
};

const updateBody = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120, description: '厂商名称' },
    platform: { type: 'string', enum: platformEnum, description: '所属平台' },
    contactName: { type: 'string', maxLength: 64, description: '商务联系人' },
    contactPhone: { type: 'string', maxLength: 32, description: '联系电话' },
    status: { type: 'integer', enum: [0, 1], description: '1 启用，0 停用' },
    remark: { type: 'string', maxLength: 255, description: '备注' },
  },
};

export default async function vendorRoutes(app) {
  app.get(
    '',
    {
      schema: {
        tags: ['厂商管理'],
        summary: '厂商分页列表',
        security,
        querystring: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '厂商名称或编码模糊搜索' },
            platform: { type: 'string', enum: platformEnum, description: '按所属平台筛选' },
            status: { type: 'string', enum: ['0', '1'], description: '1 启用，0 停用' },
            ...pagingQuery.properties,
          },
        },
      },
    },
    async (request) => {
      const { items, total, page, pageSize } = await vendorService.list(request.query);
      return paged(items, total, page, pageSize);
    }
  );

  app.get(
    '/active',
    {
      schema: {
        tags: ['厂商管理'],
        summary: '启用中的厂商（发布向导用）',
        description: '只返回 status=1 且未删除的厂商，供计划选择。',
        security,
      },
    },
    async () => ok(await vendorService.active())
  );

  app.get(
    '/:id',
    {
      schema: { tags: ['厂商管理'], summary: '厂商详情', description: '含关联计划数', security, params: idParams },
    },
    async (request) => ok(await vendorService.detail(request.params.id))
  );

  app.post(
    '',
    {
      preHandler: requireAdmin,
      schema: { tags: ['厂商管理'], summary: '新增厂商', security, body: createBody },
    },
    async (request) => ok(await vendorService.create(request.body, request.user, request.ip))
  );

  app.put(
    '/:id',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['厂商管理'],
        summary: '修改厂商',
        description: '厂商编码创建后不可修改；已关联计划的厂商建议停用而不是删除。',
        security,
        params: idParams,
        body: updateBody,
      },
    },
    async (request) => ok(await vendorService.update(request.params.id, request.body, request.user, request.ip))
  );

  app.delete(
    '/:id',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['厂商管理'],
        summary: '删除厂商',
        description: '已被计划引用的厂商不可删除，接口返回 2004，请改为停用。',
        security,
        params: idParams,
      },
    },
    async (request) => ok(await vendorService.remove(request.params.id, request.user, request.ip))
  );
}
