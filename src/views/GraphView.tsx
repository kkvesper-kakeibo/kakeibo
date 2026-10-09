// グラフの画面: 内訳(ドーナツ)・月ごとの推移・カテゴリの推移・年ごとの比較
import { useMemo, useState } from 'react'
import { ALL_LEDGERS, KIND_LABEL, liveEntries, type Book, type Entry, type Kind } from '../lib/model'
import { totalsOf } from '../lib/summary'
import { ymd } from '../lib/dates'
import Money from './Money'
import { BarChart, Donut, type Slice } from './charts'

export type GraphMode = 'month' | 'year'

interface Props {
  book: Book
  ledger: string
  ym: string // 2026-10(年のときは年の部分だけ使う)
  mode: GraphMode
  setMode: (m: GraphMode) => void
  onOpenMonth: (ym: string) => void
  onOpenYear: (year: number) => void
}

const OTHER_COLOR = '#9a9fa8'
const MAX_SLICES = 5 // 上位 5 つ + その他(6 区分まで)

/** 12 か月分の「2026-01」の並び。年なら 1〜12 月、月なら選んでいる月までの 12 か月 */
function monthsOf(mode: GraphMode, ym: string): string[] {
  const [y, m] = ym.split('-').map(Number)
  return Array.from({ length: 12 }, (_, i) => {
    const d = mode === 'year' ? new Date(y, i, 1) : new Date(y, m - 12 + i, 1)
    return ymd(d).slice(0, 7)
  })
}
const monthLabel = (s: string) => `${Number(s.slice(5))}月`
const jpYm = (s: string) => `${s.slice(0, 4)}年${Number(s.slice(5))}月`

