// 家計簿データの形と、2台以上の端末で書き換えたデータの「合わせ方」
//
// 方針: 消さない・失わない
// - 明細とカテゴリはそれぞれ ID を持ち、変更のたびに updatedAt(時刻)を更新する
// - 削除は「削除済みの印(deleted)」を付けるだけで、データからは取り除かない
// - 2つのデータを合わせるときは、ID ごとに updatedAt が新しいほうを採用する
//   → どの端末で、どの順番で合わせても同じ結果になる(片方の変更が消えない)

export type Kind = 'expense' | 'income'

export interface Entry {
  id: string
  date: string // 2026-10-09
  kind: Kind
  amount: number // 円(正の整数)
  categoryId: string
  memo: string
  updatedAt: number
  deleted?: true
  importId?: string // CSV から取り込んだ明細(取り込み単位で取り消せるように)
  ledgerId?: string // 帳簿(無ければ最初の帳簿 MAIN_LEDGER)
}

export interface Category {
  id: string
  kind: Kind
  name: string
  color: string
  order: number
  hidden?: boolean // 入力画面に出さない(過去の明細の表示には使う)
  ledgerId?: string // 帳簿(無ければ最初の帳簿 MAIN_LEDGER)
  updatedAt: number
  deleted?: true
}

/** 帳簿(かけ〜ぼ の「帳簿」と同じ。家計・仕事などを分けて記録する) */
export interface Ledger {
  id: string
  name: string
  order: number
  updatedAt: number
  deleted?: true
}

export interface ImportRecord {
  id: string
  at: string // 取り込んだ日時
  fileName: string
  count: number
  updatedAt: number
  deleted?: true // 取り消した
}

export interface Book {
  format: 'kakeibo'
  version: 1
  entries: Record<string, Entry>
  categories: Record<string, Category>
  imports: Record<string, ImportRecord>
  ledgers: Record<string, Ledger>
}

/** 最初の帳簿(帳簿の指定が無い明細・カテゴリはこの帳簿のもの) */
export const MAIN_LEDGER = 'l-main'
export const ledgerOf = (x: { ledgerId?: string }) => x.ledgerId ?? MAIN_LEDGER

export const liveLedgers = (b: Book) =>
  Object.values(b.ledgers)
    .filter((l) => !l.deleted)
    .sort((x, y) => x.order - y.order || x.name.localeCompare(y.name, 'ja'))

export const KIND_LABEL: Record<Kind, string> = { expense: '支出', income: '収入' }

// 最初から用意するカテゴリ。ID を固定しておくと、2台の端末がそれぞれ最初に作っても重複しない
const DEFAULTS: [Kind, string, string, string][] = [
  ['expense', 'e-food', '食費', '#e8833a'],
  ['expense', 'e-eatout', '外食', '#d9534f'],
  ['expense', 'e-daily', '日用品', '#5bb57a'],
  ['expense', 'e-transport', '交通費', '#4a90d9'],
  ['expense', 'e-clothes', '衣服・美容', '#c06bc2'],
  ['expense', 'e-social', '交際費', '#e2b33d'],
  ['expense', 'e-hobby', '趣味・娯楽', '#2fb3a8'],
  ['expense', 'e-medical', '医療', '#e86b8f'],
  ['expense', 'e-utility', '水道・光熱費', '#3fa7d6'],
  ['expense', 'e-phone', '通信費', '#7a7fd6'],
  ['expense', 'e-house', '住居', '#8d6e63'],
  ['expense', 'e-insurance', '保険', '#6d9a4a'],
  ['expense', 'e-tax', '税金', '#9e9e9e'],
  ['expense', 'e-car', '車', '#546e7a'],
  ['expense', 'e-education', '教育', '#ab8b2f'],
  ['expense', 'e-other', 'その他', '#a0a4ab'],
  ['income', 'i-salary', '給料', '#2f7fd9'],
  ['income', 'i-bonus', '賞与', '#2fb3a8'],
  ['income', 'i-extra', '臨時収入', '#5bb57a'],
  ['income', 'i-other', 'その他', '#a0a4ab'],
]

export function emptyBook(): Book {
  const categories: Record<string, Category> = {}
  DEFAULTS.forEach(([kind, id, name, color], i) => {
    categories[id] = { id, kind, name, color, order: i, updatedAt: 0 }
  })
  return { format: 'kakeibo', version: 1, entries: {}, categories, imports: {}, ledgers: { [MAIN_LEDGER]: { id: MAIN_LEDGER, name: '家計簿', order: 0, updatedAt: 0 } } }
}

