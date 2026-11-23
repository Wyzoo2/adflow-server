// 投放渠道业务：管理员维护，计划引用渠道编码。
import { channelRepo } from '../repositories/channel.repo.js';
import { auditRepo } from '../repositories/audit.repo.js';
import { errors } from '../utils/errors.js';

const CODE_RE = /^[a-z][a-z0-9_-]{1,31}$/;

export const channelService = {
  async list(query) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20));
    const { items, total } = await channelRepo.list({
      keyword: query.keyword,
      status: query.status,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });
    return { items, total, page, pageSize };
  },

  active: () => channelRepo.listActive(),

  async detail(id) {
    const channel = await channelRepo.findById(id);
    if (!channel) throw errors.notFound('渠道不存在');
    channel.campaignCount = await channelRepo.countCampaigns(channel.code);
    return channel;
  },

  async create(payload, operator, ip) {
    const code = String(payload.code || '').trim();
    const name = String(payload.name || '').trim();
    if (!CODE_RE.test(code)) {
      throw errors.badRequest('渠道编码需以小写字母开头，仅含小写字母、数字、下划线或短横线，长度 2-32');
    }
    if (!name) throw errors.badRequest('渠道名称不能为空');
    if (payload.bidType && !['cpm', 'cpc'].includes(payload.bidType)) {
      throw errors.badRequest('出价方式只能是 cpm 或 cpc');
    }
    const exists = await channelRepo.findByCode(code);
    if (exists) throw errors.nameExists('渠道编码已存在');

    const id = await channelRepo.create({
      code,
      name,
      bidType: payload.bidType || 'cpm',
      status: payload.status === undefined ? 1 : Number(payload.status),
      sortNo: payload.sortNo || 0,
      remark: payload.remark,
    });
    await auditRepo.insert({
      objectType: 'channel',
      objectId: id,
      action: 'create',
      after: { code, name },
      operatorId: operator.id,
      ip,
    });
    return channelRepo.findById(id);
  },

  async update(id, payload, operator, ip) {
    const before = await channelRepo.findById(id);
    if (!before) throw errors.notFound('渠道不存在');
    if (payload.code && payload.code !== before.code) {
      throw errors.badRequest('渠道编码创建后不可修改，避免影响历史计划');
    }
    if (payload.bidType && !['cpm', 'cpc'].includes(payload.bidType)) {
      throw errors.badRequest('出价方式只能是 cpm 或 cpc');
    }
    if (payload.name !== undefined && !String(payload.name).trim()) {
      throw errors.badRequest('渠道名称不能为空');
    }
    await channelRepo.update(id, payload);
    await auditRepo.insert({
      objectType: 'channel',
      objectId: id,
      action: 'update',
      before,
      after: payload,
      operatorId: operator.id,
      ip,
    });
    return channelRepo.findById(id);
  },

  async remove(id, operator, ip) {
    const before = await channelRepo.findById(id);
    if (!before) throw errors.notFound('渠道不存在');
    const campaignCount = await channelRepo.countCampaigns(before.code);
    await channelRepo.softDelete(id);
    await auditRepo.insert({
      objectType: 'channel',
      objectId: id,
      action: 'delete',
      before: { code: before.code, name: before.name },
      after: { campaignCount },
      operatorId: operator.id,
      ip,
    });
    return { deleted: true, campaignCount };
  },
};
