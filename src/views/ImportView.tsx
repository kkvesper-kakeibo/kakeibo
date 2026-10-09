// 他の家計簿アプリ(かけ〜ぼ など)の CSV を取り込む。
// 列の並びはアプリごとに違うので、どの列が日付・金額…かを画面で選ぶ(見出しから自動で推測する)
import { useMemo, useState } from 'react'
import { decodeText, parseCsv } from '../lib/csv'
import { ALL_LEDGERS, KIND_LABEL, ledgerOf, liveCategories, liveEntries, liveLedgers, MAIN_LEDGER, newId, stamp, type Book, type Category, type Entry, type Kind } from '../lib/model'
import { readKakeboFiles, type KakeboBackup } from '../lib/kakebo'
import KakeboImport from './KakeboImport'
import Money from './Money'

interface Props {
  book: Book
  update: (fn: (b: Book) => Book) => void
  current: string // 今見ている帳簿(取り込み先の初期値)
}

type KindMode = 'column' | 'split' | 'sign' | 'expense' | 'income'

interface Mapping {
  header: boolean
  date: number
  amount: number // split のときは支出の列
  income: number // split のときの収入の列
  kindCol: number
  kindMode: KindMode
  category: number
  sub: number // 小分類など(メモの先頭に付ける)
  memo: number
  memo2: number
}

const NONE = -1

