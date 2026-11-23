// 路由复用的 JSON Schema 片段（ID、分页、日期范围、鉴权）。

export const idParams = {
  type: 'object',
  properties: { id: { type: 'string', description: '资源 ID' } },
  required: ['id'],
};

export const pagingQuery = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 200, default: 20 },
  },
};

export const dateRangeQuery = {
  type: 'object',
  properties: {
    projectId: { type: 'string' },
    from: { type: 'string', description: '开始日期 YYYY-MM-DD' },
    to: { type: 'string', description: '结束日期 YYYY-MM-DD' },
  },
};

export const security = [{ bearerAuth: [] }];
