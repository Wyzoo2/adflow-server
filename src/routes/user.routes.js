// 用户管理路由（仅管理员）。
import { ok, paged } from '../utils/response.js';
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
        summary: '用户分页列表',
        security,
        querystring: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '登录名或显示名模糊搜索' },
            role: { type: 'string', enum: ['admin', 'user'], description: '身份筛选' },
            status: { type: 'string', enum: ['0', '1'], description: '状态筛选：1 启用，0 停用' },
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
            username: { type: 'string', minLength: 3, maxLength: 64, description: '登录名，全局唯一' },
            password: { type: 'string', minLength: 6, maxLength: 64, description: '初始密码，至少 6 位' },
            displayName: { type: 'string', minLength: 1, maxLength: 64, description: '显示名' },
            role: { type: 'string', enum: ['admin', 'user'], description: '身份：admin 管理员 / user 普通用户' },
            status: { type: 'integer', enum: [0, 1], default: 1, description: '1 启用，0 停用' },
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
            displayName: { type: 'string', minLength: 1, maxLength: 64, description: '显示名' },
            role: { type: 'string', enum: ['admin', 'user'], description: '身份' },
            status: { type: 'integer', enum: [0, 1], description: '1 启用，0 停用；不能停用自己' },
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
          properties: {
            password: { type: 'string', minLength: 6, maxLength: 64, description: '新密码，至少 6 位' },
          },
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
      schema: {
        tags: ['用户管理'],
        summary: '停用用户（软删除）',
        description: '将账号状态置为停用，保留历史操作记录；不能停用当前登录账号。',
        security,
        params: idParams,
      },
    },
    async (request) => ok(await userService.remove(request.params.id, request.user, request.ip))
  );
}
