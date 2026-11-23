// 全局鉴权钩子与管理员校验（登录、健康检查、文档放行）。

import { authService } from '../services/auth.service.js';
import { userRepo } from '../repositories/user.repo.js';
import { errors } from '../utils/errors.js';

// 无需登录即可访问的路径（文档、登录、健康检查）
const PUBLIC_PREFIXES = ['/api-docs', '/api/v1/auth/login', '/health', '/api/v1/health'];

function isPublic(request) {
  const url = request.url.split('?')[0];
  if (request.method === 'OPTIONS') return true;
  return PUBLIC_PREFIXES.some((p) => url === p || url.startsWith(`${p}/`));
}

/**
 * 全局鉴权钩子：校验 Bearer Token 后回查用户，
 * 保证账号停用、角色调整能立即生效，而不是等 Token 过期。
 */
export async function authHook(request) {
  if (isPublic(request)) return;
  const header = request.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw errors.unauthorized();

  const payload = authService.verify(header.slice(7).trim());
  const user = await userRepo.findById(payload.id);
  if (!user || user.status !== 1) throw errors.unauthorized('账号不存在或已停用');

  request.user = {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  };
}

/** 管理员权限校验，供路由的 preHandler 使用 */
export async function requireAdmin(request) {
  if (!request.user) throw errors.unauthorized();
  if (request.user.role !== 'admin') throw errors.forbidden('该操作仅管理员可执行');
}
