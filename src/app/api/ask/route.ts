import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import mysql from 'mysql2/promise';
//import { isSafeSql } from '@/utils/sqlGuard';
import { validateSql } from '@/utils/sqlGuard';
import { fallbackSqlFor } from '@/utils/fallbackSqlFor';

const system = `
You are a MySQL assistant for a read-only analytics API.

- You may only use these tables: core_temperature, cleaning_frequency, food_cooling,
  hot_holding, daily_check, fridge_freezer, calibration_probe.
- Do NOT use: wm_check, temperature, daily_core_temp, daily_hot_hold, \`check\`, template.
- Use FROM_UNIXTIME() when converting Unix timestamps (e.g., FROM_UNIXTIME(created_at, '%Y-%m-%d %H:%i:%s')).
- "today" means: BETWEEN UNIX_TIMESTAMP(CURDATE()) AND UNIX_TIMESTAMP(CURDATE() + INTERVAL 1 DAY) - 1.
- Completion status depends on table:
  • cleaning_frequency: status 0|1|2 = not started | pending | completed → completed only when status = 2.
  • core_temperature, hot_holding, fridge_freezer: status 1|0 → completed when status = 1; failed = 0.
  • daily_check: consider completed if is_completed = 1 OR status = 1 (fallback rule).
- Always add LIMIT 1000.
- Always restrict to the specific restaurant: add WHERE restaurant_id = {restaurantId}.
`;

// wm_check, temperature, daily_core_temp, daily_hot_hold, check, template
// Restaurant ID: 58, 61, 62, 67, 68, 69, 74
// for core_temperature, hot_holding, fridge_freezer will be status = 1|0
// cleaning_frequency, status is 0|1|2 => not started|pending|completed 
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
    // Try to auto-detect restaurant id in the question.
    // Handles: "restaurant 53", "restaurant id 53", "for restaurant 53", "restaurant: 53"
    const idMatch =
      question.match(/\brestaurant\s*id\s*[:=]?\s*(\d+)/i) ||
      question.match(/\brestaurant\s*[:=]?\s*(\d+)/i);
    const detectedId = idMatch ? parseInt(idMatch[1], 10) : undefined;

    // If not in the question, allow the client to POST { restaurantId }, else fall back to a default.
    // You can change the default 53 to any known-good restaurant id for demos.
    const restaurantId: number = Number.isFinite(detectedId)
      ? detectedId!
      : (Number(bodyRestaurantId) || 53);


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
    // 5) Summarise
    // 5) Summarise (tweaked with per-table completion rules)
    const summary = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: `Question: ${question}
    SQL: ${sql}
    Rows: ${JSON.stringify(rows).slice(0, 30000)}
    Write a concise, business-friendly answer.

    Completion rules:
    - cleaning_frequency: completed only when status = 2 (0 not started, 1 pending, 2 completed).
    - core_temperature, hot_holding, fridge_freezer: completed when status = 1; failed when status = 0.
    - daily_check: treat as completed if is_completed = 1 OR status = 1 (fallback rule).

    If SQL is a COUNT, answer naturally (e.g., "Yes, 12 …").
    If rows include a time column (e.g., check_time/start_time/end_time/created_time), include it.
    If no rows, say "No data found."`
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
