// Cola M/M/c · M/G/c · M/M/1: servidores, abandono por paciencia, métricas y validación Erlang C

import jStat from 'jstat'
import { Passenger } from './passenger'

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type QueueType = 'MMc' | 'MGc' | 'MM1'

export interface QueueConfig {
  type:      QueueType
  servers:   number      // número de servidores c
  mu:        number      // tasa de servicio por servidor (clientes/min)
  sigma?:    number      // desviación estándar del tiempo de servicio (solo MGc)
  capacity:  number      // máximo de pasajeros en sala de espera
}

export interface QueueMetrics {
  Lq:          number   // promedio de clientes en cola (time-average)
  Wq:          number   // tiempo medio de espera en cola (min)
  rho:         number   // utilización por servidor = λ/(c·μ)
  utilization: number   // fracción promedio de servidores ocupados (simulado)
}

// ── jStat shim ────────────────────────────────────────────────────────────────

type JStatSub = {
  exponential: { sample: (rate: number) => number }
  normal:      { sample: (mean: number, std: number) => number }
}
const jstat = jStat as unknown as JStatSub

// ── Utilidades ────────────────────────────────────────────────────────────────

function factorial(n: number): number {
  if (n <= 1) return 1
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

// Box-Muller para M/G/c — fórmula exacta del enunciado
function boxMuller(mu: number, sigma: number): number {
  const u1 = Math.random(), u2 = Math.random()
  const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return Math.max(0.1, mu + sigma * z)
}

// Muestra exponencial con fallback si jStat no responde
function expSample(mu: number): number {
  try { return jstat.exponential.sample(mu) } catch { /* fallback */ }
  return -Math.log(Math.random()) / mu
}

// ── Clase Queue ───────────────────────────────────────────────────────────────

export class Queue {
  readonly waiting: Passenger[]                  // sala de espera FIFO
  readonly serving: Map<number, Passenger>       // servidor → pasajero en servicio
  readonly config:  QueueConfig
  readonly stats:   { totalServed: number; totalAbandoned: number; totalWaitTime: number }

  // Internos
  #serviceTimers:  Map<number, number>   // servidor → tiempo restante de servicio
  #queueEntryTime: Map<number, number>   // passenger.id → instante de llegada a cola
  #sumQueueLength: number                // ∫ Lq dt  (para calcular promedio)
  #sumUtilization: number                // ∫ (busy/c) dt
  #totalSimTime:   number
  #totalArrived:   number

  constructor(config: QueueConfig) {
    if (config.servers < 1)  throw new Error('servers debe ser ≥ 1')
    if (config.mu <= 0)      throw new Error('mu debe ser > 0')
    if (config.capacity < 1) throw new Error('capacity debe ser ≥ 1')

    this.config  = { ...config }
    this.waiting = []
    this.serving = new Map()
    this.stats   = { totalServed: 0, totalAbandoned: 0, totalWaitTime: 0 }

    this.#serviceTimers  = new Map()
    this.#queueEntryTime = new Map()
    this.#sumQueueLength = 0
    this.#sumUtilization = 0
    this.#totalSimTime   = 0
    this.#totalArrived   = 0
  }

  // Añade un pasajero a la sala de espera.
  // Retorna false si la sala está llena (capacity superada).
  enqueue(passenger: Passenger, currentTime: number): boolean {
    if (this.waiting.length >= this.config.capacity) return false
    if (passenger.type === 'vip') {
      const idx = this.waiting.findIndex(p => p.type === 'standard')
      if (idx === -1) {
        this.waiting.push(passenger)
      } else {
        this.waiting.splice(idx, 0, passenger)
      }
    } else {
      this.waiting.push(passenger)
    }
    this.#queueEntryTime.set(passenger.id, currentTime)
    this.#totalArrived++
    return true
  }

  // Avanza dt minutos de simulación.
  // Retorna los pasajeros cuyo servicio terminó en este tick.
  tick(currentTime: number, dt: number): Passenger[] {
    const finished: Passenger[] = []

    // ── Acumuladores de tiempo ─────────────────────────────────────────────
    this.#totalSimTime   += dt
    this.#sumQueueLength += this.waiting.length * dt
    this.#sumUtilization += (this.serving.size / this.config.servers) * dt

    // ── Avanzar timers de servicio ─────────────────────────────────────────
    const completing: number[] = []
    for (const [svrIdx] of this.serving) {
      const remaining = (this.#serviceTimers.get(svrIdx) ?? 0) - dt
      if (remaining <= 0) {
        completing.push(svrIdx)
      } else {
        this.#serviceTimers.set(svrIdx, remaining)
      }
    }
    for (const svrIdx of completing) {
      finished.push(this.serving.get(svrIdx)!)
      this.serving.delete(svrIdx)
      this.#serviceTimers.delete(svrIdx)
      this.stats.totalServed++
    }

    // ── Mover espera → servidores libres ───────────────────────────────────
    while (this.waiting.length > 0 && this.serving.size < this.config.servers) {
      const svrIdx    = this.#findFreeServer()
      const passenger = this.waiting.shift()!
      const entryTime = this.#queueEntryTime.get(passenger.id) ?? currentTime
      const waitTime  = currentTime - entryTime

      this.stats.totalWaitTime += waitTime
      this.serving.set(svrIdx, passenger)
      this.#serviceTimers.set(svrIdx, this.generateServiceTime())
      this.#queueEntryTime.delete(passenger.id)
    }

    // ── Abandono por impaciencia (de atrás hacia adelante para safe-splice) ─
    for (let i = this.waiting.length - 1; i >= 0; i--) {
      const p         = this.waiting[i]
      const entryTime = this.#queueEntryTime.get(p.id) ?? currentTime
      if (currentTime - entryTime >= p.patience) {
        this.waiting.splice(i, 1)
        this.#queueEntryTime.delete(p.id)
        this.stats.totalAbandoned++
      }
    }

    return finished
  }

  // Tiempo de servicio según el tipo de cola configurado
  generateServiceTime(): number {
    const { type, mu, sigma } = this.config
    if (type === 'MGc') {
      return boxMuller(1 / mu, sigma ?? (1 / mu) * 0.3)
    }
    // MM1 y MMc: exponencial con media 1/mu
    return expSample(mu)
  }

  // Métricas basadas en los acumuladores de la simulación
  getMetrics(): QueueMetrics {
    const simTime  = Math.max(this.#totalSimTime, 1e-9)
    const served   = Math.max(this.stats.totalServed, 1)
    const estLambda = this.#totalArrived / simTime

    return {
      Lq:          this.#sumQueueLength / simTime,
      Wq:          this.stats.totalWaitTime / served,
      rho:         estLambda / (this.config.servers * this.config.mu),
      utilization: this.#sumUtilization / simTime,
    }
  }

  // Erlang C — P(esperar) para M/M/c.
  // lambda: tasa de llegadas conocida; si se omite, se estima de la simulación.
  // Retorna probabilidad de que un cliente entrante deba esperar.
  erlangC(lambda?: number): number {
    const c   = this.config.servers
    const mu  = this.config.mu
    const lam = lambda ?? (this.#totalArrived / Math.max(this.#totalSimTime, 1e-9))
    const a   = lam / mu               // carga ofrecida total (Erlangs)
    const rho = lam / (c * mu)         // utilización por servidor

    if (rho >= 1) return 1             // sistema inestable

    // ── P0: probabilidad de sistema vacío ──────────────────────────────────
    let sumTerms = 0
    for (let k = 0; k < c; k++) {
      sumTerms += Math.pow(a, k) / factorial(k)
    }
    const cTerm = Math.pow(a, c) / (factorial(c) * (1 - rho))
    const p0    = 1 / (sumTerms + cTerm)

    return cTerm * p0   // Erlang C = fracción de llegadas que esperan
  }

  reset(): void {
    this.waiting.length = 0
    this.serving.clear()
    this.stats.totalServed    = 0
    this.stats.totalAbandoned = 0
    this.stats.totalWaitTime  = 0
    this.#serviceTimers.clear()
    this.#queueEntryTime.clear()
    this.#sumQueueLength = 0
    this.#sumUtilization = 0
    this.#totalSimTime   = 0
    this.#totalArrived   = 0
  }

  #findFreeServer(): number {
    for (let i = 0; i < this.config.servers; i++) {
      if (!this.serving.has(i)) return i
    }
    return 0
  }
}

// ── Test ───────────────────────────────────────────────────────────────────────

/**
 * Simula M/M/c durante T minutos con llegadas Poisson(λ).
 * Sin tiempo extra de drenaje: simEnd = T exacto, lo que garantiza
 * λ̂ = arrived/T ≈ λ.  Para T grande el arranque (<2% de T) no sesga
 * el promedio de Lq de forma perceptible.
 */
function simulate(T: number, lambda: number, mu: number, c: number, dt: number) {
  Passenger.resetCounter()
  const q = new Queue({ type: 'MMc', servers: c, mu, capacity: 1000 })

  const arrivals: number[] = []
  let tAcc = 0
  while (tAcc < T) {
    tAcc += -Math.log(Math.random()) / lambda
    if (tAcc < T) arrivals.push(tAcc)
  }

  const steps = Math.ceil(T / dt)
  let arrIdx  = 0
  for (let step = 0; step <= steps; step++) {
    const t = step * dt
    while (arrIdx < arrivals.length && arrivals[arrIdx] <= t) {
      q.enqueue(new Passenger('standard', 1, arrivals[arrIdx]), t)
      arrIdx++
    }
    q.tick(t, dt)
  }
  return { q, arrived: arrivals.length }
}

function runTest() {
  const LAMBDA = 4    // llegadas/min
  const MU     = 2    // servicio/min por servidor
  const C      = 3    // servidores
  const DT     = 0.01 // paso de simulación (min)

  // ── Métricas analíticas de referencia ─────────────────────────────────────
  const rhoRef    = LAMBDA / (C * MU)
  const qRef      = new Queue({ type: 'MMc', servers: C, mu: MU, capacity: 200 })
  const pWait     = qRef.erlangC(LAMBDA)
  const LqRef     = pWait * rhoRef / (1 - rhoRef)
  const WqRef     = LqRef / LAMBDA

  console.log('\n══════════════════════════════════════════════════════')
  console.log('  Test Queue M/M/c')
  console.log('══════════════════════════════════════════════════════')
  console.log(`\nParámetros: λ=${LAMBDA}/min  μ=${MU}/srv  c=${C}  ρ=${rhoRef.toFixed(4)}`)
  console.log('\n── Analítico (Erlang C) ─────────────────────────────')
  console.log(`  P(esperar) = ${pWait.toFixed(4)}`)
  console.log(`  Lq         = ${LqRef.toFixed(4)}`)
  console.log(`  Wq         = ${WqRef.toFixed(4)}  min`)

  // ── Corrida "50 pasajeros" (T ≈ 12.5 min, transitorio) ───────────────────
  const T_SHORT = 50 / LAMBDA   // 12.5 min → ~50 llegadas esperadas
  const { q: qs, arrived: ns } = simulate(T_SHORT, LAMBDA, MU, C, DT)
  const ms = qs.getMetrics()
  console.log(`\n── Simulado  T=${T_SHORT.toFixed(1)} min  (${ns} llegadas, transitorio) ──────`)
  console.log(`  ρ̂      = ${ms.rho.toFixed(4)}  Lq = ${ms.Lq.toFixed(4)}  Wq = ${ms.Wq.toFixed(4)}`)
  console.log(`  Atend. ${qs.stats.totalServed}/${ns}  Aban. ${qs.stats.totalAbandoned}`)
  console.log(`  ⚠  T corto → alta varianza: error esperado ±50-80%`)

  // ── Corrida larga (T=500 min ≈ 2 000 llegadas, estado estacionario) ───────
  const { q: ql, arrived: nl } = simulate(500, LAMBDA, MU, C, DT)
  const ml     = ql.getMetrics()
  const errLq  = Math.abs(ml.Lq - LqRef)
  const relErr = (errLq / LqRef * 100).toFixed(1)

  console.log(`\n── Simulado  T=500 min  (${nl} llegadas, estado estacionario) ─────`)
  console.log(`  ρ̂          = ${ml.rho.toFixed(4)}  (ideal ${rhoRef.toFixed(4)})`)
  console.log(`  Lq         = ${ml.Lq.toFixed(4)}  (ideal ${LqRef.toFixed(4)})`)
  console.log(`  Wq         = ${ml.Wq.toFixed(4)}  min  (ideal ${WqRef.toFixed(4)})`)
  console.log(`  Utiliz.    = ${(ml.utilization * 100).toFixed(1)}%  (ideal ${(rhoRef*100).toFixed(1)}%)`)
  console.log(`  Atendidos  : ${ql.stats.totalServed}  Abandonados: ${ql.stats.totalAbandoned}`)

  console.log('\n── Comparación (T=500) vs Erlang C ──────────────────')
  console.log(`  ΔLq = |${ml.Lq.toFixed(4)} − ${LqRef.toFixed(4)}| = ${errLq.toFixed(4)}  (${relErr}%)`)
  console.log(`  ✓ convergencia ≤ 20%: ${errLq < LqRef * 0.20}`)
  console.log(`  (varianza residual normal: exponencial tiene CV=1, M/M/c sensible a ρ)`)

  // ── generateServiceTime — verificación de distribuciones ─────────────────
  console.log('\n── generateServiceTime()  media de 1 000 muestras ───')
  const testMu = 3
  for (const [type, label] of [
    ['MM1', `Exp(μ=3)          esperado=${(1/testMu).toFixed(4)}`],
    ['MMc', `Exp(μ=3)          esperado=${(1/testMu).toFixed(4)}`],
    ['MGc', `BoxMuller(1/3,σ)  esperado=${(1/testMu).toFixed(4)}`],
  ] as [QueueType, string][]) {
    const qt = new Queue({ type, servers: 2, mu: testMu, sigma: 0.08, capacity: 50 })
    let sum = 0
    for (let i = 0; i < 1000; i++) sum += qt.generateServiceTime()
    console.log(`  ${type.padEnd(4)}: media=${(sum/1000).toFixed(4)}  ${label}`)
  }
}

