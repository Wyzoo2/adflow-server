// 看板路由：汇总、趋势、人群、渠道。
import { ok } from '../utils/response.js';
import { dashboardService } from '../services/dashboard.service.js';
import { security } from '../schemas/common.js';

const rangeProps = {
  projectId: { type: 'string', description: '项目 ID，不传表示全部项目' },
  from: { type: 'string', description: '开始日期 YYYY-MM-DD' },
  to: { type: 'string', description: '结束日期 YYYY-MM-DD' },
};

export default async function dashboardRoutes(app) {
  app.get(
    '/summary',
    {
      schema: {
        tags: ['数据看板'],
        summary: '汇总指标',
        description:
          '返回目标曝光、实际曝光、曝光人数、点击人数、消耗、完成率、点击率、CPM、在投计划数与数据更新时间；compare=previous 时附带上一周期对象。',
        security,
        querystring: {
          type: 'object',
          properties: {
            ...rangeProps,
            compare: { type: 'string', enum: ['previous'], description: '传 previous 返回上一周期环比' },
          },
        },
      },
    },
    async (request) => ok(await dashboardService.summary(request.query, request.user))
  );

  app.get(
    '/trend',
    {
      schema: {
        tags: ['数据看板'],
        summary: '按日趋势',
        description:
          '返回区间内每天的实际曝光/人数/点击/消耗与当日计划目标 target；区间内无数据的日期补零。',
        security,
        querystring: { type: 'object', properties: rangeProps },
      },
    },
    async (request) => ok(await dashboardService.trend(request.query, request.user))
  );

  app.get(
    '/dimensions',
    {
      schema: {
        tags: ['数据看板'],
        summary: '人群分布（地域/性别/年龄）',
        description: '支持按日期区间与维度类型过滤，返回 items 与按维度分组的 grouped。',
        security,
        querystring: {
          type: 'object',
          properties: {
            ...rangeProps,
            type: { type: 'string', enum: ['region', 'gender', 'age'], description: '维度类型，不传返回全部' },
          },
        },
      },
    },
    async (request) => ok(await dashboardService.dimensions(request.query, request.user))
  );

  app.get(
    '/channels',
    {
      schema: {
        tags: ['数据看板'],
        summary: '渠道曝光占比',
        description: '返回渠道编码、渠道名称与曝光量。',
        security,
        querystring: { type: 'object', properties: rangeProps },
      },
    },
    async (request) => ok(await dashboardService.channels(request.query, request.user))
  );
}
