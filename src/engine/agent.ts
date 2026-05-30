// Agente de optimización con brain.js: red neuronal que aprende a ajustar servidores y lambda para minimizar Wq

import { Passenger, PassengerType } from './passenger'

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type AgentDecision = 'wait' | 'change_queue' | 'abandon' | 'proceed'

export type SupervisorDecision = 'open_server' | 'close_server' | 'redirect' | 'none'

export interface EnvironmentState {
  queues: {
    checkin:  number[]   // longitudes de sub-colas de check-in
    security: number[]   // longitudes de sub-colas de seguridad
    boarding: number[]   // longitudes de sub-colas de embarque
  }
  currentTime:      number
  availableServers: { checkin: number; security: number }
}

// ── PassengerAgent ────────────────────────────────────────────────────────────

export class PassengerAgent extends Passenger {
  // Percepción más reciente
  #perceivedQueues:  EnvironmentState['queues'] | null  = null
  #perceivedServers: EnvironmentState['availableServers'] | null = null
  #perceivedTime:    number = 0
  #waitTime:         number = 0   // tiempo de espera calculado en perceive()

  // Registro de decisiones tomadas
  readonly decisionLog: AgentDecision[] = []

  constructor(type: PassengerType = 'standard', flightId = 0, arrivedAt = 0) {
    super(type, flightId, arrivedAt)
  }

  // Observa el entorno y actualiza el tiempo de espera actual
  perceive(env: EnvironmentState): void {
    this.#perceivedQueues  = env.queues
    this.#perceivedServers = env.availableServers
    this.#perceivedTime    = env.currentTime

    const ts = this.timestamps
    if      (this.state === 'checkin_q')  this.#waitTime = env.currentTime - ts.checkinStart
    else if (this.state === 'security_q') this.#waitTime = env.currentTime - ts.securityStart
    else if (this.state === 'boarding_q') this.#waitTime = env.currentTime - ts.boardingStart
    else                                  this.#waitTime = 0
  }

  // Lógica de decisión basada en la percepción más reciente
  decide(): AgentDecision {
    if (!this.#perceivedQueues || !this.#perceivedServers) return 'wait'
    if (this.state === 'abandoned' || this.state === 'boarded') return 'wait'

    // Regla 1: abandona si la espera supera el 80% de la paciencia
    if (this.#waitTime > this.patience * 0.8) return 'abandon'

    // Regla 2: cambia si hay otra sub-cola ≥30% más corta
    const current  = this.#currentSubQueueLength()
    const shortest = this.#shortestSubQueueLength()
    if (shortest !== null && current > 0 && shortest < current * 0.7) return 'change_queue'

    // Regla 3: avanza si hay servidor libre en la estación actual
    const servers = this.#perceivedServers
    if (this.state === 'checkin_q'  && servers.checkin  > 0) return 'proceed'
    if (this.state === 'security_q' && servers.security > 0) return 'proceed'
    if (this.state === 'boarding_q')                         return 'proceed'

    return 'wait'
  }

  // Ejecuta la decisión y actualiza el estado del pasajero
  act(decision: AgentDecision, env: EnvironmentState): void {
    this.decisionLog.push(decision)

    switch (decision) {
      case 'abandon':
        this.setState('abandoned', env.currentTime)
        break

      case 'proceed':
        if      (this.state === 'checkin_q')  this.setState('checkin_s',  env.currentTime)
        else if (this.state === 'security_q') this.setState('security_s', env.currentTime)
        else if (this.state === 'boarding_q') this.setState('boarding_s', env.currentTime)
        break

      case 'change_queue':
        // Re-entrar a la misma estación reinicia el timer de espera (nueva sub-cola)
        if      (this.state === 'checkin_q')  this.setState('checkin_q',  env.currentTime)
        else if (this.state === 'security_q') this.setState('security_q', env.currentTime)
        else if (this.state === 'boarding_q') this.setState('boarding_q', env.currentTime)
        break

      case 'wait':
        break
    }
  }

  // ── Helpers privados ────────────────────────────────────────────────────

  // Longitud de la sub-cola donde está conceptualmente este pasajero
  #currentSubQueueLength(): number {
    const qs = this.#stationQueues()
    if (!qs || qs.length === 0) return 0
    return qs[this.id % qs.length]
  }

  // Longitud de la sub-cola más corta en la misma estación
  #shortestSubQueueLength(): number | null {
    const qs = this.#stationQueues()
    if (!qs || qs.length <= 1) return null   // sin alternativa
    return Math.min(...qs)
  }

