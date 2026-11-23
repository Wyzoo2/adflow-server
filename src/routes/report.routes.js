// 报表生成、列表与下载路由。
import { createReadStream } from 'node:fs';
import { ok, paged } from '../utils/response.js';
import { reportService } from '../services/report.service.js';
import { idParams, pagingQuery, security } from '../schemas/common.js';

export default async function reportRoutes(app) {
  app.post(
    '',
    {
      schema: {
        tags: ['报表中心'],
        summary: '生成报表',
        description:
          'type：daily 日报、weekly 周报、campaign 结案报告、detail 数据明细；统一导出 xlsx。campaign 必须传 campaignId；daily/weekly/detail 需要 from/to，可用 campaignIds 批量。',
        security,
        body: {
          type: 'object',
          required: ['type'],
          properties: {
            type: { type: 'string', enum: ['daily', 'weekly', 'campaign', 'detail'], description: '报表类型' },
            format: { type: 'string', enum: ['xlsx'], default: 'xlsx', description: '文件格式，当前仅支持 xlsx' },
            projectId: { type: 'string', description: '按项目过滤' },
            campaignId: { type: 'string', description: '结案报告的计划 ID（type=campaign 必填）' },
            campaignIds: {
              type: 'array',
              items: { type: 'string' },
              description: '批量计划 ID，仅对 daily/weekly/detail 生效',
            },
            from: { type: 'string', description: '开始日期 YYYY-MM-DD' },
            to: { type: 'string', description: '结束日期 YYYY-MM-DD' },
          },
        },
      },
    },
    async (request) => ok(await reportService.create(request.body || {}, request.user))
  );

  app.get(
    '',
    {
      schema: {
        tags: ['报表中心'],
        summary: '报表任务列表',
        description: '返回类型、格式、状态、文件名、文件大小、计划 ID 与时间。',
        security,
        querystring: { type: 'object', properties: pagingQuery.properties },
      },
    },
    async (request) => {
      const { items, total, page, pageSize } = await reportService.list(request.query, request.user);
      return paged(items, total, page, pageSize);
    }
  );

  app.get(
    '/:id/download',
    {
      schema: {
        tags: ['报表中心'],
        summary: '下载报表文件',
        description: '按报表任务 ID 下载 xlsx，Content-Disposition 带中文友好文件名。',
        security,
        params: idParams,
        produces: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      },
    },
    async (request, reply) => {
      const task = await reportService.getFile(request.params.id, request.user);
      // HTTP 头只允许 ASCII，中文文件名放在 filename* 中，filename 用 ASCII 兜底
      const asciiName = `report-${task.id}.xlsx`;
      reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header(
          'Content-Disposition',
          `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(task.fileName)}`
        );
      return reply.send(createReadStream(task.filePath));
    }
  );
}
