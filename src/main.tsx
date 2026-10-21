import './desktop/install' // 専用アプリの中なら保存場所を差し替える(必ず最初に読み込む)
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { inDesktopApp } from './desktop/host'

// 開発サーバーで ?demo を付けたときだけ、架空のドライブ・架空の明細で動かす(本番ビルドからは除去される)
if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
  const { installDemo } = await import('./dev/demo')
  await installDemo()
}

// この端末のサイトデータ(家計簿の控え)を、容量不足などで自動削除されにくくする
if (!inDesktopApp) navigator.storage?.persist?.().catch(() => {})

// 本番だけ Service Worker を登録(スマホ・PC へのインストールとオフライン起動用)
// 専用アプリの中では不要(プログラムはアプリと一緒に入っている)
if (import.meta.env.PROD && !inDesktopApp && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
}

createRoot(document.getElementById('root')!).render(<App />)
