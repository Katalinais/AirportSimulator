import * as PIXI from 'pixi.js'
import { Passenger } from '../engine/passenger'
import {
  GATE_POS,
  CORRIDOR_Y,
  checkinLaneX, securityLaneX,
} from './pixiApp'

interface VisData {
  x: number; y: number
  tx: number; ty: number
  walkPhase: number
}

const visuals = new Map<number, VisData>()
let lastFrameMs = 0

interface BoardingExit { x: number; y: number; isVip: boolean; startMs: number; id: number }
const boardingExit = new Map<number, BoardingExit>()

export function clearPassengerVisuals(): void {
  visuals.clear()
  boardingExit.clear()
  lastFrameMs = 0
}

// ── Colores de camiseta por estado ────────────────────────────────────────────
const SHIRT_COLOR: Record<string, number> = {
  arriving:     0x93c5fd,
  checkin_q:    0xfbbf24,
  checkin_s:    0xf97316,
  security_q:   0xf87171,
  security_s:   0xfb923c,
  waiting_gate: 0x86efac,
  boarding_q:   0x22d3ee,
  boarding_s:   0x06b6d4,
}

// ── Paleta para diversidad ────────────────────────────────────────────────────
const SKINS = [0xfcd5a0, 0xf0b87a, 0xd4956a, 0xb07040, 0x8d5524, 0xfde0b8]
const HAIRS = [0x1a1005, 0x3d2b1f, 0x6b4226, 0xd4a017, 0x4a4a4a, 0x1a1a2e]
const PANTS = [0x1e293b, 0x374151, 0x1e3a5f, 0x2d1b69, 0x1a2e1a, 0x3b1a1a]

// ── Posiciones ────────────────────────────────────────────────────────────────
const TERMINAL_BOTTOM = 452
const COUNTER_Y = TERMINAL_BOTTOM - 10  // y de los mostradores (pies del pasajero)

function checkinQueuePos(idx: number, c1: number) {
  const lane  = idx % c1
  const depth = Math.floor(idx / c1)
  return { x: checkinLaneX(lane, c1), y: COUNTER_Y - 36 - depth * 26 }
}
function checkinServerPos(slot: number, c1: number) {
  return { x: checkinLaneX(slot % c1, c1), y: COUNTER_Y }
}
function securityQueuePos(idx: number, c2: number) {
  const lane  = idx % c2
  const depth = Math.floor(idx / c2)
  return { x: securityLaneX(lane, c2), y: COUNTER_Y - 36 - depth * 26 }
}
function securityServerPos(slot: number, c2: number) {
  return { x: securityLaneX(slot % c2, c2), y: COUNTER_Y }
}
function waitingAreaPos(idx: number) {
  const cols = 10
  const col  = idx % cols
  const row  = Math.min(Math.floor(idx / cols), 5)   // cap at 6 rows
  return { x: 1095 + col * 65, y: 309 + row * 26 }
}
function boardingQueuePos(idx: number, gateId: number) {
  const gx = GATE_POS[Math.min(gateId, GATE_POS.length - 1)].x
  return { x: gx, y: 157 + idx * 22 }
}
function boardingServerPos(gateId: number) {
  const gx = GATE_POS[Math.min(gateId, GATE_POS.length - 1)].x
  return { x: gx, y: 151 }
}

function getTarget(
  p: Passenger, idxInGroup: number, c1: number, c2: number,
): { x: number; y: number } | null {
  switch (p.state) {
    case 'arriving':
    case 'checkin_q':    return checkinQueuePos(idxInGroup, c1)
    case 'checkin_s':    return checkinServerPos(p.id % c1, c1)
    case 'security_q':   return securityQueuePos(idxInGroup, c2)
    case 'security_s':   return securityServerPos(p.id % c2, c2)
    case 'waiting_gate': return waitingAreaPos(idxInGroup)
    default:             return null
  }
}

// ── Figura humana ─────────────────────────────────────────────────────────────

