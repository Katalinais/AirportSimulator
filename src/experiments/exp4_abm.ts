// Experimento 4 — Colas separadas (clásico) vs cola agrupada (ABM óptimo)
//
// Justificación: el ABM permite cambiar de fila si hay una >30% más corta.
// El efecto teórico equivale a un pooling parcial de servidores.
// Se compara el caso extremo:
//   Clásico:    k colas M/M/1 independientes con asignación aleatoria
//   ABM óptimo: 1 cola M/M/k agrupada (pooling perfecto)
// La diferencia en Wq es el techo de mejora que un ABM real puede alcanzar.
//
// Uso: npx tsx src/experiments/exp4_abm.ts

import { Passenger } from '../engine/passenger'
import { Queue }     from '../engine/queue'

const MU  = 4      // tasa de servicio por servidor
const K   = 3      // número de servidores (fijo como en el simulador)
const T   = 600
const DT  = 0.05
const REP = 8

// Escenarios con distintos ρ
const SCENARIOS = [
  { label: 'ρ = 0.50', lambda: 6  },
  { label: 'ρ = 0.67', lambda: 8  },
  { label: 'ρ = 0.75', lambda: 9  },
  { label: 'ρ = 0.83', lambda: 10 },
]

// ── Clásico: K colas M/M/1 con asignación aleatoria ──────────────────────────

function runSeparate(lambda: number): number {
  Passenger.resetCounter()
  const queues = Array.from({ length: K }, () =>
    new Queue({ type: 'MMc', servers: 1, mu: MU, capacity: 2000 }),
  )

  // Generar llegadas y distribuirlas aleatoriamente entre K colas
  const arrivals: { t: number; qi: number }[] = []
  let t = 0
  while (t < T) {
    t += -Math.log(Math.random()) / lambda
    if (t < T) arrivals.push({ t, qi: Math.floor(Math.random() * K) })
  }
  arrivals.sort((a, b) => a.t - b.t)

  const steps = Math.ceil(T / DT)
  let idx = 0
  for (let s = 0; s <= steps; s++) {
    const now = s * DT
    while (idx < arrivals.length && arrivals[idx].t <= now) {
      const { t: at, qi } = arrivals[idx++]
      const p = new Passenger('standard', 0, at)
      p.patience = 9999
      queues[qi].enqueue(p, now)
    }
    for (const q of queues) q.tick(now, DT)
  }

  // Wq ponderado por pasajeros atendidos en cada cola
  let totalServed = 0, totalWait = 0
  for (const q of queues) {
    totalServed += q.stats.totalServed
    totalWait   += q.getMetrics().Wq * q.stats.totalServed
  }
  return totalServed > 0 ? totalWait / totalServed : 0
}

// ── ABM óptimo: 1 cola M/M/K agrupada ────────────────────────────────────────

function runPooled(lambda: number): number {
  Passenger.resetCounter()
  const q = new Queue({ type: 'MMc', servers: K, mu: MU, capacity: 2000 })

  const arrivals: number[] = []
  let t = 0
  while (t < T) {
    t += -Math.log(Math.random()) / lambda
    if (t < T) arrivals.push(t)
  }

  const steps = Math.ceil(T / DT)
  let idx = 0
  for (let s = 0; s <= steps; s++) {
    const now = s * DT
    while (idx < arrivals.length && arrivals[idx] <= now) {
      const p = new Passenger('standard', 0, arrivals[idx++])
      p.patience = 9999
      q.enqueue(p, now)
    }
    q.tick(now, DT)
  }
  return q.getMetrics().Wq
}

// ── Referencias analíticas ────────────────────────────────────────────────────

function erlangWq(lambda: number, c: number): number {
  const rho = lambda / (c * MU)
  if (rho >= 1) return Infinity
  const q  = new Queue({ type: 'MMc', servers: c, mu: MU, capacity: 2000 })
  const C  = q.erlangC(lambda)
  return C * rho / (1 - rho) / lambda
}

function mm1Wq(lambda: number): number {
  // Cada cola M/M/1 recibe λ/K
  const lam = lambda / K
  const rho = lam / MU
  if (rho >= 1) return Infinity
  return rho / (MU * (1 - rho))
}

// ── Ejecutar ──────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════════════════')
console.log(`  Experimento 4 — Colas separadas vs agrupadas  (K=${K} servidores, μ=${MU}/min)`)
console.log(`  T=${T} min  rep=${REP}`)
console.log('══════════════════════════════════════════════════════════════════════\n')
console.log('Escenario   Wq_sep (sim)  Wq_pool (sim)  Mejora(%)  Wq_sep (EC)  Wq_pool (EC)')
console.log('──────────  ───────────  ─────────────  ─────────  ───────────  ────────────')

for (const { label, lambda } of SCENARIOS) {
  let sumSep = 0, sumPool = 0
  for (let r = 0; r < REP; r++) {
    sumSep  += runSeparate(lambda)
    sumPool += runPooled(lambda)
  }
  const wqSep  = sumSep  / REP
  const wqPool = sumPool / REP
  const mejora = (wqSep - wqPool) / wqSep * 100

  const wqSepEC  = mm1Wq(lambda)
  const wqPoolEC = erlangWq(lambda, K)

  console.log(
    `${label.padEnd(10)}  ` +
    `${wqSep.toFixed(4).padEnd(11)}  ` +
    `${wqPool.toFixed(4).padEnd(13)}  ` +
    `${(mejora.toFixed(1) + '%').padEnd(9)}  ` +
    `${wqSepEC.toFixed(4).padEnd(11)}  ` +
    `${wqPoolEC.toFixed(4)}`,
  )
}

console.log('\nColumnas:')
console.log('  Wq_sep  → K colas M/M/1 con asignación aleatoria (sin ABM)')
console.log('  Wq_pool → 1 cola M/M/K agrupada (ABM óptimo, switching perfecto)')
console.log('  Mejora  → reducción de Wq que el ABM real puede aproximar')
console.log('\n→ Hipótesis: la mejora aumenta cuando ρ es alto')
console.log('  (pooling es más valioso cerca de la saturación)')
