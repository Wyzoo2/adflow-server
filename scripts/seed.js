import bcrypt from 'bcryptjs';
import { pool, query, execute } from '../src/db/pool.js';

const force = process.argv.includes('--force');
const ADMIN = {
  username: process.env.ADMIN_USERNAME || 'root',
  password: process.env.ADMIN_PASSWORD || 'root',
  displayName: process.env.ADMIN_DISPLAY_NAME || '系统管理员',
};

const BUSINESS_TABLES = [
  'report_task',
  'sync_task',
  'audit_log',
  'mock_profile',
  'dim_stat',
  'daily_stat',
  'campaign_vendor',
  'creative',
  'campaign',
  'vendor',
  'project',
];

async function main() {
  if (force) {
    await execute('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of BUSINESS_TABLES) {
      await execute(`TRUNCATE TABLE ${table}`);
    }
    await execute('SET FOREIGN_KEY_CHECKS = 1');
    await execute('DELETE FROM sys_user WHERE username <> ?', [ADMIN.username]);
    console.log('已清空业务数据与普通用户');
  }

  const existing = await query('SELECT id FROM sys_user WHERE username = ?', [ADMIN.username]);
  const passwordHash = bcrypt.hashSync(ADMIN.password, 10);

  if (existing.length) {
    if (force) {
      await execute(
        'UPDATE sys_user SET password_hash = ?, display_name = ?, role = ?, status = 1 WHERE id = ?',
        [passwordHash, ADMIN.displayName, 'admin', existing[0].id]
      );
      console.log('已重置管理员密码');
    } else {
      console.log('管理员账号已存在，跳过创建');
    }
  } else {
    await execute(
      `INSERT INTO sys_user (username, password_hash, display_name, role, status)
       VALUES (?, ?, ?, 'admin', 1)`,
      [ADMIN.username, passwordHash, ADMIN.displayName]
    );
    console.log('已创建管理员账号');
  }

  console.log(`初始化完成：仅保留管理员 ${ADMIN.username} / ${ADMIN.password}`);
  console.log('不写入任何项目、厂商、计划与投放数据，业务数据由系统内录入或接口生成。');
}

main()
  .catch((err) => {
    console.error('seed failed:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
