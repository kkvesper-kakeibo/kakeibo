import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBook } from './lib/useBook'
import { ALL_LEDGERS, liveLedgers, MAIN_LEDGER, stamp, type Entry, type Kind } from './lib/model'
import { dayTotals, indexByDay, monthEntries, totalsOf } from './lib/summary'
import { ymd } from './lib/dates'
import { buildInfo, useNewerVersion, versionLabel } from './lib/version'
import { useSwipe } from './lib/useSwipe'
import YearView from './views/YearView'
import GraphView, { type GraphMode } from './views/GraphView'
import CalendarView from './views/CalendarView'
import ListView from './views/ListView'
import EntryForm from './views/EntryForm'
import SettingsView, { type Theme } from './views/SettingsView'
import Money from './views/Money'

type Tab = 'calendar' | 'list' | 'graph' | 'year' | 'settings'
const THEME = 'kakeibo.theme'
const TAB = 'kakeibo.tab'
const LEDGER = 'kakeibo.ledger'
const WEEK_START = 'kakeibo.weekStart'
const GRAPH_MODE = 'kakeibo.graphMode'

const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* 無視 */
  }
}

export default function App() {
  const api = useBook()
  const { book } = api
  const today = ymd(new Date())
  const [selected, setSelected] = useState(today)
  const [ym, setYm] = useState(today.slice(0, 7))
  const [tab, setTab] = useState<Tab>(() => (lsGet(TAB) as Tab) || 'calendar')
  const [form, setForm] = useState<{ date: string; kind?: Kind } | Entry | null>(null)
  const [theme, setThemeState] = useState<Theme>(() => (lsGet(THEME) as Theme) || 'auto')
  const newer = useNewerVersion()
  const [ledgerPick, setLedgerPick] = useState(() => lsGet(LEDGER) || MAIN_LEDGER)
  const [graphMode, setGraphModeState] = useState<GraphMode>(() => (lsGet(GRAPH_MODE) as GraphMode) || 'month')
  const setGraphMode = (g: GraphMode) => {
    setGraphModeState(g)
    lsSet(GRAPH_MODE, g)
  }
  const [weekStart, setWeekStartState] = useState(() => Number(lsGet(WEEK_START) ?? '1'))
  const ledgers = useMemo(() => (book ? liveLedgers(book) : []), [book])
  // 選んでいた帳簿が消されていたら最初の帳簿に戻す
  const ledger = ledgerPick === ALL_LEDGERS || ledgers.some((l) => l.id === ledgerPick) ? ledgerPick : (ledgers[0]?.id ?? MAIN_LEDGER)
  const pickLedger = (id: string) => {
    setLedgerPick(id)
    lsSet(LEDGER, id)
  }
  const setWeekStart = (n: number) => {
    setWeekStartState(n)
    lsSet(WEEK_START, String(n))
  }

  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
  }, [theme])
  const setTheme = (t: Theme) => {
    setThemeState(t)
    lsSet(THEME, t)
  }
  const go = (t: Tab) => {
    setTab(t)
    setSlide('')
    lsSet(TAB, t)
  }

  const [y, m] = ym.split('-').map(Number)
  const shiftMonth = (d: number) => {
    const nd = new Date(y, m - 1 + d, 1)
    const nym = ymd(nd).slice(0, 7)
    setYm(nym)
    // 選んでいる日も、その月に移す(今月なら今日)
    setSelected(nym === today.slice(0, 7) ? today : `${nym}-01`)
    setSlide(d > 0 ? 'next' : 'prev')
  }
  // 年の画面: 年を移す(月はそのまま)
  const shiftYear = (d: number) => {
    const nym = `${y + d}-${String(m).padStart(2, '0')}`
    setYm(nym)
    setSelected(nym === today.slice(0, 7) ? today : `${nym}-01`)
    setSlide(d > 0 ? 'next' : 'prev')
  }
  // 年の画面と、グラフを「年」で見ているときは年単位で移す
  const byYear = tab === 'year' || (tab === 'graph' && graphMode === 'year')
  const shift = (d: number) => (byYear ? shiftYear(d) : shiftMonth(d))
  // 月・年を移したときの動き(左右に少しずらして表示)
  const [slide, setSlide] = useState<'next' | 'prev' | ''>('')
  // スマホ: 左右にスワイプで月(年の画面では年)を移す
  const swipe = useSwipe((dir) => tab !== 'settings' && shift(dir === 'left' ? 1 : -1))

  const byDay = useMemo(() => (book ? indexByDay(book, ledger) : new Map<string, Entry[]>()), [book, ledger])
  const totals = useMemo(() => dayTotals(byDay), [byDay])
  const monthT = useMemo(() => (book ? totalsOf(monthEntries(book, ym, ledger)) : { income: 0, expense: 0 }), [book, ym, ledger])

  const save = useCallback(
    (e: Entry) => {
      api.ensureLogin()
      api.update((b) => ({ ...b, entries: { ...b.entries, [e.id]: e } }))
      setSelected(e.date)
      setYm(e.date.slice(0, 7))
    },
    [api],
  )
  const remove = useCallback(
    (e: Entry) => {
      api.ensureLogin()
      api.update((b) => ({ ...b, entries: { ...b.entries, [e.id]: { ...e, deleted: true, updatedAt: stamp() } } }))
    },
    [api],
  )

  // キーボード: N で新規入力(入力欄にいないとき)
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (form || ev.ctrlKey || ev.metaKey || ev.altKey) return
      const t = ev.target as HTMLElement
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName)) return
      if (ev.key === 'n' || ev.key === 'N') {
        ev.preventDefault()
        setForm({ date: selected })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [form, selected])

  if (!book) return <div className="loading">読み込み中…</div>

  const syncLabel =
    api.status === 'syncing'
      ? '同期中…'
      : api.status === 'error'
        ? '同期エラー'
        : !api.token
          ? api.dirty
            ? '未同期の変更あり'
            : api.status === 'idle'
              ? '同期する'
              : '未ログイン'
          : api.dirty
            ? '送信待ち'
            : '同期済み'

  return (
    <div className="app">
      <header className="topbar">
        <div className="title">家計簿</div>
        {ledgers.length > 1 && (
          <select className="ledger-select" value={ledger} onChange={(e) => pickLedger(e.target.value)} aria-label="帳簿">
            {ledgers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            <option value={ALL_LEDGERS}>すべての帳簿</option>
          </select>
        )}
        {tab !== 'settings' && (
          <div className="month-nav">
            <button type="button" className="ghost small" onClick={() => shift(-1)} aria-label={byYear ? '前の年' : '前の月'}>
              ‹
            </button>
            <button
              type="button"
              className="ghost small month-label"
              onClick={() => (setYm(today.slice(0, 7)), setSelected(today))}
              title={byYear ? '今年に戻る' : '今月に戻る'}
            >
              {byYear ? `${y}年` : `${y}年${m}月`}
            </button>
            <button type="button" className="ghost small" onClick={() => shift(1)} aria-label={byYear ? '次の年' : '次の月'}>
              ›
            </button>
          </div>
        )}
        <span className="spacer" />
        <button
          type="button"
          className={`sync-badge ${api.status} ${api.dirty ? 'dirty' : ''}`}
          onClick={() => (api.token ? api.sync() : api.login())}
          title={api.error || (api.syncedAt ? `最後の同期 ${new Date(api.syncedAt).toLocaleString('ja-JP')}` : '')}
        >
          {syncLabel}
        </button>
        <span className="version" title="ヴァージョン">
          {versionLabel}
        </span>
      </header>

      {newer && (
        <div className="banner">
          新しい版(ver {newer.version})が出ています。
          <button type="button" className="small" onClick={() => location.reload()}>
            再読み込み
          </button>
        </div>
      )}
      {!api.token && api.status === 'login' && (
        <div className="banner">
          入力はこのままできます(この端末に保存)。PC とスマホで同じデータを使うには Google にログインしてください。
          <button type="button" className="small" onClick={api.login}>
            ログイン
          </button>
        </div>
      )}
      {!api.token && api.status === 'idle' && (
        <div className="banner">
          ほかの端末で入力した分を読み込むには「同期」を押してください(入力して保存したときも自動で同期します)。
          <button type="button" className="small" onClick={api.login}>
            同期
          </button>
        </div>
      )}
      {api.error && tab !== 'settings' && <div className="banner error">{api.error}</div>}
      {api.folder && api.folder.permission !== 'granted' && (
        <div className="banner">
          バックアップフォルダ「{api.folder.handle.name}」への保存が止まっています。
          <button type="button" className="small" onClick={api.resumeFolder}>
            許可して再開
          </button>
        </div>
      )}

      {(tab === 'calendar' || tab === 'list') && (
        <div className="month-sum">
          <div>
            <span className="muted">収入</span>
            <b><Money value={monthT.income} kind="income" /></b>
          </div>
          <div>
            <span className="muted">支出</span>
            <b><Money value={monthT.expense} kind="expense" /></b>
          </div>
          <div>
            <span className="muted">収支</span>
            <b><Money value={monthT.income - monthT.expense} /></b>
          </div>
        </div>
      )}

      <main className="main" {...(tab !== 'settings' ? swipe : {})}>
        <div key={tab === 'settings' ? 'settings' : `${tab}-${byYear ? y : ym}-${tab === 'graph' ? graphMode : ''}`} className={`slide ${slide}`}>
        {tab === 'calendar' && (
          <CalendarView
            book={book}
            year={y}
            month0={m - 1}
            totals={totals}
            byDay={byDay}
            selected={selected}
            onSelect={(d) => {
              setSelected(d)
              if (d.slice(0, 7) !== ym) setYm(d.slice(0, 7))
            }}
            onEdit={setForm}
            onAdd={(date) => setForm({ date })}
            weekStart={weekStart}
            showLedger={ledger === ALL_LEDGERS}
          />
        )}
        {tab === 'list' && <ListView book={book} ym={ym} ledger={ledger} onEdit={setForm} />}
        {tab === 'graph' && (
          <GraphView
            book={book}
            ledger={ledger}
            ym={ym}
            mode={graphMode}
            setMode={(g) => (setGraphMode(g), setSlide(''))}
            onOpenMonth={(nym) => {
              setYm(nym)
              setSelected(nym === today.slice(0, 7) ? today : `${nym}-01`)
              go('list')
            }}
            onOpenYear={(ny) => {
              const nym = `${ny}-${String(m).padStart(2, '0')}`
              setYm(nym)
              setSelected(nym === today.slice(0, 7) ? today : `${nym}-01`)
              go('year')
            }}
          />
        )}
        {tab === 'year' && (
          <YearView
            book={book}
            year={y}
            ledger={ledger}
            onPickMonth={(nym) => {
              setYm(nym)
              setSelected(nym === today.slice(0, 7) ? today : `${nym}-01`)
              setSlide('')
              go('list')
            }}
          />
        )}
        {tab === 'settings' && <SettingsView api={api} book={book} theme={theme} setTheme={setTheme} ledger={ledger} weekStart={weekStart} setWeekStart={setWeekStart} />}
        </div>
        <p className="app-version">
          家計簿 {versionLabel}({buildInfo.built} 公開)
        </p>
      </main>

      {/* カレンダーでは日の欄の「＋ この日に入力」を使う。明細の画面には日の欄が無いので、今日の分を入力するボタンを出す */}
      {tab === 'list' && (
        <button type="button" className="fab" onClick={() => setForm({ date: today })} title="今日の分を入力(N キー)">
          ＋ 今日の分を入力
        </button>
      )}

      <nav className="tabbar">
        {(
          [
            ['calendar', 'カレンダー'],
            ['list', '明細'],
            ['graph', 'グラフ'],
            ['year', '年'],
            ['settings', '設定'],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} type="button" className={tab === t ? 'on' : ''} onClick={() => go(t)}>
            {label}
          </button>
        ))}
      </nav>

      {form && <EntryForm key={'id' in form ? form.id : `new-${form.date}`} book={book} initial={form} onSave={save} onDelete={remove} onClose={() => setForm(null)} ledger={ledger} />}
    </div>
  )
}
