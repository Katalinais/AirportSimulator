import { Passenger } from '../engine/passenger'
import { GATE_POS }  from './airportCanvas'

// ── Estado visual por pasajero ────────────────────────────────────────────────

interface VisData {
  x: number; y: number
  tx: number; ty: number
  walkPhase: number
}

const visuals = new Map<number, VisData>()
let lastFrameMs = 0

interface BoardingExit { x: number; y: number; isVip: boolean; startMs: number }
const boardingExit = new Map<number, BoardingExit>()

export function clearVisuals(): void {
  visuals.clear()
  boardingExit.clear()
  lastFrameMs = 0
}

// ── Colores por estado ────────────────────────────────────────────────────────

const STATE_COLOR: Record<string, string> = {
  arriving:     '#93c5fd',
  checkin_q:    '#fbbf24',
  checkin_s:    '#f97316',
  security_q:   '#f87171',
  security_s:   '#fb923c',
  waiting_gate: '#86efac',
  boarding_q:   '#22d3ee',
  boarding_s:   '#06b6d4',
}

// ── Posiciones de cola (coordenadas absolutas del canvas) ──────────────────────

// Check-in: una fila vertical por mostrador (centros x = 59, 131, 203)
function checkinQueuePos(idx: number, c1: number) {
  const lane  = idx % c1
  const depth = Math.floor(idx / c1)
  return { x: 59 + lane * 72, y: 230 - depth * 18 }
}
function checkinServerPos(slot: number) {
  return { x: 59 + (slot % 3) * 72, y: 242 }
}

// Seguridad: una fila vertical por escáner (centros x = 353, 461)
function securityQueuePos(idx: number, c2: number) {
  const lane  = idx % c2
  const depth = Math.floor(idx / c2)
  return { x: 353 + lane * 108, y: 230 - depth * 18 }
}
function securityServerPos(slot: number) {
  return { x: 353 + (slot % 2) * 108, y: 242 }
}

// Sala de espera: cuadrícula en la franja y=200-265 (debajo de la cola de embarque)
function waitingAreaPos(idx: number) {
  const col = idx % 8
  const row = Math.floor(idx / 8)
  return { x: 616 + col * 32, y: 200 + row * 20 }
}

// Embarque: fila vertical bajo cada puerta
// idx=0 = primero en cola (más cerca de la puerta); idx crece → más lejos de la puerta (y crece)
function boardingQueuePos(idx: number, gateId: number) {
  const gx = GATE_POS[Math.min(gateId, GATE_POS.length - 1)].x
  return { x: gx, y: 88 + idx * 14 }   // front en y=88; cola baja hacia sala de espera
}
function boardingServerPos(gateId: number) {
  const gx = GATE_POS[Math.min(gateId, GATE_POS.length - 1)].x
  return { x: gx, y: 76 }   // en la entrada del jetway
}

function getTarget(
  p: Passenger,
  idxInGroup: number,
  c1: number,
  c2: number,
): { x: number; y: number } | null {
  switch (p.state) {
    case 'arriving':
    case 'checkin_q':    return checkinQueuePos(idxInGroup, c1)
    case 'checkin_s':    return checkinServerPos(p.id % c1)
    case 'security_q':   return securityQueuePos(idxInGroup, c2)
    case 'security_s':   return securityServerPos(p.id % c2)
    case 'waiting_gate': return waitingAreaPos(idxInGroup)
    default:             return null
  }
}

// ── Figura de palito ──────────────────────────────────────────────────────────

