// かけ〜ぼのバックアップの取り込み: 帳簿ごとの取り込み先を選び、内訳を確認してから取り込む
import { useMemo, useState } from 'react'
import { applyKakebo, type KakeboBackup } from '../lib/kakebo'
import { liveEntries, liveLedgers, MAIN_LEDGER, ledgerOf, type Book } from '../lib/model'

interface Props {
  book: Book
  backup: KakeboBackup
  update: (fn: (b: Book) => Book) => void
  onDone: (msg: string) => void
  onCancel: () => void
}

const jp = (d: string) => (d ? d.replace(/-/g, '/') : '—')

export default function KakeboImport({ book, backup, update, onDone, onCancel }: Props) {
  const ledgers = liveLedgers(book)
  const counts = new Map<string, number>()
  for (const e of liveEntries(book)) counts.set(ledgerOf(e), (counts.get(ledgerOf(e)) ?? 0) + 1)

  // 初期値: 帳簿コード 0(かけ〜ぼの最初の帳簿)→ この家計簿の最初の帳簿、ほかは同じ名前の帳簿があればそれ、無ければ新しく作る
  const [ledgerMap, setLedgerMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      backup.ledgers.map((l) => [l.code, ledgers.find((x) => x.name === l.name)?.id ?? (l.code === '0' ? (ledgers[0]?.id ?? MAIN_LEDGER) : 'new')]),
    ),
  )
  const [skipDup, setSkipDup] = useState(true)
  const [hideDefaults, setHideDefaults] = useState(true)
  const [sortByUse, setSortByUse] = useState(true)
  const [hideOld, setHideOld] = useState(true)
  const fileName = `かけ〜ぼ(${backup.fileNames.join('・')})`

  const preview = useMemo(
    () => applyKakebo(book, backup, { ledgerMap, skipDup, hideUnusedDefaults: hideDefaults, sortByUse, hideOld, fileName }).stats,
    [book, backup, ledgerMap, skipDup, hideDefaults, sortByUse, hideOld, fileName],
  )
  const kbCount = (code: string) => backup.entries.filter((e) => e.code === code).length

  // 2つの帳簿を同じ取り込み先にしていないか(できるが、混ざるので注意を出す)
  const targets = Object.values(ledgerMap).filter((v) => v !== 'new')
  const merged = targets.length !== new Set(targets).size

  const run = () => {
    if (!preview.total) return
    if (!confirm(`かけ〜ぼの明細 ${preview.total.toLocaleString()}件を取り込みます。よろしいですか?\n(あとで「取り込みの履歴」から取り消せます)`)) return
    let total = 0
    update((b) => {
      const r = applyKakebo(b, backup, { ledgerMap, skipDup, hideUnusedDefaults: hideDefaults, sortByUse, hideOld, fileName })
      total = r.stats.total
      return r.book
    })
    onDone(`かけ〜ぼの明細 ${total.toLocaleString()}件を取り込みました`)
  }

  return (
    <div className="import-box">
      <p>
        <b>かけ〜ぼのバックアップ</b>(読み込んだファイル: {backup.fileNames.join('、')})
      </p>
      <p className="muted">
        明細 {backup.entries.length.toLocaleString()}件・費目 {backup.items.length}個・帳簿 {backup.ledgers.length}つ
        {backup.skipped > 0 && <span className="error-text">・読めない行 {backup.skipped}件(取り込みません)</span>}
      </p>
      {!backup.fileNames.some((n) => /items/i.test(n)) && <p className="muted small-note">items.csv が無いので、カテゴリの色・並び順は引き継ぎません。</p>}

      <div className="table-wrap">
        <table className="preview">
          <thead>
            <tr>
              <th>かけ〜ぼの帳簿</th>
              <th className="num">件数</th>
              <th>取り込み先</th>
              <th className="num">取り込む</th>
              <th>期間</th>
            </tr>
          </thead>
          <tbody>
            {backup.ledgers.map((l) => {
              const p = preview.perLedger.find((x) => x.code === l.code)
              return (
                <tr key={l.code}>
                  <td>{l.name}</td>
                  <td className="num">{kbCount(l.code).toLocaleString()}</td>
                  <td>
                    <select value={ledgerMap[l.code]} onChange={(e) => setLedgerMap({ ...ledgerMap, [l.code]: e.target.value })}>
                      {ledgers.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}(今 {counts.get(x.id) ?? 0}件)
                        </option>
                      ))}
                      <option value="new">新しい帳簿「{l.name}」を作る</option>
                    </select>
                  </td>
                  <td className="num">
                    {(p?.count ?? 0).toLocaleString()}
                    {!!p?.dup && <span className="muted">(重複 {p.dup})</span>}
                  </td>
                  <td>
                    {jp(p?.from ?? '')} 〜 {jp(p?.to ?? '')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {merged && <div className="msg error">2つ以上のかけ〜ぼの帳簿を、同じ帳簿に取り込もうとしています(明細が混ざります)。</div>}

      {!!preview.dup && (
        <label className="check">
          <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />
          すでに同じ明細(帳簿・日付・収支・金額・カテゴリ・メモが同じ)がある {preview.dup.toLocaleString()}件を飛ばす
        </label>
      )}
      <label className="check">
        <input type="checkbox" checked={hideDefaults} onChange={(e) => setHideDefaults(e.target.checked)} />
        最初から用意していたカテゴリのうち、使っていないものを隠す(入力画面をかけ〜ぼと同じ並びにする)
      </label>
      <label className="check">
        <input type="checkbox" checked={sortByUse} onChange={(e) => setSortByUse(e.target.checked)} />
        カテゴリを、使う回数の多い順に並べる(入力画面で探しやすくする)
      </label>
      <label className="check">
        <input type="checkbox" checked={hideOld} onChange={(e) => setHideOld(e.target.checked)} />
        最近2年間使っていないカテゴリを隠す(過去の明細はそのまま表示されます)
      </label>
      <p className="muted small-note">
        カテゴリを {preview.newCategories}個 作ります(うち明細で使っていない費目 {preview.hiddenUnusedItems}個は「隠す」にして作ります。設定のカテゴリで戻せます)。
        {hideDefaults && preview.hiddenDefaults > 0 && ` 最初から用意していたカテゴリ ${preview.hiddenDefaults}個を隠します。`}
        {hideOld && preview.hiddenOld > 0 && ` 最近2年間使っていないカテゴリ ${preview.hiddenOld}個を隠します。`}
      </p>

      <div className="form-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          やめる
        </button>
        <span className="spacer" />
        <button type="button" disabled={!preview.total} onClick={run}>
          {preview.total.toLocaleString()}件を取り込む
        </button>
      </div>
    </div>
  )
}
