// Renderizador principal del canvas: terminal, zonas, corredores con carriles, apron, taxiway y pista

export const CANVAS_W = 900
export const CANVAS_H = 460

// Rectángulos donde los pasajeros se dispersan según su estado
export const ZONES = {
  checkinQ:   { x: 28,  y: 75,  w: 215, h: 155 },
  checkinS:   { x: 28,  y: 245, w: 215, h: 28  },
  securityQ:  { x: 308, y: 75,  w: 215, h: 155 },
  securityS:  { x: 308, y: 245, w: 215, h: 28  },
  waitGate:   { x: 608, y: 155, w: 258, h: 115 },
  boardingQ:  { x: 608, y: 130, w: 258, h: 28  },
} as const

// Posición visual de cada puerta (máx. 5)
export const GATE_POS = [
  { x: 638, y: 55 },
  { x: 710, y: 55 },
  { x: 782, y: 55 },
  { x: 854, y: 55 },
  { x: 926, y: 55 },   // solo visible si canvas se amplía
]

export function drawAirport(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // ── Fondo general ────────────────────────────────────────────────────────
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, w, h)

  // ── Terminal ─────────────────────────────────────────────────────────────
  ctx.fillStyle = '#111827'
  ctx.strokeStyle = '#374151'
  ctx.lineWidth = 2
  ctx.fillRect(10, 10, 880, 285)
  ctx.strokeRect(10, 10, 880, 285)

  // ── Zona Check-in ─────────────────────────────────────────────────────────
  _fillZone(ctx, 18,  10, 262, 285, 'rgba(59,130,246,0.08)')
  _label(ctx, 149, 26, 'CHECK-IN', '#60a5fa')
  // Mostradores
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = '#1e3a5f'
    ctx.fillRect(28 + i * 72, 248, 62, 22)
    ctx.strokeStyle = '#2563eb'
    ctx.lineWidth = 1
    ctx.strokeRect(28 + i * 72, 248, 62, 22)
  }

  // ── Separador 1 ───────────────────────────────────────────────────────────
  ctx.strokeStyle = '#1f2937'
  ctx.lineWidth = 2
  ctx.setLineDash([6, 4])
  ctx.beginPath(); ctx.moveTo(288, 14); ctx.lineTo(288, 291); ctx.stroke()
  ctx.setLineDash([])

  // ── Zona Seguridad ────────────────────────────────────────────────────────
  _fillZone(ctx, 296, 10, 270, 285, 'rgba(239,68,68,0.07)')
  _label(ctx, 431, 26, 'SEGURIDAD', '#f87171')
  // Scanners
  for (let i = 0; i < 2; i++) {
    const sx = 308 + i * 108
    ctx.fillStyle = '#3b1a1a'
    ctx.fillRect(sx, 248, 90, 22)
    ctx.strokeStyle = '#dc2626'
    ctx.lineWidth = 1
    ctx.strokeRect(sx, 248, 90, 22)
    // Arco del escáner
    ctx.beginPath()
    ctx.strokeStyle = '#dc2626'
    ctx.lineWidth = 2
    ctx.arc(sx + 45, 248, 22, Math.PI, 0)
    ctx.stroke()
  }

  // ── Separador 2 ───────────────────────────────────────────────────────────
  ctx.strokeStyle = '#1f2937'
  ctx.lineWidth = 2
  ctx.setLineDash([6, 4])
  ctx.beginPath(); ctx.moveTo(574, 14); ctx.lineTo(574, 291); ctx.stroke()
  ctx.setLineDash([])

  // ── Zona Puertas ──────────────────────────────────────────────────────────
  _fillZone(ctx, 582, 10, 306, 285, 'rgba(34,197,94,0.07)')
  _label(ctx, 735, 26, 'PUERTAS / EMBARQUE', '#4ade80')

  // Jetways de puertas
  for (let i = 0; i < 4; i++) {
    const gx = GATE_POS[i].x
    ctx.fillStyle = '#1a2e1a'
    ctx.fillRect(gx - 18, 14, 36, 55)
    ctx.strokeStyle = '#16a34a'
    ctx.lineWidth = 1
    ctx.strokeRect(gx - 18, 14, 36, 55)
    ctx.fillStyle = '#4ade80'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`G${i + 1}`, gx, 46)
  }

  // ── Apron ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#161f2e'
  ctx.strokeStyle = '#1f2937'
  ctx.lineWidth = 1
  ctx.fillRect(10, 302, 880, 42)
  ctx.strokeRect(10, 302, 880, 42)

  // Línea amarilla taxiway
  ctx.strokeStyle = '#eab308'
  ctx.lineWidth = 1.5
  ctx.setLineDash([14, 10])
  ctx.beginPath(); ctx.moveTo(12, 323); ctx.lineTo(888, 323); ctx.stroke()
  ctx.setLineDash([])

  ctx.fillStyle = '#6b7280'
  ctx.font = '10px monospace'
  ctx.textAlign = 'left'
  ctx.fillText('TAXIWAY', 16, 318)

  // ── Pista ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0d1520'
  ctx.strokeStyle = '#374151'
  ctx.lineWidth = 2
  ctx.fillRect(10, 350, 880, 100)
  ctx.strokeRect(10, 350, 880, 100)

  // Bordes blancos de pista
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 1.5
  ctx.strokeRect(18, 358, 864, 84)

  // Línea central discontinua
  ctx.strokeStyle = '#f3f4f6'
  ctx.lineWidth = 2
  ctx.setLineDash([28, 18])
  ctx.beginPath(); ctx.moveTo(18, 400); ctx.lineTo(882, 400); ctx.stroke()
  ctx.setLineDash([])

  // Marcas de umbral
  for (let xi = 0; xi < 4; xi++) {
    ctx.fillStyle = '#e5e7eb'
    ctx.fillRect(26 + xi * 10, 360, 6, 28)
    ctx.fillRect(26 + xi * 10, 412, 6, 28)
    ctx.fillRect(856 - xi * 10, 360, 6, 28)
    ctx.fillRect(856 - xi * 10, 412, 6, 28)
  }

  ctx.fillStyle = '#6b7280'
  ctx.font = '10px monospace'
  ctx.textAlign = 'left'
  ctx.fillText('PISTA', 16, 378)
}

function _fillZone(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: string,
): void {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

function _label(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, text: string, color: string,
): void {
  ctx.fillStyle = color
  ctx.font = '11px monospace'
  ctx.textAlign = 'center'
  ctx.globalAlpha = 0.7
  ctx.fillText(text, x, y)
  ctx.globalAlpha = 1
}
