// Experimento 2 — Número de servidores c₁ vs tiempo de espera Wq
// Compara Wq simulado vs Erlang C para cada valor de c₁.
// Uso: npx tsx src/experiments/exp2_servers.ts

import { Passenger } from '../engine/passenger'
import { Queue }     from '../engine/queue'

const LAMBDA  = 10
const MU1     = 4
const T       = 500
const DT      = 0.001
const REP     = 5
const SERVERS = [3, 4, 5, 6, 8, 10]   // c₁ < 3 es inestable (ρ ≥ 1)

function runOnce(c: number): { Wq: number } {
  Passenger.resetCounter()
  const q = new Queue({ type: 'MMc', servers: c, mu: MU1, capacity: 2000 })

  const arrivals: number[] = []
  let t = 0
  while (t < T) {
    t += -Math.log(Math.random()) / LAMBDA
    if (t < T) arrivals.push(t)
  }

  const steps = Math.ceil(T / DT)
  let idx = 0
  for (let s = 0; s <= steps; s++) {
    const now = s * DT
    while (idx < arrivals.length && arrivals[idx] <= now) {
      const p = new Passenger('standard', 0, arrivals[idx])
      p.patience = 9999
      q.enqueue(p, now)
      idx++
    }
    q.tick(now, DT)
  }
  return { Wq: q.getMetrics().Wq }
}

function erlangRef(c: number) {
  const rho = LAMBDA / (c * MU1)
  if (rho >= 1) return null
  const q  = new Queue({ type: 'MMc', servers: c, mu: MU1, capacity: 2000 })
  const C  = q.erlangC(LAMBDA)
  const Lq = C * rho / (1 - rho)
  const Wq = Lq / LAMBDA
  return { rho, Lq, Wq }
}

console.log('\n══════════════════════════════════════════════════════════════════════')
console.log('  Experimento 2 — Servidores c₁ vs Tiempo de espera Wq')
console.log(`  λ=${LAMBDA}/min  μ₁=${MU1}/min  T=${T} min  DT=${DT}  rep=${REP}`)
console.log('  Nota: c₁=1 y c₁=2 son inestables (ρ ≥ 1) con λ=10, μ=4')
console.log('══════════════════════════════════════════════════════════════════════\n')
console.log('c₁    ρ       Wq_sim (min)   Wq_EC (min)   Error(%)   Reducción vs c₁ anterior')
console.log('────  ──────  ────────────   ───────────   ────────   ─────────────────────────')

let prevWq = Infinity

for (const c of SERVERS) {
  const ref = erlangRef(c)
  if (!ref) {
    console.log(`${String(c).padEnd(4)}  ≥1.000  inestable`)
    continue
  }

  let sumWq = 0
  for (let r = 0; r < REP; r++) sumWq += runOnce(c).Wq
  const Wq  = sumWq / REP
  const err = Math.abs(Wq - ref.Wq) / ref.Wq * 100
  const reduction = isFinite(prevWq) ? ((prevWq - Wq) / prevWq * 100).toFixed(1) + '%' : '--'
  prevWq = Wq

  console.log(
    `${String(c).padEnd(4)}  ` +
    `${ref.rho.toFixed(3).padEnd(6)}  ` +
    `${Wq.toFixed(5).padEnd(14)} ` +
    `${ref.Wq.toFixed(5).padEnd(13)} ` +
    `${(err.toFixed(1) + '%').padEnd(9)}  ` +
    `${reduction}`,
  )
}

console.log('\n→ Hipótesis: reducción de Wq al añadir un servidor es mayor cuando ρ es alto')
console.log('  (impacto marginal decrece: mayor beneficio cerca de la saturación)')
