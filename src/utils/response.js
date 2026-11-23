// 统一响应体（成功与分页）。

/** 统一成功响应体 */
export const ok = (data = null) => ({ code: 0, message: 'ok', data });

/** 统一分页响应体 */
export const paged = (items, total, page, pageSize) =>
  ok({ items, total: Number(total), page: Number(page), pageSize: Number(pageSize) });