export const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(2)).reduce((s, n) => s + n.toString(36), '')}`

/** 時刻を必ず前に進める(同じミリ秒に2回変更しても、後の変更が勝つように) */
let lastStamp = 0
export function stamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1)
  return lastStamp
}

type Stamped = { updatedAt: number }

function mergeMap<T extends Stamped>(a: Record<string, T>, b: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = { ...a }
  for (const [id, v] of Object.entries(b)) {
    const cur = out[id]
    // 同じ時刻なら、内容で決める(どちら側から合わせても同じ結果にするため)
    if (!cur || v.updatedAt > cur.updatedAt || (v.updatedAt === cur.updatedAt && JSON.stringify(v) > JSON.stringify(cur))) out[id] = v
  }
  return out
}

/** 2つの家計簿データを合わせる(どちらの変更も残す) */
export function mergeBooks(a: Book, b: Book): Book {
  return {
    format: 'kakeibo',
    version: 1,
    entries: mergeMap(a.entries, b.entries),
    categories: mergeMap(a.categories, b.categories),
    imports: mergeMap(a.imports ?? {}, b.imports ?? {}),
    ledgers: mergeMap(a.ledgers ?? {}, b.ledgers ?? {}),
  }
}

/** 読み込んだ JSON が家計簿データか確かめ、足りない項目を補う */
export function parseBook(text: string): Book {
  const raw = JSON.parse(text) as Partial<Book>
  if (raw?.format !== 'kakeibo' || typeof raw.entries !== 'object') throw new Error('家計簿データのファイルではありません')
  return mergeBooks(emptyBook(), { format: 'kakeibo', version: 1, entries: raw.entries ?? {}, categories: raw.categories ?? {}, imports: raw.imports ?? {}, ledgers: raw.ledgers ?? {} })
}

/** 内容が同じか(保存・送信が必要かの判定) */
export const sameBook = (a: Book, b: Book) => JSON.stringify(sortBook(a)) === JSON.stringify(sortBook(b))

const sortObj = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))

/** 保存用: ID 順に並べる(差分が見やすく、同じ内容なら同じファイルになる) */
export const sortBook = (b: Book): Book => ({
  format: 'kakeibo',
  version: 1,
  entries: sortObj(b.entries),
  categories: sortObj(b.categories),
  imports: sortObj(b.imports),
  ledgers: sortObj(b.ledgers),
})

/** 削除されていない明細。ledger を指定するとその帳簿だけ('all' または省略で全帳簿) */
export const liveEntries = (b: Book, ledger?: string) =>
  Object.values(b.entries).filter((e) => !e.deleted && (!ledger || ledger === ALL_LEDGERS || ledgerOf(e) === ledger))

/** 「すべての帳簿」をまとめて見るときの指定 */
export const ALL_LEDGERS = 'all'

export const liveCategories = (b: Book, kind?: Kind, ledger?: string) =>
  Object.values(b.categories)
    .filter((c) => !c.deleted && (!kind || c.kind === kind) && (!ledger || ledger === ALL_LEDGERS || ledgerOf(c) === ledger))
    .sort((x, y) => x.order - y.order || x.name.localeCompare(y.name, 'ja'))

export const yen = (n: number) => `${n < 0 ? '-' : ''}¥${Math.abs(n).toLocaleString('ja-JP')}`

/** 電卓のように入力された金額(例 "1,200+340") を計算する。整数の円にする */
export function evalAmount(text: string): number | null {
  const s = text.replace(/[,，\s円¥￥]/g, '').replace(/[０-９＋－×÷＊／（）．]/g, (c) => '0123456789+-*/*/().'['０１２３４５６７８９＋－×÷＊／（）．'.indexOf(c)]).replace(/[×x]/g, '*').replace(/÷/g, '/')
  if (!s || !/^[\d+\-*/().]+$/.test(s)) return null
  // 四則演算と括弧だけの簡単な計算(画面の安全設定で eval は使えないため自前で計算する)
  let i = 0
  const num = (): number => {
    if (s[i] === '(') {
      i++
      const v = expr()
      if (s[i++] !== ')') throw new Error()
      return v
    }
    if (s[i] === '-') {
      i++
      return -num()
    }
    const m = /^\d+(\.\d+)?/.exec(s.slice(i))
    if (!m) throw new Error()
    i += m[0].length
    return Number(m[0])
  }
  const term = (): number => {
    let v = num()
    while (s[i] === '*' || s[i] === '/') v = s[i++] === '*' ? v * num() : v / num()
    return v
  }
  const expr = (): number => {
    let v = term()
    while (s[i] === '+' || s[i] === '-') v = s[i++] === '+' ? v + term() : v - term()
    return v
  }
  try {
    const v = expr()
    if (i !== s.length || !Number.isFinite(v)) return null
    return Math.round(v)
  } catch {
    return null
  }
}
