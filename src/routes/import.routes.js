// Excel 导入与模板下载路由。

import { ok } from '../utils/response.js';
import { statsService } from '../services/stats.service.js';
import { errors } from '../utils/errors.js';
import { security } from '../schemas/common.js';

export default async function importRoutes(app) {
  app.post(
    '/import',
    {
      // multipart 请求体由 @fastify/multipart 处理，这里补空对象以通过 JSON Schema 校验
      preValidation: async (request) => {
        request.body = {};
      },
      schema: {
        tags: ['数据回收'],
        summary: 'Excel 批量导入分日数据',
        description:
          '上传 xlsx 文件，必填列：计划编号、日期、曝光量、曝光人数、点击人数，消耗可选。存在错误行时整体不写入并返回错误明细。',
        security,
        consumes: ['multipart/form-data'],
        body: {
          type: 'object',
          properties: { file: { type: 'string', format: 'binary' } },
        },
      },
    },
    async (request) => {
      const file = await request.file();
      if (!file) throw errors.importFormat('请上传 Excel 文件');
      if (!/\.xlsx$/i.test(file.filename || '')) throw errors.importFormat('仅支持 .xlsx 文件');
      const buffer = await file.toBuffer();
      return ok(await statsService.import(buffer, request.user, request.ip));
    }
  );

  app.get(
    '/import/template',
    {
      schema: {
        tags: ['数据回收'],
        summary: '下载导入模板',
        security,
        produces: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      },
    },
    async (request, reply) => {
      const buffer = await statsService.template();
      return reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', "attachment; filename*=UTF-8''stats-import-template.xlsx")
        .send(Buffer.from(buffer));
    }
  );
}
