const ALLOWED_TABLES = ['sales'] as const;
const ALLOWED_COLUMNS: Record<(typeof ALLOWED_TABLES)[number], string[]> = {
  sales: ['id', 'product', 'quantity', 'total_amount', 'sale_date']
};
const DISALLOWED = [
  'INSERT','UPDATE','DELETE','DROP','TRUNCATE','ALTER','CREATE','GRANT',
  'REVOKE','MERGE','CALL','DESCRIBE','SHOW','INTO','OUTFILE','INFILE'
];

export function isSafeSql(sql?: string) {
  if (!sql || typeof sql !== 'string') return false;
  const q = sql.replace(/\s+/g, ' ').trim();
  const upper = q.toUpperCase();

  if (!upper.startsWith('SELECT ')) return false;
  if (q.includes(';') || q.includes('--') || q.includes('/*') || q.includes('*/')) return false;
  if (DISALLOWED.some(k => upper.includes(`${k} `) || upper.endsWith(k))) return false;

  const tableMatches =
    [...q.matchAll(/\bFROM\s+([a-zA-Z0-9_]+)/gi)]
      .concat([...q.matchAll(/\bJOIN\s+([a-zA-Z0-9_]+)/gi)]);
  const tables = tableMatches.map(m => m[1].toLowerCase());
  if (tables.length === 0) return false;
  if (!tables.every(t => (ALLOWED_TABLES as readonly string[]).includes(t))) return false;

  const selectClause = q.split(/from/i)[0].replace(/^select/i, '').trim();
  if (selectClause !== '*') {
    const cols = selectClause.split(',').map(s => s.trim().replace(/`/g, ''));
    const ok = cols.every(col => {
      if (col === '*') return true;
      if (/^COUNT\(\*\)$/i.test(col)) return true;
      const funcMatch = col.match(/^[A-Z_]+\((.+)\)$/i);
      const inner = funcMatch ? funcMatch[1].trim() : col;
      const base = inner.split(' AS ')[0].split('.').pop()!.trim();
      return ALLOWED_COLUMNS.sales.includes(base);
    });
    if (!ok) return false;
  }

  if (!/\bLIMIT\s+\d+\b/i.test(q)) return false;
  return true;
}
