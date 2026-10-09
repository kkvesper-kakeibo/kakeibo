import { useState } from 'react'
import type { BookApi } from '../lib/useBook'
import { canPickFolder, pickRoot } from '../lib/backup'
import { bookToCsv, downloadText } from '../lib/csv'
import { ALL_LEDGERS, emptyBook, KIND_LABEL, ledgerOf, liveCategories, liveEntries, liveLedgers, MAIN_LEDGER, mergeBooks, newId, parseBook, sameBook, sortBook, stamp, type Book, type Kind } from '../lib/model'
import { ymd } from '../lib/dates'
import { versionDetail } from '../lib/version'
import ImportView from './ImportView'
import { sortCategoriesByUse } from '../lib/kakebo'

export type Theme = 'auto' | 'light' | 'dark'

interface Props {
  api: BookApi
  book: Book
  theme: Theme
  setTheme: (t: Theme) => void
  ledger: string
  weekStart: number
  setWeekStart: (n: number) => void
}

const fmt = (iso: string) => (iso ? new Date(iso).toLocaleString('ja-JP') : 'まだありません')

export default function SettingsView({ api, book, theme, setTheme, ledger, weekStart, setWeekStart }: Props) {
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const count = liveEntries(book).length

  const importJson = async (f: File) => {
    setMsg('')
    setErr('')
    try {
      const other = parseBook(await f.text())
      const merged = mergeBooks(book, other)
      if (sameBook(merged, book)) return setMsg('新しい内容はありませんでした(すべて取り込み済みです)')
      const added = liveEntries(merged).length - count
      if (!confirm(`「${f.name}」の内容を今のデータに合わせます(今の明細は消えません)。\n明細の増減: ${added >= 0 ? '+' : ''}${added}件\nよろしいですか?`)) return
      api.update((b) => mergeBooks(b, other))
      setMsg('バックアップの内容を合わせました')
    } catch (e) {
      setErr(`読み込めませんでした: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="settings">
      <section className="card">
        <h2>Google ドライブとの同期</h2>
        <p className="muted">
          家計簿のデータは、あなたの Google ドライブの「家計簿アプリ」フォルダに保存し、PC とスマホで同じ内容を使います。このアプリはドライブの他のファイルは見られません。
        </p>
        {api.token ? (
          <>
            <p>
              状態: <b>{api.status === 'syncing' ? '同期中…' : api.status === 'error' ? 'エラー' : 'ログイン中'}</b>
              {api.dirty && '(まだ送っていない変更があります)'}
            </p>
            <p className="muted">最後に同期した時刻: {fmt(api.syncedAt)}</p>
            <div className="btn-row">
              <button type="button" onClick={() => api.sync()}>
                今すぐ同期
              </button>
              <button type="button" className="ghost" onClick={api.logout}>
                ログアウト
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">最後に同期した時刻: {fmt(api.syncedAt)}</p>
            <button type="button" onClick={api.login}>
              Google にログインして同期
            </button>
          </>
        )}
        {api.error && <div className="msg error">{api.error}</div>}
      </section>

      <section className="card">
        <h2>バックアップフォルダ(PC)</h2>
        {canPickFolder() ? (
          <>
            <p className="muted">
              好きなフォルダ(PC・NAS・USB メモリなど)を選ぶと、変更のたびに自動で保存します。「最新」フォルダに最新の内容(.json と Excel で開ける .csv)、「履歴」フォルダに1日1ファイルの控えを残します。
            </p>
            {api.folder ? (
              <p>
                保存先: <b>{api.folder.handle.name}</b>
                {api.folder.permission !== 'granted' && <span className="error-text">(保存の許可が必要です)</span>}
                {api.backupAt && <span className="muted">(最後の保存 {api.backupAt})</span>}
              </p>
            ) : (
              <p>保存先: 未設定</p>
            )}
            <div className="btn-row">
              {api.folder && api.folder.permission !== 'granted' && (
                <button type="button" onClick={api.resumeFolder}>
                  保存を許可して再開
                </button>
              )}
              <button
                type="button"
                className={api.folder ? 'ghost' : ''}
                onClick={async () => {
                  try {
                    await api.chooseFolder(await pickRoot())
                  } catch (e) {
                    if (!(e instanceof DOMException && e.name === 'AbortError')) setErr(String(e))
                  }
                }}
              >
                {api.folder ? '保存先を変える' : '保存先のフォルダを選ぶ'}
              </button>
              {api.folder?.permission === 'granted' && (
                <button type="button" className="ghost" onClick={api.backupNow}>
                  今すぐ保存
                </button>
              )}
            </div>
            {api.backupError && <div className="msg error">{api.backupError}</div>}
          </>
        ) : (
          <p className="muted">フォルダへの自動バックアップは PC だけで行います。この端末のデータは Google ドライブに保存されています(手元に控えが必要なときは、下の「ファイルに書き出す」)。</p>
        )}
      </section>

      <section className="card">
        <h2>ファイルに書き出す・読み込む</h2>
        <p className="muted">明細 {count}件</p>
        <div className="btn-row">
          <button type="button" className="ghost" onClick={() => downloadText(`家計簿データ_${ymd(new Date())}.json`, JSON.stringify(sortBook(book), null, 1))}>
            バックアップ(.json)を書き出す
          </button>
          <button type="button" className="ghost" onClick={() => downloadText(`家計簿_${ymd(new Date())}.csv`, bookToCsv(book), 'text/csv')}>
            Excel 用(.csv)を書き出す
          </button>
          <label className="file-btn ghost">
            バックアップ(.json)を読み込む
            <input type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          </label>
        </div>
        <p className="muted small-note">読み込みは「合わせる」だけで、今の明細を消したり上書きで戻したりはしません。</p>
        {msg && <div className="msg ok">{msg}</div>}
        {err && <div className="msg error">{err}</div>}
      </section>

      <LedgerEditor api={api} book={book} />

      <CategoryEditor api={api} book={book} current={ledger} />

      <ImportView book={book} update={api.update} current={ledger} />

      <section className="card">
        <h2>表示</h2>
        <div className="btn-row">
          {(['auto', 'light', 'dark'] as Theme[]).map((t) => (
            <button key={t} type="button" className={theme === t ? '' : 'ghost'} onClick={() => setTheme(t)}>
              {t === 'auto' ? '端末に合わせる' : t === 'light' ? '明るい' : '暗い'}
            </button>
          ))}
        </div>
        <h3>カレンダーの週の始まり(この端末)</h3>
        <div className="btn-row">
          {[
            [1, '月曜'],
            [0, '日曜'],
          ].map(([n, label]) => (
            <button key={n} type="button" className={weekStart === n ? '' : 'ghost'} onClick={() => setWeekStart(n as number)}>
              {label}
            </button>
          ))}
        </div>
        <p className="muted small-note">{versionDetail}</p>
      </section>
    </div>
  )
}

function LedgerEditor({ api, book }: { api: BookApi; book: Book }) {
  const [newName, setNewName] = useState('')
  const ledgers = liveLedgers(book)
  const counts = new Map<string, number>()
  for (const e of liveEntries(book)) counts.set(ledgerOf(e), (counts.get(ledgerOf(e)) ?? 0) + 1)

  const patch = (id: string, p: Partial<Book['ledgers'][string]>) =>
    api.update((b) => ({ ...b, ledgers: { ...b.ledgers, [id]: { ...b.ledgers[id], ...p, updatedAt: stamp() } } }))

  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= ledgers.length) return
    const list = [...ledgers]
    ;[list[i], list[j]] = [list[j], list[i]]
    api.update((b) => {
      const next = { ...b.ledgers }
      list.forEach((l, k) => {
        if (next[l.id].order !== k) next[l.id] = { ...next[l.id], order: k, updatedAt: stamp() }
      })
      return { ...b, ledgers: next }
    })
  }

  const add = () => {
    const name = newName.trim()
    if (!name) return
    if (ledgers.some((l) => l.name === name)) return alert('同じ名前の帳簿があります')
    const id = newId('l')
    api.update((b) => {
      // 新しい帳簿には、最初から用意しているカテゴリを入れておく
      const categories = { ...b.categories }
      for (const c of Object.values(emptyBook().categories)) {
        const cid = newId('c')
        categories[cid] = { ...c, id: cid, ledgerId: id, updatedAt: stamp() }
      }
      return { ...b, categories, ledgers: { ...b.ledgers, [id]: { id, name, order: ledgers.length, updatedAt: stamp() } } }
    })
    setNewName('')
  }

  return (
    <section className="card">
      <h2>帳簿</h2>
      <p className="muted">家計と仕事などを分けて記録できます。画面上部で切り替え、「すべての帳簿」でまとめて見られます。</p>
      <ul className="cat-edit">
        {ledgers.map((l, i) => (
          <li key={l.id}>
            <input
              className="cat-name"
              defaultValue={l.name}
              key={l.name}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== l.name) patch(l.id, { name: v })
                else e.target.value = l.name
              }}
              aria-label="帳簿の名前"
            />
            <span className="muted">{counts.get(l.id) ?? 0}件</span>
            <button type="button" className="ghost small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="上へ">
              ↑
            </button>
            <button type="button" className="ghost small" onClick={() => move(i, 1)} disabled={i === ledgers.length - 1} aria-label="下へ">
              ↓
            </button>
            {!counts.get(l.id) && ledgers.length > 1 && (
              <button type="button" className="ghost small" onClick={() => confirm(`帳簿「${l.name}」を削除しますか?`) && patch(l.id, { deleted: true })}>
                削除
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="muted small-note">明細がある帳簿は削除できません。</p>
      <div className="btn-row">
        <input placeholder="新しい帳簿の名前" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button type="button" onClick={add}>
          追加
        </button>
      </div>
    </section>
  )
}

function CategoryEditor({ api, book, current }: { api: BookApi; book: Book; current: string }) {
  const [kind, setKind] = useState<Kind>('expense')
  const [newName, setNewName] = useState('')
  const ledgers = liveLedgers(book)
  const [pick, setPick] = useState(current)
  const ledger = pick !== ALL_LEDGERS && ledgers.some((l) => l.id === pick) ? pick : (ledgers[0]?.id ?? MAIN_LEDGER)
  const cats = liveCategories(book, kind, ledger)
  const used = new Set(liveEntries(book).map((e) => e.categoryId))

  const patch = (id: string, p: Partial<Book['categories'][string]>) =>
    api.update((b) => ({ ...b, categories: { ...b.categories, [id]: { ...b.categories[id], ...p, updatedAt: stamp() } } }))

  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= cats.length) return
    const list = [...cats]
    ;[list[i], list[j]] = [list[j], list[i]]
    api.update((b) => {
      const categories = { ...b.categories }
      list.forEach((c, k) => {
        if (categories[c.id].order !== k) categories[c.id] = { ...categories[c.id], order: k, updatedAt: stamp() }
      })
      return { ...b, categories }
    })
  }

  const add = () => {
    const name = newName.trim()
    if (!name) return
    if (cats.some((c) => c.name === name)) return alert('同じ名前のカテゴリがあります')
    const id = newId('c')
    api.update((b) => ({ ...b, categories: { ...b.categories, [id]: { id, kind, name, color: '#7a8a9a', order: cats.length, ledgerId: ledger === MAIN_LEDGER ? undefined : ledger, updatedAt: stamp() } } }))
    setNewName('')
  }

  return (
    <section className="card">
      <h2>カテゴリ</h2>
      {ledgers.length > 1 && (
        <div className="btn-row">
          <span className="muted">帳簿</span>
          <select value={ledger} onChange={(e) => setPick(e.target.value)}>
            {ledgers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="kind-toggle small-toggle">
        {(['expense', 'income'] as Kind[]).map((k) => (
          <button key={k} type="button" className={`kind-btn ${k} ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <ul className="cat-edit">
        {cats.map((c, i) => (
          <li key={c.id} className={c.hidden ? 'hidden-cat' : ''}>
            <input type="color" value={c.color} onChange={(e) => patch(c.id, { color: e.target.value })} aria-label="色" />
            <input
              className="cat-name"
              defaultValue={c.name}
              key={c.name}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== c.name) patch(c.id, { name: v })
                else e.target.value = c.name
              }}
              aria-label="名前"
            />
            <button type="button" className="ghost small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="上へ">
              ↑
            </button>
            <button type="button" className="ghost small" onClick={() => move(i, 1)} disabled={i === cats.length - 1} aria-label="下へ">
              ↓
            </button>
            <label className="check small-check">
              <input type="checkbox" checked={!!c.hidden} onChange={(e) => patch(c.id, { hidden: e.target.checked || undefined })} />
              隠す
            </label>
            {!used.has(c.id) && (
              <button type="button" className="ghost small" onClick={() => confirm(`「${c.name}」を削除しますか?`) && patch(c.id, { deleted: true })}>
                削除
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="muted small-note">明細があるカテゴリは削除できません(「隠す」で入力画面に出さないようにできます)。</p>
      <button
        type="button"
        className="ghost small"
        onClick={() =>
          confirm('この帳簿のカテゴリを、明細で使った回数の多い順に並べ替えますか?') &&
          api.update((b) => ({ ...b, categories: { ...b.categories, ...sortCategoriesByUse(b, new Set([ledger])) } }))
        }
      >
        使う回数の多い順に並べ替え
      </button>
      <div className="btn-row">
        <input placeholder="新しいカテゴリの名前" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button type="button" onClick={add}>
          追加
        </button>
      </div>
    </section>
  )
}
