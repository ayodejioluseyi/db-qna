import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import mysql from 'mysql2/promise';
//import { isSafeSql } from '@/utils/sqlGuard';
import { validateSql } from '@/utils/sqlGuard';
import { fallbackSqlFor } from '@/utils/fallbackSqlFor';

const system = `
You are a MySQL assistant for a read-only analytics API.

- You may only use these tables: temperature, core_temperature, daily_core_temp, daily_hot_hold,
  hot_holding, daily_check, check, template, wm_check.
- Use FROM_UNIXTIME() when converting Unix timestamps.
- "today" means BETWEEN UNIX_TIMESTAMP(CURDATE()) AND UNIX_TIMESTAMP(CURDATE() + INTERVAL 1 DAY) - 1.
- A check is "completed" if status = 1 OR is_completed = 1.
- "failed" means status = 0.
- Always add LIMIT 1000.
- Restrict every query to the specific restaurant: add WHERE restaurant_id = {restaurantId}.
`;

// put this near the top of the file (or inside the POST handler if you prefer)
function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return 'Unknown error'; }
}

export async function POST(req: NextRequest) {
  try {
    const { question, restaurantId: bodyRestaurantId } = await req.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // Try to auto-detect "restaurant 123" in the question; otherwise use provided or a safe default
    const m = question.match(/restaurant\s+(\d+)/i);
    const detectedId = m ? parseInt(m[1], 10) : undefined;
    const restaurantId: number = Number.isFinite(detectedId)
      ? detectedId!
      : (Number(bodyRestaurantId) || 53); // <- change 53 to whatever default you prefer

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    // 1) Domain fallback first (fast + predictable)
    let sql = fallbackSqlFor(question, restaurantId);

    // 2) If fallback didn’t have a specific path, ask the model for SQL
    if (!sql) {
      const ai = await openai.responses.create({
        model: 'gpt-4.1-mini',
        input: [
          { role: 'system', content: system.replace('{restaurantId}', String(restaurantId)) },
          { role: 'user', content: `Question: "${question}". Return a single SELECT with LIMIT 1000.` }
        ]
      });
      sql = (ai.output_text || '').trim();
      if (!/\bLIMIT\b/i.test(sql)) sql += ' LIMIT 1000';
    }

    // 3) Guard (you can disable while testing, but recommended to keep on)
    //if (!isSafeSql(sql)) {
    //  return NextResponse.json({ error: 'Generated SQL rejected by guard.' }, { status: 400 });
    //}
    // --- Guard + auto-fallback ---
    let check = validateSql(sql);
    if (!check.ok) {
      // Try domain-specific fallback if model SQL failed
      const fb = fallbackSqlFor(question, restaurantId);
      if (fb) {
        const fbCheck = validateSql(fb);
        if (fbCheck.ok) {
          sql = fb;        // use the safe fallback
          check = fbCheck; // update check result
        }
      }
    }

    if (!check.ok) {
      // Return reason + attempted SQL so you can see what failed
      return NextResponse.json(
        { error: 'Generated SQL rejected by guard.', reason: check.reason, sqlAttempt: sql },
        { status: 400 }
      );
    }
// --- End guard block ---

    // 4) Execute
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST!,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      database: process.env.DB_NAME!,
      connectTimeout: 10000
    });

    const [rows] = await conn.query(sql);
    await conn.end();

    // 5) Summarise
    const summary = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: `Question: ${question}
SQL: ${sql}
Rows: ${JSON.stringify(rows).slice(0, 30000)}
Write a concise, business-friendly answer.
- If SQL is a COUNT, answer naturally (e.g., "Yes, 12 opening checks have been completed today").
- If rows include a time column (check_time/start_time/end_time), include it.
- If no rows, say "No data found."`
    });

    return NextResponse.json({ answer: summary.output_text, sql, rows, restaurantId });
  //} catch (e: any) {
  //  console.error('ASK API ERROR:', e);
  //  return NextResponse.json(
  //    { error: 'Server error while answering question.', detail: e?.message || String(e) },
  //    { status: 500 }
  //  );
  //}
  } catch (e: unknown) {
    console.error('ASK API ERROR:', e);
    return NextResponse.json(
      { error: 'Server error while answering question.', detail: toMessage(e) },
      { status: 500 }
    );
  }
}
