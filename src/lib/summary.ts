// 集計(日ごと・月ごと・カテゴリごと)
import { liveEntries, type Book, type Entry, type Kind } from './model'

export interface DayTotals {
  income: number
  expense: number
}

const byDate = (a: Entry, b: Entry) => a.date.localeCompare(b.date) || a.updatedAt - b.updatedAt

/** 日付ごとの明細(入力順) */
export function indexByDay(book: Book): Map<string, Entry[]> {
  const m = new Map<string, Entry[]>()
  for (const e of liveEntries(book).sort(byDate)) {
    const l = m.get(e.date)
    if (l) l.push(e)
    else m.set(e.date, [e])
  }
  return m
}

export function dayTotals(byDay: Map<string, Entry[]>): Map<string, DayTotals> {
  const m = new Map<string, DayTotals>()
  for (const [d, list] of byDay) {
    const t = { income: 0, expense: 0 }
    for (const e of list) t[e.kind] += e.amount
    m.set(d, t)
  }
  return m
}

/** その月(2026-10)の明細 */
export const monthEntries = (book: Book, ym: string) => liveEntries(book).filter((e) => e.date.startsWith(ym)).sort(byDate)

export function totalsOf(entries: Entry[]): DayTotals {
  const t = { income: 0, expense: 0 }
  for (const e of entries) t[e.kind] += e.amount
  return t
}

/** カテゴリごとの合計(多い順) */
export function byCategory(entries: Entry[], kind: Kind): { categoryId: string; total: number; count: number }[] {
  const m = new Map<string, { total: number; count: number }>()
  for (const e of entries) {
    if (e.kind !== kind) continue
    const c = m.get(e.categoryId) ?? { total: 0, count: 0 }
    c.total += e.amount
    c.count++
    m.set(e.categoryId, c)
  }
  return [...m].map(([categoryId, v]) => ({ categoryId, ...v })).sort((a, b) => b.total - a.total)
}
