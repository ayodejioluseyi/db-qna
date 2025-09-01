import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { query } from '@/lib/db';
import { isSafeSql } from '@/utils/sqlGuard';

export async function GET() {
  return NextResponse.json({ ok: true, hint: 'POST { question: "..." }' });
}

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    const system = `
You are a MySQL assistant for a read-only analytics API.

You may only use these tables and columns:

- temperature(
  id BIGINT, equipment VARCHAR, dev_eui VARCHAR, bat_v DECIMAL, bat_status TINYINT,
  hum_sht DECIMAL, temp_ds DECIMAL, temp_sht DECIMAL, temp_calc DECIMAL,
  date INT, restaurant_id INT, token VARCHAR, status TINYINT
)

- core_temperature(
  id INT, dish_id INT, temperature DECIMAL, re_temperature DECIMAL, remarks TEXT,
  restaurant_id INT, type TINYINT, status TINYINT, retest TINYINT, iteration INT,
  created_at INT, updated_at INT, created_by INT, updated_by INT, token VARCHAR
)

- daily_core_temp(
  id INT, note VARCHAR, type TINYINT, date INT, restaurant_id INT,
  created_by INT, updated_by INT, updated_at INT, created_at INT, status TINYINT, token VARCHAR
)

- daily_hot_hold(
  id INT, note VARCHAR, type TINYINT, date INT, restaurant_id INT,
  created_by INT, updated_by INT, updated_at INT, created_at INT, status TINYINT, token VARCHAR
)

- hot_holding(
  id INT, dish_id INT, equipment_id INT, start INT, end INT, temperature DECIMAL,
  re_temperature DECIMAL, restaurant_id INT, type TINYINT, remarks TEXT,
  created_at INT, updated_at INT, created_by INT, updated_by INT,
  token VARCHAR, status TINYINT, retest TINYINT, iteration INT, trash TINYINT
)

- daily_check(
  id INT, qid INT, category TINYINT, image VARCHAR, note TEXT, status TINYINT,
  start INT, end INT, reference VARCHAR, restaurant_id INT, area VARCHAR(1),
  created_by INT, updated_by INT, date INT, token VARCHAR, is_completed TINYINT
)

- \`check\`(
  id INT, qid INT, category TINYINT, image VARCHAR, note TEXT, status TINYINT,
  start INT, end INT, reference VARCHAR, restaurant_id INT, area VARCHAR(1),
  created_by INT, updated_by INT, date INT, token VARCHAR, is_completed TINYINT
)

- template(
  id INT, name VARCHAR, file VARCHAR, created_by INT, updated_by INT,
  created_at INT, updated_at INT, status TINYINT, trash TINYINT, token VARCHAR
)

- wm_check(
  id INT, date INT, restaurant_id INT, token VARCHAR, type TINYINT, status TINYINT
)

Rules:
- Return ONLY one SELECT statement (no code fences).
- Use only the tables/columns above.
- WHERE/GROUP BY/ORDER BY/LIMIT are allowed. Subqueries, comments, DDL/DML are not.
- Treat INT time fields as Unix epoch seconds.
  "today" means BETWEEN UNIX_TIMESTAMP(CURDATE()) AND UNIX_TIMESTAMP(CURDATE() + INTERVAL 1 DAY) - 1.
- Completion:
  • Consider a check "completed" if status = 1 OR is_completed = 1 (when present).
  • Consider "failed" if status = 0 (when present). If no status column, return a count/rows without fail flag.
- Opening checks:
  • Use wm_check where type = 1 for opening (assumption; if unknown, still filter by type = 1).
- Always include LIMIT 1000.
- If you cannot answer with these tables, return:
  SELECT 'unsupported question' AS message LIMIT 1
`;
    const user = `Question: "${question}". Return the single SELECT per rules.`;

    const ai = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: [{ role: 'system', content: system }, { role: 'user', content: user }]
    });

    let sql = (ai.output_text || '').trim();
    console.log('Generated SQL:', sql); // <— TEMP log

    if (!isSafeSql(sql)) {
      sql = 'SELECT SUM(total_amount) AS total_sales FROM sales LIMIT 1000';
    }

    const rows = await query(sql);
    console.log('Row count:', Array.isArray(rows) ? rows.length : 0); // <— TEMP log

    const summary = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: `Question: ${question}\nSQL: ${sql}\nRows: ${JSON.stringify(rows)}\nWrite a concise, friendly answer. If empty, say no data found.`
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
