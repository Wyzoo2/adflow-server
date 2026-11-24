// 环境变量集中读取与默认值；override 用于覆盖机器上同名的 DB_* 变量。

import dotenv from 'dotenv';
import path from 'node:path';

// 覆盖系统同名环境变量，避免与机器上其他数据库配置（如 DB_PORT）冲突
dotenv.config({ override: true });

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  env: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '0.0.0.0',
  port: num(process.env.PORT, 3000),
  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  jwtSecret: process.env.JWT_SECRET || 'adflow-dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  reportDir: path.resolve(process.cwd(), process.env.REPORT_DIR || 'storage/reports'),
  // 投放数据自动变化：默认开启，按固定间隔滚动更新投放中的计划
  autoDataEnabled: (process.env.AUTO_DATA_ENABLED || 'true') !== 'false',
  autoTickIntervalMs: num(process.env.AUTO_TICK_INTERVAL_MS, 60000),
  // 排期自动发布：scheduled 计划到开始日期后自动转 running
  autoPublishEnabled: (process.env.AUTO_PUBLISH_ENABLED || 'true') !== 'false',
  autoPublishIntervalMs: num(process.env.AUTO_PUBLISH_INTERVAL_MS, 60000),
  // PDF 报表使用的中文字体；Windows 默认用黑体，Linux 部署时通过环境变量指定
  pdfFontPath: process.env.PDF_FONT_PATH || 'C:\\Windows\\Fonts\\simhei.ttf',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: num(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'adflow',
    connectionLimit: num(process.env.DB_CONNECTION_LIMIT, 10),
  },
};

export const isProd = config.env === 'production';
