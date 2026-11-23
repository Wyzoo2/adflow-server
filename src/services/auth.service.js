// 登录认证：密码校验、JWT 签发、登录审计。

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import { userRepo } from '../repositories/user.repo.js';
import { auditRepo } from '../repositories/audit.repo.js';
import { errors } from '../utils/errors.js';

export const authService = {
  /** 登录：校验密码与账号状态，签发 JWT 并记录登录审计 */
  async login({ username, password }, context = {}) {
    const row = await userRepo.findByUsername(username);
    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
      throw errors.unauthorized('用户名或密码错误');
    }
    if (Number(row.status) !== 1) throw errors.forbidden('账号已停用，请联系管理员');

    const user = {
      id: String(row.id),
      username: row.username,
      displayName: row.display_name,
      role: row.role,
    };
    const token = jwt.sign(user, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

    await userRepo.touchLogin(row.id);
    await auditRepo.insert({
      objectType: 'user',
      objectId: row.id,
      action: 'login',
      operatorId: row.id,
      ip: context.ip,
    });

    return {
      token,
      tokenType: 'Bearer',
      expiresIn: config.jwtExpiresIn,
      user,
    };
  },

  verify(token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      return {
        id: String(payload.id),
        username: payload.username,
        displayName: payload.displayName,
        role: payload.role,
      };
    } catch {
      throw errors.unauthorized();
    }
  },
};
