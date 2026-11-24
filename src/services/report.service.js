// 报表业务：生成 xlsx / pdf 并登记任务。
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { config } from '../config/index.js';
import { pool } from '../db/pool.js';
import { reportRepo } from '../repositories/report.repo.js';
import { campaignRepo } from '../repositories/campaign.repo.js';
import { statsRepo } from '../repositories/stats.repo.js';
import { errors } from '../utils/errors.js';
import { weekStart } from '../utils/date.js';

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17416B' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } };
const TYPES = ['daily', 'weekly', 'campaign', 'detail'];
const FORMATS = ['xlsx', 'pdf'];

function safeFileName(name) {
  return name.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80);
}

function styleHeader(sheet) {
  const row = sheet.getRow(1);
  row.font = HEADER_FONT;
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
}

function addSection(workbook, section) {
  const sheet = workbook.addWorksheet(section.name.slice(0, 30));
  sheet.columns = section.headers.map((header, i) => ({
    header,
    key: `c${i}`,
    width: section.widths?.[i] || 18,
  }));
  for (const row of section.rows) {
    const data = {};
    row.forEach((value, i) => {
      data[`c${i}`] = value;
    });
    sheet.addRow(data);
  }
  styleHeader(sheet);
}

async function writeXlsx(filePath, report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'adflow-server';
  for (const section of report.sections) addSection(workbook, section);
  await workbook.xlsx.writeFile(filePath);
}

/** PDF 表格：固定行高、列宽按权重分配，跨页自动重绘表头 */
function drawTable(doc, headers, rows, widths) {
  const left = doc.page.margins.left;
  const available = doc.page.width - left - doc.page.margins.right;
  const total = widths.reduce((a, b) => a + b, 0);
  const cols = widths.map((w) => (w / total) * available);
  const rowHeight = 18;

  const drawRow = (cells, isHeader) => {
    let x = left;
    const y = doc.y;
    if (isHeader) doc.rect(left, y, available, rowHeight).fill('#17416B');
    cells.forEach((cell, i) => {
      doc
        .fillColor(isHeader ? '#FFFFFF' : '#1F2329')
        .fontSize(isHeader ? 8.5 : 8)
        .text(String(cell ?? ''), x + 3, y + 4, {
          width: cols[i] - 6,
          height: rowHeight - 6,
          ellipsis: true,
          lineBreak: false,
        });
      x += cols[i];
    });
    doc.y = y + rowHeight;
  };

  drawRow(headers, true);
  for (const row of rows) {
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage();
      drawRow(headers, true);
    }
    drawRow(row, false);
  }
}

async function writePdf(filePath, report) {
  if (!fs.existsSync(config.pdfFontPath)) {
    throw errors.badRequest(`缺少中文字体文件：${config.pdfFontPath}，请通过 PDF_FONT_PATH 指定`);
  }
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);
  doc.registerFont('cn', config.pdfFontPath);

  doc.font('cn').fontSize(16).fillColor('#17416B').text(report.title);
  doc.moveDown(0.3);
  doc.fontSize(8.5).fillColor('#5B6673').text(`生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`);
  if (report.meta) doc.text(report.meta);
  doc.moveDown(0.8);

  for (const section of report.sections) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 160) doc.addPage();
    doc.font('cn').fontSize(11).fillColor('#17416B').text(section.name);
    doc.moveDown(0.3);
    doc.fillColor('#1F2329');
    drawTable(doc, section.headers, section.rows, section.widths || section.headers.map(() => 1));
    doc.moveDown(0.8);
  }

  doc.end();
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

function buildWhere(payload, user) {
  const where = ['c.deleted_at IS NULL'];
  const params = [];
  if (payload.projectId) {
    where.push('c.project_id = ?');
    params.push(payload.projectId);
  }
  if (Array.isArray(payload.campaignIds) && payload.campaignIds.length) {
    where.push('c.id IN (?)');
    params.push(payload.campaignIds);
  }
  if (user.role !== 'admin') {
    where.push('c.created_by = ?');
    params.push(user.id);
  }
  if (payload.from) {
    where.push('d.stat_date >= ?');
    params.push(payload.from);
  }
  if (payload.to) {
    where.push('d.stat_date <= ?');
    params.push(payload.to);
  }
  return { clause: where.join(' AND '), params };
}

