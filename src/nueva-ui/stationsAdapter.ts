// Genera world.stations con coordenadas en 640×360 a partir de SimConfig.
// La distribución de puertas es dinámica (config.gates 1-4).
// Los aviones se animan interpolando posición frame a frame.

import type { SimConfig }  from '../hooks/useSimulation'
import type { Plane }       from '../engine/plane'
import type { WorldStations, StationData, GateData, RenderPlane, Slot, PlaneVisual } from './types'

// Constantes del canvas 640×360
const WORLD_W   = 640
const FLOOR_TOP = 30
const FLOOR_BOT = 352
const PARK_X    = 458    // borde izquierdo del avión aparcado en puerta
const RUNWAY_X  = 560    // cabecera de pista
const RUNWAY_Y  = 191    // línea central de pista

// Velocidades de animación (px por sim-minuto)
const SPEED_TAXI     = 18   // rodaje puerta→pista
const SPEED_TAKEOFF  = 90   // despegue (zoom fuera del canvas)
const SPEED_APPROACH = 22   // llegada (derecha→puerta)

// ── Helpers de slots ──────────────────────────────────────────────────────────

function snake(rx0: number, rx1: number, ry0: number, ry1: number, cs: number, rs: number): Slot[] {
  const slots: Slot[] = []
  const cols = Math.max(1, Math.floor((rx1 - rx0) / cs) + 1)
  const rows = Math.max(1, Math.floor((ry1 - ry0) / rs) + 1)
  for (let c = 0; c < cols; c++) {
    const x = rx1 - c * cs
    for (let r = 0; r < rows; r++) {
      const rr = c % 2 === 0 ? r : rows - 1 - r
      slots.push({ x, y: ry0 + rr * rs })
    }
  }
  return slots
}

function checkinServers(c1: number): StationData['servers'] {
  const n = Math.max(1, Math.min(3, c1))
  if (n >= 3) return [{ x: 202, y: 78 }, { x: 202, y: 170 }, { x: 202, y: 262 }]
  if (n === 2) return [{ x: 202, y: 120 }, { x: 202, y: 220 }]
  return [{ x: 202, y: 170 }]
}

function securityServers(c2: number): StationData['servers'] {
  if (Math.max(1, c2) >= 2) return [{ x: 322, y: 120 }, { x: 322, y: 232 }]
  return [{ x: 322, y: 176 }]
}

function gateYPositions(n: number): number[] {
  const spacing = (FLOOR_BOT - FLOOR_TOP) / (n + 1)
  return Array.from({ length: n }, (_, i) => Math.round(FLOOR_TOP + spacing * (i + 1)))
}

// ── Animación de aviones ──────────────────────────────────────────────────────

// Posición OBJETIVO en función del estado del avión
function targetPos(state: string, bandY: number): { x: number; y: number } {
  switch (state) {
    case 'approaching':
    case 'landing':
    case 'taxiing_in':
      return { x: PARK_X, y: bandY }           // llega a la puerta
    case 'at_gate':
    case 'boarding':
    case 'delayed':
    case 'mechanical':
    case 'cancelled':
    case 'crashed':
      return { x: PARK_X, y: bandY }           // estacionado
    case 'taxiing_out':
      return { x: RUNWAY_X, y: RUNWAY_Y }      // avanza a la cabecera de pista
    case 'takeoff':
    case 'airborne':
      return { x: WORLD_W + 150, y: RUNWAY_Y } // acelera y sale por la derecha
    default:
      return { x: PARK_X, y: bandY }
  }
}

// Posición inicial cuando un avión aparece por primera vez
function initPos(state: string, bandY: number): { x: number; y: number } {
  if (['approaching', 'landing', 'taxiing_in'].includes(state)) {
    return { x: WORLD_W + 150, y: RUNWAY_Y }  // entra desde la derecha
  }
  return targetPos(state, bandY)
}

// Velocidad de animación según estado (px / sim-min)
function speedFor(state: string): number {
  if (['takeoff', 'airborne'].includes(state))                   return SPEED_TAKEOFF
  if (['approaching', 'landing', 'taxiing_in'].includes(state)) return SPEED_APPROACH
  return SPEED_TAXI
}

