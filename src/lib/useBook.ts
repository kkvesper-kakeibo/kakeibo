// 家計簿データの管理: 端末(IndexedDB)に保存し、Google ドライブ(正本)・バックアップフォルダと合わせる
//
// - 入力・変更はまず端末に保存する(ネットにつながっていなくても、ログインしていなくても入力できる)
// - ログイン中は、変更から少し待ってドライブと同期する(ドライブの内容と合わせてから書き戻す)
// - 同期は「合わせる」だけなので、PC とスマホで別々に入力しても両方残る
import { useCallback, useEffect, useRef, useState } from 'react'
import { requestAccessToken, revokeToken, type AccessToken } from '../google/auth'
import { desktopHasLogin, inDesktopApp } from '../desktop/host'
import { AuthExpiredError, loadRemote, pruneRevisions, saveRemote, SCOPE_DRIVE_FILE, type RemoteState } from '../google/drive'
import { emptyBook, mergeBooks, sameBook, type Book } from './model'
import { idbGet, idbSet } from './idb'
import { allowFolder, loadFolder, readBackup, writeBackup, type FolderState } from './backup'

const BOOK = 'book'
const DIRTY = 'dirty' // ドライブへまだ送っていない変更がある
const REMOTE = 'remote' // ドライブ上のファイルの場所
const SYNCED_AT = 'syncedAt'
const PRUNED_AT = 'prunedAt' // ドライブの以前の版を整理した時刻
const KEEP_REVISIONS = 10
const LOGGED_IN = 'kakeibo.loggedIn' // 一度許可した端末では、2回目から確認画面を出さない

/** 開発用の架空ドライブ(?demo)。本番では使われない */
export interface RemoteApi {
  load(token: AccessToken, st: RemoteState): Promise<Book | null>
  save(token: AccessToken, st: RemoteState, book: Book): Promise<void>
  prune(token: AccessToken, st: RemoteState, keep: number): Promise<number>
}
const realRemote: RemoteApi = { load: loadRemote, save: saveRemote, prune: pruneRevisions }
const remoteApi = (): RemoteApi => (globalThis as { __kakeiboDemoRemote?: RemoteApi }).__kakeiboDemoRemote ?? realRemote

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const lsSet = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* 保存できない環境 */
  }
}

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error' | 'login'

