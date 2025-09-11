// Guardrails for generated SQL
// - Only SELECT
// - Only whitelisted tables/columns
// - Require LIMIT <= 1000
// - Allow FROM_UNIXTIME()
// - Allow safe aliases (like "daily_check d")
// - Allow exactly one safe JOIN: daily_check.qid = template.id
// - Allow subquery: restaurant_id IN (SELECT id FROM restaurant WHERE account_id = ?)

const ALLOWED_TABLES = [
  'temperature',
  'core_temperature',
  'daily_core_temp',
  'daily_hot_hold',
  'hot_holding',
  'daily_check',
  'check',
  'template',
  'wm_check',
  'restaurant', // explicitly allow subquery reference
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
    'id','note','type','date','restaurant_id','created_by','updated_by','updated_at',
    'created_at','status','token'
  ],
  daily_hot_hold: [
    'id','note','type','date','restaurant_id','created_by','updated_by','updated_at',
    'created_at','status','token'
  ],
  hot_holding: [
    'id','dish_id','equipment_id','start','end','temperature','re_temperature','restaurant_id',
    'type','remarks','created_at','updated_at','created_by','updated_by','token','status',
    'retest','iteration','trash'
  ],
  daily_check: [
    'id','qid','category','image','note','status','start','end','reference','restaurant_id',
    'area','created_by','updated_by','date','token','is_completed'
  ],
  check: [
    'id','qid','category','image','note','status','start','end','reference','restaurant_id',
    'area','created_by','updated_by','date','token','is_completed'
  ],
  template: [
    'id','name','file','created_by','updated_by','created_at','updated_at','status',
    'trash','token'
  ],
  wm_check: [
    'id','date','restaurant_id','token','type','status'
  ],
  restaurant: [
    'id','account_id'
  ]
};

// allowed join
const ALLOWED_JOINS = [
  { left: 'daily_check', colL: 'qid', right: 'template', colR: 'id' },
];

const DISALLOWED = [
  'INSERT','UPDATE','DELETE','DROP','TRUNCATE','ALTER','CREATE','GRANT',
  'REVOKE','MERGE','CALL','DESCRIBE','SHOW','INTO','OUTFILE','INFILE'
];

export function isSafeSql(sql?: string) {
  if (!sql || typeof sql !== 'string') return false;

  const q = sql.replace(/\s+/g,' ').trim();
  const upper = q.toUpperCase();

  // 1) Only SELECT
  if (!upper.startsWith('SELECT ')) return false;

  // 2) No semicolons or comments
  if (q.includes(';') || q.includes('--') || q.includes('/*') || q.includes('*/')) return false;

  // 3) Block dangerous keywords
  if (DISALLOWED.some(k => new RegExp(`\\b${k}\\b`, 'i').test(q))) return false;

  // 4) All referenced tables must be allowed (ignore aliases)
  const tableMatches = [
    ...q.matchAll(/\bFROM\s+([a-zA-Z0-9_]+)(?:\s+[a-z])?/gi),
    ...q.matchAll(/\bJOIN\s+([a-zA-Z0-9_]+)(?:\s+[a-z])?/gi),
  ];
  const tables = tableMatches.map(m => m[1].toLowerCase());
  if (!tables.length || !tables.every(t => (ALLOWED_TABLES as readonly string[]).includes(t))) return false;

  // 5) Validate SELECT list columns (best-effort)
  const selectClause = q.split(/\bfrom\b/i)[0].replace(/^select/i,'').trim();
  if (selectClause !== '*') {
    const cols = selectClause.split(',').map(s => s.trim());
    const baseCols = cols.map(c => {
      if (/^COUNT\(\*\)$/i.test(c)) return '*';
      if (/^FROM_UNIXTIME\(.+\)$/i.test(c)) return 'FROM_UNIXTIME'; // ✅ allow time conversion
      const func = c.match(/^[A-Z_]+\((.+)\)$/i);
      const noAlias = (func ? func[1] : c).split(/\sas\s/i)[0];
      const bare = noAlias.split('.').pop()?.replace(/`/g,'').trim();
      return bare || '';
    }).filter(Boolean) as string[];

    const allAllowed = baseCols.every(col =>
      col === '*' ||
      col === 'FROM_UNIXTIME' ||
      Object.values(ALLOWED_COLUMNS).some(list => list.includes(col))
    );
    if (!allAllowed) return false;
  }

  // ✅ 5b) Explicitly allow subquery form for account_id scoping
  if (/restaurant\s+where\s+account_id/i.test(q)) {
    // skip extra validation for that subquery — it's whitelisted
  }

  // 6) JOINs must match whitelist
  const joinConds = [...q.matchAll(/\bJOIN\s+([a-zA-Z0-9_]+)\s+ON\s+([a-zA-Z0-9_.`]+)\s*=\s*([a-zA-Z0-9_.`]+)/gi)];
  for (const m of joinConds) {
    const leftSide = m[2].replace(/`/g,'').split('.');
    const rightSide = m[3].replace(/`/g,'').split('.');
    if (leftSide.length !== 2 || rightSide.length !== 2) return false;
    const [tL, cL] = leftSide;
    const [tR, cR] = rightSide;
    const ok = ALLOWED_JOINS.some(j =>
      ((tL === j.left && cL === j.colL && tR === j.right && cR === j.colR) ||
       (tL === j.right && cL === j.colR && tR === j.left && cR === j.colL))
    );
    if (!ok) return false;
  }

  // 7) LIMIT present and bounded
  const limit = q.match(/\bLIMIT\s+(\d+)\b/i);
  if (!limit) return false;
  if (Number(limit[1]) > 1000) return false;

  return true;
}
