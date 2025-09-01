import mysql from 'mysql2/promise';

let cached: string[] | null = null;
let cachedAt = 0;

export async function getAccountColumns(): Promise<string[]> {
  const now = Date.now();
  if (cached && now - cachedAt < 5 * 60 * 1000) return cached; // 5 min cache

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
  });
  const [rows] = await conn.query<any[]>(`SHOW COLUMNS FROM \`account\``);
  await conn.end();

  cached = rows.map(r => String(r.Field));
  cachedAt = now;
  return cached!;
}
