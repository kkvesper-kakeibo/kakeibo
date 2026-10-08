// かけ〜ぼ(Android 版)の「CSV バックアップ」の読み取り
//
// バックアップのフォルダには次のファイルがある(文字コードは Shift_JIS):
//   cashbook_all.csv … 明細。No,日付(20261004),収入,支出,費目名,収支区分(収入/支出),メモ,帳簿コード,…
//   items.csv        … 費目(カテゴリ)。費目,利用回数,色(R),色(G),色(B),金額,帳簿コード,並び順,…
//   codeName.csv     … 帳簿。帳簿コード,帳簿名
// (cashbook.csv は件数などの情報だけ。ほかの予算・カード・固定費などは今は使わない)
import { decodeText, parseCsv } from './csv'
import { ledgerOf, MAIN_LEDGER, newId, stamp, type Book, type Entry, type Kind } from './model'

export interface KakeboEntry {
  no: string
  date: string // 2026-10-04
  kind: Kind
  amount: number
  item: string
  memo: string
  code: string // 帳簿コード
}

export interface KakeboItem {
  name: string
  color: string
  order: number
  uses: number
  code: string
}

export interface KakeboBackup {
  entries: KakeboEntry[]
  items: KakeboItem[]
  ledgers: { code: string; name: string }[]
  skipped: number // 読めなかった行
  fileNames: string[]
}

// Shift_JIS で表せない文字(絵文字など)は、かけ〜ぼが書き出すときに壊れて「�」になるので取り除く
const clean = (s: string) => s.replace(/�/g, '').trim()

const hex = (n: string) => Math.max(0, Math.min(255, Number(n) || 0)).toString(16).padStart(2, '0')

const isHeader = (row: string[] | undefined, ...cols: string[]) => !!row && cols.every((c, i) => row[i]?.trim() === c)

export const isKakeboCashbook = (rows: string[][]) => isHeader(rows[0], 'No', '日付', '収入', '支出', '費目名', '収支区分')

/** 選ばれたファイル(複数可)の中から、かけ〜ぼのバックアップを読み取る。明細のファイルが無ければ null */
export async function readKakeboFiles(files: File[]): Promise<KakeboBackup | null> {
  let cash: string[][] | null = null
  let items: string[][] = []
  let codes: string[][] = []
  const used: string[] = []
  for (const f of files) {
    const rows = parseCsv(decodeText(await f.arrayBuffer()))
    if (isKakeboCashbook(rows)) {
      // cashbook.csv(件数だけ)と cashbook_all.csv(全明細)の両方があれば、行の多いほう
      if (!cash || rows.length > cash.length) cash = rows
      used.push(f.name)
    } else if (isHeader(rows[0], '費目', '利用回数')) {
      items = rows
      used.push(f.name)
    } else if (isHeader(rows[0], '帳簿コード', '帳簿名')) {
      codes = rows
      used.push(f.name)
    }
  }
  if (!cash) return null
  return { ...parseKakebo(cash, items, codes), fileNames: used }
}

export function parseKakebo(cash: string[][], items: string[][], codes: string[][]): Omit<KakeboBackup, 'fileNames'> {
  const entries: KakeboEntry[] = []
  let skipped = 0
  for (const r of cash.slice(1)) {
    const [no, d, inc, exp, item, kindText, memo, code] = r
    if (no === '9999999' || d === '99991231') continue // 件数などの情報の行
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(d?.trim() ?? '')
    const kind: Kind = kindText?.trim() === '収入' ? 'income' : 'expense'
    const amount = Math.round(Math.abs(Number((kind === 'income' ? inc : exp)?.replace(/,/g, '')) || Number((inc || exp)?.replace(/,/g, '')) || 0))
    if (!m || !amount) {
      skipped++
      continue
    }
    entries.push({ no, date: `${m[1]}-${m[2]}-${m[3]}`, kind, amount, item: clean(item ?? '') || 'その他', memo: clean(memo ?? ''), code: (code ?? '0').trim() || '0' })
  }
  const itemList: KakeboItem[] = items.slice(1).map((r) => ({
    name: clean(r[0] ?? ''),
    uses: Number(r[1]) || 0,
    // 黒(0,0,0)は かけ〜ぼ で色を付けていない費目。暗い画面で見えないので、取り込むときに色を割り当てる
    color: `#${hex(r[2])}${hex(r[3])}${hex(r[4])}`.replace('#000000', ''),
    code: (r[6] ?? '0').trim() || '0',
    order: Number(r[7]) || 0,
  }))
  const ledgers = codes
    .slice(1)
    .map((r) => ({ code: (r[0] ?? '').trim(), name: clean(r[1] ?? '') }))
    .filter((l) => l.code !== '')
  // 帳簿の一覧に無いコードの明細があれば、仮の名前で足す
  for (const c of new Set(entries.map((e) => e.code))) if (!ledgers.some((l) => l.code === c)) ledgers.push({ code: c, name: `帳簿${c}` })
  return { entries, items: itemList.filter((i) => i.name), ledgers, skipped }
}