/** 日付の読み取り: 2026/10/9・2026-10-09・2026年10月9日・20261009(後ろの時刻は無視) */
export function parseDate(s: string): string | null {
  const t = s.trim()
  const m = /^(\d{4})[/\-.年](\d{1,2})[/\-.月](\d{1,2})/.exec(t) ?? /^(\d{4})(\d{2})(\d{2})(?!\d)/.exec(t)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function parseAmount(s: string): number | null {
  const t = s.replace(/[,，\s円¥￥"]/g, '').replace(/[０-９]/g, (c) => String('０１２３４５６７８９'.indexOf(c))).replace(/^▲|^△/, '-')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  return Math.round(Number(t))
}

const find = (head: string[], ...words: RegExp[]) => {
  for (const w of words) {
    const i = head.findIndex((h) => w.test(h.trim()))
    if (i >= 0) return i
  }
  return NONE
}

function guess(rows: string[][]): Mapping {
  const head = rows[0] ?? []
  const header = !parseDate(head[0] ?? '') && head.some((h) => /日付|金額|カテゴリ|date|amount/i.test(h))
  const m: Mapping = {
    header,
    date: find(head, /^日付$/, /日付|日時|date/i),
    amount: find(head, /^金額$/, /金額|amount|price/i),
    income: NONE,
    kindCol: find(head, /^(収支|種類|区分|種別|収入\/支出|入出金)$/, /収支|区分|種別|type/i),
    kindMode: 'expense',
    category: find(head, /^(カテゴリ|カテゴリー|大分類|費目|項目)$/, /カテゴリ|分類|費目|category/i),
    sub: find(head, /^(小分類|サブカテゴリ|内訳)$/),
    memo: find(head, /^(メモ|内容|備考|摘要)$/, /メモ|内容|備考|memo|note/i),
    memo2: NONE,
  }
  const inc = find(head, /^収入(額|金額)?$/)
  const exp = find(head, /^支出(額|金額)?$/)
  if (inc >= 0 && exp >= 0) {
    m.kindMode = 'split'
    m.income = inc
    m.amount = exp
  } else if (m.kindCol >= 0) m.kindMode = 'column'
  if (!header) {
    // 見出しが無いとき: 日付らしい列と数字の列を探す
    const r = rows[0] ?? []
    m.date = r.findIndex((c) => parseDate(c))
    m.amount = r.findIndex((c, i) => i !== m.date && parseAmount(c) !== null)
  }
  if (m.memo === m.category) m.memo = NONE
  return m
}

interface Parsed {
  row: number
  ok: boolean
  reason?: string
  date: string
  kind: Kind
  amount: number
  catName: string
  memo: string
  dup?: boolean
}

const dupKey = (date: string, kind: Kind, amount: number, cat: string, memo: string) => `${date}|${kind}|${amount}|${cat}|${memo}`

export default function ImportView({ book, update, current }: Props) {
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<string[][]>([])
  const [map, setMap] = useState<Mapping | null>(null)
  const [skipDup, setSkipDup] = useState(true)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [kakebo, setKakebo] = useState<KakeboBackup | null>(null)
  const ledgers = liveLedgers(book)
  const [targetPick, setTargetPick] = useState(current)
  const target = targetPick !== ALL_LEDGERS && ledgers.some((l) => l.id === targetPick) ? targetPick : (ledgers[0]?.id ?? MAIN_LEDGER)

  const open = async (files: File[]) => {
    setMsg('')
    setErr('')
    setRows([])
    setMap(null)
    setKakebo(null)
    try {
      // かけ〜ぼのバックアップ(cashbook_all.csv など)なら、帳簿・費目ごとまとめて取り込む画面にする
      const kb = await readKakeboFiles(files)
      if (kb) {
        setKakebo(kb)
        return
      }
      const f = files[0]
      const r = parseCsv(decodeText(await f.arrayBuffer()))
      if (!r.length) throw new Error('中身が空です')
      setRows(r)
      setMap(guess(r))
      setFileName(f.name)
    } catch (e) {
      setErr(`読み込めませんでした: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const head = rows[0] ?? []
  const width = Math.max(0, ...rows.slice(0, 50).map((r) => r.length))
  const colName = (i: number) => (map?.header && head[i]?.trim() ? `${i + 1}列目「${head[i].trim()}」` : `${i + 1}列目${rows[map?.header ? 1 : 0]?.[i] ? `(例: ${rows[map?.header ? 1 : 0][i].slice(0, 12)})` : ''}`)

  // 取り込み済みの明細(重複の判定用)
  const existing = useMemo(() => {
    const s = new Set<string>()
    for (const e of liveEntries(book, target)) s.add(dupKey(e.date, e.kind, e.amount, book.categories[e.categoryId]?.name ?? '', e.memo))
    return s
  }, [book, target])

  const parsed: Parsed[] = useMemo(() => {
    if (!map) return []
    const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').replace(/�/g, '').trim() : '')
    return rows.slice(map.header ? 1 : 0).map((r, idx) => {
      const row = idx + (map.header ? 2 : 1)
      const date = parseDate(get(r, map.date)) ?? ''
      let kind: Kind = map.kindMode === 'income' ? 'income' : 'expense'
      let amount: number | null = parseAmount(get(r, map.amount))
      if (map.kindMode === 'column') kind = /収入|入金|income/i.test(get(r, map.kindCol)) ? 'income' : 'expense'
      if (map.kindMode === 'sign' && amount !== null) kind = amount > 0 ? 'income' : 'expense'
      if (map.kindMode === 'split') {
        const inc = parseAmount(get(r, map.income))
        if (inc) {
          kind = 'income'
          amount = inc
        }
      }
      if (amount !== null) amount = Math.abs(amount)
      const sub = get(r, map.sub)
      const memo = [sub, get(r, map.memo), get(r, map.memo2)].filter(Boolean).join(' ')
      const catName = get(r, map.category) || 'その他'
      const p: Parsed = { row, ok: true, date, kind, amount: amount ?? 0, catName, memo }
      if (!date) Object.assign(p, { ok: false, reason: '日付が読めません' })
      else if (!amount) Object.assign(p, { ok: false, reason: '金額が読めません(または0円)' })
      else if (existing.has(dupKey(date, kind, p.amount, catName, memo))) p.dup = true
      return p
    })
  }, [rows, map, existing])

  const valid = parsed.filter((p) => p.ok && !(skipDup && p.dup))
  const bad = parsed.filter((p) => !p.ok)
  const dups = parsed.filter((p) => p.ok && p.dup)

  // CSV のカテゴリ名 → 家計簿のカテゴリ(同じ名前・同じ収支のものがあれば使い、無ければ新しく作る)
  const catPlan = useMemo(() => {
    const plan = new Map<string, { kind: Kind; name: string; existing?: Category }>()
    for (const p of valid) {
      const k = `${p.kind}|${p.catName}`
      if (!plan.has(k)) plan.set(k, { kind: p.kind, name: p.catName, existing: liveCategories(book, p.kind, target).find((c) => c.name === p.catName) })
    }
    return [...plan.values()]
  }, [valid, book, target])
  const newCats = catPlan.filter((c) => !c.existing)

  const run = () => {
    if (!valid.length) return
    if (!confirm(`${valid.length}件を取り込みます。よろしいですか?\n(あとで設定画面の「取り込みの履歴」から取り消せます)`)) return
    const importId = newId('imp')
    update((b) => {
      const categories = { ...b.categories }
      const idOf = new Map<string, string>()
      let order = Math.max(0, ...Object.values(categories).map((c) => c.order)) + 1
      const palette = ['#e8833a', '#5bb57a', '#4a90d9', '#c06bc2', '#e2b33d', '#2fb3a8', '#e86b8f', '#7a7fd6', '#8d6e63', '#6d9a4a']
      for (const c of catPlan) {
        const found = c.existing ?? Object.values(categories).find((x) => !x.deleted && x.kind === c.kind && x.name === c.name && ledgerOf(x) === target)
        if (found) idOf.set(`${c.kind}|${c.name}`, found.id)
        else {
          const id = newId('c')
          categories[id] = { id, kind: c.kind, name: c.name, color: palette[order % palette.length], order: order++, ledgerId: target === MAIN_LEDGER ? undefined : target, updatedAt: stamp() }
          idOf.set(`${c.kind}|${c.name}`, id)
        }
      }
      const entries = { ...b.entries }
      for (const p of valid) {
        const e: Entry = { id: newId('e'), date: p.date, kind: p.kind, amount: p.amount, categoryId: idOf.get(`${p.kind}|${p.catName}`)!, memo: p.memo, ledgerId: target === MAIN_LEDGER ? undefined : target, updatedAt: stamp(), importId }
        entries[e.id] = e
      }
      return {
        ...b,
        categories,
        entries,
        imports: { ...b.imports, [importId]: { id: importId, at: new Date().toISOString(), fileName, count: valid.length, updatedAt: stamp() } },
      }
    })
    setMsg(`${valid.length}件を取り込みました${newCats.length ? `(カテゴリを${newCats.length}個追加)` : ''}`)
    setRows([])
    setMap(null)
  }

  const imports = Object.values(book.imports)
    .filter((i) => !i.deleted)
    .sort((a, b) => b.at.localeCompare(a.at))

  const undo = (id: string) => {
    const rec = book.imports[id]
    if (!rec || !confirm(`「${rec.fileName}」から取り込んだ明細(${rec.count}件)を削除しますか?\n(取り込み後に手で直した明細も削除されます)`)) return
    update((b) => {
      const entries = { ...b.entries }
      for (const e of Object.values(entries)) if (e.importId === id && !e.deleted) entries[e.id] = { ...e, deleted: true, updatedAt: stamp() }
      return { ...b, entries, imports: { ...b.imports, [id]: { ...b.imports[id], deleted: true, updatedAt: stamp() } } }
    })
  }

  const sel = (key: keyof Mapping, label: string, allowNone = true) =>
    map && (
      <label className="map-row">
        <span>{label}</span>
        <select value={map[key] as number} onChange={(e) => setMap({ ...map, [key]: Number(e.target.value) })}>
          {allowNone && <option value={NONE}>(使わない)</option>}
          {Array.from({ length: width }, (_, i) => (
            <option key={i} value={i}>
              {colName(i)}
            </option>
          ))}
        </select>
      </label>
    )

  return (
    <section className="card">
      <h2>CSV の取り込み(かけ〜ぼ など)</h2>
      <p className="muted">
        他の家計簿アプリで書き出した CSV ファイルを選ぶと、中身を確認してから取り込めます。取り込んでも、今ある明細は消えません。
      </p>
      <p className="muted small-note">
        かけ〜ぼ: バックアップのフォルダの <code>cashbook_all.csv</code>・<code>items.csv</code>・<code>codeName.csv</code> をまとめて選ぶ(Ctrl キーを押しながらクリック)と、帳簿・費目の色と並び順ごと取り込みます。
      </p>
      <label className="file-btn">
        CSV ファイルを選ぶ
        <input
          type="file"
          multiple
          accept=".csv,.txt,.tsv,text/csv"
          onChange={(e) => {
            const fs = [...(e.target.files ?? [])]
            e.target.value = ''
            if (fs.length) void open(fs)
          }}
          hidden
        />
      </label>
      {err && <div className="msg error">{err}</div>}
      {msg && <div className="msg ok">{msg}</div>}
      {kakebo && (
        <KakeboImport
          book={book}
          backup={kakebo}
          update={update}
          onDone={(m) => {
            setMsg(m)
            setKakebo(null)
          }}
          onCancel={() => setKakebo(null)}
        />
      )}

      {map && (
        <div className="import-box">
          <p>
            <b>{fileName}</b>({rows.length}行)
          </p>
          {ledgers.length > 1 && (
            <label className="map-row">
              <span>取り込み先の帳簿</span>
              <select value={target} onChange={(e) => setTargetPick(e.target.value)}>
                {ledgers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={map.header} onChange={(e) => setMap({ ...map, header: e.target.checked })} />
            1行目は見出し(取り込まない)
          </label>
          <div className="map-grid">
            {sel('date', '日付', false)}
            <label className="map-row">
              <span>収入・支出の見分け方</span>
              <select value={map.kindMode} onChange={(e) => setMap({ ...map, kindMode: e.target.value as KindMode })}>
                <option value="column">「収支」などの列で見分ける</option>
                <option value="split">収入と支出が別の列</option>
                <option value="sign">金額の符号(マイナスが支出)</option>
                <option value="expense">すべて支出</option>
                <option value="income">すべて収入</option>
              </select>
            </label>
            {map.kindMode === 'column' && sel('kindCol', '収支の列(「収入」を含む値が収入)', false)}
            {sel('amount', map.kindMode === 'split' ? '支出の金額' : '金額', false)}
            {map.kindMode === 'split' && sel('income', '収入の金額', false)}
            {sel('category', 'カテゴリ')}
            {sel('sub', '小分類(メモの先頭に付けます)')}
            {sel('memo', 'メモ')}
            {sel('memo2', 'メモ2(つなげます)')}
          </div>

          <div className="import-summary">
            <span className="ok-text">取り込む: {valid.length}件</span>
            {!!dups.length && (
              <label className="check">
                <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />
                すでに同じ明細(日付・収支・金額・カテゴリ・メモが同じ)がある {dups.length}件を飛ばす
              </label>
            )}
            {!!bad.length && <span className="error-text">読めない行: {bad.length}件(取り込みません)</span>}
          </div>
          {!!newCats.length && (
            <p className="muted">
              新しく作るカテゴリ: {newCats.map((c) => `${c.name}(${KIND_LABEL[c.kind]})`).join('、')}
            </p>
          )}

          <div className="table-wrap">
            <table className="preview">
              <thead>
                <tr>
                  <th>行</th>
                  <th>日付</th>
                  <th>収支</th>
                  <th>カテゴリ</th>
                  <th className="num">金額</th>
                  <th>メモ</th>
                </tr>
              </thead>
              <tbody>
                {[...bad.slice(0, 5), ...parsed.filter((p) => p.ok).slice(0, 15)].map((p) => (
                  <tr key={p.row} className={!p.ok ? 'bad' : p.dup && skipDup ? 'dup' : ''}>
                    <td>{p.row}</td>
                    <td>{p.date || '—'}</td>
                    <td>{KIND_LABEL[p.kind]}</td>
                    <td>{p.catName}</td>
                    <td className="num">{p.ok ? <Money value={p.amount} kind={p.kind} /> : '—'}</td>
                    <td>{p.ok ? (p.dup ? `(重複) ${p.memo}` : p.memo) : p.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small-note">先頭の一部だけを表示しています(赤=読めない行、灰色=重複で飛ばす行)</p>
          <div className="form-actions">
            <button type="button" className="ghost" onClick={() => (setRows([]), setMap(null))}>
              やめる
            </button>
            <span className="spacer" />
            <button type="button" disabled={!valid.length} onClick={run}>
              {valid.length}件を取り込む
            </button>
          </div>
        </div>
      )}

      {!!imports.length && (
        <>
          <h3>取り込みの履歴</h3>
          <ul className="plain-list">
            {imports.map((i) => (
              <li key={i.id}>
                {new Date(i.at).toLocaleString('ja-JP')} 「{i.fileName}」 {i.count}件
                <button type="button" className="ghost small" onClick={() => undo(i.id)}>
                  この取り込みを取り消す
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
