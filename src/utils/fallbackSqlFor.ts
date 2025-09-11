// src/utils/fallbackSqlFor.ts

export function fallbackSqlFor(question: string, accountId: number): string {
  const q = question.toLowerCase();

  // Temperature checks today
  if (q.includes('temperature')) {
    return `SELECT id,
                   equipment,
                   temp_calc AS temperature,
                   status,
                   FROM_UNIXTIME(date, '%Y-%m-%d %H:%i:%s') AS check_time
            FROM temperature
            WHERE restaurant_id IN (
              SELECT id FROM restaurant WHERE account_id = ${accountId}
            )
              AND date BETWEEN UNIX_TIMESTAMP(CURDATE())
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
            WHERE restaurant_id IN (
              SELECT id FROM restaurant WHERE account_id = ${accountId}
            )
              AND date BETWEEN UNIX_TIMESTAMP(CURDATE())
                           AND UNIX_TIMESTAMP(CURDATE() + INTERVAL 1 DAY) - 1
              AND (is_completed = 0 OR status = 0 OR status = 2)
            ORDER BY id DESC
            LIMIT 1000`;
  }

  // Opening checks completed?
  if (q.includes('opening')) {
    return `SELECT COUNT(*) AS completed_opening_checks
            FROM daily_check d
            JOIN template t ON d.qid = t.id
            WHERE d.restaurant_id IN (
              SELECT id FROM restaurant WHERE account_id = ${accountId}
            )
              AND t.name LIKE '%opening%'
              AND (d.is_completed = 1 OR d.status = 1)
              AND d.date BETWEEN UNIX_TIMESTAMP(CURDATE())
                             AND UNIX_TIMESTAMP(CURDATE() + INTERVAL 1 DAY) - 1
            LIMIT 1000`;
  }

  // Generic safe fallback
  return `SELECT id, note, status,
                 FROM_UNIXTIME(date, '%Y-%m-%d %H:%i:%s') AS check_time
          FROM daily_check
          WHERE restaurant_id IN (
            SELECT id FROM restaurant WHERE account_id = ${accountId}
          )
            AND date BETWEEN UNIX_TIMESTAMP(CURDATE())
                         AND UNIX_TIMESTAMP(CURDATE() + INTERVAL 1 DAY) - 1
          ORDER BY id DESC
          LIMIT 1000`;
}
