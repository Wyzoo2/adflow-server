// 用户业务：创建、改身份、停用、重置密码。

import bcrypt from 'bcryptjs';
import { userRepo } from '../repositories/user.repo.js';
import { auditRepo } from '../repositories/audit.repo.js';
import { errors } from '../utils/errors.js';

const ROLES = ['admin', 'user'];

export const userService = {
  async list(query) {
    const { keyword, role, status } = query;
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20));
    const { items, total } = await userRepo.list({
      keyword,
      role,
      status,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });
    return { items, total, page, pageSize };
  },

  async create(payload, operator, ip) {
    if (!ROLES.includes(payload.role)) throw errors.badRequest('role 只能是 admin 或 user');
    if (!payload.password || payload.password.length < 6) {
      throw errors.badRequest('密码至少 6 位');
    }
    const exists = await userRepo.findByUsername(payload.username);
    if (exists) throw errors.nameExists('登录名已存在');

    const id = await userRepo.create({
      username: payload.username,
      passwordHash: bcrypt.hashSync(payload.password, 10),
      displayName: payload.displayName,
      role: payload.role,
      status: payload.status === undefined ? 1 : Number(payload.status),
    });
    await auditRepo.insert({
      objectType: 'user',
      objectId: id,
      action: 'create',
      after: { username: payload.username, role: payload.role },
      operatorId: operator.id,
      ip,
    });
    return userRepo.findById(id);
  },

  async update(id, payload, operator, ip) {
    const target = await userRepo.findById(id);
    if (!target) throw errors.notFound('用户不存在');
    if (payload.role && !ROLES.includes(payload.role)) {
      throw errors.badRequest('role 只能是 admin 或 user');
    }
    if (String(id) === String(operator.id) && payload.status !== undefined && Number(payload.status) === 0) {
      throw errors.badRequest('不能停用当前登录账号');
    }
    await userRepo.update(id, payload);
    await auditRepo.insert({
      objectType: 'user',
      objectId: id,
      action: 'update',
      before: { role: target.role, status: target.status, displayName: target.displayName },
      after: payload,
      operatorId: operator.id,
      ip,
    });
    return userRepo.findById(id);
  },

  async resetPassword(id, password, operator, ip) {
    const target = await userRepo.findById(id);
    if (!target) throw errors.notFound('用户不存在');
    if (!password || password.length < 6) throw errors.badRequest('密码至少 6 位');
    await userRepo.updatePassword(id, bcrypt.hashSync(password, 10));
    await auditRepo.insert({
      objectType: 'user',
      objectId: id,
      action: 'reset_password',
      operatorId: operator.id,
      ip,
    });
    return true;
  },

  async remove(id, operator, ip) {
    const target = await userRepo.findById(id);
    if (!target) throw errors.notFound('用户不存在');
    if (String(id) === String(operator.id)) throw errors.badRequest('不能停用当前登录账号');
    await userRepo.update(id, { status: 0 });
    await auditRepo.insert({
      objectType: 'user',
      objectId: id,
      action: 'disable',
      operatorId: operator.id,
      ip,
    });
    return true;
  },
};
