// 项目数据访问。

import { query, queryOne, execute } from '../db/pool.js';

const mapProject = (row) => ({
  id: String(row.id),
  name: row.name,
  client: row.client,
  startDate: row.start_date,
  endDate: row.end_date,
  budget: row.budget,
  createdAt: row.created_at,
});

export const projectRepo = {
  async list() {
    const rows = await query('SELECT * FROM project ORDER BY id ASC');
    return rows.map(mapProject);
  },

  async findById(id) {
    const row = await queryOne('SELECT * FROM project WHERE id = ?', [id]);
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
