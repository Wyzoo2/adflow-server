// 认证路由：登录、当前用户、续期、退出。
import { ok } from '../utils/response.js';
import { authService } from '../services/auth.service.js';
import { security } from '../schemas/common.js';

export default async function authRoutes(app) {
  app.post(
    '/login',
    {
      schema: {
        tags: ['认证'],
        summary: '登录并获取令牌',
        description: '使用用户名与密码登录，返回 JWT。默认管理员 root/root，普通用户由管理员创建。',
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
