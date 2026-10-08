// PC(Edge / Chrome)で選んだフォルダへのバックアップ。保存先は自由(PC・NAS・USB など)
//
// <選んだフォルダ>/
//   最新/家計簿データ.json   … 変更のたびに上書き(アプリに戻せる形)
//   最新/家計簿.csv          … 同じ内容を Excel で開ける形で
//   履歴/家計簿データ_YYYY-MM-DD.json … 1日1ファイル(その日の最後の状態)。消さずに残す
import { getDir, loadSavedRoot, permissionOf, readText, requestPermission, saveRoot, writeBlob } from './fs'
import { bookToCsv } from './csv'
import { parseBook, sortBook, type Book } from './model'
import { ymd } from './dates'

export { canPickFolder, pickRoot } from './fs'

export type FolderState = { handle: FileSystemDirectoryHandle; permission: 'granted' | 'denied' | 'prompt' } | null

export async function loadFolder(): Promise<FolderState> {
  const handle = await loadSavedRoot().catch(() => undefined)
  if (!handle) return null
  return { handle, permission: await permissionOf(handle).catch(() => 'prompt' as const) }
}

export async function setFolder(handle: FileSystemDirectoryHandle): Promise<void> {
  await saveRoot(handle)
}

/** ボタン操作の中から呼ぶ(ブラウザの決まり) */
export const allowFolder = requestPermission

export async function writeBackup(dir: FileSystemDirectoryHandle, book: Book): Promise<void> {
  const json = JSON.stringify(sortBook(book), null, 1)
  const latest = (await getDir(dir, ['最新'], true))!
  const hist = (await getDir(dir, ['履歴'], true))!
  await writeBlob(latest, '家計簿データ.json', json)
  await writeBlob(hist, `家計簿データ_${ymd(new Date())}.json`, json)
  await writeBlob(latest, '家計簿.csv', new Blob([bookToCsv(book)], { type: 'text/csv' }))
}

/** フォルダの「最新」を読む(ブラウザのデータが消えたときの復元用) */
export async function readBackup(dir: FileSystemDirectoryHandle): Promise<Book | undefined> {
  const latest = await getDir(dir, ['最新'], false)
  const text = latest && (await readText(latest, '家計簿データ.json'))
  return text ? parseBook(text) : undefined
}
