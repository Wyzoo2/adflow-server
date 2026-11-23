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
        security,
        querystring: {
          type: 'object',
          properties: {
            objectType: { type: 'string' },
            objectId: { type: 'string' },
            operatorId: { type: 'string' },
            action: { type: 'string' },
            from: { type: 'string' },
            to: { type: 'string' },
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
        security,
        querystring: {
          type: 'object',
          properties: {
            campaignId: { type: 'string' },
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
        where.push('campaign_id = ?');
        params.push(request.query.campaignId);
      }
      if (request.user.role !== 'admin') {
        where.push('1 = 0');
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const rows = await query(
        `SELECT * FROM sync_task ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize]
      );
      const [{ total }] = await query(`SELECT COUNT(*) AS total FROM sync_task ${clause}`, params);
      return paged(
        rows.map((r) => ({
          id: String(r.id),
          campaignId: r.campaign_id ? String(r.campaign_id) : null,
          triggerType: r.trigger_type,
          adapter: r.adapter,
          status: r.status,
          rowsAffected: r.rows_affected,
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
