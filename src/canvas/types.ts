// Tipos del mundo de nueva-ui (espacio de coordenadas 640×360)

export interface Slot { x: number; y: number }
export interface Server { x: number; y: number }

export interface RenderPassenger {
  id: number
  x: number; y: number
  shirt: string; skin: string; hair: string
  bag: boolean; moving: boolean; walk: number
  state: 'queue' | 'toserver' | 'service' | 'boarding'
  station: 'checkin' | 'security' | 'gate'
  gateIdx: number
  tx: number; ty: number; wait: number
}

export interface RenderPlane {
  x: number; y: number
  state: 'boarding' | 'wait' | 'taxi' | 'takeoff' | 'return'
  boarded: number; capacity: number; timer: number
  angle: number   // radianes, 0 = morro apunta a la derecha
}

export interface StationData {
  id: string; name: string
  x0?: number; x1?: number
  qx0: number; qx1: number; qy0: number; qy1: number
  slots: Slot[]
  servers: Server[]
  sMin?: number; sMax?: number
}

export interface GateData {
  id: number; bandY: number
  qx0: number; qx1: number; qy0: number; qy1: number
  slots: Slot[]
  doorX: number; doorY: number
  parkX: number; parkY: number
  boardingNow: number
  plane: RenderPlane
  line: number[]
}

export interface GateGroup {
  id: string; name: string
  gates: GateData[]
}

export interface WorldStations {
  checkin: StationData
  security: StationData
  gate: GateGroup
}

export interface WorldStats {
  volados: number
  vuelos: number
  waitSamples: number[]
}

export interface World {
  passengers: RenderPassenger[]
  stations: WorldStations
  stats: WorldStats
  runwayBusy: number | null
  time: number
}

// Posición y ángulo visual de un avión, animados frame a frame
export interface PlaneVisual { x: number; y: number; angle: number }

export interface DrawOpts {
  theme?: 'dia' | 'atardecer' | 'noche'
  showPaths?: boolean
  size?: number
}
