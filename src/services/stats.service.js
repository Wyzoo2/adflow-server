// 数据回收：录入、单日调节、Excel 导入、同步。

import ExcelJS from 'exceljs';
import { withTransaction } from '../db/pool.js';
import { campaignRepo } from '../repositories/campaign.repo.js';
import { statsRepo } from '../repositories/stats.repo.js';
import { auditRepo } from '../repositories/audit.repo.js';
import { canAcceptStats } from '../domain/campaign-status.js';
import { clickRate, completionRate } from '../domain/metrics.js';
import { mockService } from './mock.service.js';
import { errors } from '../utils/errors.js';
import { formatDate } from '../utils/date.js';

const MAX_IMPORT_ROWS = 10000;

async function accessCampaign(id, user) {
  const campaign = await campaignRepo.findById(id, user.role === 'admin' ? {} : { createdBy: user.id });
  if (!campaign) throw errors.notFound('投放计划不存在');
  return campaign;
}

function toInt(value, field) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw errors.badRequest(`${field} 必须是非负整数`);
  }
  return n;
}

function toMoney(value) {
  const n = Number(String(value ?? 0).replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) throw errors.badRequest('消耗金额不合法');
  return Number(n.toFixed(2));
}

function validateValues({ impressions, reach, clicks, cost }) {
  const imp = toInt(impressions, '曝光量');
  const rch = toInt(reach, '曝光人数');
  const clk = toInt(clicks, '点击人数');
  const cst = toMoney(cost);
  if (rch > imp) throw errors.badRequest('曝光人数不应大于曝光量');
  if (clk > rch) throw errors.badRequest('点击人数不应大于曝光人数');
  return { impressions: imp, reach: rch, clicks: clk, cost: cst };
}

function assertDateInRange(campaign, statDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(statDate)) throw errors.badRequest('数据日期格式应为 YYYY-MM-DD');
  if (statDate < campaign.startDate || statDate > campaign.endDate) {
    throw errors.badRequest('数据日期需在计划排期范围内');
  }
}

/** 把前端传入的 dims 校验并转换成 dim_stat 行；三组合计必须等于当日曝光 */
function buildDimRows(dims, campaignId, statDate, totalImpressions) {
  if (!dims) return [];
  const rows = [];
  for (const type of ['region', 'gender', 'age']) {
    const items = dims[type];
    if (items === undefined) continue;
    if (!Array.isArray(items) || items.length === 0) {
      throw errors.badRequest(`维度 ${type} 不能为空数组`);
    }
    let sum = 0;
    for (const item of items) {
      const value = String(item.name || item.key || '').trim();
      if (!value) throw errors.badRequest('维度名称不能为空');
      const imp = toInt(item.impressions, `${type} 维度曝光量`);
      sum += imp;
      rows.push([
        campaignId,
        statDate,
        type,
        value.slice(0, 32),
        imp,
        toInt(item.reach ?? 0, `${type} 维度曝光人数`),
        toInt(item.clicks ?? 0, `${type} 维度点击人数`),
      ]);
    }
    if (sum !== totalImpressions) {
      throw errors.badRequest(`${type} 维度合计 ${sum} 与曝光量 ${totalImpressions} 不一致`);
    }
  }
  return rows;
}

