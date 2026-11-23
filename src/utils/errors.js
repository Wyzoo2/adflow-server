// 业务错误类型与错误码到 HTTP 状态的映射。

export const ERROR_STATUS = {
  1001: 400,
  1002: 401,
  1003: 403,
  1004: 404,
  2001: 409,
  2002: 409,
  2003: 409,
  2004: 409,
  2005: 409,
  3001: 400,
  3002: 422,
  3003: 422,
  4001: 502,
  5000: 500,
};

export class AppError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code] || 400;
    this.details = details;
  }
}

export const errors = {
  badRequest: (msg = '参数校验失败', details) => new AppError(1001, msg, details),
  unauthorized: (msg = '未登录或令牌已过期') => new AppError(1002, msg),
  forbidden: (msg = '无权限执行该操作') => new AppError(1003, msg),
  notFound: (msg = '资源不存在') => new AppError(1004, msg),
  conflict: (msg = '当前状态不允许该操作') => new AppError(2001, msg),
  nameExists: (msg = '名称已存在') => new AppError(2002, msg),
  budgetExceeded: (msg = '预算超出项目余额') => new AppError(2003, msg),
  vendorInUse: (msg = '厂商已被计划引用，不能删除，请改为停用') => new AppError(2004, msg),
  vendorDisabled: (msg = '存在停用或无效的厂商') => new AppError(2005, msg),
  importFormat: (msg = '导入文件格式错误', details) => new AppError(3001, msg, details),
  importInvalid: (msg = '导入数据校验失败', details) => new AppError(3002, msg, details),
  mockParam: (msg = '模拟参数超出合理范围') => new AppError(3003, msg),
  mediaFailed: (msg = '媒体接口调用失败') => new AppError(4001, msg),
};
