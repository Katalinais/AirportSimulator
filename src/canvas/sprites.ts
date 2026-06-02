// Dibujo pixel-art (canvas 2D). Conversión de sprites.js a ES module.

import type { RenderPassenger, RenderPlane } from './types'

type Ctx = CanvasRenderingContext2D

export function px(ctx: Ctx, x: number, y: number, w: number, h: number, c: string): void {
  ctx.fillStyle = c
  ctx.fillRect(x | 0, y | 0, w, h)
}

// Persona vista ligeramente frontal sobre el plano. Anclada por su "centro".
export function person(ctx: Ctx, p: RenderPassenger, s = 1): void {
  ctx.save()
  ctx.translate(Math.round(p.x), Math.round(p.y))
  if (s !== 1) ctx.scale(s, s)
  const sh = p.shirt, sk = p.skin, hr = p.hair
  const ph = p.moving ? (Math.floor(p.walk) % 2) : 2 // 0/1 pasos, 2 quieto

  px(ctx, -4, 6, 9, 2, 'rgba(0,0,0,0.20)')
  if (ph === 0)      { px(ctx, -3, 2, 2, 5, '#3a3a44'); px(ctx, 1, 2, 2, 4, '#3a3a44') }
  else if (ph === 1) { px(ctx, -3, 2, 2, 4, '#3a3a44'); px(ctx, 1, 2, 2, 5, '#3a3a44') }
  else               { px(ctx, -3, 2, 2, 5, '#3a3a44'); px(ctx, 1, 2, 2, 5, '#3a3a44') }

  px(ctx, -3, -3, 7, 6, sh)
  px(ctx, -4, -2, 1, 4, sh); px(ctx, 4, -2, 1, 4, sh)
  px(ctx, -2, -8, 5, 5, sk)
  px(ctx, -2, -9, 5, 2, hr); px(ctx, -3, -8, 1, 2, hr); px(ctx, 3, -8, 1, 2, hr)
  if (p.bag) { px(ctx, 5, -1, 3, 6, '#2a2a30'); px(ctx, 6, -2, 1, 1, '#777') }
  ctx.restore()
}

// Mostrador / escritorio (check-in, embarque)
export function desk(ctx: Ctx, x: number, y: number, c1: string, c2: string): void {
  px(ctx, x - 9, y - 8, 26, 17, c2)
  px(ctx, x - 9, y - 8, 26,  4, c1)
  px(ctx, x - 7, y - 3,  6,  4, '#dfe7ef')
  px(ctx, x + 4, y - 3,  9,  5, '#cfd8e2')
}

// Escáner de seguridad (arco)
export function scanner(ctx: Ctx, x: number, y: number, accent: string): void {
  px(ctx, x - 10, y - 12, 24, 24, '#cfd6de')
  px(ctx, x -  6, y -  8, 16, 16, '#2b3440')
  px(ctx, x -  6, y -  8, 16,  2, accent)
  px(ctx, x -  6, y +  6, 16,  2, accent)
}

// Avión (vista cenital, morro a la derecha).
// pl.angle rota el sprite alrededor del centro del fuselaje.
export function plane(ctx: Ctx, pl: RenderPlane, accent: string): void {
  const left  = Math.round(pl.x)
  const cy    = Math.round(pl.y)
  const bodyL = left
  const bodyR = left + 66

  ctx.save()
  if (Math.abs(pl.angle) > 0.005) {
    // Centro de rotación: mitad del fuselaje
    const cx = left + 39
    ctx.translate(cx, cy)
    ctx.rotate(pl.angle)
    ctx.translate(-cx, -cy)
  }

  ctx.fillStyle = '#c9ced6'
  ctx.beginPath()
  ctx.moveTo(left + 26, cy - 7); ctx.lineTo(left + 50, cy - 36); ctx.lineTo(left + 40, cy - 7)
  ctx.closePath(); ctx.fill()
  ctx.beginPath()
  ctx.moveTo(left + 26, cy + 7); ctx.lineTo(left + 50, cy + 36); ctx.lineTo(left + 40, cy + 7)
  ctx.closePath(); ctx.fill()

  px(ctx, left + 40, cy - 26, 5, 9, '#9aa0aa')
  px(ctx, left + 40, cy + 17, 5, 9, '#9aa0aa')

  ctx.fillStyle = '#dfe3e9'
  ctx.beginPath()
  ctx.moveTo(left + 2, cy - 5); ctx.lineTo(left - 12, cy - 18); ctx.lineTo(left + 6, cy - 5)
  ctx.closePath(); ctx.fill()
  ctx.beginPath()
  ctx.moveTo(left + 2, cy + 5); ctx.lineTo(left - 12, cy + 18); ctx.lineTo(left + 6, cy + 5)
  ctx.closePath(); ctx.fill()

  px(ctx, bodyL, cy - 9, bodyR - bodyL, 18, '#eef1f5')
  px(ctx, bodyL, cy - 9, bodyR - bodyL,  3, '#ffffff')
  px(ctx, bodyL, cy + 6, bodyR - bodyL,  3, '#cdd3db')
  px(ctx, bodyL, cy - 1, bodyR - bodyL,  3, accent)

  ctx.fillStyle = '#eef1f5'
  ctx.beginPath()
  ctx.moveTo(bodyR, cy - 9); ctx.lineTo(bodyR + 12, cy); ctx.lineTo(bodyR, cy + 9)
  ctx.closePath(); ctx.fill()

  px(ctx, bodyR + 6, cy - 2, 4, 4, '#9fd0ff')
  for (let i = 0; i < 9; i++) px(ctx, bodyL + 12 + i * 5, cy - 6, 2, 2, '#9fd0ff')
  px(ctx, bodyL + 3, cy - 6,  4, 12, '#2b3440')
  px(ctx, bodyL + 3, cy - 1,  4,  2, accent)

  ctx.restore()
}

// Poste de valla (insinúa las filas)
export function post(ctx: Ctx, x: number, y: number): void {
  px(ctx, x - 1, y - 5, 2, 8, '#6b7280')
  px(ctx, x - 2, y - 6, 4, 2, '#9aa3af')
}
