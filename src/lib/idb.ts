// IndexedDB: この端末だけの記録(家計簿データの控え、バックアップフォルダのハンドル)。
// WebCalendar・写真日記と同じサイト(github.io)に置いても混ざらないように、別の名前にする
let DB = 'kakeibo'
/** 開発用の ?demo で、本物の控えと混ざらないよう別の保存場所にする */
export const switchToDemoDb = () => void (DB = 'kakeibo-demo')
const KV = 'kv'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(KV)) req.result.createObjectStore(KV)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open()
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(KV, mode).objectStore(KV))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  }).finally(() => db.close())
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    return await tx<T | undefined>('readonly', (s) => s.get(key))
  } catch {
    return undefined
  }
}

export const idbSet = (key: string, value: unknown) => tx<void>('readwrite', (s) => s.put(value, key)).then(() => undefined)

export const idbDelete = (key: string) => tx<void>('readwrite', (s) => s.delete(key)).then(() => undefined)
