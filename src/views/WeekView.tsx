// カレンダーの「週」表示: 7日分の明細を並べる(PC は横に7列、スマホは縦に並べる)
import { WEEKDAYS, ymd } from '../lib/dates'
import { holidayName } from '../lib/holidays'
import { ledgerOf, type Book, type Entry } from '../lib/model'
import type { DayTotals } from '../lib/summary'
import Money from './Money'

interface Props {
  book: Book
  dates: Date[]
  totals: Map<string, DayTotals>
  byDay: Map<string, Entry[]>
  selected: string
  onPickDay: (date: string) => void
  onEdit: (e: Entry) => void
  onAdd: (date: string) => void
  showLedger: boolean
}

export default function WeekView({ book, dates, totals, byDay, selected, onPickDay, onEdit, onAdd, showLedger }: Props) {
  const today = ymd(new Date())
  return (
    <div className="week">
      {dates.map((d) => {
        const key = ymd(d)
        const hol = holidayName(d.getFullYear(), d.getMonth() + 1, d.getDate())
        const t = totals.get(key)
        const list = byDay.get(key) ?? []
        const tone = hol || d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''
        return (
          <section key={key} className={`week-day card ${key === today ? 'today' : ''} ${key === selected ? 'selected' : ''}`}>
            <button type="button" className={`week-head ${tone}`} onClick={() => onPickDay(key)} title="この日を開く">
              <span className="week-date">
                <span className="daynum">{d.getDate()}</span>
                <span className="week-wd">
                  {d.getMonth() + 1}月・{WEEKDAYS[d.getDay()]}
                </span>
              </span>
              {hol && <span className="hol-name">{hol}</span>}
            </button>
            <div className="week-sum">
              {t?.income ? <Money value={t.income} kind="income" /> : null}
              {t?.expense ? <Money value={t.expense} kind="expense" /> : null}
            </div>
            <ul className="week-entries">
              {list.map((e) => {
                const c = book.categories[e.categoryId]
                return (
                  <li key={e.id}>
                    <button type="button" className="week-entry" onClick={() => onEdit(e)} title={`${c?.name ?? '(不明)'}${e.memo ? `\n${e.memo}` : ''}`}>
                      <span className="week-entry-cat">
                        <span className="cat-dot" style={{ background: c?.color ?? '#999' }} />
                        {showLedger && <span className="entry-ledger">{book.ledgers[ledgerOf(e)]?.name}</span>}
                        <span className="week-entry-name">{c?.name ?? '(不明)'}</span>
                      </span>
                      {e.memo && <span className="week-entry-memo">{e.memo}</span>}
                      <Money className="week-entry-amt" value={e.amount} kind={e.kind} />
                    </button>
                  </li>
                )
              })}
            </ul>
            <button type="button" className="ghost small week-add" onClick={() => onAdd(key)} title="この日に入力">
              ＋
            </button>
          </section>
        )
      })}
    </div>
  )
}
