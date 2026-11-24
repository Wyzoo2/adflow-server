// 投放数据自动更新定时器：服务启动后按固定间隔执行，多实例用数据库锁互斥。
import { config } from '../config/index.js';
import { autoDataService } from '../services/auto-data.service.js';

export function startAutoData(app) {
  if (!config.autoDataEnabled) {
    app.log.info('投放数据自动更新已关闭（AUTO_DATA_ENABLED=false）');
    return null;
  }

  const run = () => {
    autoDataService
      .tick()
      .then((result) => {
        if (result.updated) {
          app.log.debug(
            `投放数据自动更新：${result.campaigns} 个计划，写入 ${result.updated} 天`
          );
        }
      })
      .catch((err) => app.log.warn(`投放数据自动更新失败：${err.message}`));
  };

  const initial = setTimeout(run, 3000);
  initial.unref?.();
  const timer = setInterval(run, config.autoTickIntervalMs);
  timer.unref?.();
  app.log.info(`投放数据自动更新已开启，间隔 ${config.autoTickIntervalMs}ms`);
  return timer;
}
