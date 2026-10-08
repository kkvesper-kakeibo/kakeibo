// 開発用の ?demo: 架空の Google ログイン・架空のドライブ(localStorage)・架空の明細で動かす。
// 本番ビルドには含まれない。?demo=reset で架空データを作り直す
import { switchToDemoDb } from '../lib/idb'
import { emptyBook, newId, parseBook, sortBook, stamp, type Book, type Entry } from '../lib/model'
import { addDays, ymd } from '../lib/dates'
import type { RemoteApi } from '../lib/useBook'

const REMOTE = 'kakeibo-demo-remote'
const log: string[] = []

function sample(): Book {
  const b = emptyBook()
  const today = new Date()
  const items: [string, string, number[], string[]][] = [
    ['e-food', 'expense', [380, 1250, 2980, 640, 1830], ['スーパー', 'パン屋', 'コンビニ', '八百屋']],
    ['e-eatout', 'expense', [980, 1500, 4200], ['ランチ', '定食屋', '飲み会']],
    ['e-daily', 'expense', [298, 1100, 540], ['ドラッグストア', '100円ショップ']],
    ['e-transport', 'expense', [220, 440, 1200], ['電車', 'バス']],
    ['e-hobby', 'expense', [1800, 3300], ['本', '映画']],
  ]
  let seed = 7
  const rnd = (n: number) => ((seed = (seed * 9301 + 49297) % 233280) / 233280) * n
  for (let i = 0; i < 70; i++) {
    const d = ymd(addDays(today, -Math.floor(rnd(60))))
    const [cat, , amounts, memos] = items[Math.floor(rnd(items.length))]
    const e: Entry = { id: newId('e'), date: d, kind: 'expense', amount: amounts[Math.floor(rnd(amounts.length))], categoryId: cat, memo: memos[Math.floor(rnd(memos.length))], updatedAt: stamp() }
    b.entries[e.id] = e
  }
  for (let k = 0; k < 2; k++) {
    const d = new Date(today.getFullYear(), today.getMonth() - k, 25)
    const fixed: [string, string, number, string][] = [
      ['i-salary', 'income', 285000, '給料'],
      ['e-house', 'expense', 72000, '家賃'],
      ['e-utility', 'expense', 8400, '電気・ガス'],
      ['e-phone', 'expense', 3980, 'スマホ'],
    ]
    for (const [cat, kind, amount, memo] of fixed) {
      const e: Entry = { id: newId('e'), date: ymd(d), kind: kind as Entry['kind'], amount, categoryId: cat, memo, updatedAt: stamp() }
      b.entries[e.id] = e
    }
  }
  return b
}

export async function installDemo() {
  switchToDemoDb()
  const reset = new URLSearchParams(location.search).get('demo') === 'reset'
  if (reset) {
    localStorage.removeItem(REMOTE)
    localStorage.removeItem('kakeibo.loggedIn')
    await new Promise((r) => {
      const req = indexedDB.deleteDatabase('kakeibo-demo')
      req.onsuccess = req.onerror = req.onblocked = r
    })
  }
  if (!localStorage.getItem(REMOTE)) localStorage.setItem(REMOTE, JSON.stringify(sortBook(sample())))

  // 架空の Google ログイン
  const w = window as unknown as Record<string, unknown>
  w.google = {
    accounts: {
      oauth2: {
        initTokenClient: (cfg: { callback: (r: unknown) => void; scope: string }) => ({
          requestAccessToken: () => {
            log.push('login')
            setTimeout(() => cfg.callback({ access_token: 'demo', expires_in: 3600, scope: cfg.scope }), 50)
          },
        }),
        hasGrantedAllScopes: () => true,
        revoke: (_t: string, done?: () => void) => done?.(),
      },
    },
  }

  // 架空のドライブ
  const snapshots: string[] = []
  const remote: RemoteApi = {
    async load() {
      log.push('load')
      const t = localStorage.getItem(REMOTE)
      return t ? parseBook(t) : null
    },
    async save(_t, _st, book) {
      log.push('save')
      localStorage.setItem(REMOTE, JSON.stringify(sortBook(book)))
    },
    async snapshot(_t, _st, _b, date) {
      log.push(`snapshot ${date}`)
      snapshots.push(date)
      return true
    },
  }
  w.__kakeiboDemoRemote = remote
  w.__demoLog = log
  // 「別の端末(スマホ)で入力した」ことにする: ドライブ側にだけ明細を足す
  w.__demoOtherDevice = (memo = 'スマホで入力', amount = 500) => {
    const b = parseBook(localStorage.getItem(REMOTE)!)
    const e: Entry = { id: newId('e'), date: ymd(new Date()), kind: 'expense', amount, categoryId: 'e-food', memo, updatedAt: stamp() }
    b.entries[e.id] = e
    localStorage.setItem(REMOTE, JSON.stringify(sortBook(b)))
    return e.id
  }
  w.__demoRemoteBook = () => parseBook(localStorage.getItem(REMOTE)!)
}
