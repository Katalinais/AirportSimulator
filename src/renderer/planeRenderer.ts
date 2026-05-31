// Renderizador de aviones: animación de llegada, docking, salida por pista y zona HOLD en taxiway

import { Plane } from '../engine/plane'
import { GATE_POS } from './airportCanvas'

const TAXIWAY_Y = 323
const RUNWAY_Y  = 400
const CANVAS_W  = 900

// Zona de espera (HOLD): x=80+slot*72, y=TAXIWAY_Y+14
const HOLD_X0   = 80
const HOLD_DX   = 72
const HOLD_Y    = TAXIWAY_Y + 14

// ── Estado visual por avión ───────────────────────────────────────────────────

interface PlaneVis {
  x: number; y: number; angle: number
  gateX: number; gateY: number
  airborneAt: number | null
}

const planeVisuals = new Map<number, PlaneVis>()
let lastPlaneFrameMs = 0

export function clearPlaneVisuals(): void {
  planeVisuals.clear()
  lastPlaneFrameMs = 0
}

// ── Color por estado ──────────────────────────────────────────────────────────

function planeColor(state: string): string {
  switch (state) {
    case 'approaching':
    case 'landing':
    case 'taxiing_in':                          return '#60a5fa'
    case 'holding':                             return '#93c5fd'
    case 'at_gate':                             return '#a78bfa'
    case 'boarding':                            return '#34d399'
    case 'delayed':                             return '#fbbf24'
    case 'taxiing_out': case 'takeoff': case 'airborne': return '#f97316'
    case 'cancelled':                           return '#ef4444'
    default:                                    return '#94a3b8'
  }
}

// ── Icono de avión (vista superior) ──────────────────────────────────────────

function drawPlaneIcon(
  ctx:   CanvasRenderingContext2D,
  cx:    number, cy: number,
  color: string,
  scale = 1,
  angle = -Math.PI / 2,
): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.scale(scale, scale)

  ctx.fillStyle   = color
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'
  ctx.lineWidth   = 0.8

  ctx.beginPath()
  ctx.ellipse(0, 0, 14, 4, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(14, 0); ctx.lineTo(22, 0); ctx.lineTo(14, -2)
  ctx.closePath(); ctx.fill()

  ctx.beginPath()
  ctx.moveTo(2, 0); ctx.lineTo(-2, -15); ctx.lineTo(-10, -13); ctx.lineTo(-8, 0)
  ctx.closePath(); ctx.fill(); ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(2, 0); ctx.lineTo(-2, 15); ctx.lineTo(-10, 13); ctx.lineTo(-8, 0)
  ctx.closePath(); ctx.fill(); ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(-12, 0); ctx.lineTo(-16, -7); ctx.lineTo(-10, 0)
  ctx.closePath(); ctx.fill(); ctx.stroke()

  ctx.restore()
}

// ── Zona HOLD en el apron (dibujo estático) ───────────────────────────────────

export function drawHoldZone(ctx: CanvasRenderingContext2D): void {
  // Fondo sutil
  ctx.fillStyle = 'rgba(30,40,60,0.6)'
  ctx.fillRect(16, 328, 510, 14)

  // Borde punteado
  ctx.strokeStyle = '#374151'
  ctx.lineWidth   = 1
  ctx.setLineDash([6, 5])
  ctx.strokeRect(16, 328, 510, 14)
  ctx.setLineDash([])

  // Divisores de slots
  ctx.strokeStyle = '#2d3748'
  ctx.lineWidth   = 0.8
  for (let i = 1; i < 7; i++) {
    ctx.beginPath()
    ctx.moveTo(HOLD_X0 + i * HOLD_DX, 328)
    ctx.lineTo(HOLD_X0 + i * HOLD_DX, 342)
    ctx.stroke()
  }

  ctx.fillStyle = '#4b5563'
  ctx.font      = '8px monospace'
  ctx.textAlign = 'left'
  ctx.fillText('HOLD', 20, 338)
}

