import type { TsMeta } from './timestamps'
export function formatWhen(v: string|number|Date|null|undefined, meta: TsMeta|null) {
  if (!v) return ''
  const d = new Date(v)
  if (meta?.type === 'date') {
    return d.toLocaleDateString('en-GB', { timeZone: 'Europe/London' })
  }
  const hh=d.getHours(), mm=d.getMinutes(), ss=d.getSeconds()
  if (hh===1 && mm===0 && ss===5) {
    return d.toLocaleDateString('en-GB', { timeZone: 'Europe/London' })
  }
  return d.toLocaleString('en-GB', { timeZone: 'Europe/London' })
}
