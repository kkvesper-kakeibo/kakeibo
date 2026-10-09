// 年の画面: 1年分の月ごとの収入・支出・収支と、カテゴリ別の年間合計。月を押すとその月の明細へ
import { useMemo, useState } from 'react'
import { KIND_LABEL, liveEntries, type Book, type Kind } from '../lib/model'
import { byCategory, totalsOf } from '../lib/summary'
import Money from './Money'
import { ymd } from '../lib/dates'

interface Props {
  book: Book
  year: number
  ledger: string
  onPickMonth: (ym: string) => void
}

export default function YearView({ book, year, ledger, onPickMonth }: Props) {
  const [kind, setKind] = useState<Kind>('expense')
  const entries = useMemo(() => liveEntries(book, ledger).filter((e) => e.date.startsWith(`${year}-`)), [book, ledger, year])
  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const ym = `${year}-${String(i + 1).padStart(2, '0')}`
        const list = entries.filter((e) => e.date.startsWith(ym))
        return { ym, month: i + 1, count: list.length, ...totalsOf(list) }
      }),
    [entries, year],
  )
  const total = totalsOf(entries)
  const maxExp = Math.max(1, ...months.map((m) => m.expense))
  const cats = byCategory(entries, kind)
  const kindTotal = total[kind]
  const thisYm = ymd(new Date()).slice(0, 7)

  return (
    <div className="year-layout">
      <div className="month-sum year-sum">
        <div>
          <span className="muted">{year}年の収入</span>
          <b>
            <Money value={total.income} kind="income" />
          </b>
        </div>
        <div>
          <span className="muted">{year}年の支出</span>
          <b>
            <Money value={total.expense} kind="expense" />
          </b>
        </div>
        <div>
          <span className="muted">{year}年の収支</span>
          <b>
            <Money value={total.income - total.expense} />
          </b>
        </div>
      </div>

      <section className="card">
        <h2>月ごと</h2>
        <table className="year-table">
          <thead>
            <tr>
              <th>月</th>
              <th className="num">収入</th>
              <th className="num">支出</th>
              <th className="num">収支</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.ym} className={`${m.count ? '' : 'empty'} ${m.ym === thisYm ? 'this-month' : ''}`} onClick={() => onPickMonth(m.ym)} title="この月の明細を開く">
                <td className="ym-cell">{m.month}月</td>
                <td className="num">{m.income ? <Money value={m.income} kind="income" /> : <span className="muted">—</span>}</td>
                <td className="num exp-cell">
                  <span className="exp-bar" style={{ width: `${(m.expense / maxExp) * 100}%` }} />
                  {m.expense ? <Money value={m.expense} kind="expense" /> : <span className="muted">—</span>}
                </td>
                <td className="num">{m.count ? <Money value={m.income - m.expense} /> : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small-note">月を押すと、その月の明細を開きます。</p>
      </section>

      <section className="card">
        <div className="breakdown-head">
          <h2>カテゴリ別(年間)</h2>
          <div className="kind-toggle small-toggle">
            {(['expense', 'income'] as Kind[]).map((k) => (
              <button key={k} type="button" className={`kind-btn ${k} ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
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
                  <tr key={c.categoryId}>
                    <td className="ct-name">
                      <span className="cat-dot" style={{ background: cat?.color ?? '#999' }} />
                      {cat?.name ?? '(不明)'}
                    </td>
                    <td className="ct-bar">
                      <span style={{ width: `${pct}%`, background: cat?.color ?? '#999' }} />
                    </td>
                    <td className="ct-pct">{pct.toFixed(1)}%</td>
                    <td className="ct-amt">
                      <Money value={c.total} kind={kind} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="muted">{year}年の{KIND_LABEL[kind]}はありません</p>
        )}
      </section>
    </div>
  )
}