function drawPerson(
  ctx:       CanvasRenderingContext2D,
  x:         number,
  y:         number,
  color:     string,
  walkPhase: number,
  moving:    boolean,
  isVip:     boolean,
): void {
  const legLen  = 6
  const bodyLen = 7
  const headR   = 3.5
  const armLen  = 5

  const hipsY = y - legLen
  const neckY = hipsY - bodyLen
  const headY = neckY - headR

  ctx.save()
  ctx.lineCap  = 'round'
  ctx.lineJoin = 'round'

  ctx.globalAlpha = 0.18
  ctx.fillStyle   = '#000'
  ctx.beginPath()
  ctx.ellipse(x, y + 1, 5, 2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, headY, headR, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = color
  ctx.lineWidth   = 1.8
  ctx.beginPath()
  ctx.moveTo(x, neckY)
  ctx.lineTo(x, hipsY)
  ctx.stroke()

  const armOsc = moving ? Math.sin(walkPhase * Math.PI * 2) * 2.5 : 0
  ctx.beginPath()
  ctx.moveTo(x - armLen, neckY + 2 + armOsc)
  ctx.lineTo(x + armLen, neckY + 2 - armOsc)
  ctx.stroke()

  if (moving) {
    const swing = Math.sin(walkPhase * Math.PI * 2) * 4.5
    ctx.beginPath()
    ctx.moveTo(x, hipsY); ctx.lineTo(x + swing, y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x, hipsY); ctx.lineTo(x - swing, y)
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.moveTo(x, hipsY); ctx.lineTo(x - 2, y)
    ctx.moveTo(x, hipsY); ctx.lineTo(x + 2, y)
    ctx.stroke()
  }

  if (isVip) {
    ctx.fillStyle = '#fde68a'
    ctx.font      = 'bold 8px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('★', x, headY - headR - 2)
  }

  ctx.restore()
}

// ── Helper: mover y dibujar un pasajero hacia su destino ─────────────────────

function moveAndDraw(
  p:      Passenger,
  target: { x: number; y: number },
  dt:     number,
  ctx:    CanvasRenderingContext2D,
  activeIds: Set<number>,
): void {
  activeIds.add(p.id)

  if (!visuals.has(p.id)) {
    // Los pasajeros "entran" desde el corredor (y=278) o desde el borde de su zona
    let startX = target.x
    let startY = target.y
    if (p.state === 'checkin_q' || p.state === 'arriving') {
      // Entran desde el lado izquierdo del check-in (puerta del aeropuerto)
      startX = 18; startY = 278
    } else if (p.state === 'security_q' || p.state === 'security_s') {
      // Entran al corredor desde check-in y suben a seguridad
      startX = target.x; startY = 278
    } else if (p.state === 'waiting_gate') {
      // Entran al corredor desde seguridad y van a la sala de espera
      startX = 582; startY = 278
    } else if (p.state === 'boarding_q' || p.state === 'boarding_s') {
      // Suben desde la sala de espera hacia la puerta
      startX = target.x; startY = 210
    }
    visuals.set(p.id, { x: startX, y: startY, tx: target.x, ty: target.y, walkPhase: 0 })
  }
  const vis = visuals.get(p.id)!
  vis.tx = target.x
  vis.ty = target.y

  const dx   = vis.tx - vis.x
  const dy   = vis.ty - vis.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const LERP = Math.min(1, 10 * dt)

  if (dist > 0.5) {
    vis.x += dx * LERP
    vis.y += dy * LERP
    vis.walkPhase = (vis.walkPhase + dt * 4) % 1
  }

  const moving = dist > 2
  const color  = STATE_COLOR[p.state] ?? '#94a3b8'
  drawPerson(ctx, vis.x, vis.y, color, vis.walkPhase, moving, p.type === 'vip')
}

// ── Render principal ──────────────────────────────────────────────────────────

export function drawPassengers(
  ctx:        CanvasRenderingContext2D,
  passengers: Passenger[],
  c1:         number,
  c2:         number,
): void {
  const now = performance.now()
  const dt  = Math.min((now - (lastFrameMs || now)) / 1000, 0.05)
  lastFrameMs = now

  const activeIds = new Set<number>()

  // ── Estados no-embarque ────────────────────────────────────────────────────
  const byState = new Map<string, Passenger[]>()
  for (const p of passengers) {
    if (['boarded', 'abandoned', 'boarding_q', 'boarding_s'].includes(p.state)) continue
    if (!byState.has(p.state)) byState.set(p.state, [])
    byState.get(p.state)!.push(p)
  }
  for (const g of byState.values()) g.sort((a, b) => a.id - b.id)

  for (const [, group] of byState) {
    group.forEach((p, idx) => {
      const target = getTarget(p, idx, c1, c2)
      if (!target) return
      moveAndDraw(p, target, dt, ctx, activeIds)
    })
  }

  // ── Embarque: agrupado por puerta ──────────────────────────────────────────
  const boardingByGate = new Map<number, { q: Passenger[]; s: Passenger[] }>()
  for (const p of passengers) {
    if (p.state !== 'boarding_q' && p.state !== 'boarding_s') continue
    const g = p.gateId >= 0 ? p.gateId : 0
    if (!boardingByGate.has(g)) boardingByGate.set(g, { q: [], s: [] })
    if (p.state === 'boarding_q') boardingByGate.get(g)!.q.push(p)
    else                          boardingByGate.get(g)!.s.push(p)
  }
  for (const [gateId, { q, s }] of boardingByGate) {
    q.sort((a, b) => a.id - b.id)
    q.forEach((p, idx) => moveAndDraw(p, boardingQueuePos(idx, gateId), dt, ctx, activeIds))
    s.forEach((p)       => moveAndDraw(p, boardingServerPos(gateId),    dt, ctx, activeIds))
  }

  // ── Animación de salida al abordar ─────────────────────────────────────────
  for (const p of passengers) {
    if (p.state === 'boarded' && visuals.has(p.id) && !boardingExit.has(p.id)) {
      const vis = visuals.get(p.id)!
      boardingExit.set(p.id, { x: vis.x, y: vis.y, isVip: p.type === 'vip', startMs: now })
    }
  }

  for (const id of visuals.keys()) {
    if (!activeIds.has(id)) visuals.delete(id)
  }

  const DURATION = 1.4
  for (const [id, exit] of boardingExit) {
    const age = (now - exit.startMs) / 1000
    if (age > DURATION) { boardingExit.delete(id); continue }
    const progress = age / DURATION
    ctx.save()
    ctx.globalAlpha = 1 - progress
    drawPerson(ctx, exit.x, exit.y - progress * 38, STATE_COLOR.boarding_s, 0.5 + progress, true, exit.isVip)
    ctx.restore()
  }
}

// ── Leyenda ───────────────────────────────────────────────────────────────────

export function drawLegend(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const items: [string, string][] = [
    [STATE_COLOR.checkin_q,  'Cola C-I'],
    [STATE_COLOR.security_q, 'Cola Seg.'],
    [STATE_COLOR.boarding_q, 'Embarcando'],
    [STATE_COLOR.waiting_gate, 'Esperando'],
  ]

  ctx.font      = '10px sans-serif'
  ctx.textAlign = 'left'
  items.forEach(([color, label], i) => {
    const lx = x + i * 115

    ctx.save()
    ctx.lineCap = 'round'
    ctx.fillStyle   = color
    ctx.strokeStyle = color
    ctx.lineWidth   = 1.5
    ctx.beginPath(); ctx.arc(lx, y - 7, 3, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.moveTo(lx, y - 4); ctx.lineTo(lx, y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(lx - 3, y - 2); ctx.lineTo(lx + 3, y - 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx - 2, y + 4); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx + 2, y + 4); ctx.stroke()
    ctx.restore()

    ctx.fillStyle = '#9ca3af'
    ctx.fillText(label, lx + 7, y + 1)
  })
}
