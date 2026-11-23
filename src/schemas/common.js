// 路由复用的 JSON Schema 片段（ID、分页、日期范围、鉴权）。
export const idParams = {
  type: 'object',
  description: '路径参数',
  properties: {
    id: { type: 'string', description: '资源 ID' },
  },
  required: ['id'],
};

export const pagingQuery = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 1, default: 1, description: '页码，从 1 开始' },
    pageSize: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 20,
      description: '每页条数，最大 200',
    },
  },
};

export const dateRangeQuery = {
  type: 'object',
  properties: {
    projectId: { type: 'string', description: '项目 ID，不传表示全部项目' },
    from: { type: 'string', description: '开始日期，格式 YYYY-MM-DD（含当天）' },
    to: { type: 'string', description: '结束日期，格式 YYYY-MM-DD（含当天）' },
  },
};

export const security = [{ bearerAuth: [] }];

export const CAMPAIGN_STATUS = [
  'draft',
  'pending',
  'scheduled',
  'running',
  'paused',
  'finished',
  'closed',
];

export const CHANNEL_PATTERN = '^[a-z][a-z0-9_-]{1,31}$';
