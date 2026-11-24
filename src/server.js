// 启动入口：监听 0.0.0.0，输出本机/局域网文档地址，处理优雅退出。

import os from 'node:os';
import { buildApp } from './app.js';
import { config } from './config/index.js';
import { closePool } from './db/pool.js';
import { startAutoData } from './plugins/auto-data.js';

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) out.push(item.address);
    }
  }
  return out;
}

const app = await buildApp();

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n启动失败：端口 ${config.port} 已被占用。`);
    console.error(`  查看占用进程：netstat -ano | findstr :${config.port}`);
    console.error('  结束进程：    taskkill /PID <上面的PID> /F');
    console.error(`  或修改 .env 中的 PORT（如 3001）后重新启动。`);
    console.error('  如果是之前启动的服务还在运行，直接访问原地址即可，不必重复启动。\n');
  } else {
    app.log.error(err);
  }
  process.exit(1);
}

const addresses = lanAddresses();
const lines = [
  '',
  '投流统计平台后端已启动',
  `  本机文档： http://localhost:${config.port}/api-docs`,
  ...addresses.map((ip) => `  局域网：   http://${ip}:${config.port}/api-docs`),
  `  健康检查： http://localhost:${config.port}/health`,
  `  数据库：   ${config.db.host}:${config.db.port}/${config.db.database}`,
  '',
];
console.log(lines.join('\n'));
startAutoData(app);

async function shutdown(signal) {
  app.log.info(`收到 ${signal}，正在关闭服务`);
  try {
    await app.close();
    await closePool();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
