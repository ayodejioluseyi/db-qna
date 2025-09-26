// src/utils/fallbackSqlFor.ts
// Domain-aware, safe default SQLs that always include restaurant scoping.

export type DateRange = { startISO: string; endISO: string; label?: string };

// daily_check uses a UNIX seconds column named `date`
function dcDatePredicate(dr?: DateRange): string {
  if (!dr) {
    // default = TODAY
    return `
      date BETWEEN UNIX_TIMESTAMP(CURDATE())
             AND UNIX_TIMESTAMP(CURDATE() + INTERVAL 1 DAY) - 1
    `;
  }
  // closed-open [start, end) in UNIX seconds
  return `
    date BETWEEN UNIX_TIMESTAMP(STR_TO_DATE('${dr.startISO}','%Y-%m-%d'))
           AND UNIX_TIMESTAMP(STR_TO_DATE('${dr.endISO}','%Y-%m-%d')) - 1
  `;
}

// temperature tables use a DATETIME column (created_at by default)
function tempDatePredicate(col: string, dr?: DateRange): string {
  if (!dr) return `DATE(${col}) = CURDATE()`; // TODAY
  // closed-open [start, end) -> >= start AND < end
  return `
    ${col} >= STR_TO_DATE('${dr.startISO}','%Y-%m-%d')
    AND ${col} <  STR_TO_DATE('${dr.endISO}','%Y-%m-%d')
  `;
}

export function fallbackSqlFor(
  question: string,
  restaurantId: number,
  dr?: DateRange
): string | null {
  const q = question.toLowerCase();
  const norm = q
    .replace(/\bresturant\b/g, 'restaurant')
    .replace(/\brestuarant\b/g, 'restaurant')
    .trim();

  // Parser-provided range takes priority; otherwise derive quick phrases here
  let range = dr;

  if (!range) {
    // Build ISO dates from JS here to match predicates
    const now = new Date();
    const toISO = (d: Date) => {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const addDays = (iso: string, days: number) => {
      const d = new Date(`${iso}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return toISO(d);
    };
    const todayISO = toISO(now);

    if (norm.includes('yesterday')) {
      const yISO = addDays(todayISO, -1);
      range = { startISO: yISO, endISO: todayISO, label: 'yesterday' };
    } else if (norm.includes('this month')) {
      // Start of current month to start of next month
      const startISO = `${now.getUTCFullYear()}-${String(
        now.getUTCMonth() + 1
      ).padStart(2, '0')}-01`;
      const nextMonth = new Date(`${startISO}T00:00:00Z`);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      const endISO = toISO(nextMonth);
      range = { startISO, endISO, label: 'this month' };
    } else if (norm.includes('this week')) {
      // Fallback: last 6 days + today (7-day window)
      const startISO = addDays(todayISO, -6);
      const endISO = addDays(todayISO, 1);
      range = { startISO, endISO, label: 'this week' };
    }
  }

  // 🔹 Opening checks completed? (daily_check)
  if (norm.includes('opening')) {
    return `
      SELECT COUNT(*) AS completed_opening_checks
      FROM daily_check
      WHERE restaurant_id = ${restaurantId}
        AND (is_completed = 1 OR status = 1)
        AND ${dcDatePredicate(range)}
      LIMIT 1000
    `.trim();
  }

  // 🔹 Outstanding/pending/not done (daily_check)
  if (norm.includes('outstanding') || norm.includes('pending') || norm.includes('not done')) {
    return `
      SELECT id, qid, note, status, is_completed,
             FROM_UNIXTIME(date, '%Y-%m-%d %H:%i:%s') AS check_time
      FROM daily_check
      WHERE restaurant_id = ${restaurantId}
        AND ${dcDatePredicate(range)}
        AND (is_completed = 0 AND status IN (0,1))
      ORDER BY id DESC
      LIMIT 1000
    `.trim();
  }

  // 🔹 Checks completed THIS WEEK (explicit wording) – respect range if provided
  if (
    (norm.includes('this week') || norm.includes('current week')) &&
    norm.includes('check') &&
    (norm.includes('completed') || norm.includes('done'))
  ) {
    if (!range) {
      // default “this week” via MySQL yearweek if no explicit dr
      return `
        SELECT COUNT(*) AS completed_checks_this_week
        FROM daily_check
        WHERE restaurant_id = ${restaurantId}
          AND (is_completed = 1 OR status = 1)
          AND YEARWEEK(FROM_UNIXTIME(date), 1) = YEARWEEK(CURDATE(), 1)
        LIMIT 1000
      `.trim();
    }
    // respect custom range
    return `
      SELECT COUNT(*) AS completed_checks
      FROM daily_check
      WHERE restaurant_id = ${restaurantId}
        AND (is_completed = 1 OR status = 1)
        AND ${dcDatePredicate(range)}
      LIMIT 1000
    `.trim();
  }

  // 🔹 Temperature checks (core_temperature, hot_holding, fridge_freezer) – completed/failed
  if (
    /\btemp(erature)?\s+checks?\b/.test(norm) ||
    /\btemp\s+logs?\b/.test(norm) ||
    norm.includes('hot holding') ||
    norm.includes('hot_hold') ||
    norm.includes('fridge') ||
    norm.includes('freezer') ||
    norm.includes('temp logs')
  ) {
    const timeCol = 'created_at'; // <- change if your schema uses a different column

    return `
      SELECT 'core_temperature' AS table_name,
             CAST(COALESCE(SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END), 0) AS UNSIGNED) AS completed,
             CAST(COALESCE(SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END), 0) AS UNSIGNED) AS failed
      FROM core_temperature
      WHERE restaurant_id = ${restaurantId}
        AND ${tempDatePredicate(timeCol, range)}
      UNION ALL
      SELECT 'hot_holding',
             CAST(COALESCE(SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END), 0) AS UNSIGNED),
             CAST(COALESCE(SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END), 0) AS UNSIGNED)
      FROM hot_holding
      WHERE restaurant_id = ${restaurantId}
        AND ${tempDatePredicate(timeCol, range)}
      UNION ALL
      SELECT 'fridge_freezer',
             CAST(COALESCE(SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END), 0) AS UNSIGNED),
             CAST(COALESCE(SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END), 0) AS UNSIGNED)
      FROM fridge_freezer
      WHERE restaurant_id = ${restaurantId}
        AND ${tempDatePredicate(timeCol, range)}
      LIMIT 1000
    `.trim();
  }

  // 🔹 Generic “completed …” phrasing (daily_check), respect range
  if (norm.includes('completed')) {
    return `
      SELECT id, qid, status, is_completed,
             FROM_UNIXTIME(date, '%Y-%m-%d %H:%i:%s') AS check_time
      FROM daily_check
      WHERE restaurant_id = ${restaurantId}
        AND (is_completed = 1 OR status = 1)
        AND ${dcDatePredicate(range)}
      ORDER BY id DESC
      LIMIT 1000
    `.trim();
  }

  // fallback: model handles it
  return null;
}
