// src/utils/sqlGuard.ts

const ALLOWED_TABLES = [
  'core_temperature',
  'cleaning_frequency',
  'food_cooling',
  'hot_holding',
  'daily_check',
  'fridge_freezer',
  'calibration_probe',
] as const;

const DISALLOWED = [
  'INSERT','UPDATE','DELETE','DROP','TRUNCATE','ALTER','CREATE','GRANT',
  'REVOKE','MERGE','CALL','DESCRIBE','SHOW','INTO','OUTFILE','INFILE'
];

export function validateSql(sql?: string): { ok: boolean; reason?: string } {
  if (!sql || typeof sql !== 'string') return { ok: false, reason: 'Empty SQL' };

  const q = sql.replace(/\s+/g, ' ').trim();
  const upper = q.toUpperCase();

  if (!upper.startsWith('SELECT ')) return { ok: false, reason: 'Only SELECT allowed' };
  if (q.includes(';') || q.includes('--') || q.includes('/*') || q.includes('*/'))
    return { ok: false, reason: 'No semicolons/comments' };
  if (DISALLOWED.some(k => new RegExp(`\\b${k}\\b`, 'i').test(q)))
    return { ok: false, reason: 'Disallowed keyword' };

  // Tables mentioned must be allowed
  const tableMatches = [
    ...q.matchAll(/\bFROM\s+([a-zA-Z0-9_]+)(?:\s+[a-z])?/gi),
    ...q.matchAll(/\bJOIN\s+([a-zA-Z0-9_]+)(?:\s+[a-z])?/gi),
  ];
  const tables = tableMatches.map(m => m[1].toLowerCase());
  if (!tables.length) return { ok: false, reason: 'No tables found' };
  if (!tables.every(t => (ALLOWED_TABLES as readonly string[]).includes(t)))
    return { ok: false, reason: 'Table not allowed' };

  // Require LIMIT and cap to 1000
  const limit = q.match(/\bLIMIT\s+(\d+)\b/i);
  if (!limit) return { ok: false, reason: 'LIMIT missing' };
  if (Number(limit[1]) > 1000) return { ok: false, reason: 'LIMIT too high' };

  return { ok: true };
}
