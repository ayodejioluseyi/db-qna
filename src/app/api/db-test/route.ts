// src/app/api/db-test/route.ts
import { NextResponse } from 'next/server'
import mysql from 'mysql2/promise'

// (optional) force Node runtime (mysql2 is not edge-compatible)
export const runtime = 'nodejs'

async function getConn() {
  const host = process.env.DB_HOST
  const port = Number(process.env.DB_PORT || 3306)
  const user = process.env.DB_USER
  const password = process.env.DB_PASSWORD
  const database = process.env.DB_NAME

  if (!host || !user || !password || !database) {
    throw new Error('One or more DB_* env vars are missing.')
  }
  return mysql.createConnection({ host, port, user, password, database })
}

export async function GET() {
  let conn: mysql.Connection | null = null
  try {
    conn = await getConn()
    const [rows] = await conn.query(`
      SELECT
        id,
        qid,
        category,
        note,
        status,
        is_completed,
        FROM_UNIXTIME(date, '%Y-%m-%d %H:%i:%s') AS check_time
      FROM daily_check
      LIMIT 20
    `)
    return NextResponse.json({ ok: true, rows })
  } catch (e: any) {
    return NextResponse.json({ ok: false, where: 'db', message: e?.message ?? String(e) }, { status: 500 })
  } finally {
    if (conn) await conn.end()
  }
}

export async function POST(req: Request) {
  let conn: mysql.Connection | null = null
  try {
    const body = await req.json().catch(() => ({}))
    // Example: whitelist a simple filter
    const { status } = body as { status?: string }

    conn = await getConn()

    // Parameterised query — avoids SQL injection
    const [rows] = await conn.execute(
      `
      SELECT
        id,
        qid,
        category,
        note,
        status,
        is_completed,
        FROM_UNIXTIME(date, '%Y-%m-%d %H:%i:%s') AS check_time
      FROM daily_check
      WHERE (? IS NULL OR status = ?)
      ORDER BY date DESC
      LIMIT 50
      `,
      [status ?? null, status ?? null]
    )

    return NextResponse.json({ ok: true, rows })
  } catch (e: any) {
    return NextResponse.json({ ok: false, where: 'db', message: e?.message ?? String(e) }, { status: 500 })
  } finally {
    if (conn) await conn.end()
  }
}
