// 应用装配：CORS、Swagger、鉴权、错误处理与全部路由注册。

import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from './config/index.js';
import swaggerPlugin from './plugins/swagger.js';
import { authHook } from './plugins/auth.js';
import { errorHandler, notFoundHandler } from './plugins/error-handler.js';
import routes from './routes/index.js';
import healthRoutes from './routes/health.routes.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport: undefined,
    },
    trustProxy: true,
    bodyLimit: 20 * 1024 * 1024,
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: true,
        useDefaults: true,
        allErrors: false,
      },
    },
  });

  // 跨域：默认允许所有来源，生产可通过 CORS_ORIGIN 配置白名单（逗号分隔）
  await app.register(cors, {
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Trace-Id', 'X-Requested-With'],
    exposedHeaders: ['Content-Disposition', 'X-Trace-Id'],
    maxAge: 86400,
  });

  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

  // 允许 application/json + 空 body：按 {} 处理，避免前端不传 body 时被解析器拒绝
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    const text = String(body || '').trim();
    if (!text) return done(null, {});
    try {
      return done(null, JSON.parse(text));
    } catch (err) {
      err.statusCode = 400;
      return done(err);
    }
  });

  // 直接在当前(根)上下文调用，确保 swagger 的 onRoute 钩子能收集到后面注册的全部路由
  await swaggerPlugin(app);

  app.addHook('onRequest', authHook);

  // POST/PUT/PATCH 允许不带请求体：校验前补空对象，避免可选 body 被判定为非法
  app.addHook('preValidation', async (request) => {
    if (request.body === undefined && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const contentType = String(request.headers['content-type'] || '');
      if (!contentType || contentType.includes('application/json')) request.body = {};
    }
  });

  app.addHook('preSerialization', async (request, reply, payload) => {
    if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload) && 'code' in payload) {
      return { ...payload, traceId: request.id };
    }
    return payload;
  });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  await app.register(routes, { prefix: '/api/v1' });
  await app.register(healthRoutes);

  app.get('/', { schema: { hide: true } }, async (request, reply) => reply.redirect('/api-docs'));

  return app;
}
