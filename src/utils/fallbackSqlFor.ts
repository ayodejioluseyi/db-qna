// src/utils/fallbackSqlFor.ts
// Domain-aware, safe default SQLs that always include restaurant scoping.

export function fallbackSqlFor(question: string, restaurantId: number): string | null {
  const q = question.toLowerCase();

  // ✅ Checks completed LAST WEEK (Mon–Sun, ISO week)
  if (q.includes('last week') && q.includes('check') && (q.includes('completed') || q.includes('done'))) {
    return `SELECT COUNT(*) AS completed_checks_last_week
            FROM daily_check
            WHERE restaurant_id = ${restaurantId}
              AND (is_completed = 1 OR status = 1)
              AND YEARWEEK(FROM_UNIXTIME(date), 1) = YEARWEEK(CURDATE() - INTERVAL 1 WEEK, 1)
            LIMIT 1000`;
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

  // opening checks completed?
  if (q.includes('opening') && (q.includes('completed') || q.startsWith('have'))) {
    return `SELECT COUNT(*) AS completed_opening_checks
            FROM daily_check d
            WHERE d.restaurant_id = ${restaurantId}
              AND d.category = 1
              AND (d.is_completed = 1 OR d.status = 1)
              AND d.date BETWEEN UNIX_TIMESTAMP(CURDATE())
                             AND UNIX_TIMESTAMP(CURDATE() + INTERVAL 1 DAY) - 1
            LIMIT 1000`;
  }

  // Generic daily checks summary today
  if (q.includes('checks') && q.includes('today')) {
    return `SELECT id, note, status, is_completed,
                   FROM_UNIXTIME(date, '%Y-%m-%d %H:%i:%s') AS check_time
            FROM daily_check
            WHERE restaurant_id = ${restaurantId}
              AND date BETWEEN UNIX_TIMESTAMP(CURDATE())
                           AND UNIX_TIMESTAMP(CURDATE() + INTERVAL 1 DAY) - 1
            ORDER BY id DESC
            LIMIT 1000`;
  }

  // Fallback — let the model handle anything else
  return null;
}
