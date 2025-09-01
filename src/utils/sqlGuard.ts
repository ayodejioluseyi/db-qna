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

const DISALLOWED = [
  'INSERT','UPDATE','DELETE','DROP','TRUNCATE','ALTER','CREATE','GRANT',
  'REVOKE','MERGE','CALL','DESCRIBE','SHOW','INTO','OUTFILE','INFILE'
];

export function isSafeSql(sql?: string) {
  if (!sql || typeof sql !== 'string') return false;
  const q = sql.replace(/\s+/g,' ').trim();
  const upper = q.toUpperCase();

  // Only SELECT
  if (!upper.startsWith('SELECT ')) return false;

  // No semicolons or comments
  if (q.includes(';') || q.includes('--') || q.includes('/*') || q.includes('*/')) return false;

  // Block dangerous keywords
  if (DISALLOWED.some(k => new RegExp(`\\b${k}\\b`, 'i').test(q))) return false;

  // All referenced tables must be allowed
  const tableMatches = [
    ...q.matchAll(/\bFROM\s+([a-zA-Z0-9_]+)/gi),
    ...q.matchAll(/\bJOIN\s+([a-zA-Z0-9_]+)/gi),
  ];
  const tables = tableMatches.map(m => m[1].toLowerCase());
  if (!tables.length || !tables.every(t => (ALLOWED_TABLES as readonly string[]).includes(t))) return false;

  // Basic column whitelist on SELECT list (best effort)
  const selectClause = q.split(/\bfrom\b/i)[0].replace(/^select/i,'').trim();
  if (selectClause !== '*') {
    const cols = selectClause.split(',').map(s => s.trim());
    const baseCols = cols.map(c => {
      const func = c.match(/^[A-Z_]+\((.+)\)$/i);
      const inner = func ? func[1] : c;
      const left = inner.split(/\sas\s/i)[0];
      return left.split('.').pop()?.replace(/`/g,'').trim();
    }).filter(Boolean) as string[];
    const allAllowed = baseCols.every(col =>
      col === '*' || /^COUNT\(\*\)$/i.test(col) ||
      Object.values(ALLOWED_COLUMNS).some(list => list.includes(col))
    );
    if (!allAllowed) return false;
  }

  // Require LIMIT
  if (!/\bLIMIT\s+\d+\b/i.test(q)) return false;

  return true;
}
