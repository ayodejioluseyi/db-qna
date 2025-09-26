// src/lib/db.ts
import mysql, {
  Pool,
  PoolConnection,
  RowDataPacket,
  ResultSetHeader,
  FieldPacket,
} from 'mysql2/promise';

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;
  pool = mysql.createPool({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    decimalNumbers: true,
  });
  // after: pool = mysql.createPool({ ... });
  (async () => {
    try {
      // Set the session (default) timezone for all pooled connections.
      // 'Europe/London' ensures CURDATE() / DATE() align with your business timezone.
      await pool!.query(`SET time_zone = 'Europe/London'`);
    } catch (e) {
      // Don't crash the app if this fails; just log once.
      console.error('[db] Failed to set time_zone Europe/London:', e);
    }
  })();

  return pool;
}

/**
 * Typed query helper.
 * - For SELECTs, use the default generic (RowDataPacket[]).
 * - For INSERT/UPDATE/DELETE, pass <ResultSetHeader>.
 */
export async function query<
  T extends RowDataPacket[] | ResultSetHeader = RowDataPacket[]
>(
  sql: string,
  values?: ReadonlyArray<unknown>
): Promise<T> {
  const [rows] = await getPool().execute<T>(sql, values);
  return rows;
}

/** Borrow a connection for multiple ops (auto-release). */
export async function withConnection<T>(
  fn: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    return await fn(conn);
  } finally {
    conn.release();
  }
}

/** Run a transactional block (BEGIN/COMMIT/ROLLBACK). */
export async function withTransaction<T>(
  fn: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await getPool().getConnection();
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
