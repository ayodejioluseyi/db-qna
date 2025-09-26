// src/utils/parseDateRange.ts
// Parse natural dates in the user's question: 'today', 'yesterday', 'last week',
// 'on 2025-09-01', 'on 01/09/2025', 'between 2025-09-01 and 2025-09-07' (UK dd/mm also).
// Returns closed-open [start, end) ISO dates, e.g., start='2025-09-01', end='2025-09-02'.
// For full-week requests, end = start + 7 days.

type Range = { startISO: string; endISO: string; label?: string };

function toISO(d: Date): string {
  // Force UTC yyyy-mm-dd (avoid tz drift)
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}
function parseISO(s?: string): Date | null {
  if (!s) return null;
  // yyyy-mm-dd
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return isNaN(+d) ? null : d;
}
function parseUKDate(s?: string): Date | null {
  if (!s) return null;
  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return null;
  const [_, dd, mm, yyyy] = m;
  const d = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00Z`);
  return isNaN(+d) ? null : d;
}

export function parseDateRange(question?: string): Range | null {
  const now = new Date(); // use server clock; fine for server-side API usage
  const todayISO = toISO(now);
  if (!question) return null;

  const q = question.toLowerCase();

  // today
  if (/\btoday\b/.test(q)) {
    return { startISO: todayISO, endISO: addDaysISO(todayISO, 1), label: 'today' };
  }

  // yesterday
  if (/\byesterday\b/.test(q)) {
    const yISO = addDaysISO(todayISO, -1);
    return { startISO: yISO, endISO: todayISO, label: 'yesterday' };
  }

  // last week (Mon–Sun using ISO week can be subjective; we take 7 days prior)
  if (/\blast\s+week\b/.test(q)) {
    const end = addDaysISO(todayISO, 0);        // today start
    const start = addDaysISO(end, -7);          // 7 days back
    return { startISO: start, endISO: end, label: 'last week' };
  }

  // between <date> and <date>  (supports ISO and UK)
  const between = q.match(/\bbetween\s+([0-9\/\-]+)\s+and\s+([0-9\/\-]+)\b/);
  if (between) {
    const aRaw = between[1], bRaw = between[2];
    const a = parseISO(aRaw) || parseUKDate(aRaw);
    const b = parseISO(bRaw) || parseUKDate(bRaw);
    if (a && b) {
      const aISO = toISO(a), bISO = toISO(b);
      // Make closed-open: end = b + 1 day
      const start = aISO < bISO ? aISO : bISO;
      const end = addDaysISO(aISO < bISO ? bISO : aISO, 1);
      return { startISO: start, endISO: end, label: 'between' };
    }
  }

  // on <date>  (ISO or UK)
  const on = q.match(/\bon\s+([0-9\/\-]{8,10})\b/);
  if (on) {
    const raw = on[1];
    const d = parseISO(raw) || parseUKDate(raw);
    if (d) {
      const s = toISO(d);
      return { startISO: s, endISO: addDaysISO(s, 1), label: 'on' };
    }
  }

  // week of <date>  → 7-day window starting that date
  const weekOf = q.match(/\bweek\s+of\s+([0-9\/\-]{8,10})\b/);
  if (weekOf) {
    const raw = weekOf[1];
    const d = parseISO(raw) || parseUKDate(raw);
    if (d) {
      const s = toISO(d);
      return { startISO: s, endISO: addDaysISO(s, 7), label: 'week of' };
    }
  }

  return null;
}
