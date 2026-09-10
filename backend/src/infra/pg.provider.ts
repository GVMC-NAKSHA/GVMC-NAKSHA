import { Pool, QueryResultRow } from 'pg';
export async function q<T extends QueryResultRow = any>(pool: Pool, sql: string, params: unknown[] = []) {
  const { rows } = await pool.query<T>(sql, params);
  return rows;
}
export const one = async <T extends QueryResultRow = any>(pool: Pool, sql: string, params: unknown[] = []) =>
  (await q<T>(pool, sql, params))[0] ?? null;