async function fetchRows(payload, user) {
  const { clause, params } = buildWhere(payload, user);
  const [rows] = await pool.query(
    `SELECT c.id, c.code, c.name, c.channel, ch.name AS channel_name, d.stat_date,
            d.impressions, d.reach, d.clicks, d.cost
       FROM daily_stat d JOIN campaign c ON c.id = d.campaign_id
       LEFT JOIN channel ch ON ch.code = c.channel
      WHERE ${clause}
      ORDER BY d.stat_date ASC, c.id ASC`,
    params
  );
  return rows;
}

function summarize(rows) {
  return rows.reduce(
    (acc, row) => {
      acc.impressions += Number(row.impressions);
      acc.reach += Number(row.reach);
      acc.clicks += Number(row.clicks);
      acc.cost += Number(row.cost);
      return acc;
    },
    { impressions: 0, reach: 0, clicks: 0, cost: 0 }
  );
}

function overviewSection(campaign, totals) {
  return {
    name: '概览',
    headers: ['指标', '数值'],
    widths: [35, 65],
    rows: [
      ['计划名称', campaign.name],
      ['投放单号', campaign.code || '-'],
      ['状态', campaign.status],
      ['投放渠道', campaign.channelName || campaign.channel],
      ['投放厂商', (campaign.vendors || []).map((v) => v.name).join('、') || '-'],
      ['排期', `${campaign.startDate} 至 ${campaign.endDate}`],
      ['计划曝光量', campaign.targetImpressions],
      ['实际曝光量', totals.impressions],
      ['曝光人数', totals.reach],
      ['点击人数', totals.clicks],
      ['消耗金额', totals.cost],
      ['数据更新时间', totals.dataUpdatedAt || '-'],
    ],
  };
}

