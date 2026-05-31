// Modelo de avión: máquina de estados de vuelo, gestión de retrasos, embarque y serialización

export type PlaneState =
  | 'approaching'
  | 'landing'
  | 'taxiing_in'
  | 'at_gate'
  | 'boarding'
  | 'taxiing_out'
  | 'takeoff'
  | 'airborne'
  | 'delayed'
  | 'cancelled'

interface StateTransition {
  state: PlaneState
  at: number
}

// Estados en los que el avión está activo en tierra y puede recibir pasajeros
const GROUND_STATES = new Set<PlaneState>(['at_gate', 'boarding', 'delayed'])

// Estados terminales — no se permiten más transiciones
const TERMINAL_STATES = new Set<PlaneState>(['airborne', 'cancelled'])

export class Plane {
  static #counter = 0

  readonly id: number
  state: PlaneState
  gateId: number
  readonly capacity: number
  readonly scheduledDeparture: number
  actualDeparture: number
  passengersBoarded: number
  delayMinutes: number
  position: { x: number; y: number }

  #history: StateTransition[] = []

  constructor(gateId: number, scheduledDeparture: number, spawnTime = 0) {
    this.id = ++Plane.#counter
    this.gateId = gateId
    this.scheduledDeparture = scheduledDeparture
    this.actualDeparture = scheduledDeparture
    this.state = 'approaching'
    this.capacity = Math.floor(80 + Math.random() * 101)   // [80, 180]
    this.passengersBoarded = 0
    this.delayMinutes = 0
    this.position = { x: 0, y: 0 }
    this.#history.push({ state: 'approaching', at: spawnTime })
  }

  // Transiciona el estado y lo registra en el historial
  setState(state: PlaneState, currentTime: number): void {
    if (TERMINAL_STATES.has(this.state)) return   // no salir de estados terminales
    this.state = state
    this.#history.push({ state, at: currentTime })
  }

  // True si el avión está listo para iniciar el rodaje de salida
  isReady(): boolean {
    if (TERMINAL_STATES.has(this.state) || this.state === 'delayed') return false
    return this.state === 'boarding' && this.isFull()
  }

  // True cuando todos los asientos están ocupados
  isFull(): boolean {
    return this.passengersBoarded >= this.capacity
  }

  // Acumula retraso y actualiza el tiempo de salida real;
  // pone el estado en 'delayed' sin registrar timestamp (no se conoce el tiempo exacto aquí)
  addDelay(minutes: number): void {
    if (TERMINAL_STATES.has(this.state)) return
    this.delayMinutes += minutes
    this.actualDeparture = this.scheduledDeparture + this.delayMinutes
    if (!TERMINAL_STATES.has(this.state)) {
      this.state = 'delayed'
    }
  }

  // Retorna cuántos minutos lleva en el estado actual (requiere currentTime externo)
  timeInCurrentState(currentTime: number): number {
    const last = this.#history.at(-1)
    return last ? currentTime - last.at : 0
  }

  toJSON(): object {
    return {
      id:                 this.id,
      state:              this.state,
      gateId:             this.gateId,
      capacity:           this.capacity,
      scheduledDeparture: this.scheduledDeparture,
      actualDeparture:    this.actualDeparture,
      passengersBoarded:  this.passengersBoarded,
      delayMinutes:       this.delayMinutes,
      position:           { ...this.position },
      occupancy:          `${this.passengersBoarded}/${this.capacity}`,
      isReady:            this.isReady(),
      isFull:             this.isFull(),
      stateHistory:       this.#history.map(h => ({ ...h })),
    }
  }

  static resetCounter(): void {
    Plane.#counter = 0
  }
}

// ── Test ───────────────────────────────────────────────────────────────────────

function runTest() {
  Plane.resetCounter()

  // ── Avión 1: vuelo completo sin incidentes ─────────────────────────────────
  const p1 = new Plane(1, 120, 0)   // Gate 1, sale a t=120
  p1.setState('landing',      5)
  p1.setState('taxiing_in',   8)
  p1.setState('at_gate',     15)
  p1.setState('boarding',    18)
  p1.passengersBoarded = p1.capacity  // abordaje completo
  // isReady() debe ser true ahora
  p1.setState('taxiing_out', 100)
  p1.setState('takeoff',     108)
  p1.setState('airborne',    115)

  // ── Avión 2: vuelo con retraso de 30 minutos ───────────────────────────────
  const p2 = new Plane(2, 100, 0)   // Gate 2, programado t=100
  p2.setState('landing',     7)
  p2.setState('taxiing_in',  12)
  p2.setState('at_gate',     20)
  p2.setState('boarding',    23)
  // Surge un problema técnico → retraso de 30 min
  p2.addDelay(30)                    // actualDeparture → 130, state → 'delayed'
  // Problema resuelto → retoma boarding
  p2.setState('boarding',    55)
  p2.passengersBoarded = p2.capacity
  p2.setState('taxiing_out', 120)
  p2.setState('takeoff',     128)
  p2.setState('airborne',    135)

  // ── Avión 3: vuelo cancelado durante el abordaje ───────────────────────────
  const p3 = new Plane(3, 80, 0)    // Gate 3, programado t=80
  p3.setState('landing',     6)
  p3.setState('taxiing_in',  10)
  p3.setState('at_gate',     18)
  p3.setState('boarding',    21)
  p3.passengersBoarded = Math.floor(p3.capacity * 0.4)  // solo 40% abordado
  p3.addDelay(15)                    // primer retraso
  p3.setState('cancelled',   45)     // cancelado definitivamente
  // Intentar transición después de cancelado (debe ignorarse)
  p3.setState('taxiing_out', 50)

  // ── Impresión ──────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════')
  console.log('  Test Plane — 3 aviones')
  console.log('══════════════════════════════════════════════════\n')

  for (const plane of [p1, p2, p3]) {
    const j = plane.toJSON() as Record<string, unknown>
    const hist = (j.stateHistory as StateTransition[])
      .map(h => `${h.state}@t${h.at}`)
      .join(' → ')

    console.log(`Avión #${j.id}  Gate ${j.gateId}`)
    console.log(`  Estado final     : ${j.state}`)
    console.log(`  Capacidad        : ${j.occupancy} pasajeros`)
    console.log(`  Salida prog.     : t=${j.scheduledDeparture}`)
    console.log(`  Salida real      : t=${j.actualDeparture}`)
    console.log(`  Retraso total    : ${j.delayMinutes} min`)
    console.log(`  ¿Listo para salir? ${j.isReady}    ¿Completo? ${j.isFull}`)
    console.log(`  Historial: ${hist}`)
    console.log()
  }
}