  #stationQueues(): number[] | null {
    if (!this.#perceivedQueues) return null
    if (this.state === 'checkin_q')  return this.#perceivedQueues.checkin
    if (this.state === 'security_q') return this.#perceivedQueues.security
    if (this.state === 'boarding_q') return this.#perceivedQueues.boarding
    return null
  }
}

// ── SupervisorAgent ───────────────────────────────────────────────────────────

export class SupervisorAgent {
  readonly #totalServers: { checkin: number; security: number }
  #perceivedRho: { checkin: number; security: number }
  #perceivedEnv: EnvironmentState | null

  readonly decisionLog: SupervisorDecision[] = []

  constructor(totalServers: { checkin: number; security: number }) {
    this.#totalServers  = { ...totalServers }
    this.#perceivedRho  = { checkin: 0, security: 0 }
    this.#perceivedEnv  = null
  }

  // Estima ρ por estación a partir de los servidores libres
  perceive(env: EnvironmentState): void {
    this.#perceivedEnv = env
    const { checkin: freeC, security: freeS } = env.availableServers
    const totalC = this.#totalServers.checkin
    const totalS = this.#totalServers.security

    this.#perceivedRho = {
      checkin:  totalC > 0 ? (totalC - freeC) / totalC : 0,
      security: totalS > 0 ? (totalS - freeS) / totalS : 0,
    }
  }

  // Decide acción de gestión basándose en la utilización observada
  decide(): SupervisorDecision {
    const { checkin, security } = this.#perceivedRho

    if (checkin > 0.85 || security > 0.85) return 'open_server'
    if (checkin < 0.40 && security < 0.40) return 'close_server'

    // Redirige si hay desequilibrio notable entre colas
    if (this.#perceivedEnv) {
      const cLoad = this.#perceivedEnv.queues.checkin.reduce((a, b) => a + b, 0)
      const sLoad = this.#perceivedEnv.queues.security.reduce((a, b) => a + b, 0)
      if (Math.abs(cLoad - sLoad) > 4) return 'redirect'
    }

    return 'none'
  }

  // Registra la decisión y aplica el efecto conceptual
  act(decision: SupervisorDecision, queues: EnvironmentState['queues']): void {
    this.decisionLog.push(decision)
    // El efecto real (abrir/cerrar servidor, redirigir pasajeros) lo aplica el EventLoop;
    // aquí se registra la intención para que el orquestador la procese.
    void queues
  }

  get perceivedRho(): Readonly<{ checkin: number; security: number }> {
    return { ...this.#perceivedRho }
  }

  // Conteo de decisiones por tipo
  decisionCounts(): Record<SupervisorDecision, number> {
    const counts: Record<SupervisorDecision, number> =
      { open_server: 0, close_server: 0, redirect: 0, none: 0 }
    for (const d of this.decisionLog) counts[d]++
    return counts
  }
}

// ── Test ───────────────────────────────────────────────────────────────────────

