import * as PIXI from 'pixi.js'
import { Plane } from '../engine/plane'
import { GATE_POS, TAXIWAY_Y, RUNWAY_Y, CANVAS_W, APRON_Y } from './pixiApp'

const HOLD_X0 = 90
const HOLD_DX = 110
const HOLD_Y  = APRON_Y + 8

interface PlaneVis {
  x: number; y: number; angle: number
  gateX: number; gateY: number
  airborneAt: number | null
}

const planeVisuals = new Map<number, PlaneVis>()
let lastPlaneFrameMs = 0

export function clearPlanePixiVisuals(): void {
  planeVisuals.clear()
  lastPlaneFrameMs = 0
}

function planeColor(state: string): number {
  switch (state) {
    case 'approaching':
    case 'landing':
    case 'taxiing_in':                              return 0x60a5fa
    case 'holding':                                 return 0x93c5fd
    case 'at_gate':                                 return 0xa78bfa
    case 'boarding':                                return 0x34d399
    case 'delayed':                                 return 0xfbbf24
    case 'taxiing_out': case 'takeoff': case 'airborne': return 0xf97316
    case 'cancelled':                               return 0xef4444
    default:                                        return 0x94a3b8
  }
}

function drawPlaneIcon(g: PIXI.Graphics, cx: number, cy: number, color: number, angle: number): void {
  g.beginFill(color)
  g.lineStyle(0.8, 0x00000080)

  // guardamos y aplicamos rotación manualmente sobre los puntos
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  function pt(lx: number, ly: number): [number, number] {
    return [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos]
  }

  // fuselaje (elipse aproximada con polígono)
  const points: number[] = []
  for (let a = 0; a < Math.PI * 2; a += 0.3) {
    const [px, py] = pt(Math.cos(a) * 14, Math.sin(a) * 4)
    points.push(px, py)
  }
  g.drawPolygon(points)
  g.endFill()

  // nariz
  g.beginFill(color)
  const [n0x, n0y] = pt(14, 0)
  const [n1x, n1y] = pt(22, 0)
  const [n2x, n2y] = pt(14, -2)
  g.drawPolygon([n0x, n0y, n1x, n1y, n2x, n2y])
  g.endFill()

  // ala izquierda
  g.beginFill(color)
  g.lineStyle(0.8, 0x00000080)
  const [w0x, w0y] = pt(2,  0)
  const [w1x, w1y] = pt(-2, -15)
  const [w2x, w2y] = pt(-10, -13)
  const [w3x, w3y] = pt(-8, 0)
  g.drawPolygon([w0x, w0y, w1x, w1y, w2x, w2y, w3x, w3y])
  g.endFill()

  // ala derecha
  g.beginFill(color)
  const [r0x, r0y] = pt(2,  0)
  const [r1x, r1y] = pt(-2,  15)
  const [r2x, r2y] = pt(-10,  13)
  const [r3x, r3y] = pt(-8, 0)
  g.drawPolygon([r0x, r0y, r1x, r1y, r2x, r2y, r3x, r3y])
  g.endFill()

  // cola
  g.beginFill(color)
  const [t0x, t0y] = pt(-12, 0)
  const [t1x, t1y] = pt(-16, -7)
  const [t2x, t2y] = pt(-10, 0)
  g.drawPolygon([t0x, t0y, t1x, t1y, t2x, t2y])
  g.endFill()
}

function drawHoldZone(g: PIXI.Graphics): void {
  g.beginFill(0x1e283c, 0.6)
  g.lineStyle(1, 0x374151)
  g.drawRect(16, 328, 510, 14)
  g.endFill()

  g.lineStyle(0.8, 0x2d3748)
  for (let i = 1; i < 7; i++) {
    g.moveTo(HOLD_X0 + i * HOLD_DX, 328)
    g.lineTo(HOLD_X0 + i * HOLD_DX, 342)
  }
}

