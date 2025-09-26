// src/app/api/ask/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { RowDataPacket } from 'mysql2/promise';
import { query } from '@/lib/db';                // ⟵ use your pooled helper
import { validateSql } from '@/utils/sqlGuard';
import { fallbackSqlFor } from '@/utils/fallbackSqlFor';
import { parseDateRange } from '@/utils/parseDateRange';


export const runtime = 'nodejs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

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
// Restaurant ID: 58, 61, 62, 67, 68, 69, 74
function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return 'Unknown error'; }
}

// Simple extractor; you already know this pattern from your code
function detectRestaurantId(question?: string): number | undefined {
  if (!question) return undefined;
  const q = question.toLowerCase();
  const norm = q
    .replace(/\bresturant\b/g, 'restaurant')
    .replace(/\brestuarant\b/g, 'restaurant');

  const m =
    norm.match(/\brestaurant\s*id\s*[:=]?\s*(\d+)/i) ||
    norm.match(/\brestaurant\s*[:=]?\s*(\d+)/i) ||
    norm.match(/\bfor\s+restaurant\s+(\d+)/i);

  return m ? parseInt(m[1], 10) : undefined;
}


// Hard check that SQL contains a restaurant_id predicate for safety
// Belt & braces: require the resolved restaurantId to appear in a predicate
function hasRestaurantFilter(sql: string, restaurantId: number): boolean {
  const id = String(restaurantId);
  const lower = sql.toLowerCase().replace(/\s+/g, ' ');
  if (!/\brestaurant_id\b/.test(lower)) return false;

  // cheap but effective: ensure the id appears in an = or IN (...) clause
  return new RegExp(`restaurant_id\\s*(=|in)\\s*[^;]*\\b${id}\\b`).test(lower);
}

export async function POST(req: NextRequest) {
  try {
    const { question, restaurantId: bodyRestaurantId } = await req.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // Resolve restaurantId: detect in text → body override → safe default
    const detected = detectRestaurantId(question);
    const restaurantId: number = Number.isFinite(detected) ? (detected as number)
                              : Number(bodyRestaurantId) || 74; // pick your known-good default
    
    const dr = parseDateRange(question); // null or { startISO, endISO, label }

    // 1) Domain fallback first (fast + predictable)
    let sql = fallbackSqlFor(question, restaurantId, dr || undefined);


    // 2) If fallback didn’t hit, ask the model
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

    // 3) Guard + fallback
    let check = validateSql(sql);
    if (!check.ok) {
      const fb = fallbackSqlFor(question, restaurantId);
      if (fb) {
        const fbCheck = validateSql(fb);
        if (fbCheck.ok) {
          sql = fb;
          check = fbCheck;
        }
      }
    }
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Generated SQL rejected by guard.', reason: check.reason, sqlAttempt: sql },
        { status: 400 }
      );
    }

    // 4) Hard-enforce restaurant filter presence (belt & braces)
    if (!hasRestaurantFilter(sql, restaurantId)) {
      return NextResponse.json(
        { error: 'SQL must include a restaurant_id filter for the resolved restaurant.', restaurantId, sqlAttempt: sql },
        { status: 400 }
      );
    }

    // 5) Execute using pooled helper (typed)
    type AnyRow = RowDataPacket & Record<string, unknown>;
    const rows = await query<AnyRow[]>(sql);

    // 6) Summarise with completion hints (replace the whole input string below)
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
    If no rows, say "No data found."

    IMPORTANT: If the SQL implies a date range (e.g., DATE(...)=CURDATE() or BETWEEN/>=/< on dates),
    restate the period clearly in the answer using ISO dates, e.g., "for 2025-09-01 to 2025-09-07".
    If counts are all zero, say "No temperature checks logged for <table list> in that period for restaurant <id>."`
    });


    return NextResponse.json({ answer: summary.output_text, sql, rows, restaurantId });
  } catch (e: unknown) {
    console.error('ASK API ERROR:', e);
    return NextResponse.json(
      { error: 'Server error while answering question.', detail: toMessage(e) },
      { status: 500 }
    );
  }
}
