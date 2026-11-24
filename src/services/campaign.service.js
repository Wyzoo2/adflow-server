// 计划业务：创建修改、状态流转、发布（行锁+单号）、厂商。

import { withTransaction, query } from '../db/pool.js';
import { campaignRepo } from '../repositories/campaign.repo.js';
import { projectRepo } from '../repositories/project.repo.js';
import { statsRepo } from '../repositories/stats.repo.js';
import { channelRepo } from '../repositories/channel.repo.js';
import { auditRepo } from '../repositories/audit.repo.js';
import { nextStatus, assertEditable } from '../domain/campaign-status.js';
import { buildCampaignCode } from '../domain/code.js';
import { completionRate, clickRate } from '../domain/metrics.js';
import { channelName } from '../domain/dicts.js';
import { formatDate, todayShanghai } from '../utils/date.js';
import { errors } from '../utils/errors.js';

const ADMIN_ONLY_EVENTS = new Set(['approve', 'reject', 'publish', 'close']);

/** 校验厂商存在且启用，避免计划已写入后才发现厂商无效 */
async function assertVendors(vendorIds) {
  const ids = [...new Set((vendorIds || []).map(String))];
  if (!ids.length) throw errors.badRequest('至少选择一个投放厂商');
  if (ids.length > 5) throw errors.badRequest('厂商数量不能超过五个');
  const rows = await query(
    'SELECT id FROM vendor WHERE id IN (?) AND status = 1 AND deleted_at IS NULL',
    [ids]
  );
  if (rows.length !== ids.length) throw errors.vendorDisabled();
  return ids;
}

/** 校验渠道存在且启用；修改计划时允许沿用原来的渠道编码 */
async function assertChannel(code, currentCode = null) {
  if (!code) throw errors.badRequest('投放渠道不能为空');
  if (currentCode && code === currentCode) return;
  const channel = await channelRepo.findByCode(code);
  if (!channel || channel.deleted_at || Number(channel.status) !== 1) {
    throw errors.badRequest('投放渠道不存在或已停用');
  }
}

function scopeOf(user) {
  return user.role === 'admin' ? {} : { createdBy: user.id };
}

async function mustGet(id, user, { adminOnly = false } = {}) {
  if (adminOnly && user.role !== 'admin') throw errors.forbidden('该操作仅管理员可执行');
  const campaign = await campaignRepo.findById(id, scopeOf(user));
  if (!campaign) throw errors.notFound('投放计划不存在');
  return campaign;
}

function validatePayload(payload) {
  if (payload.name !== undefined && (payload.name.length < 2 || payload.name.length > 40)) {
    throw errors.badRequest('计划名称长度需在 2 到 40 个字符之间');
  }
  if (payload.startDate && payload.endDate && payload.startDate > payload.endDate) {
    throw errors.badRequest('结束日期不能早于开始日期');
  }
  if (payload.budget !== undefined && Number(payload.budget) < 0) {
    throw errors.badRequest('预算不能为负数');
  }
  if (payload.targetImpressions !== undefined && Number(payload.targetImpressions) < 0) {
    throw errors.badRequest('目标曝光量不能为负数');
  }
  if (payload.bidType !== undefined && !['cpm', 'cpc'].includes(payload.bidType)) {
    throw errors.badRequest('出价方式只能是 cpm 或 cpc');
  }
  if (payload.contractNo !== undefined && String(payload.contractNo).length > 32) {
    throw errors.badRequest('合同号不能超过 32 个字符');
  }
  if (payload.dailyBudget !== undefined && Number(payload.dailyBudget) < 0) {
    throw errors.badRequest('日预算不能为负数');
  }
}

function assertBudget(payload, campaign = null) {
  const budget = Number(payload.budget ?? campaign?.budget ?? 0);
  const dailyBudget = Number(payload.dailyBudget ?? campaign?.dailyBudget ?? 0);
  if (dailyBudget > budget) throw errors.badRequest('日预算不能大于总预算');
}

function decorate(campaign) {
  return {
    ...campaign,
    channelName: campaign.channelName || channelName(campaign.channel),
    completionRate: completionRate(campaign.actualImpressions, campaign.targetImpressions),
  };
}

