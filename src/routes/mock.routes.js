// 投放数据参数与数据生成路由。
import { ok } from '../utils/response.js';
import { mockService } from '../services/mock.service.js';
import { requireAdmin } from '../plugins/auth.js';
import { idParams, security } from '../schemas/common.js';

const profileBody = {
  type: 'object',
  properties: {
    totalImpressions: { type: 'integer', minimum: 0, description: '目标总曝光，默认取计划目标曝光' },
    curveType: {
      type: 'string',
      enum: ['uniform', 'front_load', 'back_load', 'weekend'],
      description: '投放曲线：均匀、前低后高、前高后低、周末加权',
    },
    ctr: { type: 'number', minimum: 0, maximum: 0.2, description: '点击率，0-0.2，默认 0.01' },
    cpm: { type: 'number', minimum: 0.01, description: '千人曝光成本，默认 12' },
    frequency: { type: 'number', minimum: 1, maximum: 1000, description: '曝光频次（曝光/人数），默认 65' },
    dimRatio: {
      type: 'object',
      description: '人群拆分权重',
      properties: {
        region: { type: 'object', additionalProperties: { type: 'number' }, description: '地域名称到权重' },
        gender: { type: 'object', additionalProperties: { type: 'number' }, description: '性别到权重' },
        age: { type: 'object', additionalProperties: { type: 'number' }, description: '年龄段到权重' },
      },
    },
    seed: { type: 'integer', minimum: 0, description: '随机种子，固定后结果可复现' },
  },
};

const getProfile = async (request) => ok(await mockService.getProfile(request.params.id, request.user));
const saveProfile = async (request) =>
  ok(await mockService.saveProfile(request.params.id, request.body, request.user, request.ip));
const generate = async (request) =>
  ok(await mockService.generate(request.params.id, request.body || {}, request.user, request.ip));

const profileSchema = {
  tags: ['数据生成'],
  summary: '读取数据参数',
  description: '读取计划的数据生成参数；未保存时返回默认值与计划目标曝光。',
  security,
  params: idParams,
};

const saveSchema = {
  tags: ['数据生成'],
  summary: '保存数据参数（管理员）',
  description: '目标曝光、投放曲线、点击率、千人成本、曝光频次、人群比例与随机种子。',
  security,
  params: idParams,
  body: profileBody,
};

const generateSchema = {
  tags: ['数据生成'],
  summary: '生成投放数据（管理员）',
  description: '按参数覆盖写入分日与人群数据，重复执行不会累加，返回天数、新增天数与合计。',
  security,
  params: idParams,
  body: {
    type: 'object',
    properties: {
      from: { type: 'string', description: '生成开始日期，默认计划开始日期' },
      to: { type: 'string', description: '生成结束日期，默认计划结束日期' },
    },
  },
};

export default async function dataRoutes(app) {
  app.get('/:id/data-profile', { schema: profileSchema }, getProfile);
  app.put('/:id/data-profile', { preHandler: requireAdmin, schema: saveSchema }, saveProfile);
  app.post('/:id/data/generate', { preHandler: requireAdmin, schema: generateSchema }, generate);

  // 兼容旧路径，不在文档中展示
  app.get('/:id/mock-profile', { schema: { ...profileSchema, hide: true } }, getProfile);
  app.put('/:id/mock-profile', { preHandler: requireAdmin, schema: { ...saveSchema, hide: true } }, saveProfile);
  app.post('/:id/mock/generate', { preHandler: requireAdmin, schema: { ...generateSchema, hide: true } }, generate);
}
