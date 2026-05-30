// Bucle de eventos discretos: gestiona la secuencia de llegadas, servicios y transiciones de estado tick a tick

import { Passenger }        from './passenger'
import { Plane }             from './plane'
import { Queue, QueueMetrics } from './queue'
import { PoissonGenerator }  from './poisson'

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type EventType =
  | 'PASSENGER_ARRIVE'
  | 'CHECKIN_DONE'
  | 'SECURITY_DONE'
  | 'BOARDING_DONE'
  | 'FLIGHT_DEPART'
  | 'PASSENGER_ABANDON'
  | 'WEATHER_EVENT'
  | 'ACCIDENT_EVENT'

export interface SimEvent {
  time:    number
  type:    EventType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any
}

export interface SimConfig {
  lambda:             number   // llegadas/min (base)
  peakHour:           boolean
  c1:                 number   // servidores check-in
  mu1:                number   // tasa servicio check-in
  capacity1:          number   // capacidad cola check-in
  c2:                 number   // servidores seguridad
  mu2:                number   // tasa servicio seguridad
  sigma2:             number   // σ seguridad (M/G/c)
  gates:              number   // número de puertas / colas de embarque
  delayProb:          number   // probabilidad de retraso por vuelo [0,1]
  patienceThreshold:  number   // minutos máximos de espera (referencia global)
  speed:              number   // multiplicador de velocidad de simulación
}

export interface SimQueues {
  checkin:  Queue
  security: Queue
  boarding: Queue[]   // una cola por puerta
}

export interface SimState {
  passengers:  Passenger[]
  planes:      Plane[]
  queues:      SimQueues
  currentTime: number
  metrics: {
    checkin:  QueueMetrics
    security: QueueMetrics
    boarding: QueueMetrics[]
  }
}

// ── MinHeap ───────────────────────────────────────────────────────────────────

class MinHeap {
  #data: SimEvent[] = []

