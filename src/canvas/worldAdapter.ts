// Convierte SimState + SimConfig del motor TypeScript al objeto World que
// espera render.ts. No modifica ningún archivo del engine/.

import type { SimState, SimConfig } from '../hooks/useSimulation'
import type { Passenger }           from '../engine/passenger'
import type { World, RenderPassenger, WorldStations, PlaneVisual } from './types'
import { buildStations } from './stationsAdapter'

// Paleta visual asignada por id (consistente entre frames)
const SHIRTS = [
  '#e84d4d','#e8804d','#e8c84d','#7ec84d','#4dc88a',
  '#4dc8c8','#4d8ae8','#6a4de8','#b14de8','#e84db1',
  '#d96a8a','#5a8f6a','#caa14d','#4d6ae8','#9b59b6',
]
const SKINS = ['#f1c9a5','#e0a878','#c98b5e','#9c6b43','#6e4a2f','#f5d6b8']
const HAIR  = ['#2b2218','#4a3526','#6b4a2f','#9a9a9a','#1c1c22','#a8651f','#d9c27a']

// ── Animación de caminata de pasajeros ────────────────────────────────────────

export interface PassengerAnim { x: number; y: number; walk: number }

// Lerp fraccional escalado con dt.
// LERP_BASE=0.88 → factor≈12% por frame a speed=1, 60fps.
// Propiedad clave: el pasajero cubre ~92% de la distancia dentro del tiempo de
// servicio de check-in (20 frames), sin importar la velocidad de simulación.
const LERP_BASE = 0.88

const ENTRANCE_X     = 72
const ENTRANCE_Y_MIN = 42
const ENTRANCE_Y_MAX = 318

function lerpPassenger(
  id: number,
  tx: number, ty: number,
  animMap: Map<number, PassengerAnim>,
  dt: number,
): { x: number; y: number; moving: boolean; walk: number } {
  if (!animMap.has(id)) {
    const spawnY = ENTRANCE_Y_MIN + (id * 47) % (ENTRANCE_Y_MAX - ENTRANCE_Y_MIN)
    animMap.set(id, { x: ENTRANCE_X, y: spawnY, walk: 0 })
  }

  const cur = animMap.get(id)!

  if (dt <= 0) return { x: cur.x, y: cur.y, moving: false, walk: cur.walk }

  const dx     = tx - cur.x
  const dy     = ty - cur.y
  // factor escala con dt: mismo % de acercamiento por unidad de tiempo de simulación
  const factor = 1 - Math.pow(LERP_BASE, 60 * dt)
  const moveX  = dx * factor
  const moveY  = dy * factor
  const moved  = Math.hypot(moveX, moveY)

  if (moved < 0.5) {
    cur.x = tx; cur.y = ty
    return { x: tx, y: ty, moving: false, walk: cur.walk }
  }

  cur.x += moveX
  cur.y += moveY
  cur.walk += moved * 0.04   // 2 cambios de paso por cada 50 px recorridos
  return { x: cur.x, y: cur.y, moving: true, walk: cur.walk }
}

// ── Helpers de construcción ───────────────────────────────────────────────────

function makeRenderPassenger(
  p: Passenger,
  x: number, y: number,
  state: RenderPassenger['state'],
  station: RenderPassenger['station'],
  gateIdx: number,
  moving = false,
  walk   = 0,
): RenderPassenger {
  return {
    id: p.id, x, y,
    shirt: SHIRTS[p.id % SHIRTS.length],
    skin:  SKINS[p.id  % SKINS.length],
    hair:  HAIR[p.id   % HAIR.length],
    bag:   p.id % 3 !== 0,
    moving,
    walk,
    state, station, gateIdx,
    tx: 0, ty: 0, wait: 0,
  }
}