// ── Render principal ──────────────────────────────────────────────────────────

export function drawPlanes(
  ctx:     CanvasRenderingContext2D,
  planes:  Plane[],
  simTime: number,
): void {
  const now = performance.now()
  const dt  = Math.min((now - (lastPlaneFrameMs || now)) / 1000, 0.1)
  lastPlaneFrameMs = now

  const LERP = Math.min(1, 6 * dt)

  // ── Construir cola de espera (HOLD) ─────────────────────────────────────────
  // Un avión está en HOLD si su gate ya tiene un avión activo (no-approaching, no-airborne)
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
  holdingIds.sort((a, b) => a - b)   // IDs menores = aviones más antiguos = prioridad

  // ── Zona HOLD ────────────────────────────────────────────────────────────────
  drawHoldZone(ctx)

  // ── Renderizar cada avión ────────────────────────────────────────────────────
  for (const plane of planes) {
    const gateIdx = Math.min(plane.gateId, GATE_POS.length - 1)
    const gate    = GATE_POS[gateIdx]

    if (!planeVisuals.has(plane.id)) {
      // No crear animación para aviones que ya salieron antes de que el renderer los viera
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
      // ── Animación de salida ─────────────────────────────────────────────────
      const elapsed     = (now - vis.airborneAt) / 1000
      const PHASE_DOWN  = 2.2
      const PHASE_TAXI  = 1.8
      const PHASE_RWY   = 2.5

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
      // ── Aproximación o espera en HOLD ───────────────────────────────────────
      const holdIdx = holdingIds.indexOf(plane.id)
      if (holdIdx >= 0) {
        // Estacionar en la zona HOLD
        tx = HOLD_X0 + holdIdx * HOLD_DX + HOLD_DX / 2
        ty = HOLD_Y
        targetAngle = 0   // apunta derecha (preparado para salir)
      } else {
        // Puerta libre: avanzar hacia el taxiway de la puerta
        tx = gate.x + 30
        ty = TAXIWAY_Y
        targetAngle = Math.PI
      }

    } else {
      // ── Posición según estado ────────────────────────────────────────────────
      switch (plane.state) {
        case 'taxiing_in':
          tx = gate.x; ty = gate.y; targetAngle = -Math.PI / 2
          break
        case 'at_gate':
        case 'boarding':
        case 'delayed':
        case 'cancelled':
        default:
          tx = gate.x; ty = gate.y; targetAngle = -Math.PI / 2
      }
    }

    vis.x += (tx - vis.x) * LERP
    vis.y += (ty - vis.y) * LERP
    vis.angle = targetAngle

    const isHolding = holdingIds.includes(plane.id)
    const colorKey  = vis.airborneAt !== null ? 'airborne'
                    : isHolding              ? 'holding'
                    : plane.state
    const color = planeColor(colorKey)

    // Sombra
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    ctx.ellipse(vis.x + 2, vis.y + 3, 18, 6, 0, 0, Math.PI * 2)
    ctx.fill()

    drawPlaneIcon(ctx, vis.x, vis.y, color, 1, vis.angle)

    // Etiqueta de ocupación
    if (['at_gate', 'boarding', 'delayed'].includes(plane.state)) {
      ctx.fillStyle = '#d1d5db'
      ctx.font      = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`${plane.passengersBoarded}/${plane.capacity}`, vis.x, vis.y + 22)
    }

    // Badge retraso
    if (plane.state === 'delayed') {
      ctx.fillStyle = '#f59e0b'
      ctx.font      = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('⏱', vis.x, vis.y - 20)
    }

    // Badge HOLD (planes en espera)
    if (isHolding) {
      ctx.fillStyle = '#93c5fd'
      ctx.font      = 'bold 8px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('HOLD', vis.x, vis.y - 16)
    }
  }
}
