// 厂商业务：增删改查与引用校验。

import { vendorRepo } from '../repositories/vendor.repo.js';
import { auditRepo } from '../repositories/audit.repo.js';
import { errors } from '../utils/errors.js';

const PLATFORMS = ['douyin', 'wechat', 'xiaohongshu', 'kuaishou', 'baidu', 'other'];

export const vendorService = {
  async list(query) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20));
    const { items, total } = await vendorRepo.list({
      keyword: query.keyword,
      platform: query.platform,
      status: query.status,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });
    return { items, total, page, pageSize };
  },

  async active() {
    return vendorRepo.listActive();
  },

  async detail(id) {
    const vendor = await vendorRepo.findById(id);
    if (!vendor) throw errors.notFound('厂商不存在');
    vendor.campaignCount = await vendorRepo.countCampaigns(id);
    return vendor;
  },

  async create(payload, operator, ip) {
    if (!payload.code || !payload.name) throw errors.badRequest('厂商编码与名称不能为空');
    if (payload.platform && !PLATFORMS.includes(payload.platform)) {
      throw errors.badRequest('所属平台取值不合法');
    }
    const exists = await vendorRepo.findByCode(payload.code);
    if (exists) throw errors.nameExists('厂商编码已存在');
    const id = await vendorRepo.create(payload);
    await auditRepo.insert({
      objectType: 'vendor',
      objectId: id,
      action: 'create',
      after: { code: payload.code, name: payload.name },
      operatorId: operator.id,
      ip,
    });
    return vendorRepo.findById(id);
  },

  async update(id, payload, operator, ip) {
    const before = await vendorRepo.findById(id);
    if (!before) throw errors.notFound('厂商不存在');
    if (payload.platform && !PLATFORMS.includes(payload.platform)) {
      throw errors.badRequest('所属平台取值不合法');
    }
    await vendorRepo.update(id, payload);
    await auditRepo.insert({
      objectType: 'vendor',
      objectId: id,
      action: 'update',
      before,
      after: payload,
      operatorId: operator.id,
      ip,
    });
    return vendorRepo.findById(id);
  },

  async remove(id, operator, ip) {
    const before = await vendorRepo.findById(id);
    if (!before) throw errors.notFound('厂商不存在');
    const count = await vendorRepo.countCampaigns(id);
    if (count > 0) throw errors.vendorInUse();
    await vendorRepo.softDelete(id);
    await auditRepo.insert({
      objectType: 'vendor',
      objectId: id,
      action: 'delete',
      before,
      operatorId: operator.id,
      ip,
    });
    return true;
  },
};
