// 登录认证：注册、登录、资料与密码修改、JWT 签发。
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import { userRepo } from '../repositories/user.repo.js';
import { auditRepo } from '../repositories/audit.repo.js';
import { errors } from '../utils/errors.js';

function signToken(user) {
  return jwt.sign(
    {
      id: String(user.id),
      username: user.username,
      displayName: user.displayName ?? user.display_name,
      role: user.role,
      ver: Number(user.tokenVersion ?? user.token_version ?? 0),
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

function tokenPayload(row) {
  const user = {
    id: String(row.id),
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    tokenVersion: Number(row.token_version ?? 0),
  };
  return {
    token: signToken(user),
    tokenType: 'Bearer',
    expiresIn: config.jwtExpiresIn,
    user,
  };
}

function validateUsername(username) {
  if (!username || username.length < 3 || username.length > 64) {
    throw errors.badRequest('用户名长度需在 3 到 64 个字符之间');
  }
}

function validatePassword(password) {
  if (!password || password.length < 6 || password.length > 64) {
    throw errors.badRequest('密码长度需在 6 到 64 个字符之间');
  }
}

export const authService = {
  /** 注册：只允许创建普通用户，注册成功直接返回登录令牌 */
  async register({ username, password, displayName }, context = {}) {
    validateUsername(username);
    validatePassword(password);
    const name = String(displayName || username).trim();
    if (!name || name.length > 64) throw errors.badRequest('昵称长度需在 1 到 64 个字符之间');

    const exists = await userRepo.findByUsername(username);
    if (exists) throw errors.nameExists('用户名已存在');

    const id = await userRepo.create({
      username,
      passwordHash: bcrypt.hashSync(password, 10),
      displayName: name,
      role: 'user',
      status: 1,
    });
    await auditRepo.insert({
      objectType: 'user',
      objectId: id,
      action: 'register',
      after: { username, displayName: name },
      operatorId: id,
      ip: context.ip,
    });

    const row = await userRepo.findByUsername(username);
    return tokenPayload(row);
  },

  /** 登录：校验密码与账号状态，签发 JWT 并记录登录审计 */
  async login({ username, password }, context = {}) {
    const row = await userRepo.findByUsername(username);
    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
      throw errors.unauthorized('用户名或密码错误');
    }
    if (Number(row.status) !== 1) throw errors.forbidden('账号已停用，请联系管理员');

    await userRepo.touchLogin(row.id);
    await auditRepo.insert({
      objectType: 'user',
      objectId: row.id,
      action: 'login',
      operatorId: row.id,
      ip: context.ip,
    });
    return tokenPayload(row);
  },

  /** 修改自己的昵称；返回新令牌，避免旧令牌里还是旧昵称 */
  async updateProfile(user, { displayName }, ip) {
    const name = String(displayName || '').trim();
    if (!name || name.length > 64) throw errors.badRequest('昵称长度需在 1 到 64 个字符之间');
    const before = await userRepo.findById(user.id);
    if (!before) throw errors.unauthorized('账号不存在');

    await userRepo.update(user.id, { displayName: name });
    await auditRepo.insert({
      objectType: 'user',
      objectId: user.id,
      action: 'update_profile',
      before: { displayName: before.displayName },
      after: { displayName: name },
      operatorId: user.id,
      ip,
    });
    const row = await userRepo.findByUsername(user.username);
    return tokenPayload(row);
  },

  /** 修改自己的密码：校验原密码，新密码不少于 6 位 */
  async changePassword(user, { oldPassword, newPassword }, ip) {
    const row = await userRepo.findWithPasswordById(user.id);
    if (!row || !bcrypt.compareSync(oldPassword || '', row.password_hash)) {
      throw errors.badRequest('原密码不正确');
    }
    validatePassword(newPassword);
    if (oldPassword === newPassword) throw errors.badRequest('新密码不能与原密码相同');

    await userRepo.updatePassword(user.id, bcrypt.hashSync(newPassword, 10));
    // 改密后旧令牌立即失效，所有端需要重新登录
    await userRepo.bumpTokenVersion(user.id);
    await auditRepo.insert({
      objectType: 'user',
      objectId: user.id,
      action: 'change_password',
      operatorId: user.id,
      ip,
    });
    return { success: true, relogin: true };
  },

  /** 令牌续期：基于当前登录用户重新签发，旧令牌到期前仍有效 */
  refresh(user) {
    return {
      token: signToken(user),
      tokenType: 'Bearer',
      expiresIn: config.jwtExpiresIn,
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
        tokenVersion: Number(payload.ver ?? 0),
      };
    } catch {
      throw errors.unauthorized();
    }
  },
};
