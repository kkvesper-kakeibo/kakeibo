// グラフの部品(外部のライブラリを使わず SVG で描く)
// - 棒は細めで、上の角だけ 4px 丸め、下は基準線に接する。隣の棒との間は 2px 以上あける
// - 目盛り線・軸は控えめな色。縦の目盛りは 1 本だけ(2 種類の目盛りは使わない)
// - 触れた(PC はマウスを乗せた)棒の値を吹き出しで表示。触れる範囲は棒より広く(その月の帯全体)
import { useEffect, useRef, useState, type ReactNode } from 'react'

/** 親の幅に合わせて描くための幅(px) */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** 目盛り用の金額表示(1万以上は「万」) */
export const axisYen = (n: number) => {
  if (n === 0) return '0'
  if (Math.abs(n) >= 10_000) {
    const v = n / 10_000
    return `${Number.isInteger(v) ? v : v.toFixed(1)}万`
  }
  return n.toLocaleString('ja-JP')
}

/** 0 から max までを、きりの良い間隔(1・2・5 × 10 の n 乗)で 4 つ前後に分けた目盛り */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0]
  const raw = max / 4
  const p = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Math.round(v))
  return ticks
}

/** 上の角だけを丸めた棒(下は基準線に接する) */
function barPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return ''
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

export interface Series {
  key: string
  name: string
  color: string
  values: number[]
}

interface BarChartProps {
  labels: string[] // 横軸(例 1月〜12月)
  series: Series[]
  /** 吹き出しの中身(i 番目の帯) */
  tooltip: (i: number) => ReactNode
  /** 帯を押したとき(その月を開くなど) */
  onPick?: (i: number) => void
  height?: number
  /** 強調する帯(今月など) */
  highlight?: number
}

export function BarChart({ labels, series, tooltip, onPick, height = 220, highlight }: BarChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(0, ...series.flatMap((s) => s.values))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1] || 1
  const padL = 44
  const padR = 6
  const padT = 10
  const padB = 24
  const plotW = Math.max(0, width - padL - padR)
  const plotH = height - padT - padB
  const band = labels.length ? plotW / labels.length : 0
  const groupW = band * (series.length > 1 ? 0.78 : 0.62)
  const gap = 2
  const barW = Math.max(2, (groupW - gap * (series.length - 1)) / series.length)
  const y = (v: number) => padT + plotH - (v / top) * plotH
  // 横軸の文字が混み合うときは間引く
  const every = band < 26 ? Math.ceil(26 / Math.max(band, 1)) : 1

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setActive(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={series.map((s) => s.name).join('と') + 'の棒グラフ'}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis-base' : 'grid'} />
              <text x={padL - 6} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
                {axisYen(t)}
              </text>
            </g>
          ))}
          {labels.map((lab, i) => {
            const x0 = padL + band * i
            const gx = x0 + (band - groupW) / 2
            return (
              <g key={lab + i}>
                {(highlight === i || active === i) && <rect x={x0} y={padT} width={band} height={plotH} className={active === i ? 'band-active' : 'band-highlight'} />}
                {series.map((s, k) => {
                  const v = s.values[i] ?? 0
                  const h = (v / top) * plotH
                  return <path key={s.key} d={barPath(gx + k * (barW + gap), y(v), barW, h)} fill={s.color} />
                })}
                {i % every === 0 && (
                  <text x={x0 + band / 2} y={height - 6} className={`tick ${highlight === i ? 'tick-strong' : ''}`} textAnchor="middle">
                    {lab}
                  </text>
                )}
                {/* 触れる範囲は帯全体(棒より広く) */}
                <rect
                  x={x0}
                  y={0}
                  width={band}
                  height={height}
                  fill="transparent"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => (active === i && onPick ? onPick(i) : setActive(i))}
                  style={{ cursor: 'pointer' }}
                />
              </g>
            )
          })}
        </svg>
      )}
      {active !== null && width > 0 && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(padL + band * active + band / 2, 90), width - 90) }}>
          {tooltip(active)}
          {onPick && <div className="chart-tip-hint">もう一度押すと開きます</div>}
        </div>
      )}
    </div>
  )
}

export interface Slice {
  key: string
  name: string
  color: string
  value: number
}

/** ドーナツグラフ(全体に対する割合。6 区分まで) */
export function Donut({ slices, center, size = 190 }: { slices: Slice[]; center: ReactNode; size?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  const r = size / 2 - 16
  const c = size / 2
  const sw = 26
  let a = -Math.PI / 2
  const arcs = slices.map((s) => {
    const frac = total ? s.value / total : 0
    const a0 = a
    const a1 = a + frac * Math.PI * 2
    a = a1
    return { ...s, a0, a1, frac }
  })
  const pt = (ang: number) => [c + r * Math.cos(ang), c + r * Math.sin(ang)]
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label="割合のグラフ">
        <circle cx={c} cy={c} r={r} fill="none" className="donut-track" strokeWidth={sw} />
        {arcs.map((s) => {
          if (s.frac <= 0) return null
          if (s.frac >= 0.9999) return <circle key={s.key} cx={c} cy={c} r={r} fill="none" stroke={s.color} strokeWidth={sw} />
          const [x0, y0] = pt(s.a0)
          const [x1, y1] = pt(s.a1)
          const large = s.a1 - s.a0 > Math.PI ? 1 : 0
          return <path key={s.key} d={`M${x0},${y0}A${r},${r} 0 ${large} 1 ${x1},${y1}`} fill="none" stroke={s.color} strokeWidth={sw} />
        })}
        {/* 区分の境目に背景色の細い線(2px)を入れて見分けやすく */}
        {arcs.length > 1 &&
          arcs.map((s) => {
            if (s.frac <= 0) return null
            const [xi, yi] = [c + (r - sw / 2 - 1) * Math.cos(s.a0), c + (r - sw / 2 - 1) * Math.sin(s.a0)]
            const [xo, yo] = [c + (r + sw / 2 + 1) * Math.cos(s.a0), c + (r + sw / 2 + 1) * Math.sin(s.a0)]
            return <line key={`g${s.key}`} x1={xi} y1={yi} x2={xo} y2={yo} className="donut-gap" />
          })}
      </svg>
      <div className="donut-center">{center}</div>
    </div>
  )
}
