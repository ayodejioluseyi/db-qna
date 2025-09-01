import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import mysql from 'mysql2/promise';
import { isSafeSql } from '@/utils/sqlGuard';

// Domain-aware system prompt describing tables and rules
const system = `
You are a MySQL assistant for a read-only analytics API.

You may only use these tables/columns (INT times are Unix epoch seconds):

- temperature(
  id, equipment, dev_eui, bat_v, bat_status, hum_sht, temp_ds, temp_sht, temp_calc,
  date, restaurant_id, token, status
)
  • When the user asks for date/time, SELECT FROM_UNIXTIME(date, '%Y-%m-%d %H:%i:%s') AS check_time.

- core_temperature(
  id, dish_id, temperature, re_temperature, remarks, restaurant_id, type, status,
  retest, iteration, created_at, updated_at, created_by, updated_by, token
)
  • For date/time, you can use FROM_UNIXTIME(created_at, '%Y-%m-%d %H:%i:%s') AS created_time.

- daily_core_temp(
  id, note, type, date, restaurant_id, created_by, updated_by, updated_at, created_at, status, token
)
  • For date/time, FROM_UNIXTIME(date, '%Y-%m-%d %H:%i:%s') AS check_time.

- daily_hot_hold(
  id, note, type, date, restaurant_id, created_by, updated_by, updated_at, created_at, status, token
)
  • For date/time, FROM_UNIXTIME(date, '%Y-%m-%d %H:%i:%s') AS check_time.

- hot_holding(
  id, dish_id, equipment_id, start, end, temperature, re_temperature, restaurant_id, type, remarks,
  created_at, updated_at, created_by, updated_by, token, status, retest, iteration, trash
)
  • For date/time, use FROM_UNIXTIME(start, '%Y-%m-%d %H:%i:%s') AS start_time and/or FROM_UNIXTIME(end, '%Y-%m-%d %H:%i:%s') AS end_time.

- daily_check(
  id, qid, category, image, note, status, start, end, reference, restaurant_id, area,
  created_by, updated_by, date, token, is_completed
)
  • For date/time, FROM_UNIXTIME(date, '%Y-%m-%d %H:%i:%s') AS check_time.

- template(
  id, name, file, created_by, updated_by, created_at, updated_at, status, trash, token
)

- wm_check(
  id, date, restaurant_id, token, type, status
)
  • For date/time, FROM_UNIXTIME(date, '%Y-%m-%d %H:%i:%s') AS check_time.

Rules:
- Return EXACTLY one SELECT statement (no code fences).
- Allowed clauses: WHERE, GROUP BY, ORDER BY, LIMIT, simple aggregates (COUNT, SUM, AVG, MIN, MAX).
- "today" means BETWEEN UNIX_TIMESTAMP(CURDATE()) AND UNIX_TIMESTAMP(CURDATE() + INTERVAL 1 DAY) - 1.
- Completion conventions:
  • A check is "completed" if status = 1 OR is_completed = 1 (when present).
  • "failed" means status = 0 (when present).
- "Opening checks": daily_check where category = 1.
- "Closing checks": daily_check where category = 2.
- Always include LIMIT 1000.
- If the question cannot be answered with these tables, return:
  SELECT 'unsupported question' AS message LIMIT 1
`;

