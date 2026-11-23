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
        description: 'type 为 campaign 时生成单计划结案报表（概览、分日、人群），为 daily 时生成区间明细。',
        security,
        body: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['campaign', 'daily'], default: 'campaign' },
            campaignId: { type: 'string' },
            from: { type: 'string' },
            to: { type: 'string' },
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
        security,
        querystring: { type: 'object', properties: { ...pagingQuery.properties } },
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
        security,
        params: idParams,
        produces: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      },
    },
    async (request, reply) => {
      const task = await reportService.getFile(request.params.id, request.user);
      reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header(
          'Content-Disposition',
          `attachment; filename="${task.fileName}"; filename*=UTF-8''${encodeURIComponent(task.fileName)}`
        );
      return reply.send(createReadStream(task.filePath));
    }
  );
}
