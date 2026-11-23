// 分页参数解析。

export function parsePaging(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function pagingMeta(total, page, pageSize) {
  return {
    total: Number(total),
    page,
    pageSize,
    totalPages: Math.ceil(Number(total) / pageSize) || 0,
  };
}
