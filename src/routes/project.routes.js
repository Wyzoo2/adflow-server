// 项目路由。
import { ok } from '../utils/response.js';
import { projectService } from '../services/project.service.js';
import { requireAdmin } from '../plugins/auth.js';
import { idParams, security } from '../schemas/common.js';

const projectFields = {
  name: { type: 'string', minLength: 1, maxLength: 120, description: '项目名称' },
  client: { type: 'string', maxLength: 120, description: '甲方名称' },
  startDate: { type: 'string', description: '项目开始日期，格式 YYYY-MM-DD' },
  endDate: { type: 'string', description: '项目结束日期，格式 YYYY-MM-DD' },
  budget: { type: 'number', minimum: 0, description: '项目总预算' },
};

export default async function projectRoutes(app) {
  app.get(
    '',
    {
      schema: {
        tags: ['项目管理'],
        summary: '项目列表',
        description: '返回项目及已用预算、剩余预算（已用预算为项目下所有未删除计划预算之和）。',
        security,
      },
    },
    async () => ok(await projectService.list())
  );

  app.get(
    '/:id',
    {
      schema: {
        tags: ['项目管理'],
        summary: '项目详情',
        description: '含 budget、usedBudget、remainingBudget',
        security,
        params: idParams,
      },
    },
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
        body: { type: 'object', required: ['name'], properties: projectFields },
      },
    },
    async (request) => ok(await projectService.create(request.body, request.user, request.ip))
  );

  app.put(
    '/:id',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['项目管理'],
        summary: '修改项目',
        security,
        params: idParams,
        body: { type: 'object', properties: projectFields },
      },
    },
    async (request) => ok(await projectService.update(request.params.id, request.body, request.user, request.ip))
  );
}