export function useBook() {
  const [book, setBook] = useState<Book | null>(null)
  const [dirty, setDirty] = useState(false)
  const [token, setToken] = useState<AccessToken | null>(null)
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [error, setError] = useState('')
  const [syncedAt, setSyncedAt] = useState<string>('')
  const [folder, setFolderState] = useState<FolderState>(null)
  const [backupError, setBackupError] = useState('')
  const [backupAt, setBackupAt] = useState('')

  const bookRef = useRef<Book | null>(null)
  const tokenRef = useRef<AccessToken | null>(null)
  const seq = useRef(0) // 変更の通し番号(同期中に入力があったか判定する)
  const syncChain = useRef<Promise<void>>(Promise.resolve())
  const syncTimer = useRef<number>(0)
  const backupTimer = useRef<number>(0)
  const folderRef = useRef<FolderState>(null)
  folderRef.current = folder
  const autoRelogin = useRef<() => void>(() => {}) // 専用アプリの自動のつなぎ直し(login を作ったあとで入れる)

  // ---- 起動: 端末の控えを読む。バックアップフォルダが使えれば、その内容とも合わせる(ブラウザのデータが消えても戻せるように)
  useEffect(() => {
    ;(async () => {
      const [saved, d, at, f] = await Promise.all([idbGet<Book>(BOOK), idbGet<boolean>(DIRTY), idbGet<string>(SYNCED_AT), loadFolder()])
      let b = saved ? mergeBooks(emptyBook(), saved) : emptyBook()
      let fromFolder = false
      if (f?.permission === 'granted') {
        const fb = await readBackup(f.handle).catch(() => undefined)
        if (fb && !sameBook(mergeBooks(b, fb), b)) {
          b = mergeBooks(b, fb)
          fromFolder = true
        }
      }
      bookRef.current = b
      setBook(b)
      setDirty(!!d || fromFolder)
      setSyncedAt(at ?? '')
      setFolderState(f)
      if (fromFolder) await idbSet(BOOK, b).catch(() => {})
      if (inDesktopApp ? !desktopHasLogin() : !lsGet(LOGGED_IN)) setStatus('login')
    })()
  }, [])

  const backupNow = useCallback(async () => {
    const f = folderRef.current
    const b = bookRef.current
    if (!f || f.permission !== 'granted' || !b) return
    try {
      await writeBackup(f.handle, b)
      setBackupError('')
      setBackupAt(new Date().toLocaleTimeString('ja-JP'))
    } catch (e) {
      setBackupError(`バックアップフォルダに保存できませんでした: ${errText(e)}`)
    }
  }, [])

  const scheduleBackup = useCallback(() => {
    window.clearTimeout(backupTimer.current)
    backupTimer.current = window.setTimeout(backupNow, 3000)
  }, [backupNow])

  // ---- ドライブと同期(同時に2つ走らないよう、順番に実行する)
  const sync = useCallback((): Promise<void> => {
    const run = async () => {
      const t = tokenRef.current
      if (!t) {
        setStatus('login')
        return
      }
      if (t.expiresAt < Date.now() + 30_000) {
        tokenRef.current = null
        setToken(null)
        setStatus('login')
        return
      }
      const startSeq = seq.current
      setStatus('syncing')
      try {
        const api = remoteApi()
        const st: RemoteState = (await idbGet<RemoteState>(REMOTE)) ?? {}
        const remote = await api.load(t, st)
        const local = bookRef.current ?? emptyBook()
        const merged = remote ? mergeBooks(remote, local) : local
        if (!remote || !sameBook(merged, remote)) await api.save(t, st, merged)
        // ドライブの以前の版が増えすぎないよう、1時間に1回まで整理する(失敗しても同期は続ける)
        if (Date.now() - ((await idbGet<number>(PRUNED_AT)) ?? 0) > 3600_000) {
          await api.prune(t, st, KEEP_REVISIONS).then(
            () => idbSet(PRUNED_AT, Date.now()),
            (e) => {
              if (e instanceof AuthExpiredError) throw e
            },
          )
        }
        await idbSet(REMOTE, st)
        // 同期中に入力された変更も残す
        const next = mergeBooks(bookRef.current ?? merged, merged)
        const changed = !sameBook(next, local)
        bookRef.current = next
        setBook(next)
        await idbSet(BOOK, next)
        const stillDirty = seq.current !== startSeq
        setDirty(stillDirty)
        await idbSet(DIRTY, stillDirty)
        const at = new Date().toISOString()
        setSyncedAt(at)
        await idbSet(SYNCED_AT, at)
        setError('')
        setStatus('ok')
        if (changed) scheduleBackup()
        if (stillDirty) window.setTimeout(() => void sync(), 500)
      } catch (e) {
        if (e instanceof AuthExpiredError) {
          tokenRef.current = null
          setToken(null)
          setStatus('login')
          if (desktopHasLogin()) autoRelogin.current() // 専用アプリ: 有効期限(1時間)が切れたら自動でつなぎ直す
          return
        }
        setError(errText(e))
        setStatus('error')
      }
    }
    syncChain.current = syncChain.current.then(run, run)
    return syncChain.current
  }, [scheduleBackup])

  const scheduleSync = useCallback(() => {
    window.clearTimeout(syncTimer.current)
    syncTimer.current = window.setTimeout(() => void sync(), 1500)
  }, [sync])

  /** データを変更する(端末に保存 → 少し待ってドライブ・バックアップフォルダへ) */
  const update = useCallback(
    (fn: (b: Book) => Book) => {
      const cur = bookRef.current
      if (!cur) return
      const next = fn(cur)
      bookRef.current = next
      seq.current++
      setBook(next)
      setDirty(true)
      void idbSet(BOOK, next).catch((e) => setError(`端末に保存できませんでした: ${errText(e)}`))
      void idbSet(DIRTY, true).catch(() => {})
      if (tokenRef.current) scheduleSync()
      scheduleBackup()
    },
    [scheduleSync, scheduleBackup],
  )

  // ---- ログイン
  /** auto: 起動時などの自動ログイン(専用アプリ)。保存した合鍵だけでつなぎ、ブラウザの確認画面は開かない */
  const login = useCallback(async (opts: { auto?: boolean } = {}) => {
    setError('')
    try {
      // 専用アプリでは、合鍵があればそれでつなぎ、無いときだけ確認画面(普段のブラウザ)を開く
      const silent = !!opts.auto || (!inDesktopApp && lsGet(LOGGED_IN) === '1')
      const t = await requestAccessToken(SCOPE_DRIVE_FILE, [], { silent })
      lsSet(LOGGED_IN, '1')
      tokenRef.current = t
      setToken(t)
      await sync()
    } catch (e) {
      setError(errText(e))
      setStatus('login')
    }
  }, [sync])

  const logout = useCallback(async () => {
    const t = tokenRef.current
    if (t) await revokeToken(t).catch(() => {})
    lsSet(LOGGED_IN, null)
    tokenRef.current = null
    setToken(null)
    setStatus('login')
  }, [])

  /** 入力の保存ボタンなど、ボタン操作の中で呼ぶ: ログインが切れていれば確認画面なしでログインし直す */
  const ensureLogin = useCallback(() => {
    const t = tokenRef.current
    if (t && t.expiresAt > Date.now() + 60_000) return
    if (inDesktopApp) {
      if (desktopHasLogin()) void login({ auto: true })
    } else if (lsGet(LOGGED_IN) === '1') void login()
  }, [login])

  autoRelogin.current = () => void login({ auto: true })

  // 専用アプリ: ログインの合鍵が保存されていれば、起動したらすぐ自動でつなぐ(ボタン操作は要らない)
  useEffect(() => {
    if (desktopHasLogin()) void login({ auto: true })
  }, [login])

  // 開いている間: 画面に戻ったとき・ネットにつながったとき・5分ごとに同期(ほかの端末の入力を取り込む)
  useEffect(() => {
    if (!token) return
    const onShow = () => document.visibilityState === 'visible' && void sync()
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void sync(), 5 * 60_000)
    document.addEventListener('visibilitychange', onShow)
    window.addEventListener('online', onShow)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onShow)
      window.removeEventListener('online', onShow)
    }
  }, [token, sync])

  // ---- バックアップフォルダ
  const chooseFolder = useCallback(
    async (handle: FileSystemDirectoryHandle) => {
      // 選んだフォルダにすでにバックアップがあれば、その内容も合わせる(消さない)
      const fb = await readBackup(handle).catch(() => undefined)
      if (fb) update((b) => mergeBooks(b, fb))
      await idbSet('backupDir', handle)
      const f: FolderState = { handle, permission: 'granted' }
      folderRef.current = f
      setFolderState(f)
      await backupNow()
    },
    [update, backupNow],
  )

  const resumeFolder = useCallback(async () => {
    const f = folderRef.current
    if (!f) return
    if (await allowFolder(f.handle)) {
      const g: FolderState = { handle: f.handle, permission: 'granted' }
      folderRef.current = g
      setFolderState(g)
      const fb = await readBackup(f.handle).catch(() => undefined)
      if (fb) update((b) => mergeBooks(b, fb))
      await backupNow()
    }
  }, [update, backupNow])

  return {
    book,
    update,
    dirty,
    token,
    status,
    error,
    syncedAt,
    login,
    logout,
    ensureLogin,
    sync,
    folder,
    chooseFolder,
    resumeFolder,
    backupNow,
    backupAt,
    backupError,
  }
}

export type BookApi = ReturnType<typeof useBook>
