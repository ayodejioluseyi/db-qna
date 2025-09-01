import { NextResponse } from 'next/server';
import mysql from 'mysql2/promise';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const table = url.searchParams.get('table');

    if (!table) {
      return NextResponse.json(
        { ok: false, message: 'Add ?table=your_table_name' },
        { status: 400 }
      );
    }

    // very simple allow-list regex for table identifier
    if (!/^[a-zA-Z0-9_]+$/.test(table)) {
      return NextResponse.json({ ok: false, message: 'Invalid table name' }, { status: 400 });
    }

    const conn = await mysql.createConnection({
      host: process.env.DB_HOST!,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      database: process.env.DB_NAME!,
    });

    const [rows] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
    await conn.end();

    return NextResponse.json({ ok: true, table, columns: rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message || String(e) }, { status: 500 });
  }
}
