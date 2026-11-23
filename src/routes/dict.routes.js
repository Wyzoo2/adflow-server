// 字典路由：渠道、年龄段、兴趣与指标口径。
import { ok } from '../utils/response.js';
import { getDicts } from '../domain/dicts.js';
import { channelRepo } from '../repositories/channel.repo.js';
import { security } from '../schemas/common.js';

export default async function dictRoutes(app) {
  app.get(
    '',
    {
      schema: {
        tags: ['字典'],
        summary: '全站字典',
        description: '渠道来自数据库（管理员可维护），年龄段/兴趣/指标口径为内置字典，带版本号供前端缓存。',
        security,
      },
    },
    async () => {
      const channels = await channelRepo.listAll();
      const version = (await channelRepo.version()) || undefined;
      return ok(getDicts(channels, version));
    }
  );
}
