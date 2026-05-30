// Dibuja aviones: fuselaje, alas, estabilizadores, librea de color y sombra; animación de movimiento por waypoints

import { Plane } from '../engine/plane'
import { GATE_POS } from './airportCanvas'

// Color por estado del avión
function planeColor(state: string): string {
  switch (state) {
    case 'approaching':
    case 'landing':
    case 'taxiing_in':  return '#60a5fa'   // azul → llegando
    case 'at_gate':     return '#a78bfa'   // violeta → en puerta
    case 'boarding':    return '#34d399'   // verde → embarcando
    case 'delayed':     return '#fbbf24'   // amarillo → retrasado
    case 'taxiing_out':
    case 'takeoff':     return '#f97316'   // naranja → saliendo
    case 'airborne':    return '#6b7280'   // gris → ya no visible
    case 'cancelled':   return '#ef4444'   // rojo → cancelado
    default:            return '#94a3b8'
  }
}

// Vista superior del avión (dirección: apuntando a la derecha por defecto)
function drawPlaneIcon(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  color: string,
  scale = 1,
  angle = -Math.PI / 2,   // por defecto apunta hacia arriba (hacia terminal)
): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.scale(scale, scale)

  ctx.fillStyle = color
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'
  ctx.lineWidth = 0.8

  // Fuselaje
  ctx.beginPath()
  ctx.ellipse(0, 0, 14, 4, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // Nariz
  ctx.beginPath()
  ctx.moveTo(14, 0)
  ctx.lineTo(22, 0)
  ctx.lineTo(14, -2)
  ctx.closePath()
  ctx.fill()

  // Ala izquierda
  ctx.beginPath()
  ctx.moveTo(2, 0)
  ctx.lineTo(-2, -15)
  ctx.lineTo(-10, -13)
  ctx.lineTo(-8, 0)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Ala derecha
  ctx.beginPath()
  ctx.moveTo(2, 0)
  ctx.lineTo(-2, 15)
  ctx.lineTo(-10, 13)
  ctx.lineTo(-8, 0)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Estabilizador vertical
  ctx.beginPath()
  ctx.moveTo(-12, 0)
  ctx.lineTo(-16, -7)
  ctx.lineTo(-10, 0)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  ctx.restore()
}

// Posición visual del avión según su estado
function planePosition(plane: Plane, simTime: number): { x: number; y: number; angle: number } | null {
  const gateIdx = Math.min(plane.gateId, GATE_POS.length - 1)
  const gate    = GATE_POS[gateIdx]

  switch (plane.state) {
    case 'approaching': {
      // Entra desde la derecha en el apron
      const progress = Math.min(1, (simTime % 30) / 20)
      return { x: 890 - progress * 500, y: 323, angle: Math.PI }
    }
    case 'landing': {
      const progress = Math.min(1, (simTime % 20) / 15)
      return { x: 890 - progress * 800, y: 400, angle: Math.PI }
    }
    case 'taxiing_in': {
      const progress = Math.min(1, (simTime % 15) / 10)
      return { x: 200 + progress * (gate.x - 200), y: 323 + progress * (gate.y - 323), angle: -Math.PI / 2 }
    }
    case 'at_gate':
    case 'boarding':
    case 'delayed':
    case 'cancelled':
      return { x: gate.x, y: gate.y, angle: -Math.PI / 2 }

    case 'taxiing_out': {
      const elapsed  = simTime % 8
      const progress = Math.min(1, elapsed / 6)
      return { x: gate.x + progress * (200 - gate.x), y: gate.y + progress * (323 - gate.y), angle: 0 }
    }
    case 'takeoff': {
      const elapsed  = simTime % 10
      const progress = Math.min(1, elapsed / 8)
      return { x: 20 + progress * 860, y: 400, angle: 0 }
    }
    case 'airborne':
      return null   // fuera del canvas

    default:
      return { x: gate.x, y: gate.y, angle: -Math.PI / 2 }
  }
}

export function drawPlanes(ctx: CanvasRenderingContext2D, planes: Plane[], simTime: number): void {
  for (const plane of planes) {
    if (plane.state === 'airborne') continue

    const pos = planePosition(plane, simTime)
    if (!pos) continue

    const color = planeColor(plane.state)

    // Sombra
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    ctx.ellipse(pos.x + 2, pos.y + 3, 18, 6, 0, 0, Math.PI * 2)
    ctx.fill()

    drawPlaneIcon(ctx, pos.x, pos.y, color, 1, pos.angle)

    // Indicador de estado (badge)
    if (plane.state === 'delayed' || plane.state === 'cancelled') {
      ctx.fillStyle = plane.state === 'cancelled' ? '#ef4444' : '#f59e0b'
      ctx.font = 'bold 9px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(plane.state === 'cancelled' ? '✕' : '⏱', pos.x, pos.y - 20)
    }

    // Etiqueta ocupación (solo en puerta)
    if (['at_gate', 'boarding', 'delayed'].includes(plane.state)) {
      ctx.fillStyle = '#d1d5db'
      ctx.font      = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`${plane.passengersBoarded}/${plane.capacity}`, pos.x, pos.y + 22)
    }
  }
}
