// Dibuja figuras de pasajeros: silhouette animada con color de estado, sombra y animación de caminar por waypoints

import { Passenger } from '../engine/passenger'
import { ZONES }     from './airportCanvas'

// ── Color por estado ──────────────────────────────────────────────────────────

const STATE_COLOR: Record<string, string> = {
  arriving:     '#60a5fa',
  checkin_q:    '#fbbf24',
  checkin_s:    '#f97316',
  security_q:   '#f87171',
  security_s:   '#fb923c',
  waiting_gate: '#86efac',
  boarding_q:   '#22d3ee',
  boarding_s:   '#06b6d4',
}

// ── Zona por estado ───────────────────────────────────────────────────────────

function zoneOf(state: string) {
  switch (state) {
    case 'arriving':
    case 'checkin_q':    return ZONES.checkinQ
    case 'checkin_s':    return ZONES.checkinS
    case 'security_q':   return ZONES.securityQ
    case 'security_s':   return ZONES.securityS
    case 'waiting_gate': return ZONES.waitGate
    case 'boarding_q':
    case 'boarding_s':   return ZONES.boardingQ
    default:             return null
  }
}

// Posición determinista dentro de una zona basada en el id del pasajero
function scatter(id: number, zone: { x: number; y: number; w: number; h: number }) {
  const a = ((id * 2654435761) >>> 0) / 0xffffffff
  const b = ((id * 1013904223 + id * 1664525) >>> 0) / 0xffffffff
  return {
    x: zone.x + 6 + a * (zone.w - 12),
    y: zone.y + 6 + b * (zone.h - 12),
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

export function drawPassengers(ctx: CanvasRenderingContext2D, passengers: Passenger[]): void {
  for (const p of passengers) {
    if (p.state === 'boarded' || p.state === 'abandoned') continue
    const zone = zoneOf(p.state)
    if (!zone) continue

    const { x, y } = scatter(p.id, zone)
    const color    = STATE_COLOR[p.state] ?? '#94a3b8'

    // Sombra
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath()
    ctx.ellipse(x + 1, y + 5, 4, 2, 0, 0, Math.PI * 2)
    ctx.fill()

    // Cuerpo
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fill()

    // Borde VIP dorado
    if (p.type === 'vip') {
      ctx.strokeStyle = '#fde68a'
      ctx.lineWidth   = 1.5
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Cabeza (silhouette)
    ctx.fillStyle = color
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    ctx.arc(x, y - 6, 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
}

// ── Leyenda de colores ────────────────────────────────────────────────────────

export function drawLegend(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const items: [string, string][] = [
    ['#fbbf24', 'En cola C-I'],
    ['#f87171', 'En cola Seg.'],
    ['#22d3ee', 'Embarcando'],
    ['#86efac', 'Esperando'],
  ]
  ctx.font = '10px sans-serif'
  items.forEach(([color, label], i) => {
    const lx = x + i * 110
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(lx, y, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#9ca3af'
    ctx.textAlign = 'left'
    ctx.fillText(label, lx + 8, y + 4)
  })
}
