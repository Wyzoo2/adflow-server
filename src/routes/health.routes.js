// 健康检查路由（无需登录）。

import { ping } from '../db/pool.js';

export default async function healthRoutes(app) {
  const handler = async () => {
    let db = 'down';
    try {
      await ping();
      db = 'up';
    } catch {
      db = 'down';
    }
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      version: '1.0.0',
      uptime: Math.round(process.uptime()),
      time: new Date().toISOString(),
    };
  };

  app.get(
    '/health',
    { schema: { tags: ['健康检查'], summary: '服务与数据库健康检查', security: [] } },
    handler
  );

  app.get(
    '/api/v1/health',
    { schema: { tags: ['健康检查'], summary: '服务与数据库健康检查（带前缀）', security: [] } },
    handler
  );
}