function runTest() {
  Passenger.resetCounter()

  const SIM_TIME   = 30      // minutos de simulación
  const DT         = 0.5     // paso por tick
  const N_AGENTS   = 20
  const SPAWN_INTERVAL = SIM_TIME / N_AGENTS   // 1 agente cada 1.5 min

  const supervisor = new SupervisorAgent({ checkin: 4, security: 3 })
  const agents: PassengerAgent[] = []
  let nextSpawn    = SPAWN_INTERVAL

  // Conteo global de decisiones de pasajeros
  const totals: Record<AgentDecision, number> = { wait: 0, change_queue: 0, abandon: 0, proceed: 0 }

  // ── Bucle de simulación ────────────────────────────────────────────────────
  for (let t = 0; t <= SIM_TIME; t = +(t + DT).toFixed(4)) {

    // Generar nuevos agentes al ritmo de spawn
    while (nextSpawn <= t && agents.length < N_AGENTS) {
      const a = new PassengerAgent('standard', 0, t)
      a.setState('checkin_q', t)
      agents.push(a)
      nextSpawn += SPAWN_INTERVAL
    }

    // ── Construir estado del entorno ─────────────────────────────────────────
    const inCheckin  = agents.filter(a => a.state === 'checkin_q')
    const inSecurity = agents.filter(a => a.state === 'security_q')
    const inBoarding = agents.filter(a => a.state === 'boarding_q')

    // Sub-colas desbalanceadas intencionalmente: agentes con id par van al contador A
    const cA = inCheckin.filter(a => a.id % 2 === 0).length
    const cB = inCheckin.length - cA
    const sA = inSecurity.filter(a => a.id % 2 === 0).length
    const sB = inSecurity.length - sA

    // Servidores libres: 0 si la cola supera la capacidad por servidor
    const freeCheckin  = Math.max(0, 4 - Math.min(4, Math.ceil(inCheckin.length  / 2)))
    const freeSecurity = Math.max(0, 3 - Math.min(3, Math.ceil(inSecurity.length / 2)))

    const env: EnvironmentState = {
      queues: {
        checkin:  [cA, cB],
        security: [sA, sB],
        boarding: [inBoarding.length],
      },
      currentTime:      t,
      availableServers: { checkin: freeCheckin, security: freeSecurity },
    }

    // ── Ciclo del supervisor ─────────────────────────────────────────────────
    supervisor.perceive(env)
    const supDecision = supervisor.decide()
    supervisor.act(supDecision, env.queues)

    // ── Ciclo de agentes ─────────────────────────────────────────────────────
    for (const agent of agents) {
      const s = agent.state
      if (s === 'abandoned' || s === 'boarded') continue

      agent.perceive(env)
      const decision = agent.decide()
      totals[decision]++
      agent.act(decision, env)

      // Avance de servicio: tras tiempo suficiente en servicio → siguiente estación
      const ts = agent.timestamps
      if (agent.state === 'checkin_s'  && t - ts.checkinStart  > 1.2) {
        agent.setState('security_q', t)
      }
      if (agent.state === 'security_s' && t - ts.securityStart > 1.0) {
        agent.setState('waiting_gate', t)
        agent.setState('boarding_q',   t)
      }
      if (agent.state === 'boarding_s' && t - ts.boardingStart > 0.5) {
        agent.setState('boarded', t)
      }
    }
  }

  // ── Resultados ────────────────────────────────────────────────────────────
  const boarded   = agents.filter(a => a.state === 'boarded').length
  const abandoned = agents.filter(a => a.state === 'abandoned').length
  const pending   = agents.filter(a => a.state !== 'boarded' && a.state !== 'abandoned').length

  console.log('\n══════════════════════════════════════════════════════')
  console.log('  Test Agents  — 20 pasajeros + 1 supervisor, 30 min')
  console.log('══════════════════════════════════════════════════════')

  console.log(`\n── Pasajeros ────────────────────────────────────────`)
  console.log(`  Abordaron : ${boarded}`)
  console.log(`  Abandonaron: ${abandoned}`)
  console.log(`  Pendientes : ${pending}`)

  console.log(`\n── Decisiones de pasajeros (total ticks) ────────────`)
  const totalDec = Object.values(totals).reduce((a, b) => a + b, 0)
  for (const [k, v] of Object.entries(totals)) {
    console.log(`  ${k.padEnd(14)}: ${String(v).padStart(5)}  (${(v / totalDec * 100).toFixed(1)}%)`)
  }
  console.log(`  ✓ change_queue ocurrió: ${totals.change_queue > 0}`)

  console.log(`\n── Decisiones del supervisor ────────────────────────`)
  const sc = supervisor.decisionCounts()
  for (const [k, v] of Object.entries(sc)) {
    console.log(`  ${k.padEnd(14)}: ${v}`)
  }
  const lastRho = supervisor.perceivedRho
  console.log(`  ρ final: checkin=${lastRho.checkin.toFixed(3)}  security=${lastRho.security.toFixed(3)}`)

  console.log(`\n── Detalle por agente (muestra: primeros 8) ─────────`)
  for (const a of agents.slice(0, 8)) {
    const changes = a.decisionLog.filter(d => d === 'change_queue').length
    const total   = a.decisionLog.length
    console.log(
      `  #${String(a.id).padStart(2)} [${a.type}]` +
      `  estado=${a.state.padEnd(12)}` +
      `  espera_total=${a.getTotalWaitTime().toFixed(2).padStart(5)} min` +
      `  change_queue=${changes}/${total}`,
    )
  }
}

runTest()
