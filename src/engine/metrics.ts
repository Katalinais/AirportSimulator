// Métricas de teoría de colas en tiempo real: Lq, Wq, ρ y throughput usando fórmulas M/M/c con jstat

export interface MetricPoint {
  simTime:     number
  Lq:          number
  Wq:          number
  rho:         number
  throughput:  number
  abandonRate: number
}

export type RhoLevel = 'ok' | 'warn' | 'danger'

export function classifyRho(rho: number): RhoLevel {
  if (rho < 0.75) return 'ok'
  if (rho < 0.90) return 'warn'
  return 'danger'
}

export function fmtSimTime(minutes: number): string {
  if (!Number.isFinite(minutes)) return '00:00:00'
  const h = Math.floor(minutes / 60)
  const m = Math.floor(minutes % 60)
  const s = Math.floor((minutes * 60) % 60)
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

export function fmtNum(n: number, dp = 2): string {
  return Number.isFinite(n) ? n.toFixed(dp) : '—'
}

function pad(n: number): string {
  return String(Math.floor(n)).padStart(2, '0')
}