// Asigna posiciones en 640×360 según station y slot index
function assignPositions(
  passengers: Passenger[],
  stations: WorldStations,
  activeGateIds: Set<number>,
  animMap: Map<number, PassengerAnim>,
  dt: number,
): RenderPassenger[] {
  type PGroup = Passenger[]
  const checkinQ:    PGroup = []
  const checkinSrv:  PGroup = []
  const securityQ:   PGroup = []
  const securitySrv: PGroup = []
  const waitingGate: PGroup = []
  const gateQ   = new Map<number, PGroup>()
  const gateBrd = new Map<number, PGroup>()

  for (const p of passengers) {
    switch (p.state) {
      case 'arriving':
      case 'checkin_q':    checkinQ.push(p);   break
      case 'checkin_s':    checkinSrv.push(p);  break
      case 'security_q':   securityQ.push(p);  break
      case 'security_s':   securitySrv.push(p); break
      case 'waiting_gate':
        waitingGate.push(p); break
      case 'boarding_q': {
        const g = p.gateId >= 0 ? p.gateId : 0
        if (activeGateIds.has(g)) {
          if (!gateQ.has(g)) gateQ.set(g, [])
          gateQ.get(g)!.push(p)
        } else {
          waitingGate.push(p)
        }
        break
      }
      case 'boarding_s': {
        const g = p.gateId >= 0 ? p.gateId : 0
        if (!gateBrd.has(g)) gateBrd.set(g, [])
        gateBrd.get(g)!.push(p); break
      }
    }
  }

  const result: RenderPassenger[] = []
  const { checkin, security, gate } = stations
  const numGates = gate.gates.length

  // Cola check-in
  checkinQ.forEach((p, i) => {
    const slot = checkin.slots[i % checkin.slots.length]
    const anim = lerpPassenger(p.id, slot.x, slot.y, animMap, dt)
    result.push(makeRenderPassenger(p, anim.x, anim.y, 'queue', 'checkin', -1, anim.moving, anim.walk))
  })

  // Servidores check-in
  checkinSrv.forEach((p, i) => {
    const srv  = checkin.servers[i % checkin.servers.length]
    const anim = lerpPassenger(p.id, srv.x, srv.y, animMap, dt)
    result.push(makeRenderPassenger(p, anim.x, anim.y, 'toserver', 'checkin', -1, anim.moving, anim.walk))
  })

  // Cola seguridad
  securityQ.forEach((p, i) => {
    const slot = security.slots[i % security.slots.length]
    const anim = lerpPassenger(p.id, slot.x, slot.y, animMap, dt)
    result.push(makeRenderPassenger(p, anim.x, anim.y, 'queue', 'security', -1, anim.moving, anim.walk))
  })

  // Servidores seguridad
  securitySrv.forEach((p, i) => {
    const srv  = security.servers[i % security.servers.length]
    const anim = lerpPassenger(p.id, srv.x, srv.y, animMap, dt)
    result.push(makeRenderPassenger(p, anim.x, anim.y, 'toserver', 'security', -1, anim.moving, anim.walk))
  })

  // waiting_gate: pasillo entre seguridad y embarque
  {
    const CORRIDOR_X0 = 344
    waitingGate.forEach((p, i) => {
      const gIdx  = i % numGates
      const g     = gate.gates[gIdx]
      if (!g) return
      const col   = Math.floor(i / numGates) % 3
      const row   = Math.floor(i / (numGates * 3))
      const x     = CORRIDOR_X0 + col * 8
      const halfH = (g.qy1 - g.qy0) / 2
      const y     = g.bandY + (row % 5 - 2) * (halfH / 2.5)
      const anim  = lerpPassenger(p.id, x, Math.round(y), animMap, dt)
      result.push(makeRenderPassenger(p, anim.x, anim.y, 'queue', 'gate', gIdx, anim.moving, anim.walk))
    })
  }

  // boarding_q
  for (const [gateIdx, pList] of gateQ) {
    const g = gate.gates[gateIdx % numGates]
    if (!g) continue
    pList.forEach((p, i) => {
      const slot = g.slots[i % g.slots.length]
      const anim = lerpPassenger(p.id, slot.x, slot.y, animMap, dt)
      result.push(makeRenderPassenger(p, anim.x, anim.y, 'queue', 'gate', gateIdx, anim.moving, anim.walk))
    })
  }

  // boarding_s
  for (const [gateIdx, pList] of gateBrd) {
    const g = gate.gates[gateIdx % numGates]
    if (!g) continue
    pList.forEach((p, i) => {
      const spread = (i % 3) * 5 - 5
      const anim   = lerpPassenger(p.id, g.doorX + spread, g.doorY, animMap, dt)
      result.push(makeRenderPassenger(p, anim.x, anim.y, 'boarding', 'gate', gateIdx, anim.moving, anim.walk))
    })
  }

  return result
}

// ── Pasajeros que abandonan (animación de salida) ─────────────────────────────

const ABANDON_FLOOR_TOP = 32
const ABANDON_SHOW_MINS = 4
const ABANDON_MAX       = 14
const ABANDON_ROW_H     = 19
const ABANDON_ROWS      = 17

function abandonVisuals(passengers: Passenger[], simTime: number): RenderPassenger[] {
  return passengers
    .filter(p =>
      p.state === 'abandoned' &&
      p.timestamps.exitAt > 0 &&
      simTime - p.timestamps.exitAt < ABANDON_SHOW_MINS,
    )
    .slice(-ABANDON_MAX)
    .map(p => {
      const elapsed = simTime - p.timestamps.exitAt
      const x = 68 - elapsed * (80 / ABANDON_SHOW_MINS)
      const y = ABANDON_FLOOR_TOP + (p.id % ABANDON_ROWS) * ABANDON_ROW_H
      return {
        id:      p.id,
        x, y,
        shirt:   '#374151',
        skin:    SKINS[p.id % SKINS.length],
        hair:    HAIR[p.id  % HAIR.length],
        bag:     false,
        moving:  x > 2,
        walk:    p.id * 1.3 + elapsed * 10,
        state:   'queue'   as const,
        station: 'checkin' as const,
        gateIdx: -1,
        tx: 0, ty: 0, wait: 0,
      }
    })
}

// ── Función principal ─────────────────────────────────────────────────────────

export function buildWorld(
  state: SimState,
  config: SimConfig,
  planeVisuals: Map<number, PlaneVisual>,
  passengerAnim: Map<number, PassengerAnim>,
  dt: number,
): World {
  const { passengers, planes, simTime } = state

  const active = passengers.filter(
    p => p.state !== 'boarded' && p.state !== 'abandoned',
  )

  // Limpiar entradas de pasajeros que ya salieron del sistema
  const activeIds = new Set(active.map(p => p.id))
  for (const id of passengerAnim.keys()) {
    if (!activeIds.has(id)) passengerAnim.delete(id)
  }

  const animPlanes = planes.filter(
    p => !['cancelled', 'crashed'].includes(p.state),
  )

  const activeGateIds = new Set(
    planes
      .filter(p => !['crashed', 'cancelled', 'airborne'].includes(p.state))
      .map(p => p.gateId),
  )

  const stations = buildStations(config, animPlanes, planeVisuals, dt)

  return {
    passengers: [
      ...assignPositions(active, stations, activeGateIds, passengerAnim, dt),
      ...abandonVisuals(passengers, simTime),
    ],
    stations,
    stats: {
      volados:     passengers.filter(p => p.state === 'boarded').length,
      vuelos:      planes.filter(p => p.state === 'airborne').length,
      waitSamples: [],
    },
    runwayBusy: planes.some(p => p.state === 'taxiing_out' || p.state === 'takeoff') ? 0 : null,
    time: simTime,
  }
}
