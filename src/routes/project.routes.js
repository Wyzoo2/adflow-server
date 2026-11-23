// 项目路由。

import { ok } from '../utils/response.js';
import { projectService } from '../services/project.service.js';
import { requireAdmin } from '../plugins/auth.js';
import { idParams, security } from '../schemas/common.js';

const projectBody = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 },
    client: { type: 'string', maxLength: 120 },
    startDate: { type: 'string', description: 'YYYY-MM-DD' },
    endDate: { type: 'string', description: 'YYYY-MM-DD' },
    budget: { type: 'number', minimum: 0 },
  },
};

export default async function projectRoutes(app) {
  app.get('', { schema: { tags: ['项目管理'], summary: '项目列表', security } }, async () => ok(await projectService.list()));

  app.get(
    '/:id',
    { schema: { tags: ['项目管理'], summary: '项目详情', security, params: idParams } },
    async (request) => ok(await projectService.detail(request.params.id))
  );

  app.post(
    '',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['项目管理'],
        summary: '新增项目',
        security,
        body: { ...projectBody, required: ['name'] },
      },
    },
    async (request) => ok(await projectService.create(request.body, request.user, request.ip))
  );

  app.put(
    '/:id',
    {
      preHandler: requireAdmin,
      schema: { tags: ['项目管理'], summary: '修改项目', security, params: idParams, body: projectBody },
    },
    async (request) => ok(await projectService.update(request.params.id, request.body, request.user, request.ip))
  );
}
