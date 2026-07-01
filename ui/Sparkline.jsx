import React from 'react'
import { shortDate } from '../format.js'

export function Sparkline({ points, color, label }) {
  const vals = (points || []).map((p) => Number(p.value) || 0)
  if (vals.length === 0) return null
  const W = 320, H = 96, padX = 8, padTop = 12, padBottom = 14
  const n = vals.length
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = (max - min) || Math.max(1, max)
  const x = (i) => (n <= 1 ? W / 2 : padX + (i * (W - 2 * padX)) / (n - 1))
  const y = (v) => H - padBottom - ((v - min) / span) * (H - padTop - padBottom)
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(vals[i]).toFixed(1)}`).join(' ')
  const area = n > 1 ? `${line} L${x(n - 1).toFixed(1)},${H - padBottom} L${x(0).toFixed(1)},${H - padBottom} Z` : ''
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="wk-sparkline"
      role="img" aria-label={`${label || 'Trend'} across ${n} session${n === 1 ? '' : 's'}`}>
      {area && <path d={area} fill={color} opacity={0.13} />}
      {n > 1 && <path d={line} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />}
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(vals[i])} r={n > 30 ? 1.6 : 2.6} fill={color}>
          <title>{shortDate(p.ts)}</title>
        </circle>
      ))}
    </svg>
  )
}
