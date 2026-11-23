// 系统路由：审计日志、同步任务记录。
import { paged } from '../utils/response.js';
import { auditRepo } from '../repositories/audit.repo.js';
import { query } from '../db/pool.js';
import { requireAdmin } from '../plugins/auth.js';
import { pagingQuery, security } from '../schemas/common.js';

export default async function systemRoutes(app) {
  app.get(
    '/logs',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['系统日志'],
        summary: '审计日志',
        description: '按对象、操作人、动作、时间检索；返回前后值、操作人、IP 与时间。',
        security,
        querystring: {
          type: 'object',
          properties: {
            objectType: { type: 'string', description: '对象类型：campaign/user/vendor/channel/project/stats' },
            objectId: { type: 'string', description: '对象 ID' },
            operatorId: { type: 'string', description: '操作人用户 ID' },
            action: {
              type: 'string',
              description:
                '动作：login/create/update/delete/submit/approve/reject/publish/pause/resume/finish/close/stats_upsert/stats_adjust/stats_clear/mock_generate/import 等',
            },
            from: { type: 'string', description: '开始日期 YYYY-MM-DD' },
            to: { type: 'string', description: '结束日期 YYYY-MM-DD' },
            ...pagingQuery.properties,
          },
        },
      },
    },
    async (request) => {
      const page = Math.max(1, Number(request.query.page) || 1);
      const pageSize = Math.min(200, Math.max(1, Number(request.query.pageSize) || 20));
      const { items, total } = await auditRepo.list({
        ...request.query,
        offset: (page - 1) * pageSize,
        limit: pageSize,
      });
      return paged(items, total, page, pageSize);
    }
  );

  app.get(
    '/sync-tasks',
    {
      schema: {
        tags: ['系统日志'],
        summary: '同步任务记录',
        description: '返回触发方式、适配器、状态、影响行数、计划名称、耗时与时间；普通用户不可见。',
        security,
        querystring: {
          type: 'object',
          properties: {
            campaignId: { type: 'string', description: '按计划 ID 过滤' },
            ...pagingQuery.properties,
          },
        },
      },
    },
    async (request) => {
      const page = Math.max(1, Number(request.query.page) || 1);
      const pageSize = Math.min(200, Math.max(1, Number(request.query.pageSize) || 20));
      const where = [];
      const params = [];
      if (request.query.campaignId) {
        where.push('s.campaign_id = ?');
        params.push(request.query.campaignId);
      }
      if (request.user.role !== 'admin') {
        where.push('1 = 0');
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const rows = await query(
        `SELECT s.*, c.name AS campaign_name
           FROM sync_task s LEFT JOIN campaign c ON c.id = s.campaign_id
           ${clause} ORDER BY s.id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize]
      );
      const [{ total }] = await query(`SELECT COUNT(*) AS total FROM sync_task s ${clause}`, params);
      return paged(
        rows.map((r) => ({
          id: String(r.id),
          campaignId: r.campaign_id ? String(r.campaign_id) : null,
          campaignName: r.campaign_name || null,
          triggerType: r.trigger_type,
          adapter: r.adapter,
          status: r.status,
          rowsAffected: r.rows_affected,
          durationMs:
            r.finished_at && r.started_at
              ? Math.max(0, new Date(r.finished_at).getTime() - new Date(r.started_at).getTime())
              : null,
          message: r.message,
          startedAt: r.started_at,
          finishedAt: r.finished_at,
        })),
        total,
        page,
        pageSize
      );
    }
  );
}
