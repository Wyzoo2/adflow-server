// 项目数据访问。
import { query, queryOne, execute } from '../db/pool.js';

const mapProject = (row) => {
  const budget = Number(row.budget || 0);
  const used = Number(row.used_budget || 0);
  return {
    id: String(row.id),
    name: row.name,
    client: row.client,
    startDate: row.start_date,
    endDate: row.end_date,
    budget: row.budget,
    usedBudget: used.toFixed(2),
    remainingBudget: Math.max(0, budget - used).toFixed(2),
    createdAt: row.created_at,
  };
};

const USED_BUDGET = `COALESCE((
  SELECT SUM(c.budget) FROM campaign c
   WHERE c.project_id = p.id AND c.deleted_at IS NULL
), 0) AS used_budget`;

export const projectRepo = {
  async list() {
    const rows = await query(`SELECT p.*, ${USED_BUDGET} FROM project p ORDER BY p.id ASC`);
    return rows.map(mapProject);
  },

  async findById(id) {
    const row = await queryOne(`SELECT p.*, ${USED_BUDGET} FROM project p WHERE p.id = ?`, [id]);
    return row ? mapProject(row) : null;
  },

  async create({ name, client, startDate, endDate, budget }) {
    const result = await execute(
      `INSERT INTO project (name, client, start_date, end_date, budget) VALUES (?, ?, ?, ?, ?)`,
      [name, client || null, startDate || null, endDate || null, budget || 0]
    );
    return String(result.insertId);
  },

  async update(id, payload) {
    const sets = [];
    const params = [];
    const map = { name: 'name', client: 'client', startDate: 'start_date', endDate: 'end_date', budget: 'budget' };
    for (const [key, column] of Object.entries(map)) {
      if (payload[key] !== undefined) {
        sets.push(`${column} = ?`);
        params.push(payload[key]);
      }
    }
    if (!sets.length) return;
    params.push(id);
    await execute(`UPDATE project SET ${sets.join(', ')} WHERE id = ?`, params);
  },
};
