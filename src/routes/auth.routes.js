// 认证路由：注册、登录、当前用户、昵称与密码修改、续期、退出。
import { ok } from '../utils/response.js';
import { authService } from '../services/auth.service.js';
import { security } from '../schemas/common.js';

export default async function authRoutes(app) {
  app.post(
    '/register',
    {
      schema: {
        tags: ['认证'],
        summary: '注册账号',
        description: '公开注册，只创建普通用户，注册成功直接返回登录令牌；用户名唯一。',
        body: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string', minLength: 3, maxLength: 64, description: '登录名，3-64 位，全局唯一' },
            password: { type: 'string', minLength: 6, maxLength: 64, description: '密码，6-64 位' },
            displayName: { type: 'string', maxLength: 64, description: '昵称，不传默认使用用户名' },
          },
        },
      },
    },
    async (request) => ok(await authService.register(request.body, { ip: request.ip }))
  );

  app.post(
    '/login',
    {
      schema: {
        tags: ['认证'],
        summary: '登录并获取令牌',
        description: '使用用户名与密码登录，返回 JWT。默认管理员 root/root，普通用户由管理员创建或自行注册。',
        body: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string', minLength: 1, maxLength: 64, description: '登录名', examples: ['root'] },
            password: { type: 'string', minLength: 1, maxLength: 64, description: '密码', examples: ['root'] },
          },
        },
      },
    },
    async (request) => ok(await authService.login(request.body, { ip: request.ip }))
  );

  app.get(
    '/profile',
    {
      schema: {
        tags: ['认证'],
        summary: '当前登录用户',
        description: '返回令牌对应的用户信息（id、username、displayName、role）',
        security,
      },
    },
    async (request) => ok(request.user)
  );

  app.patch(
    '/profile',
    {
      schema: {
        tags: ['认证'],
        summary: '修改昵称',
        description: '修改当前账号的显示名称，返回新用户信息与新令牌。',
        security,
        body: {
          type: 'object',
          required: ['displayName'],
          properties: {
            displayName: { type: 'string', minLength: 1, maxLength: 64, description: '新昵称' },
          },
        },
      },
    },
    async (request) => ok(await authService.updateProfile(request.user, request.body, request.ip))
  );

  app.put(
    '/password',
    {
      schema: {
        tags: ['认证'],
        summary: '修改密码',
        description: '校验原密码后修改为新密码，新密码 6-64 位且不能与原密码相同。',
        security,
        body: {
          type: 'object',
          required: ['oldPassword', 'newPassword'],
          properties: {
            oldPassword: { type: 'string', minLength: 1, maxLength: 64, description: '原密码' },
            newPassword: { type: 'string', minLength: 6, maxLength: 64, description: '新密码，6-64 位' },
          },
        },
      },
    },
    async (request) => ok(await authService.changePassword(request.user, request.body, request.ip))
  );

  app.post(
    '/refresh',
    {
      schema: {
        tags: ['认证'],
        summary: '续期令牌',
        description: '使用当前有效令牌换取新令牌，返回新的 token 与有效期；旧令牌到期前仍有效。',
        security,
      },
    },
    async (request) => ok(authService.refresh(request.user))
  );

  app.post(
    '/logout',
    {
      schema: {
        tags: ['认证'],
        summary: '退出登录',
        description: 'JWT 为无状态令牌，退出仅作为前端清理动作，服务端记录审计。',
        security,
      },
    },
    async () => ok({ success: true })
  );
}
