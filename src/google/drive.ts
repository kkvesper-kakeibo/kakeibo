// Google ドライブ上の家計簿データ(正本)の読み書き。
// 権限は drive.file(このアプリが作ったファイルだけを読み書きでき、ドライブの他のファイルは見えない)。
// ドライブのマイドライブに「家計簿アプリ」フォルダを作り、その中に保存する(ドライブの画面からも見える・ダウンロードできる)
import { parseBook, sortBook, type Book } from '../lib/model'
import type { AccessToken } from './auth'

export const SCOPE_DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file'

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_NAME = '家計簿アプリ'
const BOOK_NAME = '家計簿データ.json'

export class AuthExpiredError extends Error {
  constructor() {
    super('Google のログインの有効期限が切れました。もう一度ログインしてください')
  }
}

async function call(token: AccessToken, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token.value}` } })
  if (res.ok) return res
  if (res.status === 401) throw new AuthExpiredError()
  const text = await res.text().catch(() => '')
  if (res.status === 403 && /accessNotConfigured|has not been used|is disabled/.test(text)) {
    throw new Error('Google Drive API が有効になっていません。Google Cloud の設定で「Google Drive API」を有効にしてください(手順は manual.html)')
  }
  throw new Error(`Google ドライブとの通信に失敗しました(${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`)
}

interface DriveFile {
  id: string
  name: string
  modifiedTime?: string
  createdTime?: string
}

async function findFiles(token: AccessToken, q: string): Promise<DriveFile[]> {
  const params = new URLSearchParams({ q: `${q} and trashed=false`, fields: 'files(id,name,modifiedTime,createdTime)', orderBy: 'createdTime', spaces: 'drive', pageSize: '100' })
  const res = await call(token, `${API}/files?${params}`)
  return ((await res.json()) as { files: DriveFile[] }).files
}

async function createFile(token: AccessToken, meta: Record<string, unknown>, body?: string): Promise<DriveFile> {
  if (body === undefined) {
    const res = await call(token, `${API}/files?fields=id,name`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta) })
    return res.json()
  }
  const boundary = `kakeibo${Date.now()}`
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${body}\r\n--${boundary}--`
  const res = await call(token, `${UPLOAD}/files?uploadType=multipart&fields=id,name`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  })
  return res.json()
}

/** ドライブ側の保存場所(端末ごとに覚えておくと毎回の検索が省ける) */
export interface RemoteState {
  folderId?: string
  fileId?: string
}

async function ensureFolder(token: AccessToken, st: RemoteState): Promise<string> {
  if (st.folderId) return st.folderId
  const found = await findFiles(token, "appProperties has { key='kakeiboFolder' and value='1' } and mimeType='application/vnd.google-apps.folder'")
  st.folderId = found[0]?.id ?? (await createFile(token, { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', appProperties: { kakeiboFolder: '1' } })).id
  return st.folderId
}

/** ドライブの家計簿データを読む。まだ無ければ null */
export async function loadRemote(token: AccessToken, st: RemoteState): Promise<Book | null> {
  const files = await findFiles(token, "appProperties has { key='kakeiboBook' and value='1' }")
  if (!files.length) {
    st.fileId = undefined
    return null
  }
  st.fileId = files[0].id
  const res = await call(token, `${API}/files/${files[0].id}?alt=media`, { cache: 'no-store' })
  return parseBook(await res.text())
}

/** ドライブの家計簿データを書き換える(無ければ作る)。ドライブは以前の版も自動で残す */
export async function saveRemote(token: AccessToken, st: RemoteState, book: Book): Promise<void> {
  const body = JSON.stringify(sortBook(book))
  if (st.fileId) {
    try {
      await call(token, `${UPLOAD}/files/${st.fileId}?uploadType=media&fields=id`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body,
      })
      return
    } catch (e) {
      if (!(e instanceof Error) || !/\(404\)/.test(e.message)) throw e
      st.fileId = undefined // ドライブ側で消された → 作り直す
    }
  }
  const folder = await ensureFolder(token, st)
  st.fileId = (await createFile(token, { name: BOOK_NAME, parents: [folder], mimeType: 'application/json', appProperties: { kakeiboBook: '1' } }, body)).id
}

/** ドライブが自動で残す「以前の版」は、ドライブの容量を使う(初期設定では 30 日・最大 100 版)。
 * 新しいものから keep 版だけ残し、それより古い版を消す(いちばん新しい版=今の内容は必ず残る)。
 * 日ごとの控えは PC のバックアップフォルダに残すので、ドライブには残さない(ユーザー決定) */
export async function pruneRevisions(token: AccessToken, st: RemoteState, keep: number): Promise<number> {
  if (!st.fileId) return 0
  const res = await call(token, `${API}/files/${st.fileId}/revisions?fields=revisions(id,modifiedTime,keepForever)&pageSize=200`)
  const list = ((await res.json()) as { revisions?: { id: string; modifiedTime: string; keepForever?: boolean }[] }).revisions ?? []
  const old = list.sort((a, b) => a.modifiedTime.localeCompare(b.modifiedTime)).slice(0, Math.max(0, list.length - keep))
  let n = 0
  for (const r of old) {
    if (r.keepForever) continue // 手動で「削除しない」にした版は残す
    try {
      await call(token, `${API}/files/${st.fileId}/revisions/${r.id}`, { method: 'DELETE' })
      n++
    } catch (e) {
      if (e instanceof AuthExpiredError) throw e
      break // 消せない版があれば、次の機会に
    }
  }
  return n
}
