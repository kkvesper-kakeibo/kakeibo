// スマホで左右にスワイプしたことを知らせる(シンプルカレンダーのように月を移すため)。
// 縦のスクロールや、表・入力欄の中での操作とは区別する
import { useRef } from 'react'

export function useSwipe(onSwipe: (dir: 'left' | 'right') => void) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null)
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const el = e.target as HTMLElement
      // 横にスクロールできる表や、入力欄の中では反応しない
      if (e.touches.length !== 1 || el.closest('input, select, textarea, .table-wrap, .no-swipe')) {
        start.current = null
        return
      }
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = start.current
      start.current = null
      if (!s) return
      const dx = e.changedTouches[0].clientX - s.x
      const dy = e.changedTouches[0].clientY - s.y
      // 横に 60px 以上、縦の動きの 1.5 倍以上、0.8 秒以内ならスワイプ
      if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - s.t < 800) onSwipe(dx < 0 ? 'left' : 'right')
    },
  }
}
