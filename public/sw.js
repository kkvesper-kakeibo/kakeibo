// アプリ本体(画面のプログラム)だけをキャッシュする。家計簿のデータは一切キャッシュしない。
const CACHE = 'kakeibo-shell-v2'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  // 自分のサイト以外(Google など)は触らない
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    // ページ本体: まずネットから最新を取り、つながらない時・公開先が止まっている時(404 など)はキャッシュ。
    // 正常に取れた時だけ保存する(公開先のエラーのページで、保存済みのアプリを上書きしないように)
    const cached = () => caches.match(req).then((r) => r || caches.match('./'))
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (!res.ok) return cached().then((r) => r || res)
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => cached()),
    )
    return
  }

  // インストール用の設定ファイル(manifest)は保存しない(識別名などを直したとき、古いものが残らないように)
  if (url.pathname.includes('/assets/') || /\.png$/.test(url.pathname)) {
    // ファイル名にハッシュが付いた JS/CSS とアイコン: キャッシュ優先
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
  }
})
