import fs from 'node:fs';
import path from 'node:path';

const rawName = process.argv.slice(2).join('_').trim();
if (!rawName) {
  console.error('用法：npm run migrate:new -- create_material');
  console.error('示例：npm run migrate:new -- add_vendor_budget');
  process.exit(1);
}

const safeName = rawName.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
if (!safeName) {
  console.error('名称不合法，请使用字母、数字或下划线');
  process.exit(1);
}

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp =
  `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
  `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

const dir = path.resolve(process.cwd(), 'sql');
fs.mkdirSync(dir, { recursive: true });

const fileName = `${stamp}_${safeName}.sql`;
const file = path.join(dir, fileName);
if (fs.existsSync(file)) {
  console.error(`文件已存在：${file}`);
  process.exit(1);
}

const content = `-- 迁移：${safeName}
-- 创建时间：${now.toLocaleString('zh-CN', { hour12: false })}
-- 说明：在此编写结构变更，只放一个变更主题，保持文件短小。
-- 示例：
-- CREATE TABLE IF NOT EXISTS example_table (
--   id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
--   name VARCHAR(120) NOT NULL,
--   created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   PRIMARY KEY (id)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

fs.writeFileSync(file, content, 'utf8');
console.log(`已创建迁移文件：${path.relative(process.cwd(), file)}`);
console.log('填写 SQL 后执行 npm run migrate；schema.sql 固定最先执行，本文件在其后按时间排序。');
