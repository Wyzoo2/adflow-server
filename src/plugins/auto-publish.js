// 排期自动发布定时器：默认每分钟检查一次已到开始日期的计划。
import { config } from '../config/index.js';
import { autoPublishService } from '../services/auto-publish.service.js';

export function startAutoPublish(app) {
  if (!config.autoPublishEnabled) {
    app.log.info('排期自动发布已关闭（AUTO_PUBLISH_ENABLED=false）');
    return null;
  }

  const run = () => {
    autoPublishService
      .tick()
      .then((result) => {
        if (result.published || result.expired || result.failed) {
          app.log.info(
            `排期自动发布：发布 ${result.published}，过期结束 ${result.expired}，失败 ${result.failed}`
          );
        }
      })
      .catch((err) => app.log.warn(`排期自动发布失败：${err.message}`));
  };

  const initial = setTimeout(run, 3000);
  initial.unref?.();
  const timer = setInterval(run, config.autoPublishIntervalMs);
  timer.unref?.();
  app.log.info(`排期自动发布已开启，间隔 ${config.autoPublishIntervalMs}ms`);
  return timer;
}