export default function GraphView({ book, ledger, ym, mode, setMode, onOpenMonth, onOpenYear }: Props) {
  const [kind, setKind] = useState<Kind>('expense')
  const [trendCat, setTrendCat] = useState('')
  const all = useMemo(() => liveEntries(book, ledger), [book, ledger])
  const year = Number(ym.slice(0, 4))
  const thisYm = ymd(new Date()).slice(0, 7)

  // すべての帳簿のときは、同じ名前のカテゴリをまとめる
  const catKey = (e: Entry) => (ledger === ALL_LEDGERS ? `${e.kind}|${book.categories[e.categoryId]?.name ?? '(不明)'}` : e.categoryId)
  const catInfo = (key: string) => {
    if (ledger !== ALL_LEDGERS) {
      const c = book.categories[key]
      return { name: c?.name ?? '(不明)', color: c?.color ?? OTHER_COLOR }
    }
    const name = key.slice(key.indexOf('|') + 1)
    const c = Object.values(book.categories).find((x) => !x.deleted && `${x.kind}|${x.name}` === key)
    return { name, color: c?.color ?? OTHER_COLOR }
  }

  // ---- 内訳(選んでいる月、または年)
  const period = useMemo(() => all.filter((e) => e.date.startsWith(mode === 'year' ? `${year}-` : ym)), [all, mode, year, ym])
  const periodLabel = mode === 'year' ? `${year}年` : jpYm(ym)
  const breakdown = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of period) if (e.kind === kind) m.set(catKey(e), (m.get(catKey(e)) ?? 0) + e.amount)
    return [...m].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, kind, ledger])
  const kindTotal = breakdown.reduce((s, x) => s + x.value, 0)
  const slices: Slice[] = breakdown.slice(0, MAX_SLICES).map((b) => ({ key: b.key, value: b.value, ...catInfo(b.key) }))
  const rest = breakdown.slice(MAX_SLICES)
  if (rest.length) slices.push({ key: 'other', name: `その他(${rest.length}カテゴリ)`, color: OTHER_COLOR, value: rest.reduce((s, x) => s + x.value, 0) })

  // ---- 月ごとの推移
  const months = monthsOf(mode, ym)
  const monthTotals = useMemo(() => months.map((mm) => totalsOf(all.filter((e) => e.date.startsWith(mm)))), [all, months.join()])

  // ---- カテゴリの推移(期間中の支出が多い順に選べる。最初は一番多いもの)
  const range = useMemo(() => all.filter((e) => e.date >= `${months[0]}-01` && e.date <= `${months[11]}-31`), [all, months.join()])
  const catOptions = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of range) if (e.kind === kind) m.set(catKey(e), (m.get(catKey(e)) ?? 0) + e.amount)
    return [...m].sort((a, b) => b[1] - a[1]).map(([key]) => key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, kind, ledger])
  const selCat = catOptions.includes(trendCat) ? trendCat : (catOptions[0] ?? '')
  const selInfo = selCat ? catInfo(selCat) : null
  const catMonthly = months.map((mm) => {
    const list = range.filter((e) => e.date.startsWith(mm) && e.kind === kind && catKey(e) === selCat)
    return { total: list.reduce((s, e) => s + e.amount, 0), count: list.length }
  })

  // ---- 年ごとの比較(記録のある最初の年から今年まで)
  const years = useMemo(() => {
    const first = all.reduce((min, e) => (e.date < min ? e.date : min), ymd(new Date())).slice(0, 4)
    const out: number[] = []
    for (let y = Number(first); y <= new Date().getFullYear(); y++) out.push(y)
    return out
  }, [all])
  const yearTotals = useMemo(() => years.map((y) => totalsOf(all.filter((e) => e.date.startsWith(`${y}-`)))), [all, years])

  const kindToggle = (
    <div className="kind-toggle small-toggle">
      {(['expense', 'income'] as Kind[]).map((k) => (
        <button key={k} type="button" className={`kind-btn ${k} ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
          {KIND_LABEL[k]}
        </button>
      ))}
    </div>
  )

  return (
    <div className="graph-layout">
      {/* 絞り込みは 1 行にまとめてグラフの上に */}
      <div className="graph-filters">
        <div className="seg">
          {(
            [
              ['month', '月'],
              ['year', '年'],
            ] as [GraphMode, string][]
          ).map(([m, label]) => (
            <button key={m} type="button" className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
        </div>
        {kindToggle}
      </div>

      <section className="card">
        <h2>
          {periodLabel}の{KIND_LABEL[kind]}の内訳
        </h2>
        {slices.length ? (
          <div className="breakdown-graph">
            <Donut
              slices={slices}
              center={
                <>
                  <span className="muted">{KIND_LABEL[kind]}の合計</span>
                  <b>
                    <Money value={kindTotal} kind={kind} />
                  </b>
                </>
              }
            />
            <ul className="legend-list">
              {slices.map((s) => (
                <li key={s.key}>
                  <button type="button" className={`legend-row ${s.key === selCat ? 'on' : ''}`} disabled={s.key === 'other'} onClick={() => setTrendCat(s.key)} title="このカテゴリの推移を下に表示">
                    <span className="cat-dot" style={{ background: s.color }} />
                    <span className="legend-name">{s.name}</span>
                    <span className="legend-pct">{kindTotal ? ((s.value / kindTotal) * 100).toFixed(1) : '0.0'}%</span>
                    <Money value={s.value} kind={kind} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="muted">
            {periodLabel}の{KIND_LABEL[kind]}はありません
          </p>
        )}
        {rest.length > 0 && <p className="muted small-note">すべてのカテゴリの金額は「明細」(月)・「年」の画面の「カテゴリ別」で見られます。</p>}
      </section>

      <section className="card">
        <h2>月ごとの収入と支出({mode === 'year' ? `${year}年` : `${jpYm(months[0])}〜${jpYm(months[11])}`})</h2>
        <div className="legend-inline">
          <span>
            <i style={{ background: 'var(--income)' }} />
            収入
          </span>
          <span>
            <i style={{ background: 'var(--expense)' }} />
            支出
          </span>
        </div>
        <BarChart
          labels={months.map(monthLabel)}
          series={[
            { key: 'income', name: '収入', color: 'var(--income)', values: monthTotals.map((t) => t.income) },
            { key: 'expense', name: '支出', color: 'var(--expense)', values: monthTotals.map((t) => t.expense) },
          ]}
          highlight={months.indexOf(mode === 'year' ? thisYm : ym)}
          onPick={(i) => onOpenMonth(months[i])}
          tooltip={(i) => (
            <>
              <b>{jpYm(months[i])}</b>
              <div>
                収入 <Money value={monthTotals[i].income} kind="income" />
              </div>
              <div>
                支出 <Money value={monthTotals[i].expense} kind="expense" />
              </div>
              <div>
                収支 <Money value={monthTotals[i].income - monthTotals[i].expense} />
              </div>
            </>
          )}
        />
        <p className="muted small-note">棒に触れると金額を表示します(もう一度押すとその月の明細を開きます)。</p>
      </section>

      <section className="card">
        <div className="breakdown-head">
          <h2>カテゴリの推移</h2>
          {catOptions.length > 0 && (
            <select value={selCat} onChange={(e) => setTrendCat(e.target.value)} aria-label="カテゴリ">
              {catOptions.map((k) => (
                <option key={k} value={k}>
                  {catInfo(k).name}
                </option>
              ))}
            </select>
          )}
        </div>
        {selInfo ? (
          <>
            <p className="muted small-note">
              <span className="cat-dot" style={{ background: selInfo.color }} /> {selInfo.name}({KIND_LABEL[kind]})の月ごとの合計。上の内訳のカテゴリを押しても切り替わります。
            </p>
            <BarChart
              labels={months.map(monthLabel)}
              series={[{ key: 'cat', name: selInfo.name, color: selInfo.color, values: catMonthly.map((c) => c.total) }]}
              highlight={months.indexOf(mode === 'year' ? thisYm : ym)}
              onPick={(i) => onOpenMonth(months[i])}
              height={190}
              tooltip={(i) => (
                <>
                  <b>{jpYm(months[i])}</b>
                  <div>
                    {selInfo.name} <Money value={catMonthly[i].total} kind={kind} />
                  </div>
                  <div className="muted">{catMonthly[i].count}件</div>
                </>
              )}
            />
          </>
        ) : (
          <p className="muted">この期間の{KIND_LABEL[kind]}はありません</p>
        )}
      </section>

      {years.length > 1 && (
        <section className="card">
          <h2>年ごとの収入と支出</h2>
          <div className="legend-inline">
            <span>
              <i style={{ background: 'var(--income)' }} />
              収入
            </span>
            <span>
              <i style={{ background: 'var(--expense)' }} />
              支出
            </span>
          </div>
          <BarChart
            labels={years.map(String)}
            series={[
              { key: 'income', name: '収入', color: 'var(--income)', values: yearTotals.map((t) => t.income) },
              { key: 'expense', name: '支出', color: 'var(--expense)', values: yearTotals.map((t) => t.expense) },
            ]}
            highlight={years.indexOf(year)}
            onPick={(i) => onOpenYear(years[i])}
            tooltip={(i) => (
              <>
                <b>{years[i]}年</b>
                <div>
                  収入 <Money value={yearTotals[i].income} kind="income" />
                </div>
                <div>
                  支出 <Money value={yearTotals[i].expense} kind="expense" />
                </div>
                <div>
                  収支 <Money value={yearTotals[i].income - yearTotals[i].expense} />
                </div>
              </>
            )}
          />
          <p className="muted small-note">もう一度押すと、その年の「年」の画面を開きます。</p>
        </section>
      )}
    </div>
  )
}
