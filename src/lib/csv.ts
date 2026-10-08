// CSV の読み書き(Excel で開ける形・他の家計簿アプリの CSV の取り込み)
import { KIND_LABEL, liveEntries, type Book } from './model'

/** 文字コードを判定して文字列にする(UTF-8 で読めなければ Shift_JIS) */
export function decodeText(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('shift_jis').decode(bytes)
  }
}

/** CSV(またはタブ区切り)を表にする。ダブルクォート内の , と改行に対応 */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const sep = (first.match(/\t/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === sep) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const q = (s: string | number) => {
  const t = String(s)
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

export const toCsv = (rows: (string | number)[][]) => '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n'

/** 明細を CSV にする(日付順。Excel で文字化けしないよう BOM 付き UTF-8) */
export function bookToCsv(book: Book): string {
  const entries = liveEntries(book).sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt - b.updatedAt)
  return toCsv([
    ['日付', '収支', 'カテゴリ', '金額', 'メモ'],
    ...entries.map((e) => [e.date, KIND_LABEL[e.kind], book.categories[e.categoryId]?.name ?? '(不明)', e.amount, e.memo]),
  ])
}

/** ブラウザからファイルとして保存させる(スマホでは「ダウンロード」に入る) */
export function downloadText(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
