import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import mysql from 'mysql2/promise';

export async function GET() {
  return NextResponse.json({ ok: true, hint: 'POST { question: "..." } to this endpoint.' });
}

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // OpenAI client
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 });
    const openai = new OpenAI({ apiKey });

    // DB connection
    const host = process.env.DB_HOST!;
    const port = Number(process.env.DB_PORT || 3306);
    const user = process.env.DB_USER!;
    const password = process.env.DB_PASSWORD!;
    const database = process.env.DB_NAME!;
    const conn = await mysql.createConnection({ host, port, user, password, database });

    // Ask OpenAI for a single safe SELECT over the 'sales' table
    const system = `
You are a MySQL assistant for a read-only analytics API.

Schema: account(
  id INT,
  account_no VARCHAR(30),
  created_at INT,
  updated_at INT,
  account_name VARCHAR(255),
  address_line_one VARCHAR(255),
  address_line_two VARCHAR(255),
  city VARCHAR(255),
  post_code VARCHAR(20),
  country_id INT,
  token VARCHAR(255),
  status TINYINT,
  trash TINYINT
)

Rules:
- Return ONLY one SELECT (no code fences), only the 'account' table.
- May use SUM/AVG/COUNT/MIN/MAX.
- Must end with LIMIT 1000.
- No subqueries/joins/comments/semicolons.
- If impossible, return: SELECT 'unsupported question' AS message LIMIT 1
`;
    const userPrompt = `Question: "${question}". Return the single SELECT per rules.`;

    const ai = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: [{ role: 'system', content: system }, { role: 'user', content: userPrompt }]
    });

    let sql = (ai.output_text || '').trim();
    console.log('Generated SQL:', sql);

    // Minimal guard
    const upper = sql.toUpperCase();
    const looksSelect =
      upper.startsWith('SELECT ') &&
      !sql.includes(';') &&
      !upper.includes('JOIN') &&
      /\bFROM\s+sales\b/i.test(sql);
    if (!looksSelect || !/\bLIMIT\s+\d+\b/i.test(sql)) {
      sql = 'SELECT COUNT(*) AS total_accounts FROM account LIMIT 1000';
    }

    // Run SQL
    const [rows] = await conn.query(sql);
    await conn.end();
    console.log('Row count:', Array.isArray(rows) ? rows.length : 0);

    // Summarise
    const summary = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: `Question: ${question}
SQL: ${sql}
Rows: ${JSON.stringify(rows)}
Write a concise, friendly answer. If empty, say no data found.`
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