export const campaignService = {
  async list(query, user) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20));
    const { items, total } = await campaignRepo.list(
      {
        projectId: query.projectId,
        keyword: query.keyword,
        code: query.code,
        channel: query.channel,
        status: query.status,
        from: query.from,
        to: query.to,
        vendorId: query.vendorId,
        createdBy: user.role === 'admin' ? query.createdBy : user.id,
      },
      { offset: (page - 1) * pageSize, limit: pageSize }
    );
    return { items: items.map(decorate), total, page, pageSize };
  },

  async detail(id, user) {
    const campaign = await mustGet(id, user);
    // 详情页需要实际曝光与完成率，列表 SQL 的聚合字段在这里补齐
    const totals = await statsRepo.totals(id);
    campaign.actualImpressions = totals.impressions;
    campaign.actualReach = totals.reach;
    campaign.actualClicks = totals.clicks;
    campaign.actualCost = totals.cost;
    campaign.completionRate = completionRate(totals.impressions, campaign.targetImpressions);
    campaign.clickRate = clickRate(totals.clicks, totals.reach);
    campaign.dataUpdatedAt = totals.dataUpdatedAt;
    campaign.channelName = campaign.channelName || channelName(campaign.channel);
    // 结案报告编号当前不单独编号，保留字段便于前端统一渲染
    campaign.reportNo = null;
    return campaign;
  },

  async create(payload, user, ip) {
    validatePayload(payload);
    assertBudget(payload);
    if (!payload.projectId || !payload.name || !payload.channel) {
      throw errors.badRequest('项目、计划名称与投放渠道不能为空');
    }
    await assertChannel(payload.channel);
    if (!payload.startDate || !payload.endDate) throw errors.badRequest('投放排期不能为空');
    const project = await projectRepo.findById(payload.projectId);
    if (!project) throw errors.notFound('项目不存在');
    if (await campaignRepo.existsName(payload.projectId, payload.name)) {
      throw errors.nameExists('该项目下已存在同名计划');
    }

    const vendorIds =
      Array.isArray(payload.vendorIds) && payload.vendorIds.length
        ? await assertVendors(payload.vendorIds)
        : null;
    const id = await campaignRepo.create({ ...payload, createdBy: user.id });
    if (vendorIds) await this.setVendors(id, vendorIds, user, ip);
    await auditRepo.insert({
      objectType: 'campaign',
      objectId: id,
      action: 'create',
      after: { name: payload.name, channel: payload.channel },
      operatorId: user.id,
      ip,
    });
    return this.detail(id, user);
  },

  async update(id, payload, user, ip) {
    const campaign = await mustGet(id, user);
    assertEditable(campaign.status);
    validatePayload(payload);
    // 部分更新时用现有值补齐日期，避免只改一端造成起止倒置
    const startDate = payload.startDate ?? campaign.startDate;
    const endDate = payload.endDate ?? campaign.endDate;
    if (startDate > endDate) throw errors.badRequest('结束日期不能早于开始日期');
    assertBudget(payload, campaign);
    if (payload.channel !== undefined) await assertChannel(payload.channel, campaign.channel);
    if (payload.name && (await campaignRepo.existsName(campaign.projectId, payload.name, id))) {
      throw errors.nameExists('该项目下已存在同名计划');
    }
    const vendorIds = Array.isArray(payload.vendorIds) ? await assertVendors(payload.vendorIds) : null;
    await campaignRepo.update(id, payload);
    if (vendorIds) await this.setVendors(id, vendorIds, user, ip);
    await auditRepo.insert({
      objectType: 'campaign',
      objectId: id,
      action: 'update',
      before: { name: campaign.name, budget: campaign.budget },
      after: payload,
      operatorId: user.id,
      ip,
    });
    return this.detail(id, user);
  },

  async remove(id, user, ip) {
    const campaign = await mustGet(id, user);
    if (campaign.status !== 'draft') throw errors.conflict('只有草稿状态的计划可以删除');
    await campaignRepo.softDelete(id);
    await auditRepo.insert({
      objectType: 'campaign',
      objectId: id,
      action: 'delete',
      before: { name: campaign.name, status: campaign.status },
      operatorId: user.id,
      ip,
    });
    return true;
  },

  async transition(id, event, user, ip, extra = {}) {
    if (ADMIN_ONLY_EVENTS.has(event) && user.role !== 'admin') {
      throw errors.forbidden('该操作仅管理员可执行');
    }
    const campaign = await mustGet(id, user);
    // 审核幂等：已排期的计划重复审核直接返回当前状态
    if (event === 'approve' && campaign.status === 'scheduled') {
      return this.detail(id, user);
    }
    const target = nextStatus(campaign.status, event);
    const stamps = {};
    if (event === 'submit') stamps.submittedAt = true;
    if (event === 'finish') stamps.finishedAt = true;
    if (event === 'close') stamps.closedAt = true;
    await campaignRepo.setStatus(id, target, stamps);
    await auditRepo.insert({
      objectType: 'campaign',
      objectId: id,
      action: event,
      before: { status: campaign.status },
      after: { status: target, comment: extra.comment || null },
      operatorId: user.id,
      ip,
    });
    return this.detail(id, user);
  },

  /**
   * 发布：按开始日期决定是否真正投放。
   * - 开始日期未到：保持 scheduled，不生成单号；
   * - 开始日期已到/今天：生成单号并转 running；
   * - 已 running：幂等返回现有单号；
   * - 历史 pending：先自动补审核，再按日期规则处理。
   */
  async publish(id, user, ip, extra = {}) {
    if (user.role !== 'admin') throw errors.forbidden('发布操作仅管理员可执行');
    const result = await withTransaction(async (conn) => {
      const campaign = await campaignRepo.lockById(conn, id);
      if (!campaign) throw errors.notFound('投放计划不存在');

      if (campaign.status === 'running') {
        return { code: campaign.code, status: 'running', idempotent: true };
      }

      const beforeStatus = campaign.status;
      let status = campaign.status;
      if (status === 'pending') {
        await conn.query(
          "UPDATE campaign SET status = 'scheduled', submitted_at = COALESCE(submitted_at, NOW()) WHERE id = ?",
          [id]
        );
        status = 'scheduled';
      }
      if (status !== 'scheduled') {
        throw errors.conflict('只有已排期或待审核的计划可以发布');
      }

      const startDate = formatDate(new Date(campaign.startDate));
      const today = todayShanghai();
      if (startDate > today) {
        return { code: null, status: 'scheduled', deferred: true };
      }

      const code = campaign.code || buildCampaignCode(campaign.id, new Date());
      await conn.query(
        `UPDATE campaign SET code = ?, status = 'running', published_at = NOW() WHERE id = ?`,
        [code, id]
      );
      await auditRepo.insert(
        {
          objectType: 'campaign',
          objectId: id,
          action: 'publish',
          before: { status: beforeStatus },
          after: { status: 'running', code, mode: extra.publishMode || 'schedule' },
          operatorId: user.id,
          ip,
        },
        conn
      );
      return { code, status: 'running' };
    });
    return { ...result, campaign: await this.detail(id, user) };
  },

  async setVendors(id, vendorIds, user, ip) {
    const campaign = await mustGet(id, user);
    if (!['draft', 'pending', 'scheduled'].includes(campaign.status)) {
      throw errors.conflict('当前状态不允许调整厂商');
    }
    const ids = [...new Set((vendorIds || []).map(String))];
    if (!ids.length) throw errors.badRequest('至少选择一个投放厂商');
    if (ids.length > 5) throw errors.badRequest('厂商数量不能超过五个');

    await withTransaction(async (conn) => {
      const rows = await campaignRepo.findActiveVendors(conn, ids);
      if (rows.length !== ids.length) throw errors.vendorDisabled();
      await campaignRepo.setVendors(conn, id, ids);
      await auditRepo.insert(
        {
          objectType: 'campaign',
          objectId: id,
          action: 'set_vendors',
          before: { vendors: campaign.vendors.map((v) => v.id) },
          after: { vendors: ids },
          operatorId: user.id,
          ip,
        },
        conn
      );
    });
    return this.detail(id, user);
  },

  async vendorsOf(id, user) {
    const campaign = await mustGet(id, user);
    return campaign.vendors;
  },

  async statsTotals(campaignId) {
    const rows = await query(
      `SELECT COALESCE(SUM(impressions),0) AS impressions,
              COALESCE(SUM(reach),0) AS reach,
              COALESCE(SUM(clicks),0) AS clicks,
              COALESCE(SUM(cost),0) AS cost
         FROM daily_stat WHERE campaign_id = ?`,
      [campaignId]
    );
    return rows[0];
  },
};