// Normaliza un ángulo al rango [-π, π]
function normAngle(a: number): number {
  return ((a % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI
}

// Mueve la posición almacenada hacia el objetivo y calcula el ángulo de rotación
function animatePos(
  planeId: number,
  state: string,
  bandY: number,
  visuals: Map<number, PlaneVisual>,
  dt: number,
): PlaneVisual {
  const target = targetPos(state, bandY)

  if (!visuals.has(planeId)) {
    visuals.set(planeId, { ...initPos(state, bandY), angle: 0 })
  }

  const cur = visuals.get(planeId)!

  if (dt > 0) {
    const speed   = speedFor(state)
    const maxMove = speed * dt
    const dx      = target.x - cur.x
    const dy      = target.y - cur.y
    const dist    = Math.hypot(dx, dy)

    if (dist <= maxMove || dist < 0.5) {
      cur.x = target.x
      cur.y = target.y
      // Al llegar a destino: enderezar hacia la derecha (ángulo 0)
      cur.angle += normAngle(-cur.angle) * Math.min(1, dt * 6)
    } else {
      cur.x += (dx / dist) * maxMove
      cur.y += (dy / dist) * maxMove

      // Solo rotar cuando rodea hacia la pista (taxiing_out)
      // En los demás estados el avión no gira (llega de frente o está parado)
      if (state === 'taxiing_out') {
        const targetAngle = Math.atan2(dy, dx)
        cur.angle += normAngle(targetAngle - cur.angle) * Math.min(1, dt * 5)
      } else {
        // Volver suavemente a 0 en cualquier otro estado
        cur.angle += normAngle(-cur.angle) * Math.min(1, dt * 4)
      }
    }
  }

  return { x: cur.x, y: cur.y, angle: cur.angle }
}

function mapPlaneState(tsState: string): RenderPlane['state'] {
  switch (tsState) {
    case 'approaching':
    case 'landing':
    case 'taxiing_in':  return 'return'
    case 'at_gate':
    case 'boarding':
    case 'delayed':
    case 'mechanical':  return 'boarding'
    case 'taxiing_out': return 'taxi'
    case 'takeoff':
    case 'airborne':    return 'takeoff'
    default:            return 'boarding'
  }
}

// Para cada puerta, busca el avión más reciente (mayor id) con ese gateId
function getGatePlane(
  planes: Plane[],
  gateIdx: number,
  bandY: number,
  visuals: Map<number, PlaneVisual>,
  dt: number,
): RenderPlane {
  const p = planes
    .filter(pl => pl.gateId === gateIdx)
    .sort((a, b) => b.id - a.id)[0]

  if (!p) {
    return { x: WORLD_W + 150, y: bandY, state: 'return', boarded: 0, capacity: 100, timer: 0, angle: 0 }
  }

  const { x, y, angle } = animatePos(p.id, p.state, bandY, visuals, dt)
  return {
    x, y, angle,
    state:    mapPlaneState(p.state),
    boarded:  p.passengersBoarded,
    capacity: p.capacity,
    timer:    0,
  }
}

// ── Función principal ─────────────────────────────────────────────────────────

export function buildStations(
  config: SimConfig,
  planes: Plane[],
  planeVisuals: Map<number, PlaneVisual>,
  dt: number,
): WorldStations {
  const numGates = Math.max(1, Math.min(4, config.gates))

  const checkin: StationData = {
    id: 'checkin', name: 'CHECK-IN',
    x0: 84, x1: 216,
    qx0: 96, qx1: 178, qy0: 52, qy1: 322,
    slots:   snake(96, 178, 52, 322, 13, 17),
    servers: checkinServers(config.c1),
    sMin: 1.4, sMax: 2.6,
  }

  const security: StationData = {
    id: 'security', name: 'SEGURIDAD',
    x0: 216, x1: 342,
    qx0: 226, qx1: 300, qy0: 60, qy1: 312,
    slots:   snake(226, 300, 60, 312, 13, 17),
    servers: securityServers(config.c2),
    sMin: 1.3, sMax: 2.4,
  }

  const bandYs = gateYPositions(numGates)
  const gates: GateData[] = bandYs.map((cy, i) => ({
    id: i, bandY: cy,
    qx0: 352, qx1: 444, qy0: cy - 40, qy1: cy + 40,
    slots:       snake(352, 444, cy - 40, cy + 40, 12, 15),
    doorX:       PARK_X + 4,
    doorY:       cy,
    parkX:       PARK_X,
    parkY:       cy,
    boardingNow: 0,
    plane:       getGatePlane(planes, i, cy, planeVisuals, dt),
    line:        [],
  }))

  return {
    checkin,
    security,
    gate: { id: 'gate', name: 'EMBARQUE', gates },
  }
}
