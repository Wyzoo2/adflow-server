// MySQL 连接池，以及 query / queryOne / execute / withTransaction 封装。

import mysql from 'mysql2/promise';
import { config } from '../config/index.js';

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  connectionLimit: config.db.connectionLimit,
  waitForConnections: true,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+08:00',
  supportBigNumbers: true,
  bigNumberStrings: true,
  dateStrings: ['DATE', 'DATETIME'],
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

/** 执行查询，返回行数组 */
export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** 执行查询，返回第一行或 null */
export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length ? rows[0] : null;
}

/** 执行写语句，返回 ResultSetHeader */
export async function execute(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result;
}

/** 事务封装：fn 接收一个 connection，异常自动回滚 */
export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function ping() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    return true;
  } finally {
    conn.release();
  }
}

export async function closePool() {
  await pool.end();
}
