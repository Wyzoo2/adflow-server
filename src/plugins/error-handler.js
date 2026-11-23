// 统一错误响应：业务错误码、参数校验错误与兜底异常。

import { AppError } from '../utils/errors.js';
import { config } from '../config/index.js';

export function errorHandler(error, request, reply) {
  if (error instanceof AppError) {
    return reply.status(error.status).send({
      code: error.code,
      message: error.message,
      details: error.details || undefined,
      traceId: request.id,
    });
  }

  if (error.validation) {
    return reply.status(400).send({
      code: 1001,
      message: '参数校验失败',
      details: error.validation.map((v) => ({
        field: v.instancePath || v.params?.missingProperty,
        message: v.message,
      })),
      traceId: request.id,
    });
  }

  if (error.statusCode && error.statusCode < 500) {
    return reply.status(error.statusCode).send({
      code: 1001,
      message: error.message,
      traceId: request.id,
    });
  }

  request.log.error({ err: error }, 'unhandled error');
  return reply.status(500).send({
    code: 5000,
    message: config.env === 'production' ? '服务内部错误' : error.message,
    traceId: request.id,
  });
}

export function notFoundHandler(request, reply) {
  reply.status(404).send({ code: 1004, message: '接口不存在', traceId: request.id });
}
