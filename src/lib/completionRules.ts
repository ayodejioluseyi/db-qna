// src/lib/completion.ts

export type AllowedTable =
  | 'cleaning_frequency'
  | 'core_temperature'
  | 'hot_holding'
  | 'fridge_freezer'
  | 'daily_check'
  | 'food_cooling'
  | 'calibration_probe';

export type MinimalStatusRow = {
  status?: number | string | null;
  is_completed?: number | string | null;
  [k: string]: unknown; // allow extra fields without using `any`
};

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isNaN(n) ? null : n;
}

export function isCompleted<T extends MinimalStatusRow>(
  table: AllowedTable | string,
  row: T
): boolean | null {
  const status = toNum(row.status);
  const completedFlag = toNum(row.is_completed);

  switch (table) {
    case 'cleaning_frequency':
      return status === 2;

    case 'core_temperature':
    case 'hot_holding':
    case 'fridge_freezer':
      return status === 1;

    case 'daily_check':
      return completedFlag === 1 || status === 1;

    // For other tables or unknowns we can't determine completion
    default:
      return null;
  }
}
