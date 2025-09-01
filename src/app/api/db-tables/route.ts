import { NextResponse } from "next/server";
import mysql from "mysql2/promise";

export async function GET() {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST!,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      database: process.env.DB_NAME!,
    });

    const [rows] = await conn.query("SHOW TABLES");
    await conn.end();

    return NextResponse.json({ ok: true, tables: rows });
  } catch (e: any) {
    console.error("DB TABLES ERROR:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
