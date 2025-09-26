export type TsMeta = { col: string; type: 'date'|'timestamp'|'unknown' }
export type TableTsMap = Record<string, TsMeta>

const PREFS: Record<string, string[]> = {
  daily_check: ['check_time','date'],
  core_temperature: ['recorded_at','created_at','updated_at','date'],
  hot_holding: ['recorded_at','hold_time','created_at','date'],
  fridge_freezer: ['recorded_at','reading_time','created_at','date'],
  food_cooling: ['cooling_end_time','cooling_start_time','recorded_at','date'],
  cleaning_frequency: ['completed_at','due_date','date'],
  calibration_probe: ['calibrated_at','recorded_at','date'],
}

export function inferTimestampMap(informationSchema: Array<{table_name:string,column_name:string,data_type:string}>): TableTsMap {
  const byTable = new Map<string, Map<string,string>>()
  for (const r of informationSchema) {
    const t = r.table_name.toLowerCase()
    const c = r.column_name.toLowerCase()
    const dt = r.data_type.toLowerCase()
    if (!byTable.has(t)) byTable.set(t, new Map())
    byTable.get(t)!.set(c, dt)
  }
  const map: TableTsMap = {}
  for (const [t, cols] of byTable) {
    const want = PREFS[t] ?? []
    for (const cand of want) {
      const dt = cols.get(cand)
      if (!dt) continue
      const type: TsMeta['type'] =
        dt.includes('date') && !dt.includes('time') ? 'date'
        : (dt.includes('timestamp') || dt.includes('datetime')) ? 'timestamp'
        : 'unknown'
      map[t] = { col: cand, type }
      break
    }
  }
  return map
}
