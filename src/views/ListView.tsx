import { useMemo, useState } from 'react'
import { KIND_LABEL, liveEntries, yen, type Book, type Entry, type Kind } from '../lib/model'
import { byCategory, monthEntries, totalsOf } from '../lib/summary'
import { WEEKDAYS, parseYmd } from '../lib/dates'
import EntryRow from './EntryRow'

interface Props {
  book: Book
  ym: string // 2026-10
  onEdit: (e: Entry) => void
}

export default function ListView({ book, ym, onEdit }: Props) {
  const [query, setQuery] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [breakdown, setBreakdown] = useState<Kind>('expense')

  const month = useMemo(() => monthEntries(book, ym), [book, ym])
  const q = query.trim().toLowerCase()

  // 検索語があるときは全期間から探す(新しい順)
  const shown = useMemo(() => {
    let list = q
      ? liveEntries(book)
          .filter((e) => `${e.memo} ${book.categories[e.categoryId]?.name ?? ''} ${e.amount}`.toLowerCase().includes(q))
          .sort((a, b) => b.date.localeCompare(a.date))
      : month
    if (catFilter) list = list.filter((e) => e.categoryId === catFilter)
    return list
  }, [book, month, q, catFilter])

  const groups = useMemo(() => {
    const g: { date: string; list: Entry[] }[] = []
    for (const e of shown) {
      const last = g[g.length - 1]
      if (last?.date === e.date) last.list.push(e)
      else g.push({ date: e.date, list: [e] })
    }
    return g
  }, [shown])

  const total = totalsOf(month)
  const cats = byCategory(month, breakdown)
  const kindTotal = total[breakdown]
  const shownTotal = totalsOf(shown)

  return (
    <div className="list-layout">
      <section className="card breakdown">
        <div className="breakdown-head">
          <h2>カテゴリ別</h2>
          <div className="kind-toggle small-toggle">
            {(['expense', 'income'] as Kind[]).map((k) => (
              <button key={k} type="button" className={`kind-btn ${k} ${breakdown === k ? 'on' : ''}`} onClick={() => setBreakdown(k)}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        {cats.length ? (
          <table className="cat-table">
            <tbody>
              {cats.map((c) => {
                const cat = book.categories[c.categoryId]
                const pct = kindTotal ? (c.total / kindTotal) * 100 : 0
                return (
                  <tr key={c.categoryId} className={catFilter === c.categoryId ? 'on' : ''} onClick={() => setCatFilter((f) => (f === c.categoryId ? '' : c.categoryId))}>
                    <td className="ct-name">
                      <span className="cat-dot" style={{ background: cat?.color ?? '#999' }} />
                      {cat?.name ?? '(不明)'}
                    </td>
                    <td className="ct-bar">
                      <span style={{ width: `${pct}%`, background: cat?.color ?? '#999' }} />
                    </td>
                    <td className="ct-pct">{pct.toFixed(1)}%</td>
                    <td className="ct-amt">{yen(c.total)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="muted">この月の{KIND_LABEL[breakdown]}はありません</p>
        )}
        <p className="muted small-note">行を押すと、そのカテゴリの明細だけを表示します</p>
      </section>

      <section className="card detail">
        <div className="detail-head">
          <input type="search" placeholder="メモ・カテゴリ・金額で検索(全期間)" value={query} onChange={(e) => setQuery(e.target.value)} />
          {catFilter && (
            <button type="button" className="ghost small" onClick={() => setCatFilter('')}>
              「{book.categories[catFilter]?.name}」の絞り込みを解除
            </button>
          )}
        </div>
        {(q || catFilter) && (
          <p className="muted">
            {shown.length}件 ・ 支出 {yen(shownTotal.expense)} ・ 収入 {yen(shownTotal.income)}
          </p>
        )}
        {groups.length ? (
          groups.map((g) => {
            const d = parseYmd(g.date)
            const t = totalsOf(g.list)
            return (
              <div key={g.date} className="day-group">
                <div className="day-group-head">
                  <span className={d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''}>
                    {q ? `${d.getFullYear()}年` : ''}
                    {d.getMonth() + 1}月{d.getDate()}日({WEEKDAYS[d.getDay()]})
                  </span>
                  <span className="muted">
                    {!!t.income && <span className="income">+{yen(t.income)} </span>}
                    {!!t.expense && <span className="expense">{yen(t.expense)}</span>}
                  </span>
                </div>
                <ul className="entries">
                  {g.list.map((e) => (
                    <EntryRow key={e.id} book={book} entry={e} onClick={() => onEdit(e)} />
                  ))}
                </ul>
              </div>
            )
          })
        ) : (
          <p className="muted">{q ? '見つかりませんでした' : 'この月の入力はありません'}</p>
        )}
      </section>
    </div>
  )
}
