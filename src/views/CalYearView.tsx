// カレンダーの「年」表示: 12か月の小さなカレンダー。支出の多い日ほど色を濃くする。日を押すとその日、月を押すとその月へ
import type { CSSProperties } from 'react'
import { WEEKDAYS, monthGrid, ymd } from '../lib/dates'
import { holidayName } from '../lib/holidays'
import { yen } from '../lib/model'
import type { DayTotals } from '../lib/summary'
import Money from './Money'

interface Props {
  year: number
  totals: Map<string, DayTotals>
  weekStart: number
  onPickDay: (date: string) => void
  onPickMonth: (ym: string) => void
}

export default function CalYearView({ year, totals, weekStart, onPickDay, onPickMonth }: Props) {
  const today = ymd(new Date())
  const heads = [0, 1, 2, 3, 4, 5, 6].map((i) => (i + weekStart) % 7)
  // 色の濃さの基準: その年の1日の支出の多い順で上から5%目あたり(飛び抜けた日に引っぱられないように)
  const exps = [...totals].filter(([d, t]) => d.startsWith(`${year}-`) && t.expense > 0).map(([, t]) => t.expense).sort((a, b) => b - a)
  const base = exps.length ? exps[Math.floor(exps.length * 0.05)] : 1
  return (
    <div className="cal-year">
      {Array.from({ length: 12 }, (_, month0) => {
        const ym = `${year}-${String(month0 + 1).padStart(2, '0')}`
        const grid = monthGrid(year, month0, weekStart).days
        const shown = grid[35].getMonth() !== month0 ? grid.slice(0, 35) : grid
        let income = 0
        let expense = 0
        for (const [d, t] of totals) {
          if (!d.startsWith(ym)) continue
          income += t.income
          expense += t.expense
        }
        return (
          <section key={ym} className="mini card">
            <button type="button" className="mini-title" onClick={() => onPickMonth(ym)} title="この月のカレンダーを開く">
              <b>{month0 + 1}月</b>
              <span className="mini-sum">
                {!!income && <Money value={income} kind="income" short />}
                {!!expense && <Money value={expense} kind="expense" short />}
              </span>
            </button>
            <div className="mini-grid">
              {heads.map((i) => (
                <div key={i} className={`mini-wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>
                  {WEEKDAYS[i]}
                </div>
              ))}
              {shown.map((d) => {
                const key = ymd(d)
                if (d.getMonth() !== month0) return <div key={key} />
                const t = totals.get(key)
                const hol = holidayName(d.getFullYear(), d.getMonth() + 1, d.getDate())
                const level = t?.expense ? Math.min(1, 0.18 + (0.82 * Math.sqrt(t.expense)) / Math.sqrt(base)) : 0
                const cls = ['mini-day', hol || d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : '', key === today && 'today', level && 'spent', t?.income && 'earned']
                  .filter(Boolean)
                  .join(' ')
                const tip = [hol, t?.income && `収入 ${yen(t.income)}`, t?.expense && `支出 ${yen(t.expense)}`].filter(Boolean).join('・')
                return (
                  <button
                    key={key}
                    type="button"
                    className={cls}
                    style={level ? ({ '--lv': `${Math.round(level * 70)}%` } as CSSProperties) : undefined}
                    onClick={() => onPickDay(key)}
                    title={tip}
                  >
                    {d.getDate()}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
      <p className="muted small-note cal-year-note">支出の多い日ほど赤く、収入のあった日は下に青い線が付きます。日を押すとその日、月を押すとその月を開きます。</p>
    </div>
  )
}
