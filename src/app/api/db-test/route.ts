import { NextResponse } from 'next/server';
import mysql from 'mysql2/promise';

export async function GET() {
  try {
    // Read env
    const host = process.env.DB_HOST;
    const port = Number(process.env.DB_PORT || 3306);
    const user = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;
    const database = process.env.DB_NAME;

    if (!host || !user || !password || !database) {
      return NextResponse.json(
        { ok: false, where: 'env', message: 'One or more DB_* env vars are missing.' },
        { status: 500 }
      );
    }

    // Connect and run a trivial query
    const conn = await mysql.createConnection({ host, port, user, password, database });
    const [rows] = await conn.query('SELECT 1 AS ok LIMIT 1');
    await conn.end();

    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, where: 'db', message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
