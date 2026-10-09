import { holidayName } from '../lib/holidays'
import { WEEKDAYS, monthGrid, ymd } from '../lib/dates'
import { type Book, type Entry } from '../lib/model'
import type { DayTotals } from '../lib/summary'
import EntryRow from './EntryRow'
import Money from './Money'

interface Props {
  book: Book
  year: number
  month0: number
  totals: Map<string, DayTotals>
  byDay: Map<string, Entry[]>
  selected: string
  onSelect: (date: string) => void
  onEdit: (e: Entry) => void
  onAdd: (date: string) => void
  weekStart: number
  showLedger: boolean
}

export default function CalendarView({ book, year, month0, totals, byDay, selected, onSelect, onEdit, onAdd, weekStart, showLedger }: Props) {
  const grid = monthGrid(year, month0, weekStart).days
  const heads = [0, 1, 2, 3, 4, 5, 6].map((i) => (i + weekStart) % 7)
  const today = ymd(new Date())
  const sel = byDay.get(selected) ?? []
  const selT = totals.get(selected)
  const [sy, sm, sd] = selected.split('-').map(Number)
  const selDate = new Date(sy, sm - 1, sd)
  return (
    <div className="cal-layout">
      <div className="month">
        <div className="month-head">
          {heads.map((i) => (
            <div key={i} className={`wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>
              {WEEKDAYS[i]}
            </div>
          ))}
        </div>
        <div className="month-grid">
          {grid.map((d) => {
            const key = ymd(d)
            const hol = holidayName(d.getFullYear(), d.getMonth() + 1, d.getDate())
            const t = totals.get(key)
            const cls = [
              'cell',
              d.getMonth() !== month0 && 'other',
              key === today && 'today',
              key === selected && 'selected',
              hol || d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button key={key} type="button" className={cls} onClick={() => onSelect(key)} onDoubleClick={() => onAdd(key)} title={hol}>
                <span className="daynum">{d.getDate()}</span>
                {t?.income ? <Money className="amt" value={t.income} kind="income" short /> : null}
                {t?.expense ? <Money className="amt" value={t.expense} kind="expense" short /> : null}
              </button>
            )
          })}
        </div>
      </div>

      <section className="day-panel card">
        <div className="day-head">
          <h2>
            {sm}月{sd}日({WEEKDAYS[selDate.getDay()]})
            {holidayName(sy, sm, sd) && <span className="hol-name">{holidayName(sy, sm, sd)}</span>}
          </h2>
          <button type="button" className="small" onClick={() => onAdd(selected)}>
            ＋ この日に入力
          </button>
        </div>
        {selT && (
          <div className="day-sum">
            {!!selT.income && <span>収入 <Money value={selT.income} kind="income" /></span>}
            {!!selT.expense && <span>支出 <Money value={selT.expense} kind="expense" /></span>}
          </div>
        )}
        {sel.length ? (
          <ul className="entries">
            {sel.map((e) => (
              <EntryRow key={e.id} book={book} entry={e} onClick={() => onEdit(e)} showLedger={showLedger} />
            ))}
          </ul>
        ) : (
          <p className="muted">この日の入力はありません</p>
        )}
      </section>
    </div>
  )
}