// --- Domain-specific safe fallback SQLs ---
function fallbackSqlFor(question: string): string {
  const q = question.toLowerCase();

  // Temperature checks today
  if (q.includes('temperature')) {
    return `SELECT id,
                   equipment,
                   temp_calc AS temperature,
                   status,
                   FROM_UNIXTIME(date, '%Y-%m-%d %H:%i:%s') AS check_time
            FROM temperature
            WHERE date BETWEEN UNIX_TIMESTAMP(CURDATE())
                           AND UNIX_TIMESTAMP(CURDATE() + INTERVAL 1 DAY) - 1
            ORDER BY id DESC
            LIMIT 1000`;
  }

  // Outstanding checks today
  if (q.includes('outstanding')) {
    return `SELECT id,
                   note,
                   status,
                   is_completed,
                   FROM_UNIXTIME(date, '%Y-%m-%d %H:%i:%s') AS check_time
            FROM daily_check
            WHERE date BETWEEN UNIX_TIMESTAMP(CURDATE())
                           AND UNIX_TIMESTAMP(CURDATE() + INTERVAL 1 DAY) - 1
              AND (is_completed = 0 OR status = 0 OR status = 2)
            ORDER BY id DESC
            LIMIT 1000`;
  }

  // Opening checks completed
  if (q.includes('opening')) {
    return `SELECT COUNT(*) AS completed_opening_checks
            FROM daily_check d
            WHERE d.category = 1
              AND (d.is_completed = 1 OR d.status = 1)
              AND d.date BETWEEN UNIX_TIMESTAMP(CURDATE())
                             AND UNIX_TIMESTAMP(CURDATE() + INTERVAL 1 DAY) - 1
            LIMIT 1000`;
  }

  // Closing checks completed
  if (q.includes('closing')) {
    return `SELECT COUNT(*) AS completed_closing_checks
            FROM daily_check d
            WHERE d.category = 2
              AND (d.is_completed = 1 OR d.status = 1)
              AND d.date BETWEEN UNIX_TIMESTAMP(CURDATE())
                             AND UNIX_TIMESTAMP(CURDATE() + INTERVAL 1 DAY) - 1
            LIMIT 1000`;
  }

  // Generic safe fallback
  return `SELECT id, note, status,
                 FROM_UNIXTIME(date, '%Y-%m-%d %H:%i:%s') AS check_time
          FROM daily_check
          WHERE date BETWEEN UNIX_TIMESTAMP(CURDATE())
                         AND UNIX_TIMESTAMP(CURDATE() + INTERVAL 1 DAY) - 1
          ORDER BY id DESC
          LIMIT 1000`;
}

// --- API Endpoints ---

export async function GET() {
  return NextResponse.json({ ok: true, hint: 'POST { question: "..." } to this endpoint.' });
}

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    // Ask OpenAI to produce one SQL query
    const ai = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        { role: 'system', content: system },
        { role: 'user', content: `Question: "${question}". Return a single SELECT with LIMIT 1000.` }
      ]
    });

    let sql = (ai.output_text || '').trim();
    if (!/\bLIMIT\b/i.test(sql)) sql += ' LIMIT 1000';

    console.log("Original SQL from AI:", sql);
    console.log("Fallback SQL for question:", fallbackSqlFor(question));
    console.log("Safe check (AI):", isSafeSql(sql));
    console.log("Safe check (Fallback):", isSafeSql(fallbackSqlFor(question)));

    // Guard it; if unsafe, use a domain-specific fallback
    if (!isSafeSql(sql)) {
      sql = fallbackSqlFor(question);
      if (!isSafeSql(sql)) {
        return NextResponse.json({ error: 'Generated SQL rejected by guard.' }, { status: 400 });
      }
    }

    // Execute query
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

    // Summarise for business users
    const summary = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: `Question: ${question}
SQL: ${sql}
Rows: ${JSON.stringify(rows).slice(0, 30000)}

Instructions for answering:
- If the result contains a COUNT column (e.g., completed_opening_checks, completed_closing_checks):
   • If the count > 0, answer naturally, e.g. "Yes, X opening checks have been completed today."
   • If the count = 0, answer naturally, e.g. "No, none of the opening checks have been completed today."
- If rows include a time column (check_time, created_time, start_time, end_time), mention it in the answer where relevant.
- Otherwise, write a concise, friendly summary in plain English.
- If no rows, say "No data found for today."`
    });

    return NextResponse.json({ answer: summary.output_text });

  } catch (e: any) {
    console.error('ASK API ERROR:', e);
    return NextResponse.json(
      { error: 'Server error while answering question.', detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}
