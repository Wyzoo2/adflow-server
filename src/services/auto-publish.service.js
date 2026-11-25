// 排期自动发布：把已到开始日期的 scheduled 计划转为 running。
// 每轮加数据库锁，单计划用行锁，避免重复生成单号。
import { pool, query, withTransaction } from '../db/pool.js';
import { campaignRepo } from '../repositories/campaign.repo.js';
import { projectRepo } from '../repositories/project.repo.js';
import { auditRepo } from '../repositories/audit.repo.js';
import { buildCampaignCode } from '../domain/code.js';
import { formatDate, todayShanghai } from '../utils/date.js';
import { errors } from '../utils/errors.js';

const LOCK_NAME = 'adflow_auto_publish_tick';
let failureStreak = 0;

async function systemOperatorId() {
  const rows = await query("SELECT id FROM sys_user WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
  return rows.length ? String(rows[0].id) : '1';
}

async function processOne(id, today, operatorId) {
  return withTransaction(async (conn) => {
    const campaign = await campaignRepo.lockById(conn, id);
    if (!campaign || campaign.status !== 'scheduled') return null;

    const startDate = formatDate(new Date(campaign.startDate));
    const endDate = formatDate(new Date(campaign.endDate));
    if (startDate > today) return null;

    // 排期已经整体结束：不进入投放，直接结束并记录系统操作
    if (endDate < today) {
      await conn.query(
        "UPDATE campaign SET status = 'finished', finished_at = ? WHERE id = ?",
        [`${endDate} 23:59:59`, id]
      );
      await auditRepo.insert(
        {
          objectType: 'campaign',
          objectId: id,
          action: 'auto_finish_expired',
          before: { status: 'scheduled' },
          after: { status: 'finished', reason: '排期已结束，未自动发布', operator: 'system' },
          operatorId,
          ip: null,
        },
        conn
      );
      return 'expired';
    }

    // 项目预算超出时不允许发布，计划继续停在 scheduled
    const project = await projectRepo.lockBudget(conn, campaign.projectId);
    if (!project) throw errors.notFound('项目不存在');
    const totalBudget = await projectRepo.sumCampaignBudget(conn, campaign.projectId);
    if (totalBudget > project.budget) {
      throw errors.budgetExceeded('项目预算已超出，无法自动发布');
    }

    const code = campaign.code || buildCampaignCode(campaign.id, new Date());
    await conn.query(
      "UPDATE campaign SET code = ?, status = 'running', published_at = NOW() WHERE id = ?",
      [code, id]
    );
    await auditRepo.insert(
      {
        objectType: 'campaign',
        objectId: id,
        action: 'auto_publish',
        before: { status: 'scheduled' },
        after: { status: 'running', code, operator: 'system' },
        operatorId,
        ip: null,
      },
      conn
    );
    return 'published';
  });
}

export const autoPublishService = {
  /**
   * 执行一次自动发布：status=scheduled 且 start_date <= 今天。
   * 返回 { skipped, campaigns, published, expired, failed }
   */
  async tick() {
    const conn = await pool.getConnection();
    try {
      const [locks] = await conn.query('SELECT GET_LOCK(?, 0) AS ok', [LOCK_NAME]);
      if (Number(locks[0].ok) !== 1) {
        return { skipped: true, campaigns: 0, published: 0, expired: 0, blocked: 0, failed: 0 };
      }

      const today = todayShanghai();
      const rows = await query(
        `SELECT id FROM campaign
          WHERE status = 'scheduled' AND deleted_at IS NULL AND start_date <= ?
          ORDER BY id ASC`,
        [today]
      );
      const operatorId = await systemOperatorId();
      let published = 0;
      let expired = 0;
      let blocked = 0;
      let failed = 0;

      for (const row of rows) {
        try {
          const result = await processOne(row.id, today, operatorId);
          if (result === 'published') published += 1;
          if (result === 'expired') expired += 1;
          failureStreak = 0;
        } catch (err) {
          if (err.code === 2003) {
            blocked += 1;
            console.warn(`[auto-publish] 计划 ${row.id} 因项目预算超出暂停发布`);
            continue;
          }
          failed += 1;
          failureStreak += 1;
          console.error(`[auto-publish] 计划 ${row.id} 自动发布失败：${err.message}`);
          if (failureStreak >= 3) {
            console.error(`[auto-publish] 已连续失败 ${failureStreak} 次，请检查数据库或计划数据`);
          }
        }
      }

      return { skipped: false, campaigns: rows.length, published, expired, blocked, failed };
    } finally {
      try {
        await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
      } catch {
        // 释放失败交给连接回收
      }
      conn.release();
    }
  },
};
