// 金額の表示をそろえる: 支出(マイナス)は赤で ▲ を付け、収入(プラス)は青
import { yen, type Kind } from '../lib/model'

interface Props {
  /** 金額(円)。kind を省略したときは符号で決める(マイナスなら支出の扱い) */
  value: number
  kind?: Kind
  /** カレンダーのマス用の短い表示(¥ を付けない・100万以上は「万」) */
  short?: boolean
  className?: string
}

const shortNum = (n: number) => (n >= 1_000_000 ? `${Math.round(n / 10_000).toLocaleString('ja-JP')}万` : n.toLocaleString('ja-JP'))

export default function Money({ value, kind, short, className }: Props) {
  const k: Kind = kind ?? (value < 0 ? 'expense' : 'income')
  const abs = Math.abs(value)
  const text = short ? shortNum(abs) : yen(abs)
  return <span className={`money ${k}${className ? ` ${className}` : ''}`}>{k === 'expense' && abs !== 0 ? `▲${text}` : text}</span>
}