async function buildReport(payload, user) {
  const type = payload.type;
  const ext = payload.format;
  const suffix = `${payload.from || ''}-${payload.to || ''}`.replace(/^-|-$/g, '') || 'all';

  if (type === 'campaign') {
    const campaign = await campaignRepo.findById(payload.campaignId, user.role === 'admin' ? {} : { createdBy: user.id });
    if (!campaign) throw errors.notFound('投放计划不存在');
    const daily = await statsRepo.listDaily(campaign.id, payload);
    const totals = await statsRepo.totals(campaign.id, payload);
    const dims = await statsRepo.listDims(campaign.id, payload);
    return {
      title: `结案报告 · ${campaign.name}`,
      fileName: safeFileName(`结案报告_${campaign.name}_${suffix}.${ext}`),
      meta: `计划编号：${campaign.code || '-'}　排期：${campaign.startDate} 至 ${campaign.endDate}`,
      sections: [
        overviewSection(campaign, totals),
        {
          name: '分日数据',
          headers: ['日期', '曝光量', '曝光人数', '点击人数', '消耗'],
          widths: [18, 18, 16, 14, 14],
          rows: daily.map((r) => [r.statDate, r.impressions, r.reach, r.clicks, r.cost]),
        },
        {
          name: '人群分布',
          headers: ['日期', '维度', '取值', '曝光量', '曝光人数', '点击人数'],
          widths: [13, 9, 14, 18, 14, 14],
          rows: dims.map((r) => [r.statDate, r.dimType, r.dimValue, r.impressions, r.reach, r.clicks]),
        },
      ],
    };
  }

  const rows = await fetchRows(payload, user);
  const totals = summarize(rows);
  const summarySection = {
    name: '概览',
    headers: ['指标', '数值'],
    widths: [35, 65],
    rows: [
      ['统计区间', `${payload.from || '-'} 至 ${payload.to || '-'}`],
      ['计划数', new Set(rows.map((r) => r.id)).size],
      ['曝光量', totals.impressions],
      ['曝光人数', totals.reach],
      ['点击人数', totals.clicks],
      ['消耗金额', totals.cost.toFixed(2)],
    ],
  };

  if (type === 'weekly') {
    const weeks = new Map();
    for (const row of rows) {
      const key = weekStart(row.stat_date);
      if (!weeks.has(key)) weeks.set(key, { impressions: 0, reach: 0, clicks: 0, cost: 0 });
      const item = weeks.get(key);
      item.impressions += Number(row.impressions);
      item.reach += Number(row.reach);
      item.clicks += Number(row.clicks);
      item.cost += Number(row.cost);
    }
    const list = [...weeks.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const weeklyRows = list.map(([week, item], index) => {
      const previous = index > 0 ? list[index - 1][1] : null;
      const growth =
        previous && previous.impressions
          ? `${(((item.impressions - previous.impressions) / previous.impressions) * 100).toFixed(2)}%`
          : '—';
      return [week, item.impressions, item.reach, item.clicks, item.cost.toFixed(2), growth];
    });
    return {
      title: '投放周报',
      fileName: safeFileName(`投放周报_${suffix}.${ext}`),
      meta: `统计区间：${payload.from || '-'} 至 ${payload.to || '-'}`,
      sections: [
        summarySection,
        {
          name: '周汇总',
          headers: ['周起始（周一）', '曝光量', '曝光人数', '点击人数', '消耗', '曝光环比'],
          widths: [18, 18, 16, 14, 14, 14],
          rows: weeklyRows,
        },
      ],
    };
  }

  if (type === 'daily') {
    const dailyRows = rows.map((r) => [
      r.code || '-',
      r.name,
      r.channel_name || r.channel,
      r.stat_date,
      String(r.impressions),
      String(r.reach),
      String(r.clicks),
      r.cost,
    ]);
    return {
      title: '投放日报',
      fileName: safeFileName(`投放日报_${suffix}.${ext}`),
      meta: `统计区间：${payload.from || '-'} 至 ${payload.to || '-'}`,
      sections: [
        summarySection,
        {
          name: '分日明细',
          headers: ['计划编号', '计划名称', '渠道', '日期', '曝光量', '曝光人数', '点击人数', '消耗'],
          widths: [18, 26, 10, 13, 16, 13, 11, 9],
          rows: dailyRows,
        },
      ],
    };
  }

  // detail：原始明细
  return {
    title: '数据明细',
    fileName: safeFileName(`数据明细_${suffix}.${ext}`),
    meta: `统计区间：${payload.from || '-'} 至 ${payload.to || '-'}`,
    sections: [
      summarySection,
      {
        name: '明细',
        headers: ['计划编号', '计划名称', '渠道', '日期', '曝光量', '曝光人数', '点击人数', '消耗'],
        widths: [18, 26, 10, 13, 16, 13, 11, 9],
        rows: rows.map((r) => [
          r.code || '-',
          r.name,
          r.channel_name || r.channel,
          r.stat_date,
          String(r.impressions),
          String(r.reach),
          String(r.clicks),
          r.cost,
        ]),
      },
    ],
  };
}

export const reportService = {
  async create(payload, user) {
    const type = payload.type || 'campaign';
    const format = payload.format || 'xlsx';
    if (!TYPES.includes(type)) throw errors.badRequest('报表类型不合法');
    if (!FORMATS.includes(format)) throw errors.badRequest('报表格式仅支持 xlsx 或 pdf');
    if (type === 'campaign' && !payload.campaignId) throw errors.badRequest('结案报告需要传 campaignId');
    if ((type === 'daily' || type === 'weekly' || type === 'detail') && (!payload.from || !payload.to)) {
      throw errors.badRequest('该报表类型需要传 from 与 to');
    }

    const id = randomUUID();
    const params = {
      projectId: payload.projectId,
      campaignIds: payload.campaignIds,
      from: payload.from,
      to: payload.to,
    };
    await reportRepo.create({
      id,
      type,
      format,
      campaignId: payload.campaignId,
      params,
      createdBy: user.id,
    });

    try {
      const report = await buildReport({ ...payload, type, format }, user);
      await fs.promises.mkdir(config.reportDir, { recursive: true });
      const filePath = path.join(config.reportDir, `${id}.${format}`);
      if (format === 'pdf') await writePdf(filePath, report);
      else await writeXlsx(filePath, report);
      const stat = await fs.promises.stat(filePath);
      await reportRepo.markDone(id, {
        fileName: report.fileName,
        filePath,
        fileSize: stat.size,
      });
      return {
        id,
        type,
        format,
        status: 'success',
        fileName: report.fileName,
        fileSize: stat.size,
        campaignIds: params.campaignIds || (payload.campaignId ? [String(payload.campaignId)] : []),
        downloadUrl: `/api/v1/reports/${id}/download`,
      };
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
    await fs.promises.access(task.filePath);
    return task;
  },
};