function drawPerson(
  g:         PIXI.Graphics,
  x:         number,
  y:         number,         // y = nivel del suelo (pies)
  shirt:     number,
  walkPhase: number,
  moving:    boolean,
  isVip:     boolean,
  personId:  number,
  alpha = 1,
): void {
  const skin  = SKINS[personId % SKINS.length]
  const hair  = HAIRS[(personId + 1) % HAIRS.length]
  const pants = PANTS[(personId + 2) % PANTS.length]

  const headR = 5
  const bodyH = 11
  const bodyW = 6
  const legH  = 10
  const legW  = 3
  const armH  = 8
  const armW  = 3

  const feetY  = y
  const hipsY  = feetY - legH
  const neckY  = hipsY - bodyH
  const headCY = neckY - headR - 1

  // Sombra
  g.lineStyle(0); g.beginFill(0x000000, 0.14 * alpha)
  g.drawEllipse(x, feetY + 2, 10, 3); g.endFill()

  // Piernas
  const legSwing = moving ? Math.sin(walkPhase * Math.PI * 2) * 4 : 0
  g.beginFill(pants, alpha); g.lineStyle(0)
  g.drawRoundedRect(x - legW - 1 + legSwing, hipsY, legW, legH, 1.5); g.endFill()
  g.beginFill(pants, alpha)
  g.drawRoundedRect(x + 1 - legSwing, hipsY, legW, legH, 1.5); g.endFill()

  // Zapatos
  g.beginFill(0x111827, alpha); g.lineStyle(0)
  g.drawEllipse(x - legW + legSwing * 0.4, feetY, legW + 1.5, 2)
  g.drawEllipse(x + legW - legSwing * 0.4, feetY, legW + 1.5, 2); g.endFill()

  // Brazos
  const armSwing = moving ? -legSwing * 0.75 : 0
  g.beginFill(shirt, alpha * 0.85); g.lineStyle(0)
  g.drawRoundedRect(x - bodyW - armW + 0.5 + armSwing, neckY + 2, armW, armH, 1.5); g.endFill()
  g.beginFill(shirt, alpha * 0.85)
  g.drawRoundedRect(x + bodyW - 0.5 - armSwing, neckY + 2, armW, armH, 1.5); g.endFill()

  // Cuerpo/camisa
  g.beginFill(shirt, alpha); g.lineStyle(0)
  g.drawRoundedRect(x - bodyW, neckY, bodyW * 2, bodyH, 3); g.endFill()

  // Cuello
  g.beginFill(skin, alpha); g.lineStyle(0)
  g.drawRoundedRect(x - 2, neckY - 2, 4, 5, 1); g.endFill()

  // Cabeza
  g.beginFill(skin, alpha)
  g.drawCircle(x, headCY, headR); g.endFill()

  // Cabello
  g.beginFill(hair, alpha)
  g.drawEllipse(x, headCY - headR * 0.5, headR * 1.05, headR * 0.72); g.endFill()

  // Ojos
  g.beginFill(0x0d0d0d, alpha)
  g.drawCircle(x - 1.8, headCY - 0.5, 1.0)
  g.drawCircle(x + 1.8, headCY - 0.5, 1.0); g.endFill()
  // brillo ojos
  g.beginFill(0xffffff, alpha * 0.55)
  g.drawCircle(x - 1.2, headCY - 1.1, 0.45)
  g.drawCircle(x + 2.4, headCY - 1.1, 0.45); g.endFill()

  // Maleta (pasajeros en check-in)
  if (shirt === SHIRT_COLOR.checkin_q || shirt === SHIRT_COLOR.arriving || shirt === SHIRT_COLOR.checkin_s) {
    g.lineStyle(0.8, 0x6b7280, alpha * 0.7)
    g.beginFill(0x4b5563, alpha * 0.9)
    g.drawRoundedRect(x + bodyW + armW + 1, neckY + 3, 6, 8, 1); g.endFill()
    g.lineStyle(0.7, 0x9ca3af, alpha * 0.6)
    g.moveTo(x + bodyW + armW + 2.5, neckY + 3)
    g.lineTo(x + bodyW + armW + 5.5, neckY + 3); g.lineStyle(0)
  }

  // Corona VIP
  if (isVip) {
    const cy2 = headCY - headR - 7
    g.lineStyle(0); g.beginFill(0xfbbf24, alpha)
    g.drawRect(x - 5, cy2 + 4, 10, 3)
    g.drawPolygon([x - 5, cy2 + 4, x - 3.5, cy2, x - 1.5, cy2 + 4])
    g.drawPolygon([x,    cy2 + 4, x,     cy2 - 1, x + 2, cy2 + 4])
    g.drawPolygon([x + 5, cy2 + 4, x + 3.5, cy2, x + 1.5, cy2 + 4]); g.endFill()
    g.beginFill(0xef4444, alpha); g.drawCircle(x, cy2 + 0.5, 1.3); g.endFill()
  }
}

// ── Mover y dibujar ────────────────────────────────────────────────────────────

