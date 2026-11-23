// 报表业务：生成 xlsx 并登记任务。

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { config } from '../config/index.js';
import { pool } from '../db/pool.js';
import { reportRepo } from '../repositories/report.repo.js';
import { campaignRepo } from '../repositories/campaign.repo.js';
import { statsRepo } from '../repositories/stats.repo.js';
import { errors } from '../utils/errors.js';

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17416B' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } };

function styleHeader(sheet) {
  const row = sheet.getRow(1);
  row.font = HEADER_FONT;
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
}

function addOverview(sheet, campaign, totals) {
  sheet.columns = [
    { header: '指标', key: 'k', width: 22 },
    { header: '数值', key: 'v', width: 26 },
  ];
  const rows = [
    ['计划名称', campaign.name],
    ['投放单号', campaign.code || '-'],
    ['状态', campaign.status],
    ['投放渠道', campaign.channel],
    ['投放厂商', campaign.vendors.map((v) => v.name).join('、') || '-'],
    ['排期', `${campaign.startDate} 至 ${campaign.endDate}`],
    ['计划曝光量', campaign.targetImpressions],
    ['实际曝光量', totals.impressions],
    ['曝光人数', totals.reach],
    ['点击人数', totals.clicks],
    ['消耗金额', totals.cost],
  ];
  for (const [k, v] of rows) sheet.addRow({ k, v });
  styleHeader(sheet);
}

function addDaily(sheet, rows) {
  sheet.columns = [
    { header: '日期', key: 'd', width: 14 },
    { header: '曝光量', key: 'i', width: 16 },
    { header: '曝光人数', key: 'r', width: 14 },
    { header: '点击人数', key: 'c', width: 14 },
    { header: '消耗', key: 'cost', width: 12 },
    { header: '数据来源', key: 's', width: 12 },
  ];
  for (const r of rows) {
    sheet.addRow({ d: r.statDate, i: r.impressions, r: r.reach, c: r.clicks, cost: r.cost, s: r.source });
  }
  styleHeader(sheet);
}

function addDims(sheet, dims) {
  sheet.columns = [
    { header: '维度', key: 't', width: 12 },
    { header: '取值', key: 'v', width: 18 },
    { header: '曝光量', key: 'i', width: 16 },
    { header: '曝光人数', key: 'r', width: 14 },
    { header: '点击人数', key: 'c', width: 14 },
  ];
  for (const d of dims) {
    sheet.addRow({ t: d.dimType, v: d.dimValue, i: d.impressions, r: d.reach, c: d.clicks });
  }
  styleHeader(sheet);
}

export const reportService = {
  async create({ type = 'campaign', campaignId, from, to }, user) {
    const id = randomUUID();
    const params = { type, campaignId, from, to };
    await reportRepo.create({ id, type, campaignId, params, createdBy: user.id });
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'adflow-server';

      if (type === 'campaign') {
        if (!campaignId) throw errors.badRequest('单计划报表需要传 campaignId');
        const campaign = await campaignRepo.findById(campaignId, user.role === 'admin' ? {} : { createdBy: user.id });
        if (!campaign) throw errors.notFound('投放计划不存在');
        const daily = await statsRepo.listDaily(campaignId, { from, to });
        const totals = await statsRepo.totals(campaignId, { from, to });
        const dims = await statsRepo.listDims(campaignId);
        addOverview(workbook.addWorksheet('概览'), campaign, totals);
        addDaily(workbook.addWorksheet('分日数据'), daily);
        addDims(workbook.addWorksheet('人群分布'), dims);
      } else {
        const where = ['c.deleted_at IS NULL'];
        const sqlParams = [];
        if (from) {
          where.push('d.stat_date >= ?');
          sqlParams.push(from);
        }
        if (to) {
          where.push('d.stat_date <= ?');
          sqlParams.push(to);
        }
        if (user.role !== 'admin') {
          where.push('c.created_by = ?');
          sqlParams.push(user.id);
        }
        const [rows] = await pool.query(
          `SELECT c.code, c.name, c.channel, d.stat_date, d.impressions, d.reach, d.clicks, d.cost
             FROM daily_stat d JOIN campaign c ON c.id = d.campaign_id
            WHERE ${where.join(' AND ')} ORDER BY d.stat_date, c.id`,
          sqlParams
        );
        const sheet = workbook.addWorksheet('数据明细');
        sheet.columns = [
          { header: '计划编号', key: 'code', width: 20 },
          { header: '计划名称', key: 'name', width: 30 },
          { header: '渠道', key: 'channel', width: 12 },
          { header: '日期', key: 'date', width: 14 },
          { header: '曝光量', key: 'impressions', width: 16 },
          { header: '曝光人数', key: 'reach', width: 14 },
          { header: '点击人数', key: 'clicks', width: 14 },
          { header: '消耗', key: 'cost', width: 12 },
        ];
        for (const r of rows) {
          sheet.addRow({
            code: r.code,
            name: r.name,
            channel: r.channel,
            date: r.stat_date,
            impressions: String(r.impressions),
            reach: String(r.reach),
            clicks: String(r.clicks),
            cost: r.cost,
          });
        }
        styleHeader(sheet);
      }

      await fs.mkdir(config.reportDir, { recursive: true });
      const fileName = `report-${id}.xlsx`;
      const filePath = path.join(config.reportDir, fileName);
      await workbook.xlsx.writeFile(filePath);
      await reportRepo.markDone(id, { fileName, filePath });
      return { id, type, status: 'success', fileName, downloadUrl: `/api/v1/reports/${id}/download` };
    } catch (err) {
      await reportRepo.markFailed(id);
      throw err;
    }
  },

  async list(query, user) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const { items, total } = await reportRepo.list({
      createdBy: user.role === 'admin' ? undefined : user.id,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });
    return { items, total, page, pageSize };
  },

  async getFile(id, user) {
    const task = await reportRepo.findById(id);
    if (!task) throw errors.notFound('报表任务不存在');
    if (user.role !== 'admin' && task.createdBy !== String(user.id)) throw errors.notFound('报表任务不存在');
    if (task.status !== 'success' || !task.filePath) throw errors.conflict('报表尚未生成完成');
    await fs.access(task.filePath);
    return task;
  },
};