export function drawPlanes(
  g:          PIXI.Graphics,
  labelCont:  PIXI.Container,
  planes:     Plane[],
  simTime:    number,
): void {
  const now = performance.now()
  const dt  = Math.min((now - (lastPlaneFrameMs || now)) / 1000, 0.1)
  lastPlaneFrameMs = now

  g.clear()
  labelCont.removeChildren()

  const LERP = Math.min(1, 6 * dt)

  // construir holdingIds
  const holdingIds: number[] = []
  for (const plane of planes) {
    if (plane.state !== 'approaching') continue
    const gateOccupied = planes.some(
      pl => pl.id !== plane.id &&
            pl.gateId === plane.gateId &&
            !['airborne', 'cancelled', 'approaching'].includes(pl.state),
    )
    const departing = [...planeVisuals.values()].some(
      v => v.gateX === GATE_POS[Math.min(plane.gateId, GATE_POS.length - 1)].x &&
           v.airborneAt !== null,
    )
    if (gateOccupied || departing) holdingIds.push(plane.id)
  }
  holdingIds.sort((a, b) => a - b)

  drawHoldZone(g)

  for (const plane of planes) {
    const gateIdx = Math.min(plane.gateId, GATE_POS.length - 1)
    const gate    = GATE_POS[gateIdx]

    if (!planeVisuals.has(plane.id)) {
      if (['airborne', 'cancelled'].includes(plane.state)) continue
      planeVisuals.set(plane.id, {
        x: CANVAS_W + 60, y: TAXIWAY_Y,
        angle: Math.PI,
        gateX: gate.x, gateY: gate.y,
        airborneAt: null,
      })
    }

    const vis = planeVisuals.get(plane.id)!
    vis.gateX = gate.x
    vis.gateY = gate.y

    if (plane.state === 'airborne' && vis.airborneAt === null) {
      vis.airborneAt = now
      vis.x = gate.x
      vis.y = gate.y
    }

    let tx = gate.x, ty = gate.y, targetAngle = -Math.PI / 2

    if (vis.airborneAt !== null) {
      const elapsed    = (now - vis.airborneAt) / 1000
      const PHASE_DOWN = 2.2
      const PHASE_TAXI = 1.8
      const PHASE_RWY  = 2.5

      if (elapsed < PHASE_DOWN) {
        const t = elapsed / PHASE_DOWN
        tx = gate.x
        ty = gate.y + t * (TAXIWAY_Y - gate.y)
        targetAngle = Math.PI / 2
      } else if (elapsed < PHASE_DOWN + PHASE_TAXI) {
        const t = (elapsed - PHASE_DOWN) / PHASE_TAXI
        tx = gate.x + t * (55 - gate.x)
        ty = TAXIWAY_Y
        targetAngle = Math.PI
      } else if (elapsed < PHASE_DOWN + PHASE_TAXI + PHASE_RWY) {
        const t = (elapsed - PHASE_DOWN - PHASE_TAXI) / PHASE_RWY
        tx = 55 + t * t * (CANVAS_W + 150)
        ty = RUNWAY_Y
        targetAngle = 0
      } else {
        planeVisuals.delete(plane.id)
        continue
      }

    } else if (plane.state === 'approaching') {
      const holdIdx = holdingIds.indexOf(plane.id)
      if (holdIdx >= 0) {
        tx = HOLD_X0 + holdIdx * HOLD_DX + HOLD_DX / 2
        ty = HOLD_Y
        targetAngle = 0
      } else {
        tx = gate.x + 30; ty = TAXIWAY_Y; targetAngle = Math.PI
      }
    } else {
      tx = gate.x; ty = gate.y; targetAngle = -Math.PI / 2
    }

    vis.x += (tx - vis.x) * LERP
    vis.y += (ty - vis.y) * LERP
    vis.angle = targetAngle

    const isHolding = holdingIds.includes(plane.id)
    const colorKey  = vis.airborneAt !== null ? 'airborne'
                    : isHolding              ? 'holding'
                    : plane.state
    const color = planeColor(colorKey)

    // sombra
    g.beginFill(0x000000, 0.3)
    g.lineStyle(0)
    g.drawEllipse(vis.x + 2, vis.y + 3, 18, 6)
    g.endFill()

    drawPlaneIcon(g, vis.x, vis.y, color, vis.angle)

    // etiqueta ocupación
    if (['at_gate', 'boarding', 'delayed'].includes(plane.state)) {
      const lbl = new PIXI.Text(
        `${plane.passengersBoarded}/${plane.capacity}`,
        new PIXI.TextStyle({ fontFamily: 'monospace', fontSize: 9, fill: 0xd1d5db }),
      )
      lbl.anchor.set(0.5, 0)
      lbl.x = vis.x; lbl.y = vis.y + 22
      labelCont.addChild(lbl)
    }

    // badge HOLD
    if (isHolding) {
      g.lineStyle(0)
      g.beginFill(0x93c5fd, 0.85)
      g.drawRoundedRect(vis.x - 12, vis.y - 24, 24, 10, 2)
      g.endFill()
    }

    // badge retraso
    if (plane.state === 'delayed') {
      g.lineStyle(0)
      g.beginFill(0xf59e0b, 0.85)
      g.drawCircle(vis.x, vis.y - 22, 5)
      g.endFill()
    }
  }
}