function moveAndDraw(
  p:         Passenger,
  target:    { x: number; y: number },
  dt:        number,
  g:         PIXI.Graphics,
  activeIds: Set<number>,
): void {
  activeIds.add(p.id)

  if (!visuals.has(p.id)) {
    let startX = target.x, startY = target.y
    if (p.state === 'checkin_q' || p.state === 'arriving') {
      startX = 18; startY = CORRIDOR_Y + 8
    } else if (p.state === 'security_q' || p.state === 'security_s') {
      startX = target.x; startY = CORRIDOR_Y + 8
    } else if (p.state === 'waiting_gate') {
      startX = 1070; startY = CORRIDOR_Y + 8
    } else if (p.state === 'boarding_q' || p.state === 'boarding_s') {
      startX = target.x; startY = 260
    }
    visuals.set(p.id, { x: startX, y: startY, tx: target.x, ty: target.y, walkPhase: 0 })
  }

  const vis = visuals.get(p.id)!
  vis.tx = target.x; vis.ty = target.y

  const dx   = vis.tx - vis.x
  const dy   = vis.ty - vis.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const LERP = Math.min(1, 10 * dt)

  if (dist > 0.5) {
    vis.x += dx * LERP; vis.y += dy * LERP
    vis.walkPhase = (vis.walkPhase + dt * 4) % 1
  }

  const moving = dist > 2
  const shirt  = SHIRT_COLOR[p.state] ?? 0x94a3b8
  drawPerson(g, vis.x, vis.y, shirt, vis.walkPhase, moving, p.type === 'vip', p.id)
}

// ── Render principal ──────────────────────────────────────────────────────────

export function drawPassengers(
  g:          PIXI.Graphics,
  passengers: Passenger[],
  c1:         number,
  c2:         number,
): void {
  const now = performance.now()
  const dt  = Math.min((now - (lastFrameMs || now)) / 1000, 0.05)
  lastFrameMs = now

  g.clear()
  const activeIds = new Set<number>()

  // Estados no-embarque
  const byState = new Map<string, Passenger[]>()
  for (const p of passengers) {
    if (['boarded', 'abandoned', 'boarding_q', 'boarding_s'].includes(p.state)) continue
    if (!byState.has(p.state)) byState.set(p.state, [])
    byState.get(p.state)!.push(p)
  }
  for (const grp of byState.values()) grp.sort((a, b) => a.id - b.id)
  for (const [, group] of byState) {
    group.forEach((p, idx) => {
      const target = getTarget(p, idx, c1, c2)
      if (!target) return
      moveAndDraw(p, target, dt, g, activeIds)
    })
  }

  // Embarque por puerta
  const boardingByGate = new Map<number, { q: Passenger[]; s: Passenger[] }>()
  for (const p of passengers) {
    if (p.state !== 'boarding_q' && p.state !== 'boarding_s') continue
    const gi = p.gateId >= 0 ? p.gateId : 0
    if (!boardingByGate.has(gi)) boardingByGate.set(gi, { q: [], s: [] })
    if (p.state === 'boarding_q') boardingByGate.get(gi)!.q.push(p)
    else                          boardingByGate.get(gi)!.s.push(p)
  }
  for (const [gateId, { q, s }] of boardingByGate) {
    q.sort((a, b) => a.id - b.id)
    q.forEach((p, idx) => moveAndDraw(p, boardingQueuePos(idx, gateId), dt, g, activeIds))
    s.forEach((p)       => moveAndDraw(p, boardingServerPos(gateId),    dt, g, activeIds))
  }

  // Animación de salida al abordar
  for (const p of passengers) {
    if (p.state === 'boarded' && visuals.has(p.id) && !boardingExit.has(p.id)) {
      const vis = visuals.get(p.id)!
      boardingExit.set(p.id, { x: vis.x, y: vis.y, isVip: p.type === 'vip', startMs: now, id: p.id })
    }
  }
  for (const id of visuals.keys()) {
    if (!activeIds.has(id)) visuals.delete(id)
  }

  const DURATION = 1.6
  for (const [id, exit] of boardingExit) {
    const age = (now - exit.startMs) / 1000
    if (age > DURATION) { boardingExit.delete(id); continue }
    const progress = age / DURATION
    drawPerson(g, exit.x, exit.y - progress * 48,
      SHIRT_COLOR.boarding_s, 0.5 + progress, true,
      exit.isVip, exit.id, 1 - progress)
  }
}
