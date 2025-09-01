import { NextResponse } from 'next/server';
import { query } from '@/lib/db';  // ✅ your db connection helper

export async function GET() {
  try {
    const rows = await query("SELECT * FROM template LIMIT 20");
    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, where: 'db', message: e?.message },
      { status: 500 }
    );
  }
}
