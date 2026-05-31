// Modelo de pasajero: máquina de estados del flujo, tiempos de espera por estación e historial de colas

export type PassengerState =
  | 'arriving'
  | 'checkin_q'
  | 'checkin_s'
  | 'security_q'
  | 'security_s'
  | 'waiting_gate'
  | 'boarding_q'
  | 'boarding_s'
  | 'boarded'
  | 'abandoned'

export type PassengerType = 'standard' | 'vip'

export type Station = 'checkin' | 'security' | 'boarding'

interface QueueEntry {
  state: PassengerState
  enteredAt: number
  leftAt: number | null
}

interface Timestamps {
  arrivedAt: number
  checkinStart: number
  securityStart: number
  boardingStart: number
  exitAt: number
}

const QUEUE_STATES = new Set<PassengerState>(['checkin_q', 'security_q', 'boarding_q'])

const STATION_QUEUE: Record<Station, PassengerState> = {
  checkin:  'checkin_q',
  security: 'security_q',
  boarding: 'boarding_q',
}

export class Passenger {
  static #counter = 0

  readonly id: number
  readonly type: PassengerType
  readonly flightId: number
  readonly patience: number          // minutos; misma unidad que currentTime
  state: PassengerState
  gateId: number                     // puerta asignada al embarque (-1 = sin asignar)
  position: { x: number; y: number }
  readonly timestamps: Timestamps

  #queueEntries: QueueEntry[] = []
  #activeEntry: QueueEntry | null = null

  constructor(type: PassengerType = 'standard', flightId = 0, arrivedAt = 0) {
    this.id = ++Passenger.#counter
    this.type = type
    this.flightId = flightId
    this.patience = 3 + Math.random() * 7   // [3, 10] minutos
    this.state = 'arriving'
    this.gateId = -1
    this.position = { x: 0, y: 0 }
    this.timestamps = {
      arrivedAt,
      checkinStart:  0,
      securityStart: 0,
      boardingStart: 0,
      exitAt:        0,
    }
  }

  // Transiciona al nuevo estado y registra timestamps clave
  setState(state: PassengerState, currentTime: number): void {
    // Cierra la entrada de cola activa si existía
    if (this.#activeEntry !== null) {
      this.#activeEntry.leftAt = currentTime
      this.#queueEntries.push(this.#activeEntry)
      this.#activeEntry = null
    }

    this.state = state

    switch (state) {
      case 'checkin_q':   this.timestamps.checkinStart  = currentTime; break
      case 'security_q':  this.timestamps.securityStart = currentTime; break
      case 'boarding_q':  this.timestamps.boardingStart = currentTime; break
      case 'boarded':
      case 'abandoned':   this.timestamps.exitAt = currentTime;        break
    }

    if (QUEUE_STATES.has(state)) {
      this.#activeEntry = { state, enteredAt: currentTime, leftAt: null }
    }
  }

  // True mientras el tiempo en cola no supere la paciencia
  isPatient(currentTime: number): boolean {
    if (this.#activeEntry === null) return true
    return (currentTime - this.#activeEntry.enteredAt) < this.patience
  }

  // Suma de tiempos de espera en todas las colas (solo entradas cerradas)
  getTotalWaitTime(): number {
    return this.#queueEntries.reduce(
      (sum, e) => sum + (e.leftAt! - e.enteredAt),
      0,
    )
  }

  // Tiempo de espera en la cola de una estación específica
  getWaitAtStation(station: Station): number {
    const qState = STATION_QUEUE[station]
    return this.#queueEntries
      .filter(e => e.state === qState)
      .reduce((sum, e) => sum + (e.leftAt! - e.enteredAt), 0)
  }

  toJSON(): object {
    return {
      id:            this.id,
      type:          this.type,
      flightId:      this.flightId,
      state:         this.state,
      patience:      +this.patience.toFixed(2),
      position:      { ...this.position },
      timestamps:    { ...this.timestamps },
      totalWaitTime: +this.getTotalWaitTime().toFixed(2),
      waitCheckin:   +this.getWaitAtStation('checkin').toFixed(2),
      waitSecurity:  +this.getWaitAtStation('security').toFixed(2),
      waitBoarding:  +this.getWaitAtStation('boarding').toFixed(2),
      queueHistory:  this.#queueEntries.map(e => ({ ...e })),
    }
  }

  // Reinicia el contador global (útil entre tests o corridas Monte Carlo)
  static resetCounter(): void {
    Passenger.#counter = 0
  }
}

// ── Test ───────────────────────────────────────────────────────────────────────

function runTest() {
  Passenger.resetCounter()

  // Pasajero 1: recorre todas las estaciones sin problemas
  const p1 = new Passenger('standard', 101, 0)
  p1.setState('checkin_q',    1)   // entra a cola checkin
  p1.setState('checkin_s',    4)   // espera 3 min → pasa a servicio
  p1.setState('security_q',   6)
  p1.setState('security_s',   9)   // espera 3 min
  p1.setState('waiting_gate', 11)
  p1.setState('boarding_q',   14)
  p1.setState('boarding_s',   17)  // espera 3 min
  p1.setState('boarded',      19)

  // Pasajero 2: VIP, colas cortas
  const p2 = new Passenger('vip', 101, 0)
  p2.setState('checkin_q',    1)
  p2.setState('checkin_s',    2)   // espera 1 min
  p2.setState('security_q',   4)
  p2.setState('security_s',   5)   // espera 1 min
  p2.setState('waiting_gate', 7)
  p2.setState('boarding_q',   10)
  p2.setState('boarding_s',   11)  // espera 1 min
  p2.setState('boarded',      13)

  // Pasajero 3: abandona en cola de checkin (espera 8 min)
  const p3 = new Passenger('standard', 102, 0)
  p3.setState('checkin_q',  2)
  p3.setState('abandoned',  10)    // 8 min en cola → probablemente impaciente

  // Pasajero 4: abandona en seguridad
  const p4 = new Passenger('standard', 102, 0)
  p4.setState('checkin_q',   1)
  p4.setState('checkin_s',   3)
  p4.setState('security_q',  5)
  p4.setState('abandoned',   12)   // 7 min esperando en seguridad

  // Pasajero 5: aún en cola de boarding (isPatient check)
  const p5 = new Passenger('standard', 103, 0)
  p5.setState('checkin_q',    1)
  p5.setState('checkin_s',    3)
  p5.setState('security_q',   5)
  p5.setState('security_s',   7)
  p5.setState('waiting_gate', 9)
  p5.setState('boarding_q',   12)
  // No ha salido → activo en cola boarding

  console.log('\n══════════════════════════════════════════')
  console.log('  Test Passenger — 5 pasajeros')
  console.log('══════════════════════════════════════════\n')

  for (const p of [p1, p2, p3, p4, p5]) {
    const j = p.toJSON() as Record<string, unknown>
    const patience = (j.patience as number).toFixed(2)
    const isP = p.isPatient(15)

    console.log(`Pasajero #${j.id} [${j.type}] vuelo ${j.flightId}`)
    console.log(`  Estado final : ${j.state}`)
    console.log(`  Paciencia    : ${patience} min  |  ¿Paciente a t=15? ${isP}`)
    console.log(`  Espera total : ${j.totalWaitTime} min`)
    console.log(`  ├─ check-in  : ${j.waitCheckin} min`)
    console.log(`  ├─ seguridad : ${j.waitSecurity} min`)
    console.log(`  └─ embarque  : ${j.waitBoarding} min`)
    console.log(`  Historial colas: ${JSON.stringify(j.queueHistory)}`)
    console.log()
  }
}

