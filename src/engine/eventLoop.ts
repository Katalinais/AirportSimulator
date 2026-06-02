// Bucle de eventos discretos: gestiona la secuencia de llegadas, servicios y transiciones de estado tick a tick

import { Passenger, PassengerType } from './passenger'
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
  | 'PLANE_TAXI_DONE'
  | 'PLANE_TAKEOFF_DONE'
  | 'PLANE_ARRIVE'
  | 'PASSENGER_ABANDON'
  | 'WEATHER_EVENT'
  | 'ACCIDENT_EVENT'
  | 'MECHANICAL_EVENT'
  | 'COLLISION_EVENT'

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
  mechanicalProb:     number   // probabilidad de que la falla mecánica se active [0,1]
  crashProb:          number   // probabilidad de colisión cuando la pista está ocupada [0,1]
  weatherProb:        number   // probabilidad de que el clima adverso aplique retrasos [0,1]
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
  mechanicalProb:    0.25,
  crashProb:         0.05,
  weatherProb:       0.5,
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
  #totalArrived:    number
  #totalBoarded:    number
  #totalAbandoned:  number
  #totalCrashes:    number
  #totalMechanical: number
  #totalWeather:    number

  // Estado de la pista
  #runwayBusy: boolean

  constructor(config: Partial<SimConfig> = {}) {
    this.#config = { ...DEFAULT_CONFIG, ...config }
    this.#heap   = new MinHeap()
    this.#currentTime = 0
    this.#passengers  = []
    this.#planes      = []
    this.#totalArrived    = 0
    this.#totalBoarded    = 0
    this.#totalAbandoned  = 0
    this.#totalCrashes    = 0
    this.#totalMechanical = 0
    this.#totalWeather    = 0
    this.#runwayBusy      = false

    this.#poisson  = new PoissonGenerator(this.#config.lambda)
    this.#checkin  = this.#makeCheckin()
    this.#security = this.#makeSecurity()
    this.#boarding = this.#makeBoarding()

    if (this.#config.peakHour) this.#poisson.setPeak(true)

    // Programar primera llegada y primeros vuelos
    this.#scheduleNextArrival()
    this.#spawnInitialFlights()
    this.#schedule('WEATHER_EVENT',    40 + Math.random() * 20)
    this.#schedule('ACCIDENT_EVENT',   80 + Math.random() * 40)
    this.#schedule('MECHANICAL_EVENT', 50 + Math.random() * 30)
  }

  // ── API pública ──────────────────────────────────────────────────────────

  tick(dt: number): SimState {
    const targetTime = this.#currentTime + dt

    // Procesar todos los eventos discretos hasta targetTime
    while (this.#heap.size > 0 && this.#heap.peek()!.time <= targetTime) {
      const event = this.#heap.pop()!
      this.#currentTime = event.time
      this.#processEvent(event)
    }

    // Avanzar colas continuas (timers de servicio) con el paso completo
    this.#currentTime = targetTime
    this.#tickQueues(dt)

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
    this.#currentTime     = 0
    this.#totalArrived    = 0
    this.#totalBoarded    = 0
    this.#totalAbandoned  = 0
    this.#totalCrashes    = 0
    this.#totalMechanical = 0
    this.#totalWeather    = 0
    this.#runwayBusy      = false
    this.#poisson.reset()
    this.#checkin.reset()
    this.#security.reset()
    this.#boarding.forEach(q => q.reset())
    if (this.#config.peakHour) this.#poisson.setPeak(true)
    this.#scheduleNextArrival()
    this.#spawnInitialFlights()
    this.#schedule('WEATHER_EVENT',    40 + Math.random() * 20)
    this.#schedule('ACCIDENT_EVENT',   80 + Math.random() * 40)
    this.#schedule('MECHANICAL_EVENT', 50 + Math.random() * 30)
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
  get totalArrived():    number { return this.#totalArrived    }
  get totalBoarded():    number { return this.#totalBoarded    }
  get totalAbandoned():  number { return this.#totalAbandoned  }
  get totalCrashes():    number { return this.#totalCrashes    }
  get totalMechanical(): number { return this.#totalMechanical }
  get totalWeather():    number { return this.#totalWeather    }

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
      // P1 ~45 min, P2 ~65 min, P3 ~85 min (punto medio entre versiones anteriores)
      const dep   = 45 + g * 20 + Math.random() * 10
      const plane = new Plane(g, dep, this.#currentTime)
      plane.setState('at_gate',  this.#currentTime)
      plane.setState('boarding', this.#currentTime)
      this.#planes.push(plane)
      this.#schedule('FLIGHT_DEPART', dep, { planeId: plane.id })
    }
  }

  // ── Procesador de eventos ────────────────────────────────────────────────

  #processEvent(event: SimEvent): void {
    switch (event.type) {
      case 'PASSENGER_ARRIVE':    this.#onArrive();                      break
      case 'CHECKIN_DONE':        this.#onCheckinDone(event.payload);   break
      case 'SECURITY_DONE':       this.#onSecurityDone(event.payload);  break
      case 'BOARDING_DONE':       this.#onBoardingDone(event.payload);  break
      case 'FLIGHT_DEPART':       this.#onDepart(event.payload);        break
      case 'PLANE_TAXI_DONE':     this.#onTaxiDone(event.payload);      break
      case 'PLANE_TAKEOFF_DONE':  this.#onTakeoffDone(event.payload);   break
      case 'PLANE_ARRIVE':        this.#onPlaneArrive(event.payload);   break
      case 'PASSENGER_ABANDON':   this.#onAbandon(event.payload);       break
      case 'WEATHER_EVENT':       this.#onWeather(event.payload);       break
      case 'ACCIDENT_EVENT':      this.#onAccident(event.payload);      break
      case 'MECHANICAL_EVENT':    this.#onMechanical();                 break
    }
  }

  #onArrive(): void {
    const type: PassengerType = Math.random() < 0.15 ? 'vip' : 'standard'
    const gateIdx = this.#leastLoadedGate()
    const flightId = this.#planes.find(
      pl => pl.gateId === gateIdx && (['at_gate', 'boarding', 'delayed'] as string[]).includes(pl.state),
    )?.id ?? 0
    const p = new Passenger(type, flightId, this.#currentTime)
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

    // Buscar puerta con avión disponible y menor carga
    let gateIdx = this.#leastLoadedGate()
    const plane = this.#planes.find(
      pl => pl.gateId === gateIdx && !pl.isFull() && ['at_gate', 'boarding', 'delayed'].includes(pl.state),
    )

    if (!plane) {
      // Sin avión ahora — reintentar en 5 min (el vuelo de reemplazo habrá llegado)
      this.#schedule('SECURITY_DONE', this.#currentTime + 5, { passengerId: p.id })
      this.#schedule('PASSENGER_ABANDON', this.#currentTime + p.patience, { passengerId: p.id })
      return
    }

    p.gateId = gateIdx
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

    const plane = this.#planes.find(
      pl => pl.gateId === payload.gateIdx && !pl.isFull() && ['at_gate', 'boarding', 'delayed'].includes(pl.state),
    )
    if (!plane) { p.setState('abandoned', this.#currentTime); this.#totalAbandoned++; return }

    p.setState('boarding_s', this.#currentTime)
    p.setState('boarded',    this.#currentTime)
    plane.passengersBoarded++
    this.#totalBoarded++

    // Si el avión se llena, adelantar la salida en ~3 min sim
    if (plane.isFull()) {
      this.#schedule('FLIGHT_DEPART', this.#currentTime + 3, { planeId: plane.id })
    }
  }

  #onDepart(payload: { planeId: number }): void {
    const plane = this.#planes.find(p => p.id === payload.planeId)
    if (!plane) return
    if (['airborne', 'cancelled', 'crashed'].includes(plane.state)) return
    // Ya en secuencia de despegue: ignorar evento duplicado
    if (plane.state === 'taxiing_out' || plane.state === 'takeoff') return
    // En reparación mecánica: reintentar en 10 min sim hasta que esté listo
    if (plane.state === 'mechanical') {
      this.#schedule('FLIGHT_DEPART', this.#currentTime + 10, { planeId: plane.id })
      return
    }

    // No despegar si el avión está demasiado vacío (< 40%).
    // Se conceden hasta 60 min de gracia desde la salida programada.
    // Pasado ese límite, despega igual para no bloquear la puerta indefinidamente.
    const occupancy = plane.passengersBoarded / plane.capacity
    const overdue   = this.#currentTime - plane.scheduledDeparture
    if (occupancy < 0.60 && overdue < 60) {
      this.#schedule('FLIGHT_DEPART', this.#currentTime + 12, { planeId: plane.id })
      return
    }

    if (Math.random() < this.#config.delayProb) {
      const delay = 5 + Math.random() * 20
      plane.addDelay(delay)

      // a) Notificar pasajeros en puerta afectados
      for (const p of this.#passengers) {
        if (p.flightId === plane.id && p.state === 'waiting_gate') {
          p.patience -= delay * 0.6
          if (p.patience <= 0) {
            this.#schedule('PASSENGER_ABANDON', this.#currentTime, { passengerId: p.id })
          }
        }
      }

      // b) Propagación a vuelo adyacente (efecto dominó, un nivel)
      if (Math.random() < 0.3) {
        const adjGateId = (plane.gateId + 1) % this.#config.gates
        const adjPlane  = this.#planes.find(
          pl => pl.gateId === adjGateId && !(['airborne', 'cancelled', 'crashed'] as string[]).includes(pl.state),
        )
        if (adjPlane) {
          adjPlane.addDelay(delay * 0.4)
          this.#schedule('FLIGHT_DEPART', this.#currentTime + delay * 0.4, { planeId: adjPlane.id })
        }
      }

      this.#schedule('FLIGHT_DEPART', this.#currentTime + delay, { planeId: plane.id })
      return
    }

    if (this.#runwayBusy && Math.random() < this.#config.crashProb) {
      this.#onCollision(plane)
      return
    }

    // Cada despegue agenda su propio freeRunway para garantizar que la pista
    // siempre se libere, aunque haya múltiples salidas simultáneas.
    this.#runwayBusy = true
    this.#schedule('PLANE_ARRIVE', this.#currentTime + 7, { freeRunway: true })

    // Fase 1: rodaje hacia la pista (visible ~3 min simulados)
    plane.setState('taxiing_out', this.#currentTime)
    this.#schedule('PLANE_TAXI_DONE', this.#currentTime + 3, { planeId: plane.id })
  }

  #onTaxiDone(payload: { planeId: number }): void {
    const plane = this.#planes.find(p => p.id === payload.planeId)
    if (!plane || plane.state !== 'taxiing_out') return
    // Fase 2: aceleración en pista (visible ~2 min simulados)
    plane.setState('takeoff', this.#currentTime)
    this.#schedule('PLANE_TAKEOFF_DONE', this.#currentTime + 2, { planeId: plane.id })
  }

  #onTakeoffDone(payload: { planeId: number }): void {
    const plane = this.#planes.find(p => p.id === payload.planeId)
    if (!plane || plane.state !== 'takeoff') return
    plane.setState('airborne', this.#currentTime)

    // Limpiar aviones terminados que ya no necesitan seguimiento
    if (this.#planes.length > 200) {
      const KEEP_RECENT_AIRBORNE = 10
      const airborne = this.#planes.filter(pl => pl.state === 'airborne')
      const toRemove = new Set(airborne.slice(0, airborne.length - KEEP_RECENT_AIRBORNE).map(pl => pl.id))
      this.#planes = this.#planes.filter(pl => !toRemove.has(pl.id))
    }

    // Spawn vuelo de reemplazo si no hay otro avión activo en esta puerta
    const activeAtGate = this.#planes.filter(
      pl => pl.gateId === plane.gateId && !['airborne', 'cancelled', 'crashed'].includes(pl.state),
    ).length
    if (activeAtGate === 0) {
      // Ventana máxima de embarque: 27-47 min (punto medio entre 12-32 y 42-72)
      const nextDep = this.#currentTime + 35 + Math.random() * 20
      const next    = new Plane(plane.gateId, nextDep, this.#currentTime)
      this.#planes.push(next)
      this.#schedule('PLANE_ARRIVE',  this.#currentTime + 8,  { planeId: next.id })
      this.#schedule('FLIGHT_DEPART', nextDep,                 { planeId: next.id })
    }
  }

  #onPlaneArrive(payload: { planeId?: number; freeRunway?: boolean }): void {
    if (payload.freeRunway) { this.#runwayBusy = false; return }
    const plane = this.#planes.find(p => p.id === payload.planeId)
    if (!plane) return
    if (['airborne', 'cancelled', 'crashed'].includes(plane.state)) return
    plane.setState('at_gate',  this.#currentTime)
    plane.setState('boarding', this.#currentTime)
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

  #onWeather(payload?: { clearRunway?: boolean; crashedGates?: number[] }): void {
    if (payload?.clearRunway) {
      this.#runwayBusy = false
      // Spawn aviones de reemplazo para puertas que quedaron sin avión tras la colisión
      for (const g of payload.crashedGates ?? []) {
        const hasActive = this.#planes.some(
          pl => pl.gateId === g && !(['airborne', 'cancelled', 'crashed'] as string[]).includes(pl.state),
        )
        if (!hasActive) {
          const nextDep = this.#currentTime + 12 + Math.random() * 8
          const next    = new Plane(g, nextDep, this.#currentTime)
          this.#planes.push(next)
          this.#schedule('PLANE_ARRIVE',  this.#currentTime + 5,  { planeId: next.id })
          this.#schedule('FLIGHT_DEPART', nextDep,                 { planeId: next.id })
        }
      }
      return
    }
    if (Math.random() < this.#config.weatherProb) {
      for (const plane of this.#planes) {
        if (!['airborne', 'cancelled', 'crashed'].includes(plane.state)) {
          plane.addDelay(5 + Math.random() * 15)
        }
      }
      this.#totalWeather++
    }
    this.#schedule('WEATHER_EVENT', this.#currentTime + 60 + Math.random() * 30)
  }

  #onAccident(payload?: { repairPlaneId?: number }): void {
    if (payload?.repairPlaneId !== undefined) {
      const plane = this.#planes.find(p => p.id === payload.repairPlaneId)
      if (plane && plane.state === 'mechanical') {
        plane.setState('boarding', this.#currentTime)
        // Agendar salida ahora que el avión está operativo (sin este paso el
        // avión nunca despega porque su FLIGHT_DEPART original ya fue ignorado)
        const dep = this.#currentTime + 5 + Math.random() * 10
        this.#schedule('FLIGHT_DEPART', dep, { planeId: plane.id })
      }
      return
    }
    // Cierra una puerta de embarque temporalmente (retraso significativo)
    if (this.#planes.length > 0) {
      const idx = Math.floor(Math.random() * this.#planes.length)
      this.#planes[idx].addDelay(20 + Math.random() * 30)
    }
    this.#schedule('ACCIDENT_EVENT', this.#currentTime + 90 + Math.random() * 60)
  }

  #onCollision(triggerPlane: Plane): void {
    // Solo el avión intruso (triggerPlane) se accidenta.
    // El avión que ya tenía prioridad de pista (en taxiing_out) continúa su despegue:
    // su PLANE_TAXI_DONE y PLANE_TAKEOFF_DONE liberarán la pista normalmente.
    triggerPlane.setState('crashed', this.#currentTime)
    triggerPlane.crashedAt = this.#currentTime
    this.#totalCrashes++

    // Abandonar pasajeros del vuelo crasheado y de su puerta
    for (const p of this.#passengers) {
      if (p.state === 'boarded' || p.state === 'abandoned') continue
      const linked = p.flightId === triggerPlane.id ||
        (p.gateId === triggerPlane.gateId &&
          (['boarding_q', 'boarding_s', 'waiting_gate'] as string[]).includes(p.state))
      if (linked) {
        p.setState('abandoned', this.#currentTime)
        this.#totalAbandoned++
      }
    }

    // Spawn reemplazo: llega en 15-25 min, ventana de boarding de ~20-35 min
    const arrDelay = 15 + Math.random() * 10
    const nextDep  = this.#currentTime + arrDelay + 20 + Math.random() * 15
    const next     = new Plane(triggerPlane.gateId, nextDep, this.#currentTime)
    this.#planes.push(next)
    this.#schedule('PLANE_ARRIVE',  this.#currentTime + arrDelay, { planeId: next.id })
    this.#schedule('FLIGHT_DEPART', nextDep,                       { planeId: next.id })
  }

  #onMechanical(): void {
    if (Math.random() >= this.#config.mechanicalProb) {
      this.#schedule('MECHANICAL_EVENT', this.#currentTime + 80 + Math.random() * 40)
      return
    }

    const candidates = this.#planes.filter(
      pl => (['at_gate', 'boarding', 'delayed'] as string[]).includes(pl.state),
    )
    if (candidates.length === 0) {
      this.#schedule('MECHANICAL_EVENT', this.#currentTime + 80 + Math.random() * 40)
      return
    }

    const plane = candidates[Math.floor(Math.random() * candidates.length)]
    plane.setState('mechanical', this.#currentTime)
    plane.addDelay(45 + Math.random() * 45)
    this.#totalMechanical++

    for (const p of this.#passengers) {
      if (p.flightId === plane.id && (['boarding_q', 'waiting_gate'] as string[]).includes(p.state)) {
        p.patience *= 0.5
      }
    }

    this.#schedule('ACCIDENT_EVENT',   this.#currentTime + 50 + Math.random() * 40, { repairPlaneId: plane.id })
    this.#schedule('MECHANICAL_EVENT', this.#currentTime + 80 + Math.random() * 40)
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
    let bestLoad = Infinity
    const candidates: number[] = []
    for (let i = 0; i < this.#boarding.length; i++) {
      const load = this.#boarding[i].waiting.length
      if (load < bestLoad) {
        bestLoad = load
        candidates.length = 0
        candidates.push(i)
      } else if (load === bestLoad) {
        candidates.push(i)
      }
    }
    // Tie-breaking aleatorio: distribuye uniformemente cuando todas las colas están igual
    return candidates[Math.floor(Math.random() * candidates.length)]
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

