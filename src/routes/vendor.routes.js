// 厂商管理路由。

import { paged, ok } from '../utils/response.js';
import { vendorService } from '../services/vendor.service.js';
import { requireAdmin } from '../plugins/auth.js';
import { idParams, pagingQuery, security } from '../schemas/common.js';

const vendorBody = {
  type: 'object',
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 32 },
    name: { type: 'string', minLength: 1, maxLength: 120 },
    platform: { type: 'string', enum: ['douyin', 'wechat', 'xiaohongshu', 'kuaishou', 'baidu', 'other'] },
    contactName: { type: 'string', maxLength: 64 },
    contactPhone: { type: 'string', maxLength: 32 },
    status: { type: 'integer', enum: [0, 1] },
    remark: { type: 'string', maxLength: 255 },
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
            keyword: { type: 'string' },
            platform: { type: 'string' },
            status: { type: 'string', enum: ['0', '1'] },
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
      schema: { tags: ['厂商管理'], summary: '启用中的厂商（发布向导用）', security },
    },
    async () => ok(await vendorService.active())
  );

  app.get(
    '/:id',
    {
      schema: { tags: ['厂商管理'], summary: '厂商详情', security, params: idParams },
    },
    async (request) => ok(await vendorService.detail(request.params.id))
  );

  app.post(
    '',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['厂商管理'],
        summary: '新增厂商',
        security,
        body: { ...vendorBody, required: ['code', 'name', 'platform'] },
      },
    },
    async (request) => ok(await vendorService.create(request.body, request.user, request.ip))
  );

  app.put(
    '/:id',
    {
      preHandler: requireAdmin,
      schema: { tags: ['厂商管理'], summary: '修改厂商', security, params: idParams, body: vendorBody },
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