  get size(): number { return this.#data.length }

  push(event: SimEvent): void {
    this.#data.push(event)
    this.#bubbleUp(this.#data.length - 1)
  }

  pop(): SimEvent | undefined {
    if (this.#data.length === 0) return undefined
    const top  = this.#data[0]
    const last = this.#data.pop()!
    if (this.#data.length > 0) {
      this.#data[0] = last
      this.#siftDown(0)
    }
    return top
  }

  peek(): SimEvent | undefined { return this.#data[0] }

  clear(): void { this.#data = [] }

  #bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.#data[parent].time <= this.#data[i].time) break
      ;[this.#data[parent], this.#data[i]] = [this.#data[i], this.#data[parent]]
      i = parent
    }
  }

  #siftDown(i: number): void {
    const n = this.#data.length
    while (true) {
      let smallest = i
      const l = 2 * i + 1, r = 2 * i + 2
      if (l < n && this.#data[l].time < this.#data[smallest].time) smallest = l
      if (r < n && this.#data[r].time < this.#data[smallest].time) smallest = r
      if (smallest === i) break
      ;[this.#data[i], this.#data[smallest]] = [this.#data[smallest], this.#data[i]]
      i = smallest
    }
  }
}

// ── EventLoop ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: SimConfig = {
  lambda:            4,
  peakHour:          false,
  c1:                3,
  mu1:               3,
  capacity1:         50,
  c2:                2,
  mu2:               2,
  sigma2:            0.1,
  gates:             3,
  delayProb:         0.1,
  patienceThreshold: 8,
  speed:             1,
}

export class EventLoop {
  #config:    SimConfig
  #heap:      MinHeap
  #poisson:   PoissonGenerator
  #checkin:   Queue
  #security:  Queue
  #boarding:  Queue[]
  #passengers: Passenger[]
  #planes:    Plane[]
  #currentTime: number

  // Estadísticas de alto nivel
  #totalArrived:   number
  #totalBoarded:   number
  #totalAbandoned: number

  constructor(config: Partial<SimConfig> = {}) {
    this.#config = { ...DEFAULT_CONFIG, ...config }
    this.#heap   = new MinHeap()
    this.#currentTime = 0
    this.#passengers  = []
    this.#planes      = []
    this.#totalArrived   = 0
    this.#totalBoarded   = 0
    this.#totalAbandoned = 0

    this.#poisson  = new PoissonGenerator(this.#config.lambda)
    this.#checkin  = this.#makeCheckin()
    this.#security = this.#makeSecurity()
    this.#boarding = this.#makeBoarding()

    if (this.#config.peakHour) this.#poisson.setPeak(true)

    // Programar primera llegada y primeros vuelos
    this.#scheduleNextArrival()
    this.#spawnInitialFlights()
  }

  // ── API pública ──────────────────────────────────────────────────────────

  tick(dt: number): SimState {
    const simDt      = dt * this.#config.speed
    const targetTime = this.#currentTime + simDt

    // Procesar todos los eventos discretos hasta targetTime
    while (this.#heap.size > 0 && this.#heap.peek()!.time <= targetTime) {
      const event = this.#heap.pop()!
      this.#currentTime = event.time
      this.#processEvent(event)
    }

    // Avanzar colas continuas (timers de servicio) con el paso completo
    this.#currentTime = targetTime
    this.#tickQueues(simDt)

    return this.getState()
  }

  updateConfig(partial: Partial<SimConfig>): void {
    const prev = this.#config
    this.#config = { ...prev, ...partial }

    if (partial.lambda !== undefined) this.#poisson.setLambda(partial.lambda)
    if (partial.peakHour !== undefined) this.#poisson.setPeak(partial.peakHour)

    if (
      partial.c1 !== undefined || partial.mu1 !== undefined ||
      partial.capacity1 !== undefined
    ) {
      this.#checkin = this.#makeCheckin()
    }
    if (
      partial.c2 !== undefined || partial.mu2 !== undefined || partial.sigma2 !== undefined
    ) {
      this.#security = this.#makeSecurity()
    }
    if (partial.gates !== undefined) {
      this.#boarding = this.#makeBoarding()
    }
  }

  reset(): void {
    Passenger.resetCounter()
    Plane.resetCounter()
    this.#heap.clear()
    this.#passengers     = []
    this.#planes         = []
    this.#currentTime    = 0
    this.#totalArrived   = 0
    this.#totalBoarded   = 0
    this.#totalAbandoned = 0
    this.#poisson.reset()
    this.#checkin.reset()
    this.#security.reset()
    this.#boarding.forEach(q => q.reset())
    if (this.#config.peakHour) this.#poisson.setPeak(true)
    this.#scheduleNextArrival()
    this.#spawnInitialFlights()
  }

  getState(): SimState {
    return {
      passengers:  [...this.#passengers],
      planes:      [...this.#planes],
      queues: {
        checkin:  this.#checkin,
        security: this.#security,
        boarding: [...this.#boarding],
      },
      currentTime: this.#currentTime,
      metrics: {
        checkin:  this.#checkin.getMetrics(),
        security: this.#security.getMetrics(),
        boarding: this.#boarding.map(q => q.getMetrics()),
      },
    }
  }

  // Acceso rápido a totales para el test
  get totalArrived():   number { return this.#totalArrived   }
  get totalBoarded():   number { return this.#totalBoarded   }
  get totalAbandoned(): number { return this.#totalAbandoned }

  // ── Constructores de colas ───────────────────────────────────────────────

  #makeCheckin(): Queue {
    return new Queue({
      type:     'MMc',
      servers:  this.#config.c1,
      mu:       this.#config.mu1,
      capacity: this.#config.capacity1,
    })
  }

  #makeSecurity(): Queue {
    return new Queue({
      type:     'MGc',
      servers:  this.#config.c2,
      mu:       this.#config.mu2,
      sigma:    this.#config.sigma2,
      capacity: 80,
    })
  }

  #makeBoarding(): Queue[] {
    return Array.from({ length: this.#config.gates }, () =>
      new Queue({ type: 'MMc', servers: 2, mu: 4, capacity: 100 }),
    )
  }

  // ── Planificador de eventos ──────────────────────────────────────────────

  #schedule(type: EventType, time: number, payload: unknown = {}): void {
    this.#heap.push({ time: Math.max(time, this.#currentTime), type, payload } as SimEvent)
  }

  #scheduleNextArrival(): void {
    const t = this.#poisson.nextArrivalTime(this.#currentTime)
    this.#schedule('PASSENGER_ARRIVE', t)
  }

  #spawnInitialFlights(): void {
    const { gates } = this.#config
    for (let g = 0; g < gates; g++) {
      const dep  = 30 + g * 20 + Math.random() * 10
      const plane = new Plane(g, dep, this.#currentTime)
      this.#planes.push(plane)
      this.#schedule('FLIGHT_DEPART', dep, { planeId: plane.id })
    }
  }

  // ── Procesador de eventos ────────────────────────────────────────────────

  #processEvent(event: SimEvent): void {
    switch (event.type) {
      case 'PASSENGER_ARRIVE':    this.#onArrive();                    break
      case 'CHECKIN_DONE':        this.#onCheckinDone(event.payload);  break
      case 'SECURITY_DONE':       this.#onSecurityDone(event.payload); break
      case 'BOARDING_DONE':       this.#onBoardingDone(event.payload); break
      case 'FLIGHT_DEPART':       this.#onDepart(event.payload);       break
      case 'PASSENGER_ABANDON':   this.#onAbandon(event.payload);      break
      case 'WEATHER_EVENT':       this.#onWeather();                   break
      case 'ACCIDENT_EVENT':      this.#onAccident();                  break
    }
  }

  #onArrive(): void {
    const p = new Passenger('standard', 0, this.#currentTime)
    p.setState('checkin_q', this.#currentTime)
    this.#passengers.push(p)
    this.#totalArrived++

    const accepted = this.#checkin.enqueue(p, this.#currentTime)
    if (!accepted) {
      p.setState('abandoned', this.#currentTime)
      this.#totalAbandoned++
    } else {
      // Abandono diferido si el pasajero pierde la paciencia
      this.#schedule('PASSENGER_ABANDON', this.#currentTime + p.patience, { passengerId: p.id })
    }

    this.#scheduleNextArrival()
  }

  #onCheckinDone(payload: { passengerId: number }): void {
    const p = this.#findPassenger(payload.passengerId)
    if (!p || p.state === 'abandoned') return
    p.setState('security_q', this.#currentTime)
    const accepted = this.#security.enqueue(p, this.#currentTime)
    if (!accepted) {
      p.setState('abandoned', this.#currentTime)
      this.#totalAbandoned++
    } else {
      this.#schedule('PASSENGER_ABANDON', this.#currentTime + p.patience, { passengerId: p.id })
    }
  }

  #onSecurityDone(payload: { passengerId: number }): void {
    const p = this.#findPassenger(payload.passengerId)
    if (!p || p.state === 'abandoned') return
    p.setState('waiting_gate', this.#currentTime)

    // Asignar puerta con menor carga
    const gateIdx = this.#leastLoadedGate()
    const plane   = this.#planes.find(pl => pl.gateId === gateIdx && !pl.isFull())

    if (!plane) {
      // No hay vuelo disponible → el pasajero abandona
      p.setState('abandoned', this.#currentTime)
      this.#totalAbandoned++
      return
    }

    p.setState('boarding_q', this.#currentTime)
    const accepted = this.#boarding[gateIdx].enqueue(p, this.#currentTime)
    if (!accepted) {
      p.setState('abandoned', this.#currentTime)
      this.#totalAbandoned++
    } else {
      this.#schedule('PASSENGER_ABANDON', this.#currentTime + p.patience, { passengerId: p.id })
    }
  }

  #onBoardingDone(payload: { passengerId: number; gateIdx: number }): void {
    const p = this.#findPassenger(payload.passengerId)
    if (!p || p.state === 'abandoned') return

    const plane = this.#planes.find(pl => pl.gateId === payload.gateIdx && !pl.isFull())
    if (!plane) { p.setState('abandoned', this.#currentTime); this.#totalAbandoned++; return }

    p.setState('boarding_s', this.#currentTime)
    p.setState('boarded',    this.#currentTime)
    plane.passengersBoarded++
    this.#totalBoarded++

    if (plane.isReady()) {
      plane.setState('taxiing_out', this.#currentTime)
      this.#schedule('FLIGHT_DEPART', this.#currentTime + 5, { planeId: plane.id })
    }
  }

  #onDepart(payload: { planeId: number }): void {
    const plane = this.#planes.find(p => p.id === payload.planeId)
    if (!plane) return

    if (Math.random() < this.#config.delayProb) {
      const delay = 5 + Math.random() * 20
      plane.addDelay(delay)
      this.#schedule('FLIGHT_DEPART', this.#currentTime + delay, { planeId: plane.id })
      return
    }

    if (plane.state !== 'taxiing_out') plane.setState('taxiing_out', this.#currentTime)
    plane.setState('takeoff',  this.#currentTime + 2)
    plane.setState('airborne', this.#currentTime + 5)
  }

  #onAbandon(payload: { passengerId: number }): void {
    const p = this.#findPassenger(payload.passengerId)
    if (!p) return
    if (p.state === 'boarded' || p.state === 'abandoned') return

    // Solo abandona si aún está en una cola (paciencia expirada)
    const inQueue = ['checkin_q', 'security_q', 'boarding_q'].includes(p.state)
    if (inQueue) {
      p.setState('abandoned', this.#currentTime)
      this.#totalAbandoned++
    }
  }

  #onWeather(): void {
    // Retraso aleatorio a todos los vuelos activos
    for (const plane of this.#planes) {
      if (!['airborne', 'cancelled'].includes(plane.state)) {
        plane.addDelay(5 + Math.random() * 15)
      }
    }
  }

  #onAccident(): void {
    // Cierra una puerta de embarque temporalmente (retraso significativo)
    if (this.#planes.length > 0) {
      const idx = Math.floor(Math.random() * this.#planes.length)
      this.#planes[idx].addDelay(20 + Math.random() * 30)
    }
  }

  // ── Avance de colas continuas ────────────────────────────────────────────

  #tickQueues(dt: number): void {
    // Check-in
    const checkinDone = this.#checkin.tick(this.#currentTime, dt)
    for (const p of checkinDone) {
      this.#schedule('CHECKIN_DONE', this.#currentTime, { passengerId: p.id })
    }

    // Seguridad
    const securityDone = this.#security.tick(this.#currentTime, dt)
    for (const p of securityDone) {
      this.#schedule('SECURITY_DONE', this.#currentTime, { passengerId: p.id })
    }

    // Embarque (una cola por puerta)
    for (let g = 0; g < this.#boarding.length; g++) {
      const boardingDone = this.#boarding[g].tick(this.#currentTime, dt)
      for (const p of boardingDone) {
        this.#schedule('BOARDING_DONE', this.#currentTime, { passengerId: p.id, gateIdx: g })
      }
    }

    // Procesar de inmediato los eventos de transición generados arriba
    while (this.#heap.size > 0 && this.#heap.peek()!.time <= this.#currentTime) {
      const event = this.#heap.pop()!
      this.#processEvent(event)
    }

    // Contabilizar abandonos registrados por Queue.tick()
    const queueAbandons =
      this.#checkin.stats.totalAbandoned +
      this.#security.stats.totalAbandoned +
      this.#boarding.reduce((s, q) => s + q.stats.totalAbandoned, 0)

    // Sincronizar conteo de abandonados (Queue ya lleva su propio registro)
    void queueAbandons   // informativo; totalAbandoned se actualiza en eventos discretos
  }

  // ── Utilidades ───────────────────────────────────────────────────────────

  #findPassenger(id: number): Passenger | undefined {
    return this.#passengers.find(p => p.id === id)
  }

  #leastLoadedGate(): number {
    let best = 0
    let bestLoad = this.#boarding[0]?.waiting.length ?? Infinity
    for (let i = 1; i < this.#boarding.length; i++) {
      const load = this.#boarding[i].waiting.length
      if (load < bestLoad) { best = i; bestLoad = load }
    }
    return best
  }
}

// ── Test ───────────────────────────────────────────────────────────────────────

function runTest() {
  Passenger.resetCounter()
  Plane.resetCounter()

  console.log('\n══════════════════════════════════════════════════════')
  console.log('  Test EventLoop  — 60 min, λ=8, c1=3')
  console.log('══════════════════════════════════════════════════════')

  const loop = new EventLoop({
    lambda:            8,
    peakHour:          false,
    c1:                3,
    mu1:               3,      // ρ = 8/(3×3) = 0.889  — estable
    capacity1:         100,
    c2:                2,
    mu2:               2,
    sigma2:            0.1,
    gates:             3,
    delayProb:         0.05,
    patienceThreshold: 10,
    speed:             1,
  })

  const SIM_MINUTES = 60
  const DT          = 1.0    // paso de 1 minuto real

  for (let m = 0; m < SIM_MINUTES; m++) {
    loop.tick(DT)
  }

  const state = loop.getState()
  const mc    = state.metrics.checkin
  const ms    = state.metrics.security

  console.log(`\nTiempo simulado : ${state.currentTime.toFixed(2)} min`)
  console.log(`\n── Totales globales ─────────────────────────────────`)
  console.log(`  Llegados        : ${loop.totalArrived}`)
  console.log(`  Abordaron       : ${loop.totalBoarded}`)
  console.log(`  Abandonaron     : ${loop.totalAbandoned}`)
  console.log(`  En colas/servicio: ${state.passengers.filter(p =>
    !['boarded','abandoned'].includes(p.state)).length}`)

  console.log(`\n── Check-in (M/M/${state.queues.checkin.config.servers}) ─────────────────────`)
  console.log(`  ρ̂  = ${mc.rho.toFixed(4)}   Lq = ${mc.Lq.toFixed(4)}   Wq = ${mc.Wq.toFixed(4)} min`)
  console.log(`  Atendidos: ${state.queues.checkin.stats.totalServed}   Abandonados: ${state.queues.checkin.stats.totalAbandoned}`)

  console.log(`\n── Seguridad (M/G/${state.queues.security.config.servers}) ─────────────────────`)
  console.log(`  ρ̂  = ${ms.rho.toFixed(4)}   Lq = ${ms.Lq.toFixed(4)}   Wq = ${ms.Wq.toFixed(4)} min`)
  console.log(`  Atendidos: ${state.queues.security.stats.totalServed}   Abandonados: ${state.queues.security.stats.totalAbandoned}`)

  console.log(`\n── Vuelos ─────────────────────────────────────────`)
  for (const plane of state.planes) {
    console.log(`  Avión #${plane.id} Gate ${plane.gateId}  ${plane.state}  ` +
      `${plane.passengersBoarded}/${plane.capacity}  retraso ${plane.delayMinutes} min`)
  }

  console.log(`\n── Verificación ───────────────────────────────────`)
  console.log(`  λ esperado ≈ 8/min → llegados en 60 min ≈ 480`)
  console.log(`  ✓ Llegados razonables (>200): ${loop.totalArrived > 200}`)
  console.log(`  ✓ Abordaron > 0:              ${loop.totalBoarded > 0}`)
  console.log(`  ✓ Abandonaron < llegados:     ${loop.totalAbandoned < loop.totalArrived}`)
  console.log(`  ✓ Abord + Aban ≤ llegados:    ${loop.totalBoarded + loop.totalAbandoned <= loop.totalArrived}`)
}

runTest()
