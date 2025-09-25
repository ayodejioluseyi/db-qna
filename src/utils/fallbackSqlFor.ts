// src/utils/fallbackSqlFor.ts
// Domain-aware, safe default SQLs that always include restaurant scoping.

export function fallbackSqlFor(question: string, restaurantId: number): string | null {
  const q = question.toLowerCase();

  // How many checks were completed last week? (generic daily_check summary)
  if (q.includes('last week')) {
    return `
      SELECT COUNT(*) AS completed_last_week
      FROM daily_check
      WHERE restaurant_id = ${restaurantId}
        AND (is_completed = 1 OR status = 1)
        AND date BETWEEN UNIX_TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 7 DAY))
                     AND UNIX_TIMESTAMP(CURDATE()) - 1
      LIMIT 1000
    `.trim();
  }

  // Outstanding checks today (generic daily_check view)
  if (q.includes('outstanding') || q.includes('pending')) {
    return `
      SELECT id, qid, note, status, is_completed,
             FROM_UNIXTIME(date, '%Y-%m-%d %H:%i:%s') AS check_time
      FROM daily_check
      WHERE restaurant_id = ${restaurantId}
        AND date BETWEEN UNIX_TIMESTAMP(CURDATE())
                     AND UNIX_TIMESTAMP(CURDATE() + INTERVAL 1 DAY) - 1
        AND (is_completed = 0 OR status = 0 OR status = 2)
      ORDER BY id DESC
      LIMIT 1000
    `.trim();
  }


  // ✅ Checks completed THIS WEEK
  if ((q.includes('this week') || q.includes('current week')) && q.includes('check') && (q.includes('completed') || q.includes('done'))) {
    return `SELECT COUNT(*) AS completed_checks_this_week
            FROM daily_check
            WHERE restaurant_id = ${restaurantId}
              AND (is_completed = 1 OR status = 1)
              AND YEARWEEK(FROM_UNIXTIME(date), 1) = YEARWEEK(CURDATE(), 1)
            LIMIT 1000`;
  }
  // temperature checks today + failures
  if (q.includes('temperature') && (q.includes('today') || q.includes('completed'))) {
    // If they mention fail/failed, we’ll filter status=0
    const wantFailedOnly = /fail|failed|out of range|failures/i.test(question);
    return `SELECT id,
                   equipment,
                   temp_calc AS temperature,
                   status,
                   FROM_UNIXTIME(date, '%Y-%m-%d %H:%i:%s') AS check_time
            FROM temperature
            WHERE restaurant_id = ${restaurantId}
              AND date BETWEEN UNIX_TIMESTAMP(CURDATE())
                           AND UNIX_TIMESTAMP(CURDATE() + INTERVAL 1 DAY) - 1
              ${wantFailedOnly ? 'AND status = 0' : ''}
            ORDER BY id DESC
            LIMIT 1000`;
  }

  // Outstanding checks today
  if (q.includes('outstanding') || q.includes('not done')) {
    return `SELECT id,
                   note,
                   status,
                   is_completed,
                   FROM_UNIXTIME(date, '%Y-%m-%d %H:%i:%s') AS check_time
            FROM daily_check
            WHERE restaurant_id = ${restaurantId}
              AND date BETWEEN UNIX_TIMESTAMP(CURDATE())
                           AND UNIX_TIMESTAMP(CURDATE() + INTERVAL 1 DAY) - 1
              AND (is_completed = 0 OR status = 0 OR status = 2)
            ORDER BY id DESC
            LIMIT 1000`;
  }

  // Opening checks completed? (No template join available anymore)
  // Fallback: use daily_check and look at completion flags.
  if (q.includes('opening')) {
    return `
      SELECT COUNT(*) AS completed_opening_checks
      FROM daily_check
      WHERE restaurant_id = ${restaurantId}
        AND (is_completed = 1 OR status = 1)
        AND date BETWEEN UNIX_TIMESTAMP(CURDATE())
                     AND UNIX_TIMESTAMP(CURDATE() + INTERVAL 1 DAY) - 1
      LIMIT 1000
    `.trim();
  }

  // Generic “checks completed today” phrasing (daily_check)
  if (q.includes('completed') && q.includes('today')) {
    return `
      SELECT id, qid, status, is_completed,
             FROM_UNIXTIME(date, '%Y-%m-%d %H:%i:%s') AS check_time
      FROM daily_check
      WHERE restaurant_id = ${restaurantId}
        AND (is_completed = 1 OR status = 1)
        AND date BETWEEN UNIX_TIMESTAMP(CURDATE())
                     AND UNIX_TIMESTAMP(CURDATE() + INTERVAL 1 DAY) - 1
      ORDER BY id DESC
      LIMIT 1000
    `.trim();
  }

  // Fallback — let the model handle anything else
  return null;
}
