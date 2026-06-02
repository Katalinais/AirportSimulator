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

function makeRenderPassenger(
  p: Passenger,
  x: number, y: number,
  state: RenderPassenger['state'],
  station: RenderPassenger['station'],
  gateIdx: number,
): RenderPassenger {
  return {
    id: p.id, x, y,
    shirt: SHIRTS[p.id % SHIRTS.length],
    skin:  SKINS[p.id  % SKINS.length],
    hair:  HAIR[p.id   % HAIR.length],
    bag:   p.id % 3 !== 0,
    moving: false,
    walk: 2,
    state, station, gateIdx,
    tx: 0, ty: 0, wait: 0,
  }
}

// Asigna posiciones en 640×360 según station y slot index
function assignPositions(
  passengers: Passenger[],
  stations: WorldStations,
  activeGateIds: Set<number>,   // puertas con avión activo (no crasheado/cancelado)
): RenderPassenger[] {
  type PGroup = Passenger[]
  const checkinQ:    PGroup = []
  const checkinSrv:  PGroup = []
  const securityQ:   PGroup = []
  const securitySrv: PGroup = []
  // waiting_gate: aún sin puerta asignada (gateId = -1)
  // Se muestran en el pasillo entre seguridad y embarque, distribuidos
  const waitingGate: PGroup = []
  // boarding_q / boarding_s: ya tienen gateId asignado por el motor
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
          // Puerta operativa: cola normal
          if (!gateQ.has(g)) gateQ.set(g, [])
          gateQ.get(g)!.push(p)
        } else {
          // Puerta cerrada (crash/cancelado): mover al pasillo de espera
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
    result.push(makeRenderPassenger(p, slot.x, slot.y, 'queue', 'checkin', -1))
  })

  // Servidores check-in
  checkinSrv.forEach((p, i) => {
    const srv = checkin.servers[i % checkin.servers.length]
    result.push(makeRenderPassenger(p, srv.x, srv.y, 'toserver', 'checkin', -1))
  })

  // Cola seguridad
  securityQ.forEach((p, i) => {
    const slot = security.slots[i % security.slots.length]
    result.push(makeRenderPassenger(p, slot.x, slot.y, 'queue', 'security', -1))
  })

  // Servidores seguridad
  securitySrv.forEach((p, i) => {
    const srv = security.servers[i % security.servers.length]
    result.push(makeRenderPassenger(p, srv.x, srv.y, 'toserver', 'security', -1))
  })

  // waiting_gate: pasillo entre seguridad y embarque (x: 342–360)
  // Se distribuyen verticalmente por el número de puerta (round-robin)
  // para que se vean "caminando hacia su puerta"
  {
    const CORRIDOR_X0 = 344
    const CORRIDOR_X1 = 360
    waitingGate.forEach((p, i) => {
      const gIdx  = i % numGates
      const g     = gate.gates[gIdx]
      if (!g) return
      // Distribuir verticalmente dentro del band de esa puerta
      const col   = Math.floor(i / numGates) % 3
      const row   = Math.floor(i / (numGates * 3))
      const x     = CORRIDOR_X0 + col * 8
      const halfH = (g.qy1 - g.qy0) / 2
      const y     = g.bandY + (row % 5 - 2) * (halfH / 2.5)
      result.push(makeRenderPassenger(p, x, Math.round(y), 'queue', 'gate', gIdx))
    })
  }

  // boarding_q: cola específica de cada puerta (ya tienen gateId del motor)
  for (const [gateIdx, pList] of gateQ) {
    const g = gate.gates[gateIdx % numGates]
    if (!g) continue
    pList.forEach((p, i) => {
      const slot = g.slots[i % g.slots.length]
      result.push(makeRenderPassenger(p, slot.x, slot.y, 'queue', 'gate', gateIdx))
    })
  }

  // boarding_s: junto a la puerta del avión
  for (const [gateIdx, pList] of gateBrd) {
    const g = gate.gates[gateIdx % numGates]
    if (!g) continue
    pList.forEach((p, i) => {
      const spread = (i % 3) * 5 - 5
      result.push(makeRenderPassenger(p, g.doorX + spread, g.doorY, 'boarding', 'gate', gateIdx))
    })
  }

  return result
}

// ── Pasajeros que abandonan (animación de salida) ─────────────────────────────

// Zona ENTRADA (x: 0-84). Los abandonados caminan desde x≈68 hasta salir
// por la izquierda en ~4 min simulados. Camiseta gris para distinguirlos.
const ABANDON_FLOOR_TOP = 32
const ABANDON_SHOW_MINS = 4      // cuántos min sim permanecen visibles
const ABANDON_MAX       = 14     // máximo de abandonados simultáneos en pantalla
const ABANDON_ROW_H     = 19     // separación vertical entre filas
const ABANDON_ROWS      = 17     // número de filas (cubre todo el suelo)

function abandonVisuals(passengers: Passenger[], simTime: number): RenderPassenger[] {
  return passengers
    .filter(p =>
      p.state === 'abandoned' &&
      p.timestamps.exitAt > 0 &&
      simTime - p.timestamps.exitAt < ABANDON_SHOW_MINS,
    )
    .slice(-ABANDON_MAX)   // solo los más recientes
    .map(p => {
      const elapsed = simTime - p.timestamps.exitAt                // 0 → SHOW_MINS
      // Se mueven de x=68 hacia la izquierda, saliendo del canvas
      const x = 68 - elapsed * (80 / ABANDON_SHOW_MINS)
      // Filas fijas por id para evitar solapamientos
      const y = ABANDON_FLOOR_TOP + (p.id % ABANDON_ROWS) * ABANDON_ROW_H
      return {
        id:      p.id,
        x, y,
        shirt:   '#374151',   // gris oscuro: indicador visual de abandono
        skin:    SKINS[p.id % SKINS.length],
        hair:    HAIR[p.id  % HAIR.length],
        bag:     false,       // soltaron el equipaje
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
  dt: number,
): World {
  const { passengers, planes, simTime } = state

  // Solo pasajeros activos (ni abordados ni abandonados)
  const active = passengers.filter(
    p => p.state !== 'boarded' && p.state !== 'abandoned',
  )

  // Para animación incluimos takeoff/airborne (completan su salida en pantalla)
  const animPlanes = planes.filter(
    p => !['cancelled', 'crashed'].includes(p.state),
  )

  // Puertas con avión operativo (excluye crash/cancel/airborne ya ido)
  const activeGateIds = new Set(
    planes
      .filter(p => !['crashed', 'cancelled', 'airborne'].includes(p.state))
      .map(p => p.gateId),
  )

  const stations = buildStations(config, animPlanes, planeVisuals, dt)

  return {
    passengers: [
      ...assignPositions(active, stations, activeGateIds),
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