export const statsService = {
  async daily(id, query, user) {
    const campaign = await accessCampaign(id, user);
    const rows = await statsRepo.listDaily(id, query);
    const totals = await statsRepo.totals(id, query);
    return {
      campaignId: campaign.id,
      from: query.from || campaign.startDate,
      to: query.to || campaign.endDate,
      totals: {
        ...totals,
        completionRate: completionRate(totals.impressions, campaign.targetImpressions),
        clickRate: clickRate(totals.clicks, totals.reach),
      },
      rows,
    };
  },

  async dimensions(id, query, user) {
    await accessCampaign(id, user);
    const rows = await statsRepo.listDims(id, query);
    const grouped = rows.reduce((acc, row) => {
      acc[row.dimType] = acc[row.dimType] || [];
      acc[row.dimType].push(row);
      return acc;
    }, {});
    const totals = rows.reduce((acc, row) => {
      acc[row.dimType] = (acc[row.dimType] || 0) + Number(row.impressions);
      return acc;
    }, {});
    return { campaignId: id, items: rows, grouped, totals };
  },

  async upsert(id, payload, user, ip) {
    const campaign = await accessCampaign(id, user);
    if (!canAcceptStats(campaign.status)) {
      throw errors.conflict('当前状态不允许录入数据');
    }
    const statDate = payload.statDate;
    assertDateInRange(campaign, statDate);
    const values = validateValues(payload);
    const dimRows = buildDimRows(payload.dims, id, statDate, values.impressions);

    await withTransaction(async (conn) => {
      await statsRepo.upsertDaily([
        [id, statDate, values.impressions, values.reach, values.clicks, values.cost, 'manual', user.id],
      ], conn);
      if (dimRows.length) await statsRepo.upsertDims(dimRows, conn);
    });
    await auditRepo.insert({
      objectType: 'campaign',
      objectId: id,
      action: 'stats_upsert',
      after: { statDate, ...values, dims: dimRows.length || undefined },
      operatorId: user.id,
      ip,
    });
    return { campaignId: id, statDate, ...values, dimsValid: dimRows.length > 0 };
  },

  async adjust(id, statDate, payload, user, ip) {
    if (user.role !== 'admin') throw errors.forbidden('数据调节仅管理员可执行');
    const campaign = await accessCampaign(id, user);
    assertDateInRange(campaign, statDate);
    const reason = String(payload.reason || '').trim();
    if (reason.length < 10) throw errors.badRequest('调节原因至少 10 个字');
    const values = validateValues(payload);
    const before = await statsRepo.findDaily(id, statDate);

    await statsRepo.upsertDaily([
      [id, statDate, values.impressions, values.reach, values.clicks, values.cost, 'manual', user.id],
    ]);
    await auditRepo.insert({
      objectType: 'campaign',
      objectId: id,
      action: 'stats_adjust',
      before: before
        ? {
            impressions: String(before.impressions),
            reach: String(before.reach),
            clicks: String(before.clicks),
            cost: before.cost,
          }
        : null,
      after: { statDate, ...values, reason },
      operatorId: user.id,
      ip,
    });
    return { campaignId: id, statDate, ...values, reason };
  },

  /**
   * Excel 导入：解析表头 → 逐行校验 → 全部通过后在一个事务里批量 upsert。
   * 任一行失败则整体不写入，返回错误行供用户修正。
   */
  async import(buffer, user, ip) {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer);
    } catch {
      throw errors.importFormat('无法解析 Excel 文件，请使用模板重新上传');
    }
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 2) throw errors.importFormat('文件中没有可导入的数据');

    const headerMap = {};
    const alias = {
      code: ['计划编号', '投放单号', '计划单号', '计划编码'],
      date: ['日期', '数据日期', '统计日期'],
      impressions: ['曝光量', '曝光次数'],
      reach: ['曝光人数', '触达人数'],
      clicks: ['点击人数', '点击次数'],
      cost: ['消耗', '消耗金额', '花费'],
    };
    sheet.getRow(1).eachCell((cell, col) => {
      const text = String(cell.value ?? '').trim();
      for (const [field, names] of Object.entries(alias)) {
        if (names.includes(text)) headerMap[field] = col;
      }
    });
    for (const field of ['code', 'date', 'impressions', 'reach', 'clicks']) {
      if (!headerMap[field]) {
        throw errors.importFormat(`缺少必填列：${alias[field][0]}`);
      }
    }

    const parseCell = (row, field) => {
      const col = headerMap[field];
      if (!col) return null;
      const value = row.getCell(col).value;
      if (value instanceof Date) return formatDate(value);
      if (value && typeof value === 'object') {
        if (value.result !== undefined) return value.result;
        if (value.text !== undefined) return value.text;
        if (value.richText) return value.richText.map((t) => t.text).join('');
      }
      return value;
    };

    const campaigns = new Map();
    const rows = [];
    const errorRows = [];
    for (let i = 2; i <= sheet.rowCount; i += 1) {
      const row = sheet.getRow(i);
      const code = String(parseCell(row, 'code') ?? '').trim();
      if (!code) continue;
      try {
        if (!campaigns.has(code)) {
          campaigns.set(code, await campaignRepo.findByCode(code, user.role === 'admin' ? {} : { createdBy: user.id }));
        }
        const campaign = campaigns.get(code);
        if (!campaign) throw new Error('计划编号不存在或无权访问');
        const statDate = String(parseCell(row, 'date') ?? '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(statDate)) throw new Error('日期格式应为 YYYY-MM-DD');
        if (statDate < campaign.startDate || statDate > campaign.endDate) throw new Error('日期不在计划排期内');
        const values = validateValues({
          impressions: parseCell(row, 'impressions'),
          reach: parseCell(row, 'reach'),
          clicks: parseCell(row, 'clicks'),
          cost: parseCell(row, 'cost') ?? 0,
        });
        rows.push([campaign.id, statDate, values.impressions, values.reach, values.clicks, values.cost, 'excel', user.id]);
      } catch (err) {
        errorRows.push({ row: i, code, message: err.message });
      }
    }

    if (!rows.length && !errorRows.length) throw errors.importInvalid('没有识别到有效数据行');
    if (errorRows.length) {
      throw errors.importInvalid(`共 ${errorRows.length} 行校验失败，请修正后重新导入`, errorRows.slice(0, 50));
    }
    if (rows.length > MAX_IMPORT_ROWS) throw errors.importFormat(`单次最多导入 ${MAX_IMPORT_ROWS} 行`);

    await withTransaction(async (conn) => {
      await statsRepo.upsertDaily(rows, conn);
      await conn.query(
        `INSERT INTO sync_task (campaign_id, trigger_type, adapter, status, rows_affected, message, finished_at)
         VALUES (NULL, 'import', 'excel', 'success', ?, ?, NOW())`,
        [rows.length, `导入 ${rows.length} 行`]
      );
      await auditRepo.insert(
        {
          objectType: 'stats',
          objectId: 0,
          action: 'import',
          after: { rows: rows.length, campaigns: [...campaigns.keys()] },
          operatorId: user.id,
          ip,
        },
        conn
      );
    });

    return { rows: rows.length, campaigns: [...campaigns.keys()] };
  },

  /** 清空单个计划的投放数据，便于演示前重置 */
  async clear(id, user, ip) {
    if (user.role !== 'admin') throw errors.forbidden('清空数据仅管理员可执行');
    await accessCampaign(id, user);
    const deletedDays = await statsRepo.clearCampaign(id);
    await auditRepo.insert({
      objectType: 'campaign',
      objectId: id,
      action: 'stats_clear',
      after: { deletedDays },
      operatorId: user.id,
      ip,
    });
    return { campaignId: id, cleared: true, deletedDays };
  },

  async sync(id, user, ip, options = {}) {
    return mockService.generate(id, options, user, ip);
  },

  async template() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('导入模板');
    sheet.columns = [
      { header: '计划编号', key: 'code', width: 22 },
      { header: '日期', key: 'date', width: 14 },
      { header: '曝光量', key: 'impressions', width: 16 },
      { header: '曝光人数', key: 'reach', width: 14 },
      { header: '点击人数', key: 'clicks', width: 14 },
      { header: '消耗', key: 'cost', width: 12 },
    ];
    sheet.addRow(['DC20261101-0001', '2026-11-01', 800000, 12000, 140, 6000]);
    sheet.getRow(1).font = { bold: true };
    return workbook.xlsx.writeBuffer();
  },
};
