import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { config } from '../src/config/index.js';

const SQL_DIR = path.resolve(process.cwd(), 'sql');

async function main() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });

  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
    );
    await conn.changeUser({ database: config.db.database });
    await conn.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name VARCHAR(255) NOT NULL,
         applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (name)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    const files = (await fs.readdir(SQL_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => {
        // 基线建表脚本永远先执行，其余按文件名（时间戳）排序
        if (a === 'schema.sql') return -1;
        if (b === 'schema.sql') return 1;
        return a.localeCompare(b);
      });
    for (const file of files) {
      const [rows] = await conn.query('SELECT 1 FROM schema_migrations WHERE name = ?', [file]);
      if (rows.length) {
        console.log(`skip  ${file}`);
        continue;
      }
      const sql = await fs.readFile(path.join(SQL_DIR, file), 'utf8');
      const body = sql.replace(/^\s*--.*$/gm, '').trim();
      if (!body) {
        console.log(`empty ${file}（仅注释，未执行也未记录）`);
        continue;
      }
      await conn.query(body);
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      console.log(`apply ${file}`);
    }
    console.log('migration done');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('migration failed:', err.message);
  process.exit(1);
});
