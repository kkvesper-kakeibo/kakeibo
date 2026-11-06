// カレンダーの「日」表示: その日の明細とカテゴリ別の合計
import { WEEKDAYS } from '../lib/dates'
import { holidayName } from '../lib/holidays'
import { type Book, type Entry, type Kind } from '../lib/model'
import { byCategory, type DayTotals } from '../lib/summary'
import EntryRow from './EntryRow'
import Money from './Money'

interface Props {
  book: Book
  date: string
  totals: DayTotals | undefined
  entries: Entry[]
  onEdit: (e: Entry) => void
  onAdd: (date: string) => void
  showLedger: boolean
}

export default function DayView({ book, date, totals, entries, onEdit, onAdd, showLedger }: Props) {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  const hol = holidayName(y, m, d)
  return (
    <div className="day-view">
      <section className="card">
        <div className="day-head">
          <h2 className={hol || dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''}>
            {m}月{d}日({WEEKDAYS[dow]}){hol && <span className="hol-name">{hol}</span>}
          </h2>
          <button type="button" className="small" onClick={() => onAdd(date)}>
            ＋ この日に入力
          </button>
        </div>
        {entries.length ? (
          <ul className="entries">
            {entries.map((e) => (
              <EntryRow key={e.id} book={book} entry={e} onClick={() => onEdit(e)} showLedger={showLedger} />
            ))}
          </ul>
        ) : (
          <p className="muted">この日の入力はありません</p>
        )}
      </section>

      {!!entries.length && (
        <section className="card">
          <h2>カテゴリ別</h2>
          {(['expense', 'income'] as Kind[]).map((k) => {
            const cats = byCategory(entries, k)
            if (!cats.length) return null
            const sum = totals?.[k] ?? 0
            return (
              <table key={k} className="cat-table day-cats">
                <tbody>
                  {cats.map((c) => {
                    const cat = book.categories[c.categoryId]
                    const pct = sum ? (c.total / sum) * 100 : 0
                    return (
                      <tr key={c.categoryId}>
                        <td className="ct-name">
                          <span className="cat-dot" style={{ background: cat?.color ?? '#999' }} />
                          {cat?.name ?? '(不明)'}
                          {c.count > 1 && <span className="muted"> ×{c.count}</span>}
                        </td>
                        <td className="ct-bar">
                          <span style={{ width: `${pct}%`, background: cat?.color ?? '#999' }} />
                        </td>
                        <td className="ct-amt">
                          <Money value={c.total} kind={k} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          })}
        </section>
      )}
    </div>
  )
}