export interface KakeboOptions {
  /** 帳簿コード → 取り込み先の帳簿 ID('new' なら同じ名前の帳簿を新しく作る) */
  ledgerMap: Record<string, string>
  /** すでに同じ明細(帳簿・日付・収支・金額・カテゴリ名・メモ)があれば飛ばす */
  skipDup: boolean
  /** 最初から用意しているカテゴリのうち、かけ〜ぼに無く明細も無いものを隠す */
  hideUnusedDefaults: boolean
  /** カテゴリを使う回数の多い順に並べる */
  sortByUse: boolean
  /** 最近2年間使っていないカテゴリを隠す(過去の明細の表示には使う) */
  hideOld: boolean
  fileName: string
}

export interface KakeboStats {
  perLedger: { code: string; name: string; target: string; count: number; dup: number; from: string; to: string }[]
  total: number
  dup: number
  newCategories: number
  hiddenUnusedItems: number // 明細で使われていない費目(隠して作る)
  hiddenDefaults: number
  hiddenOld: number
}

/** 取り込んだ結果のデータと、その内訳を返す(元のデータは変えない。プレビューにも使う) */
export function applyKakebo(book: Book, kb: KakeboBackup, opt: KakeboOptions): { book: Book; stats: KakeboStats } {
  const ledgers = { ...book.ledgers }
  const categories = { ...book.categories }
  const entries = { ...book.entries }
  const importId = newId('imp')

  // 帳簿
  const target = new Map<string, string>()
  let lOrder = Math.max(0, ...Object.values(ledgers).map((l) => l.order)) + 1
  for (const l of kb.ledgers) {
    let id = opt.ledgerMap[l.code] ?? 'new'
    if (id === 'new' || !ledgers[id] || ledgers[id].deleted) {
      id = newId('l')
      ledgers[id] = { id, name: l.name, order: lOrder++, updatedAt: stamp() }
    }
    target.set(l.code, id)
  }

  // カテゴリ: 帳簿・収支・名前が同じものがあれば使い、無ければ作る(色・並び順は かけ〜ぼ の費目から)
  const itemOf = new Map(kb.items.map((i) => [`${i.code}|${i.name}`, i]))
  const catKey = (ledgerId: string, kind: Kind, name: string) => `${ledgerId}|${kind}|${name}`
  const catIndex = new Map<string, string>()
  for (const c of Object.values(categories)) if (!c.deleted) catIndex.set(catKey(ledgerOf(c), c.kind, c.name), c.id)
  let newCategories = 0
  const palette = ['#e8833a', '#5bb57a', '#4a90d9', '#c06bc2', '#e2b33d', '#2fb3a8', '#e86b8f', '#7a7fd6', '#8d6e63', '#6d9a4a', '#3fa7d6', '#d9534f', '#ab8b2f', '#546e7a']
  const ensureCat = (code: string, kind: Kind, name: string, hidden = false) => {
    const lid = target.get(code)!
    const k = catKey(lid, kind, name)
    const found = catIndex.get(k)
    if (found) return found
    const it = itemOf.get(`${code}|${name}`)
    const id = newId('c')
    categories[id] = {
      id,
      kind,
      name,
      color: it?.color || palette[newCategories % palette.length],
      order: 1000 + (it?.order ?? 9000),
      ledgerId: lid === MAIN_LEDGER ? undefined : lid,
      hidden: hidden || undefined,
      updatedAt: stamp(),
    }
    catIndex.set(k, id)
    newCategories++
    return id
  }

  // 重複の判定用(帳簿・日付・収支・金額・カテゴリ名・メモ)
  const dupKey = (lid: string, date: string, kind: Kind, amount: number, cat: string, memo: string) => [lid, date, kind, amount, cat, memo].join('|')
  const existing = new Set<string>()
  for (const e of Object.values(entries)) {
    if (e.deleted) continue
    existing.add(dupKey(ledgerOf(e), e.date, e.kind, e.amount, categories[e.categoryId]?.name ?? '', e.memo))
  }

  const per = new Map<string, KakeboStats['perLedger'][number]>()
  for (const l of kb.ledgers) per.set(l.code, { code: l.code, name: l.name, target: ledgers[target.get(l.code)!].name, count: 0, dup: 0, from: '', to: '' })
  let total = 0
  let dup = 0
  for (const k of [...kb.entries].sort((a, b) => a.date.localeCompare(b.date) || Number(a.no) - Number(b.no))) {
    const lid = target.get(k.code)!
    const p = per.get(k.code)!
    if (existing.has(dupKey(lid, k.date, k.kind, k.amount, k.item, k.memo))) {
      p.dup++
      dup++
      if (opt.skipDup) continue
    }
    const e: Entry = {
      id: newId('e'),
      date: k.date,
      kind: k.kind,
      amount: k.amount,
      categoryId: ensureCat(k.code, k.kind, k.item),
      memo: k.memo,
      ledgerId: lid === MAIN_LEDGER ? undefined : lid,
      importId,
      updatedAt: stamp(),
    }
    entries[e.id] = e
    p.count++
    p.from ||= k.date
    p.to = k.date
    total++
  }

  // 明細で使われていない費目も、隠した支出カテゴリとして作っておく(設定のカテゴリで「隠す」を外せば使える)
  let hiddenUnusedItems = 0
  for (const it of kb.items) {
    if (!target.has(it.code)) continue
    const lid = target.get(it.code)!
    if (catIndex.has(catKey(lid, 'expense', it.name)) || catIndex.has(catKey(lid, 'income', it.name))) continue
    ensureCat(it.code, 'expense', it.name, true)
    hiddenUnusedItems++
  }

  // 最初から用意しているカテゴリ(一度も変更していないもの)のうち、明細が無いものを隠す
  let hiddenDefaults = 0
  if (opt.hideUnusedDefaults) {
    const usedCats = new Set(Object.values(entries).filter((e) => !e.deleted).map((e) => e.categoryId))
    const touched = new Set(target.values())
    for (const c of Object.values(categories)) {
      if (c.updatedAt === 0 && !c.deleted && !c.hidden && !usedCats.has(c.id) && touched.has(ledgerOf(c))) {
        categories[c.id] = { ...c, hidden: true, updatedAt: stamp() }
        hiddenDefaults++
      }
    }
  }

  const touchedLedgers = new Set(target.values())
  if (opt.sortByUse) Object.assign(categories, sortCategoriesByUse({ ...book, categories, entries }, touchedLedgers))

  let hiddenOld = 0
  if (opt.hideOld) {
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - 2)
    const limit = cutoff.toISOString().slice(0, 10)
    const last = new Map<string, string>()
    for (const e of Object.values(entries)) if (!e.deleted && (last.get(e.categoryId) ?? '') < e.date) last.set(e.categoryId, e.date)
    for (const c of Object.values(categories)) {
      const d = last.get(c.id)
      if (d && d < limit && !c.deleted && !c.hidden && touchedLedgers.has(ledgerOf(c))) {
        categories[c.id] = { ...c, hidden: true, updatedAt: stamp() }
        hiddenOld++
      }
    }
  }

  const imports = total ? { ...book.imports, [importId]: { id: importId, at: new Date().toISOString(), fileName: opt.fileName, count: total, updatedAt: stamp() } } : book.imports
  return {
    book: { ...book, ledgers, categories, entries, imports },
    stats: { perLedger: [...per.values()], total, dup, newCategories, hiddenUnusedItems, hiddenDefaults, hiddenOld },
  }
}

/** 指定した帳簿のカテゴリを、明細で使った回数の多い順(同じなら今の順)に並べ直す。変わったカテゴリだけを返す */
export function sortCategoriesByUse(book: Book, ledgerIds: Set<string>): Record<string, Book['categories'][string]> {
  const uses = new Map<string, number>()
  for (const e of Object.values(book.entries)) if (!e.deleted) uses.set(e.categoryId, (uses.get(e.categoryId) ?? 0) + 1)
  const changed: Record<string, Book['categories'][string]> = {}
  for (const lid of ledgerIds) {
    for (const kind of ['expense', 'income'] as Kind[]) {
      const list = Object.values(book.categories)
        .filter((c) => !c.deleted && c.kind === kind && ledgerOf(c) === lid)
        .sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.order - b.order || a.name.localeCompare(b.name, 'ja'))
      list.forEach((c, i) => {
        if (c.order !== i) changed[c.id] = { ...c, order: i, updatedAt: stamp() }
      })
    }
  }
  return changed
}
