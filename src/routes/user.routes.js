// 用户管理路由（仅管理员）。

import { paged, ok } from '../utils/response.js';
import { userService } from '../services/user.service.js';
import { requireAdmin } from '../plugins/auth.js';
import { idParams, pagingQuery, security } from '../schemas/common.js';

export default async function userRoutes(app) {
  app.get(
    '',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['用户管理'],
        summary: '用户列表',
        security,
        querystring: {
          type: 'object',
          properties: {
            keyword: { type: 'string' },
            role: { type: 'string', enum: ['admin', 'user'] },
            status: { type: 'string', enum: ['0', '1'] },
            ...pagingQuery.properties,
          },
        },
      },
    },
    async (request) => {
      const { items, total, page, pageSize } = await userService.list(request.query);
      return paged(items, total, page, pageSize);
    }
  );

  app.post(
    '',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['用户管理'],
        summary: '新增用户',
        security,
        body: {
          type: 'object',
          required: ['username', 'password', 'displayName', 'role'],
          properties: {
            username: { type: 'string', minLength: 3, maxLength: 64 },
            password: { type: 'string', minLength: 6, maxLength: 64 },
            displayName: { type: 'string', minLength: 1, maxLength: 64 },
            role: { type: 'string', enum: ['admin', 'user'] },
            status: { type: 'integer', enum: [0, 1], default: 1 },
          },
        },
      },
    },
    async (request) => ok(await userService.create(request.body, request.user, request.ip))
  );

  app.put(
    '/:id',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['用户管理'],
        summary: '修改用户身份或启停状态',
        security,
        params: idParams,
        body: {
          type: 'object',
          properties: {
            displayName: { type: 'string', maxLength: 64 },
            role: { type: 'string', enum: ['admin', 'user'] },
            status: { type: 'integer', enum: [0, 1] },
          },
        },
      },
    },
    async (request) => ok(await userService.update(request.params.id, request.body, request.user, request.ip))
  );

  app.post(
    '/:id/reset-password',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['用户管理'],
        summary: '重置密码',
        security,
        params: idParams,
        body: {
          type: 'object',
          required: ['password'],
          properties: { password: { type: 'string', minLength: 6 } },
        },
      },
    },
    async (request) =>
      ok(await userService.resetPassword(request.params.id, request.body.password, request.user, request.ip))
  );

  app.delete(
    '/:id',
    {
      preHandler: requireAdmin,
      schema: { tags: ['用户管理'], summary: '停用用户（软删除）', security, params: idParams },
    },
    async (request) => ok(await userService.remove(request.params.id, request.user, request.ip))
  );
}
