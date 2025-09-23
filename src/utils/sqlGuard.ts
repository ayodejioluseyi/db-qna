// Guardrails for generated SQL
// - Only SELECT
// - Only whitelisted tables/columns
// - Require LIMIT <= 1000
// - Allow FROM_UNIXTIME()
// - Allow safe aliases (like "daily_check d")
// - Allow account_id filters
// - Allow exactly one safe JOIN: daily_check.qid = template.id

// src/utils/sqlGuard.ts

const ALLOWED_TABLES = [
  'temperature',
  'core_temperature',
  'daily_core_temp',
  'daily_hot_hold',
  'hot_holding',
  'daily_check',
  'check',
  'template',
  'wm_check'
] as const;

const ALLOWED_COLUMNS: Record<(typeof ALLOWED_TABLES)[number], string[]> = {
  temperature: [
    'id','equipment','dev_eui','bat_v','bat_status','hum_sht','temp_ds','temp_sht','temp_calc',
    'date','restaurant_id','token','status'
  ],
  core_temperature: [
    'id','dish_id','temperature','re_temperature','remarks','restaurant_id','type','status',
    'retest','iteration','created_at','updated_at','created_by','updated_by','token'
  ],
  daily_core_temp: [
    'id','note','type','date','restaurant_id','created_by','updated_by','updated_at','created_at','status','token'
  ],
  daily_hot_hold: [
    'id','note','type','date','restaurant_id','created_by','updated_by','updated_at','created_at','status','token'
  ],
  hot_holding: [
    'id','dish_id','equipment_id','start','end','temperature','re_temperature','restaurant_id','type','remarks',
    'created_at','updated_at','created_by','updated_by','token','status','retest','iteration','trash'
  ],
  daily_check: [
    'id','qid','category','image','note','status','start','end','reference','restaurant_id','area',
    'created_by','updated_by','date','token','is_completed'
  ],
  check: [
    'id','qid','category','image','note','status','start','end','reference','restaurant_id','area',
    'created_by','updated_by','date','token','is_completed'
  ],
  template: [
    'id','name','file','created_by','updated_by','created_at','updated_at','status','trash','token'
  ],
  wm_check: [
    'id','date','restaurant_id','token','type','status'
  ],
};

const ALLOWED_JOINS = [
  { left: 'daily_check', colL: 'qid', right: 'template', colR: 'id' },
];

const DISALLOWED = [
  'INSERT','UPDATE','DELETE','DROP','TRUNCATE','ALTER','CREATE','GRANT',
  'REVOKE','MERGE','CALL','DESCRIBE','SHOW','INTO','OUTFILE','INFILE'
];

export function validateSql(sql?: string): { ok: boolean; reason?: string } {
  if (!sql || typeof sql !== 'string') return { ok: false, reason: 'empty' };

  const q = sql.replace(/\s+/g,' ').trim();
  const upper = q.toUpperCase();

  if (!upper.startsWith('SELECT ')) return { ok: false, reason: 'not SELECT' };
  if (q.includes(';') || q.includes('--') || q.includes('/*') || q.includes('*/'))
    return { ok: false, reason: 'contains terminators/comments' };
  if (DISALLOWED.some(k => new RegExp(`\\b${k}\\b`, 'i').test(q)))
    return { ok: false, reason: 'contains disallowed keyword' };

  // tables (ignore aliases like "daily_check d")
  const tableMatches = [
    ...q.matchAll(/\bFROM\s+([a-zA-Z0-9_]+)(?:\s+[a-zA-Z][a-zA-Z0-9_]*)?/gi),
    ...q.matchAll(/\bJOIN\s+([a-zA-Z0-9_]+)(?:\s+[a-zA-Z][a-zA-Z0-9_]*)?/gi),
  ];
  const tables = tableMatches.map(m => m[1].toLowerCase());
  if (!tables.length) return { ok: false, reason: 'no tables' };
  if (!tables.every(t => (ALLOWED_TABLES as readonly string[]).includes(t)))
    return { ok: false, reason: `unknown table in ${tables.join(',')}` };

  // select list columns (best-effort)
  const selectClause = q.split(/\bfrom\b/i)[0].replace(/^select/i,'').trim();
  if (selectClause !== '*') {
    const cols = selectClause.split(',').map(s => s.trim());
    const baseCols = cols.map(c => {
      if (/^COUNT\(\*\)$/i.test(c)) return '*';
      if (/^FROM_UNIXTIME\(.+\)$/i.test(c)) return 'FROM_UNIXTIME';
      const noAlias = c.split(/\sas\s/i)[0];
      const func = noAlias.match(/^[A-Z_]+\((.+)\)$/i);
      const inner = (func ? func[1] : noAlias).split('.')[1] ?? (func ? func[1] : noAlias);
      const bare = inner.replace(/`/g,'').trim();
      return bare || '';
    }).filter(Boolean) as string[];

    const allAllowed = baseCols.every(col =>
      col === '*' ||
      col === 'FROM_UNIXTIME' ||
      Object.values(ALLOWED_COLUMNS).some(list => list.includes(col))
    );
    if (!allAllowed) return { ok: false, reason: `unknown select col(s): ${baseCols.join(',')}` };
  }

  // allowed JOIN shapes only
  const joinConds = [...q.matchAll(/\bJOIN\s+([a-zA-Z0-9_]+)\s+(?:AS\s+)?[a-zA-Z][a-zA-Z0-9_]*\s+ON\s+([a-zA-Z0-9_.`]+)\s*=\s*([a-zA-Z0-9_.`]+)/gi)];
  for (const m of joinConds) {
    const L = m[2].replace(/`/g,'').split('.');
    const R = m[3].replace(/`/g,'').split('.');
    if (L.length !== 2 || R.length !== 2) return { ok: false, reason: 'join sides not table.col' };
    const [tL, cL] = L;
    const [tR, cR] = R;
    const ok = ALLOWED_JOINS.some(j =>
      ((tL === j.left && cL === j.colL && tR === j.right && cR === j.colR) ||
       (tL === j.right && cL === j.colR && tR === j.left && cR === j.colL))
    );
    if (!ok) return { ok: false, reason: `join not allowed: ${tL}.${cL}=${tR}.${cR}` };
  }

  const limit = q.match(/\bLIMIT\s+(\d+)\b/i);
  if (!limit) return { ok: false, reason: 'missing LIMIT' };
  if (Number(limit[1]) > 1000) return { ok: false, reason: 'LIMIT too large' };

  return { ok: true };
}

// keep old name for existing imports
export const isSafeSql = (sql?: string) => validateSql(sql).ok;

