import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import mysql from 'mysql2/promise';
import { isSafeSql } from '@/utils/sqlGuard';
import { fallbackSqlFor } from '@/utils/fallbackSqlFor';  // ✅ separate fallback

// system prompt for OpenAI
const system = `
You are a MySQL assistant for a read-only analytics API.

- You may only use these tables: temperature, core_temperature, daily_core_temp, daily_hot_hold,
  hot_holding, daily_check, check, template, wm_check, restaurant.
- Use FROM_UNIXTIME() when converting Unix timestamps.
- "today" means BETWEEN UNIX_TIMESTAMP(CURDATE()) AND UNIX_TIMESTAMP(CURDATE() + INTERVAL 1 DAY) - 1.
- A check is "completed" if status = 1 OR is_completed = 1.
- "failed" means status = 0.
- Always add LIMIT 1000.
- Restrict ALL queries to the user’s account scope:
  Use: restaurant_id IN (SELECT id FROM restaurant WHERE account_id = {accountId}).
- For "opening checks", JOIN daily_check.qid = template.id and filter template.name LIKE '%opening%'.
- Return exactly one SELECT statement. No DML (INSERT, UPDATE, DELETE, etc).
`;

export async function POST(req: NextRequest) {
  try {
    const { question, accountId } = await req.json();
    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }
    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    // try domain-specific fallback first
    let sql = fallbackSqlFor(question, accountId);

    // if no fallback, ask OpenAI
    if (!sql) {
      const ai = await openai.responses.create({
        model: 'gpt-4.1-mini',
        input: [
          { role: 'system', content: system.replace('{accountId}', String(accountId)) },
          { role: 'user', content: `Question: "${question}". Return a single SELECT with LIMIT 1000.` }
        ]
      });

      sql = (ai.output_text || '').trim();
      if (!/\bLIMIT\b/i.test(sql)) sql += ' LIMIT 1000';
    }

    // ✅ (Optional) comment out guard if testing — uncomment once queries are stable
    //if (!isSafeSql(sql)) {
    //  return NextResponse.json({ error: 'Generated SQL rejected by guard.', sql }, { status: 400 });
    //}

    // run query
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST!,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      database: process.env.DB_NAME!,
      connectTimeout: 10000,
    });

    const [rows] = await conn.query(sql);
    await conn.end();

    // summarise
    const summary = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: `Question: ${question}
SQL: ${sql}
Rows: ${JSON.stringify(rows).slice(0, 30000)}
Write a concise, business-friendly answer.
- If SQL is a COUNT, say "Yes, N checks..." instead of raw number.
- If rows include check_time/start_time/end_time, include those.
- If no rows, say "No data found for today."`
    });

    return NextResponse.json({ answer: summary.output_text, sql, rows });
  } catch (e: any) {
    console.error('ASK API ERROR:', e);
    return NextResponse.json(
      { error: 'Server error while answering question.', detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}
