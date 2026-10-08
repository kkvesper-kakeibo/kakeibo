import { useEffect, useMemo, useRef, useState } from 'react'
import { evalAmount, KIND_LABEL, liveCategories, liveEntries, newId, stamp, yen, type Book, type Entry, type Kind } from '../lib/model'
import { addDays, parseYmd, ymd, jpDate } from '../lib/dates'

interface Props {
  book: Book
  /** 新規なら date と kind だけ。編集なら元の明細 */
  initial: { date: string; kind?: Kind } | Entry
  onSave: (e: Entry) => void
  onDelete: (e: Entry) => void
  onClose: () => void
}

const isEntry = (x: Props['initial']): x is Entry => 'id' in x

// 前回選んだカテゴリ(収支ごと)を、次の入力で最初から選んでおく
const LAST_CAT = 'kakeibo.lastCategory.'
const lastCat = (kind: Kind) => {
  try {
    return localStorage.getItem(LAST_CAT + kind) ?? ''
  } catch {
    return ''
  }
}

export default function EntryForm({ book, initial, onSave, onDelete, onClose }: Props) {
  const editing = isEntry(initial) ? initial : null
  const [kind, setKind] = useState<Kind>(initial.kind ?? 'expense')
  const [date, setDate] = useState(initial.date)
  const [amountText, setAmountText] = useState(editing ? String(editing.amount) : '')
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '')
  const [memo, setMemo] = useState(editing?.memo ?? '')
  const [savedCount, setSavedCount] = useState(0)
  const [err, setErr] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)

  const cats = useMemo(() => liveCategories(book, kind).filter((c) => !c.hidden || c.id === categoryId), [book, kind, categoryId])

  // 収支を切り替えたら、その種類のカテゴリを選び直す
  useEffect(() => {
    if (cats.some((c) => c.id === categoryId)) return
    const last = lastCat(kind)
    setCategoryId(cats.find((c) => c.id === last)?.id ?? cats[0]?.id ?? '')
  }, [kind, cats, categoryId])

  useEffect(() => {
    amountRef.current?.focus()
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // メモの候補: このカテゴリで過去に使ったメモ(よく使う順)
  const memoHints = useMemo(() => {
    const n = new Map<string, number>()
    for (const e of liveEntries(book)) if (e.categoryId === categoryId && e.memo) n.set(e.memo, (n.get(e.memo) ?? 0) + 1)
    return [...n].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([m]) => m)
  }, [book, categoryId])

  const amount = evalAmount(amountText)
  const isExpr = /[+\-*/×÷＋－]/.test(amountText.replace(/^-/, ''))

  const save = (again: boolean) => {
    if (amount === null || amount <= 0) {
      setErr('金額を入力してください(1円以上)')
      amountRef.current?.focus()
      return
    }
    if (!categoryId) {
      setErr('カテゴリを選んでください')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setErr('日付を入力してください')
      return
    }
    try {
      localStorage.setItem(LAST_CAT + kind, categoryId)
    } catch {
      /* 無視 */
    }
    onSave({
      ...(editing ?? {}),
      id: editing?.id ?? newId('e'),
      date,
      kind,
      amount,
      categoryId,
      memo: memo.trim(),
      updatedAt: stamp(),
    })
    if (again) {
      setAmountText('')
      setMemo('')
      setErr('')
      setSavedCount((n) => n + 1)
      amountRef.current?.focus()
    } else onClose()
  }

  const press = (s: string) => {
    if (s === '←') setAmountText((t) => t.slice(0, -1))
    else if (s === 'C') setAmountText('')
    else if (s === '=') amount !== null && setAmountText(String(amount))
    else setAmountText((t) => t + s)
    amountRef.current?.focus()
  }

  return (
    <div className="overlay" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <form
        className="sheet card entry-form"
        onSubmit={(ev) => {
          ev.preventDefault()
          save(false)
        }}
      >
        <div className="sheet-head">
          <div className="kind-toggle" role="tablist">
            {(['expense', 'income'] as Kind[]).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} className={`kind-btn ${k} ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <button type="button" className="ghost small" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="field date-field">
          <button type="button" className="ghost small" onClick={() => setDate(ymd(addDays(parseYmd(date), -1)))} aria-label="前の日">
            ‹
          </button>
          <label className="date-label">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            <span className="muted">{/^\d{4}-\d{2}-\d{2}$/.test(date) ? jpDate(parseYmd(date)) : ''}</span>
          </label>
          <button type="button" className="ghost small" onClick={() => setDate(ymd(addDays(parseYmd(date), 1)))} aria-label="次の日">
            ›
          </button>
          <button type="button" className="ghost small" onClick={() => setDate(ymd(new Date()))}>
            今日
          </button>
        </div>

        <div className="field">
          <div className={`amount-box ${kind}`}>
            <span className="yen-mark">¥</span>
            <input
              ref={amountRef}
              className="amount-input"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={amountText}
              onChange={(e) => {
                setAmountText(e.target.value)
                setErr('')
              }}
              aria-label="金額"
            />
          </div>
          {isExpr && <div className="calc-result">= {amount === null ? '計算できません' : yen(amount)}</div>}
          <div className="keypad">
            {['+', '-', '×', '÷', '=', '←', 'C'].map((k) => (
              <button key={k} type="button" className="ghost small" onClick={() => press(k)}>
                {k}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="cat-grid">
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`cat-btn ${categoryId === c.id ? 'on' : ''}`}
                style={{ '--cat': c.color } as React.CSSProperties}
                onClick={() => setCategoryId(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <input className="memo-input" list="memo-hints" placeholder="メモ(任意)" value={memo} onChange={(e) => setMemo(e.target.value)} />
          <datalist id="memo-hints">
            {memoHints.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>

        {err && <div className="msg error">{err}</div>}
        {savedCount > 0 && !err && <div className="msg ok">{savedCount}件 保存しました。続けて入力できます</div>}

        <div className="form-actions">
          {editing && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (confirm('この明細を削除しますか?')) {
                  onDelete(editing)
                  onClose()
                }
              }}
            >
              削除
            </button>
          )}
          <span className="spacer" />
          {!editing && (
            <button type="button" className="ghost" onClick={() => save(true)}>
              保存して続けて入力
            </button>
          )}
          <button type="submit">{editing ? '変更を保存' : '保存'}</button>
        </div>
      </form>
    </div>
  )
}
