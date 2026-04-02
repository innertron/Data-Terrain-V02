import { pool } from "./db";

export interface SegmentDataRow {
  response_category: string;
  count: number;
}

export function getSegmentTableName(segmentId: number): string {
  return `seg_data_${segmentId}`;
}

export async function initializeSegmentTables(): Promise<void> {
  const client = await pool.connect();
  try {
    for (let i = 1; i <= 625; i++) {
      const tableName = getSegmentTableName(i);
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${tableName}" (
          id SERIAL PRIMARY KEY,
          response_category TEXT NOT NULL,
          count INTEGER NOT NULL DEFAULT 0
        )
      `);
    }
    console.log("625 segment data tables ready.");
  } finally {
    client.release();
  }
}

export async function getSegmentData(segmentId: number): Promise<SegmentDataRow[]> {
  const tableName = getSegmentTableName(segmentId);
  const result = await pool.query(
    `SELECT response_category, count FROM "${tableName}" ORDER BY id`
  );
  return result.rows;
}

export async function getSegmentTotal(segmentId: number): Promise<number> {
  const tableName = getSegmentTableName(segmentId);
  const result = await pool.query(
    `SELECT COALESCE(SUM(count), 0) as total FROM "${tableName}"`
  );
  return parseInt(result.rows[0].total) || 0;
}

export async function setSegmentData(
  segmentId: number,
  rows: SegmentDataRow[]
): Promise<number> {
  const tableName = getSegmentTableName(segmentId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM "${tableName}"`);
    for (const row of rows) {
      await client.query(
        `INSERT INTO "${tableName}" (response_category, count) VALUES ($1, $2)`,
        [row.response_category, row.count]
      );
    }
    await client.query("COMMIT");
    const totalResult = await client.query(
      `SELECT COALESCE(SUM(count), 0) as total FROM "${tableName}"`
    );
    return parseInt(totalResult.rows[0].total) || 0;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
