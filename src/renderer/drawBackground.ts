import * as PIXI from 'pixi.js'
import {
  CANVAS_W, CANVAS_H,
  CHECKIN_X, CHECKIN_W,
  SECURITY_X, SECURITY_W,
  GATES_X, GATES_W,
  CHECKIN_QX0, CHECKIN_QW,
  SECURITY_QX0, SECURITY_QW,
  CORRIDOR_Y, CORRIDOR_H,
  APRON_Y, TAXIWAY_Y, RUNWAY_Y,
  TERMINAL_BOTTOM,
  GATE_POS,
  checkinLaneX, securityLaneX,
} from './pixiApp'

// ── Helpers ───────────────────────────────────────────────────────────────────

function lbl(
  cont: PIXI.Container, text: string,
  x: number, y: number, color: number,
  fontSize = 11, fontFamily = 'monospace', alpha = 0.85,
  anchorX = 0.5,
): void {
  const t = new PIXI.Text(text, new PIXI.TextStyle({ fontFamily, fontSize, fill: color }))
  t.anchor.set(anchorX, 0); t.x = x; t.y = y; t.alpha = alpha
  cont.addChild(t)
}

// ── Tiles del suelo ───────────────────────────────────────────────────────────

function floorTiles(g: PIXI.Graphics, x: number, y: number, w: number, h: number, color: number): void {
  const step = 30
  g.lineStyle(0.4, color, 0.18)
  for (let gx = x; gx <= x + w; gx += step) { g.moveTo(gx, y); g.lineTo(gx, y + h) }
  for (let gy = y; gy <= y + h; gy += step) { g.moveTo(x, gy); g.lineTo(x + w, gy) }
}

// ── Carril de fila con mampara y cordón ───────────────────────────────────────

function drawQueueLanes(
  g:    PIXI.Graphics,
  cont: PIXI.Container,
  x0:  number, qw: number,           // inicio y ancho total del área de colas
  c:   number,                        // número de carriles
  yTop: number, yBot: number,         // rango vertical de las colas
  laneColor: number,
): void {
  const laneW = qw / c

  // Fondo con tinte por carril (alternado)
  for (let i = 0; i < c; i++) {
    g.beginFill(laneColor, i % 2 === 0 ? 0.06 : 0.03)
    g.lineStyle(0)
    g.drawRect(x0 + i * laneW, yTop, laneW, yBot - yTop)
    g.endFill()
  }

  // Separadores verticales y postes
  const poleInterval = 55
  for (let i = 0; i <= c; i++) {
    const lx = x0 + i * laneW

    // Línea divisoria
    g.lineStyle(0.6, 0x6b7280, 0.35)
    g.moveTo(lx, yTop); g.lineTo(lx, yBot)

    // Postes de acero cada ~55px
    for (let py = yTop + 10; py <= yBot - 10; py += poleInterval) {
      g.beginFill(0xd4d4d8)
      g.lineStyle(0.5, 0xa1a1aa, 0.7)
      g.drawCircle(lx, py, 3.5)
      g.endFill()
      // Base del poste
      g.beginFill(0x71717a, 0.8)
      g.lineStyle(0)
      g.drawRect(lx - 2, py + 3, 4, 3)
      g.endFill()
    }
  }

  // Cordones horizontales entre postes (de lado a lado en cada fila)
  for (let py = yTop + 10; py <= yBot - 10; py += poleInterval) {
    for (let i = 0; i < c; i++) {
      const lx1 = x0 + i * laneW
      const lx2 = x0 + (i + 1) * laneW
      const mid  = (lx1 + lx2) / 2
      // cordón con curva catenaria
      g.lineStyle(1.2, 0xfbbf24, 0.55)
      g.moveTo(lx1, py)
      g.bezierCurveTo(mid - 5, py + 5, mid + 5, py + 5, lx2, py)
    }
  }

  // Flechas de flujo en el centro de cada carril
  for (let i = 0; i < c; i++) {
    const cx = x0 + (i + 0.5) * laneW
    for (let ay = yTop + 30; ay < yBot - 30; ay += 55) {
      g.lineStyle(0)
      g.beginFill(0x60a5fa, 0.2)
      g.drawPolygon([cx - 6, ay, cx + 6, ay, cx, ay + 10])
      g.endFill()
    }
  }

  // Etiquetas de carril en la entrada (top)
  for (let i = 0; i < c; i++) {
    const cx = x0 + (i + 0.5) * laneW
    lbl(cont, `Carril ${i + 1}`, cx, yTop - 14, 0x94a3b8, 8, 'monospace', 0.6)
  }

  // Señal de inicio de fila
  lbl(cont, '▼  INICIO DE FILA', x0 + qw / 2, yTop - 28, 0x60a5fa, 9, 'sans-serif', 0.75)
}

// ── Monitor/pantalla ──────────────────────────────────────────────────────────

function drawMonitor(g: PIXI.Graphics, x: number, y: number): void {
  g.beginFill(0x0ea5e9); g.lineStyle(0.5, 0x38bdf8, 0.9)
  g.drawRoundedRect(x - 12, y - 16, 24, 14, 2); g.endFill()
  g.beginFill(0x7dd3fc, 0.3); g.lineStyle(0)
  g.drawRect(x - 10, y - 14, 7, 4); g.endFill()
  g.lineStyle(0.6, 0xbae6fd, 0.45)
  g.moveTo(x - 9, y - 8); g.lineTo(x + 7, y - 8)
  g.moveTo(x - 9, y - 5); g.lineTo(x + 3, y - 5)
  g.beginFill(0x374151); g.lineStyle(0)
  g.drawRect(x - 2, y - 2, 4, 3); g.endFill()
}

// ── Mostrador check-in ────────────────────────────────────────────────────────

function drawCheckinCounter(g: PIXI.Graphics, cont: PIXI.Container, cx: number, num: number): void {
  const w = 80, h = 28
  // mesa
  g.beginFill(0x1e3a5f); g.lineStyle(1.5, 0x2563eb)
  g.drawRoundedRect(cx - w / 2, TERMINAL_BOTTOM - 28, w, h, 3); g.endFill()
  // superficie
  g.beginFill(0x1d4ed8, 0.25); g.lineStyle(0)
  g.drawRect(cx - w / 2 + 3, TERMINAL_BOTTOM - 27, w - 6, 10); g.endFill()
  // monitor
  drawMonitor(g, cx - 14, TERMINAL_BOTTOM - 12)
  // teclado
  g.beginFill(0x374151, 0.8); g.lineStyle(0.5, 0x4b5563)
  g.drawRoundedRect(cx + 2, TERMINAL_BOTTOM - 15, 26, 10, 1.5); g.endFill()
  // líneas de teclado
  g.lineStyle(0.5, 0x6b7280, 0.5)
  for (let kx = cx + 6; kx < cx + 28; kx += 5) {
    g.moveTo(kx, TERMINAL_BOTTOM - 14); g.lineTo(kx, TERMINAL_BOTTOM - 7)
  }
  // número de mostrador
  lbl(cont, `C-IN ${num}`, cx, TERMINAL_BOTTOM - 46, 0x93c5fd, 9, 'monospace', 0.8)
}

// ── Escáner de seguridad ──────────────────────────────────────────────────────

function drawScanner(g: PIXI.Graphics, cont: PIXI.Container, cx: number, num: number): void {
  const archW = 60, archH = 44
  const bx = cx - archW / 2
  // columnas del arco
  g.beginFill(0x3b1a1a); g.lineStyle(1.5, 0xdc2626, 0.95)
  g.drawRoundedRect(bx, TERMINAL_BOTTOM - archH - 28, 10, archH, 2)
  g.drawRoundedRect(bx + archW - 10, TERMINAL_BOTTOM - archH - 28, 10, archH, 2)
  g.endFill()
  // arco superior
  g.lineStyle(2.5, 0xdc2626, 0.9)
  g.arc(cx, TERMINAL_BOTTOM - archH - 28, archW / 2 - 2, Math.PI, 0)
  // cinta transportadora
  g.beginFill(0x4b1c1c); g.lineStyle(1, 0xdc2626, 0.35)
  g.drawRoundedRect(bx - 5, TERMINAL_BOTTOM - 28, archW + 10, 28, 2); g.endFill()
  // rodillos
  g.lineStyle(0.7, 0x7f1d1d, 0.55)
  for (let rx = bx + 5; rx < bx + archW + 5; rx += 10) {
    g.moveTo(rx, TERMINAL_BOTTOM - 27); g.lineTo(rx, TERMINAL_BOTTOM - 1)
  }
  // indicador LED
  g.beginFill(0x22c55e, 0.9); g.lineStyle(0)
  g.drawCircle(bx + 5, TERMINAL_BOTTOM - archH - 24, 3); g.endFill()
  // etiquetas
  lbl(cont, 'X-RAY', cx, TERMINAL_BOTTOM - archH - 40, 0xfca5a5, 9, 'monospace', 0.65)
  lbl(cont, `SCANNER ${num}`, cx, TERMINAL_BOTTOM - archH - 52, 0xf87171, 8, 'monospace', 0.5)
}

// ── Puerta de embarque ────────────────────────────────────────────────────────
// El jetway cuelga desde la parte superior del terminal (GATE_TOP_Y) hasta
// donde el avión conecta (GATE_BOT_Y = GATE_POS.y).
const GATE_TOP_Y = APRON_Y + 18   // 66 — inicio del terminal en la zona de puertas
const GATE_BOT_Y = 118            // coincide con GATE_POS.y

function drawGate(g: PIXI.Graphics, cont: PIXI.Container, gx: number, label: string): void {
  const w = 48, h = GATE_BOT_Y - GATE_TOP_Y   // 52 px
  // cuerpo del jetway
  g.beginFill(0x14532d); g.lineStyle(1.5, 0x16a34a)
  g.drawRoundedRect(gx - w / 2, GATE_TOP_Y, w, h, 4); g.endFill()
  // ventana del jetway
  g.beginFill(0x0f1a1f); g.lineStyle(0.8, 0x4ade80, 0.5)
  g.drawRoundedRect(gx - 14, GATE_TOP_Y + 7, 28, 16, 3); g.endFill()
  g.beginFill(0x4ade80, 0.12); g.lineStyle(0)
  g.drawRect(gx - 12, GATE_TOP_Y + 9, 10, 6); g.endFill()
  // manga de conexión (toca el avión)
  g.lineStyle(1, 0x16a34a, 0.6)
  g.moveTo(gx, GATE_BOT_Y); g.lineTo(gx, GATE_BOT_Y + 4)
  // LED indicador
  g.beginFill(0x22c55e, 0.9); g.lineStyle(0)
  g.drawCircle(gx + w / 2 - 5, GATE_TOP_Y + 4, 3); g.endFill()
  // número de puerta
  const t = new PIXI.Text(label, new PIXI.TextStyle({ fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold', fill: 0x4ade80 }))
  t.anchor.set(0.5, 0.5); t.x = gx; t.y = GATE_TOP_Y + h / 2; cont.addChild(t)
  // etiqueta de vuelo simulada
  lbl(cont, 'FL 00', gx, GATE_BOT_Y + 6, 0x86efac, 8, 'monospace', 0.5)
}

// ── Tablero de salidas ────────────────────────────────────────────────────────

function drawDepartureBoard(g: PIXI.Graphics, cont: PIXI.Container, cx: number, y: number, w: number): void {
  g.beginFill(0x030712); g.lineStyle(1, 0x22d3ee, 0.6)
  g.drawRoundedRect(cx - w / 2, y, w, 24, 4); g.endFill()
  // slots LED
  const slots = 5
  const slotW = (w - 20) / slots
  for (let i = 0; i < slots; i++) {
    const col = [0x22c55e, 0xf97316, 0x22c55e, 0xeab308, 0x22c55e][i]
    g.beginFill(col, 0.7); g.lineStyle(0)
    g.drawRoundedRect(cx - w / 2 + 8 + i * slotW, y + 6, slotW - 5, 12, 2)
    g.endFill()
  }
  lbl(cont, 'DEPARTURES', cx - w / 2 + 6, y + 7, 0x22d3ee, 7, 'monospace', 0.75, 0)
}

// ── Sillas de sala de espera ──────────────────────────────────────────────────

function drawChairs(g: PIXI.Graphics, x: number, y: number, cols: number, rows: number, gapX: number, gapY: number): void {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = x + c * gapX
      const cy = y + r * gapY
      // respaldo
      g.beginFill(0x1e3a5f); g.lineStyle(0.5, 0x2563eb, 0.55)
      g.drawRoundedRect(cx, cy - 6, 16, 5, 1.5); g.endFill()
      // asiento
      g.beginFill(0x1e3a5f); g.lineStyle(0.5, 0x2563eb, 0.55)
      g.drawRoundedRect(cx, cy, 16, 9, 1.5); g.endFill()
      // patas
      g.lineStyle(0.7, 0x374151)
      g.moveTo(cx + 2, cy + 9); g.lineTo(cx + 2, cy + 14)
      g.moveTo(cx + 14, cy + 9); g.lineTo(cx + 14, cy + 14)
    }
  }
}

// ── Carril de cola de embarque ────────────────────────────────────────────────

function drawBoardingLane(g: PIXI.Graphics, gx: number, yTop: number, yBot: number): void {
  const hw = 18  // half-width of the lane
  // fondo del carril
  g.beginFill(0x14532d, 0.1); g.lineStyle(0)
  g.drawRect(gx - hw, yTop, hw * 2, yBot - yTop); g.endFill()
  // líneas laterales del carril
  g.lineStyle(0.7, 0x22c55e, 0.3)
  g.moveTo(gx - hw, yTop); g.lineTo(gx - hw, yBot)
  g.moveTo(gx + hw, yTop); g.lineTo(gx + hw, yBot)
  // flechas apuntando hacia la puerta (hacia arriba)
  for (let ay = yBot - 20; ay > yTop + 10; ay -= 45) {
    g.lineStyle(0)
    g.beginFill(0x4ade80, 0.2)
    g.drawPolygon([gx - 5, ay, gx + 5, ay, gx, ay - 10])
    g.endFill()
  }
}

// ── Render principal ──────────────────────────────────────────────────────────

// Terminal ocupa desde el borde inferior de la plataforma hasta el corredor
const TERM_TOP = APRON_Y + 18     // 66 — inicio visible del terminal
const TERM_BOT = CORRIDOR_Y       // 452

export function drawBackground(
  gfx:   PIXI.Graphics,
  cont:  PIXI.Container,
  gates: number,
  c1:    number,
  c2:    number,
): void {
  gfx.clear()
  cont.removeChildren()
  const g = gfx

  // ── Fondo base ─────────────────────────────────────────────────────────────
  g.beginFill(0x0f172a); g.lineStyle(0)
  g.drawRect(0, 0, CANVAS_W, CANVAS_H); g.endFill()

  // ── PISTA (top) ───────────────────────────────────────────────────────────
  const RUNWAY_H = TAXIWAY_Y - RUNWAY_Y   // 30 px
  const midRwy   = RUNWAY_Y + RUNWAY_H / 2

  g.beginFill(0x0d1520); g.lineStyle(2, 0x374151)
  g.drawRect(0, RUNWAY_Y, CANVAS_W, RUNWAY_H); g.endFill()
  g.lineStyle(1.5, 0xe5e7eb, 0.6)
  g.drawRect(4, RUNWAY_Y + 2, CANVAS_W - 8, RUNWAY_H - 4)
  // línea central discontinua
  g.lineStyle(2, 0xf3f4f6, 0.5)
  let rx = 10
  while (rx < CANVAS_W - 10) {
    g.moveTo(rx, midRwy); g.lineTo(Math.min(rx + 28, CANVAS_W - 10), midRwy)
    rx += 44
  }
  // marcas umbral
  g.lineStyle(0); g.beginFill(0xe5e7eb, 0.7)
  for (let xi = 0; xi < 3; xi++) {
    g.drawRect(20 + xi * 11, RUNWAY_Y + 3, 7, 10)
    g.drawRect(CANVAS_W - 27 - xi * 11, RUNWAY_Y + 3, 7, 10)
  }
  g.endFill()
  lbl(cont, 'PISTA / RUNWAY', 20, RUNWAY_Y + 2, 0x6b7280, 8, 'monospace', 0.65, 0)
  const rwy1 = new PIXI.Text('28L', new PIXI.TextStyle({ fontFamily: 'monospace', fontSize: 10, fill: 0xe5e7eb }))
  rwy1.anchor.set(0.5, 0.5); rwy1.x = 52; rwy1.y = midRwy; rwy1.alpha = 0.4; rwy1.rotation = -Math.PI / 2; cont.addChild(rwy1)
  const rwy2 = new PIXI.Text('10R', new PIXI.TextStyle({ fontFamily: 'monospace', fontSize: 10, fill: 0xe5e7eb }))
  rwy2.anchor.set(0.5, 0.5); rwy2.x = CANVAS_W - 52; rwy2.y = midRwy; rwy2.alpha = 0.4; rwy2.rotation = Math.PI / 2; cont.addChild(rwy2)

  // ── TAXIWAY ───────────────────────────────────────────────────────────────
  g.beginFill(0x161f2e); g.lineStyle(1, 0x1f2937)
  g.drawRect(0, TAXIWAY_Y, CANVAS_W, APRON_Y - TAXIWAY_Y); g.endFill()
  g.lineStyle(1.5, 0xeab308, 0.7)
  let tx = 12
  while (tx < CANVAS_W - 12) {
    g.moveTo(tx, TAXIWAY_Y + (APRON_Y - TAXIWAY_Y) / 2)
    g.lineTo(Math.min(tx + 18, CANVAS_W - 12), TAXIWAY_Y + (APRON_Y - TAXIWAY_Y) / 2)
    tx += 30
  }
  lbl(cont, 'TAXIWAY', 20, TAXIWAY_Y + 2, 0x6b7280, 8, 'monospace', 0.6, 0)

  // ── APRON ────────────────────────────────────────────────────────────────
  g.beginFill(0x161f2e, 0.6); g.lineStyle(1, 0x1f2937, 0.5)
  g.drawRect(0, APRON_Y, CANVAS_W, TERM_TOP - APRON_Y); g.endFill()

  // ── Terminal (fondo) ──────────────────────────────────────────────────────
  g.beginFill(0x0c1425); g.lineStyle(2, 0x374151)
  g.drawRect(10, TERM_TOP, CANVAS_W - 20, TERM_BOT - TERM_TOP); g.endFill()

  // Las colas (check-in y seguridad) van desde debajo del header hasta los
  // mostradores en la parte INFERIOR del terminal.
  const qTop = TERM_TOP + 28   // 94 — debajo del header de cada sección
  const qBot = TERM_BOT - 34   // 418 — sobre los mostradores

  // ╔══════════════════════════════════════════╗
  // ║  ZONA CHECK-IN                            ║
  // ╚══════════════════════════════════════════╝
  g.beginFill(0x1e3a5f, 0.14); g.lineStyle(0)
  g.drawRect(CHECKIN_X, TERM_TOP, CHECKIN_W, TERM_BOT - TERM_TOP); g.endFill()
  g.beginFill(0x1e3a5f, 0.7); g.lineStyle(0)
  g.drawRect(CHECKIN_X, TERM_TOP, CHECKIN_W, 26); g.endFill()
  g.lineStyle(1, 0x3b82f6, 0.4)
  g.moveTo(CHECKIN_X, TERM_TOP + 26); g.lineTo(CHECKIN_X + CHECKIN_W, TERM_TOP + 26)
  lbl(cont, '✈  CHECK-IN', CHECKIN_X + CHECKIN_W / 2, TERM_TOP + 4, 0x93c5fd, 12, 'sans-serif', 0.95)
  floorTiles(g, CHECKIN_X + 5, TERM_TOP + 28, CHECKIN_W - 10, TERM_BOT - TERM_TOP - 40, 0x3b82f6)
  drawQueueLanes(g, cont, CHECKIN_QX0, CHECKIN_QW, c1, qTop, qBot, 0x3b82f6)
  for (let i = 0; i < c1; i++) drawCheckinCounter(g, cont, checkinLaneX(i, c1), i + 1)

  // ── Separador 1 ─────────────────────────────────────────────────────────────
  g.beginFill(0x0f172a); g.lineStyle(0)
  g.drawRect(CHECKIN_X + CHECKIN_W, TERM_TOP, SECURITY_X - CHECKIN_X - CHECKIN_W, TERM_BOT - TERM_TOP); g.endFill()
  g.lineStyle(1.5, 0x374151, 0.6)
  g.moveTo(CHECKIN_X + CHECKIN_W, TERM_TOP); g.lineTo(CHECKIN_X + CHECKIN_W, TERM_BOT)
  g.moveTo(SECURITY_X, TERM_TOP); g.lineTo(SECURITY_X, TERM_BOT)

  // ╔══════════════════════════════════════════╗
  // ║  ZONA SEGURIDAD                           ║
  // ╚══════════════════════════════════════════╝
  g.beginFill(0x3b1a1a, 0.14); g.lineStyle(0)
  g.drawRect(SECURITY_X, TERM_TOP, SECURITY_W, TERM_BOT - TERM_TOP); g.endFill()
  g.beginFill(0x3b1a1a, 0.7); g.lineStyle(0)
  g.drawRect(SECURITY_X, TERM_TOP, SECURITY_W, 26); g.endFill()
  g.lineStyle(1, 0xdc2626, 0.35)
  g.moveTo(SECURITY_X, TERM_TOP + 26); g.lineTo(SECURITY_X + SECURITY_W, TERM_TOP + 26)
  lbl(cont, '🛡  SEGURIDAD', SECURITY_X + SECURITY_W / 2, TERM_TOP + 4, 0xfca5a5, 12, 'sans-serif', 0.95)
  floorTiles(g, SECURITY_X + 5, TERM_TOP + 28, SECURITY_W - 10, TERM_BOT - TERM_TOP - 40, 0xef4444)
  drawQueueLanes(g, cont, SECURITY_QX0, SECURITY_QW, c2, qTop, qBot, 0xef4444)
  for (let i = 0; i < c2; i++) drawScanner(g, cont, securityLaneX(i, c2), i + 1)

  // ── Separador 2 ─────────────────────────────────────────────────────────────
  g.beginFill(0x0f172a); g.lineStyle(0)
  g.drawRect(SECURITY_X + SECURITY_W, TERM_TOP, GATES_X - SECURITY_X - SECURITY_W, TERM_BOT - TERM_TOP); g.endFill()
  g.lineStyle(1.5, 0x374151, 0.6)
  g.moveTo(SECURITY_X + SECURITY_W, TERM_TOP); g.lineTo(SECURITY_X + SECURITY_W, TERM_BOT)
  g.moveTo(GATES_X, TERM_TOP); g.lineTo(GATES_X, TERM_BOT)

  // ╔══════════════════════════════════════════╗
  // ║  ZONA PUERTAS / EMBARQUE                  ║
  // ╚══════════════════════════════════════════╝
  g.beginFill(0x052e16, 0.15); g.lineStyle(0)
  g.drawRect(GATES_X, TERM_TOP, GATES_W, TERM_BOT - TERM_TOP); g.endFill()
  g.beginFill(0x14532d, 0.7); g.lineStyle(0)
  g.drawRect(GATES_X, TERM_TOP, GATES_W, 26); g.endFill()
  g.lineStyle(1, 0x22c55e, 0.35)
  g.moveTo(GATES_X, TERM_TOP + 26); g.lineTo(GATES_X + GATES_W, TERM_TOP + 26)
  lbl(cont, '🛫  PUERTAS / EMBARQUE', GATES_X + GATES_W / 2, TERM_TOP + 4, 0x86efac, 12, 'sans-serif', 0.95)
  floorTiles(g, GATES_X + 5, TERM_TOP + 28, GATES_W - 10, TERM_BOT - TERM_TOP - 40, 0x22c55e)

  // Tablero de salidas (justo debajo del header de la zona)
  drawDepartureBoard(g, cont, GATES_X + GATES_W / 2, TERM_TOP + 28, GATES_W - 40)

  // Puertas (jetways cuelgan desde GATE_TOP_Y hacia abajo)
  const numGates = Math.min(gates, GATE_POS.length)
  for (let i = 0; i < numGates; i++) drawGate(g, cont, GATE_POS[i].x, `G${i + 1}`)

  // Sub-zona cola de embarque: desde GATE_BOT_Y hasta BOARD_BOT
  const BOARD_BOT = 248
  g.lineStyle(1, 0x22c55e, 0.2)
  g.moveTo(GATES_X, GATE_BOT_Y); g.lineTo(GATES_X + GATES_W, GATE_BOT_Y)
  g.beginFill(0x14532d, 0.07); g.lineStyle(0)
  g.drawRect(GATES_X, GATE_BOT_Y, GATES_W, BOARD_BOT - GATE_BOT_Y); g.endFill()
  for (let i = 0; i < numGates; i++) drawBoardingLane(g, GATE_POS[i].x, GATE_BOT_Y, BOARD_BOT)

  // Separador sala de espera
  g.lineStyle(1, 0x22c55e, 0.2)
  g.moveTo(GATES_X, BOARD_BOT); g.lineTo(GATES_X + GATES_W, BOARD_BOT)
  lbl(cont, 'SALA DE ESPERA', GATES_X + GATES_W / 2, BOARD_BOT + 4, 0x4ade80, 9, 'monospace', 0.5)

  // Sillas en la sala de espera — 10 cols × 6 filas, paso vertical 26 px
  drawChairs(g, GATES_X + 20, BOARD_BOT + 20, 10, 6, 65, 26)

  // ── CORREDOR SALIDAS (fondo del terminal) ─────────────────────────────────
  g.beginFill(0x1e3764, 0.55); g.lineStyle(0)
  g.drawRect(10, CORRIDOR_Y, CANVAS_W - 20, CORRIDOR_H); g.endFill()
  g.beginFill(0xfbbf24, 0.12); g.lineStyle(0)
  g.drawRect(10, CORRIDOR_Y, CANVAS_W - 20, 3)
  g.drawRect(10, CORRIDOR_Y + CORRIDOR_H - 3, CANVAS_W - 20, 3); g.endFill()
  g.lineStyle(1, 0x60a5fa, 0.3)
  g.moveTo(10, CORRIDOR_Y); g.lineTo(CANVAS_W - 10, CORRIDOR_Y)
  g.moveTo(10, CORRIDOR_Y + CORRIDOR_H); g.lineTo(CANVAS_W - 10, CORRIDOR_Y + CORRIDOR_H)
  for (let fx = 100; fx < CANVAS_W - 50; fx += 130) {
    const arrow = new PIXI.Text('›', new PIXI.TextStyle({ fontFamily: 'sans-serif', fontSize: 15, fontWeight: 'bold', fill: 0x60a5fa }))
    arrow.alpha = 0.4; arrow.anchor.set(0.5, 0.5); arrow.x = fx; arrow.y = CORRIDOR_Y + CORRIDOR_H / 2
    cont.addChild(arrow)
  }
  lbl(cont, 'CORREDOR SALIDAS', 22, CORRIDOR_Y + 4, 0x94a3b8, 8, 'monospace', 0.55, 0)

  // ── LEYENDA (parte inferior libre del canvas) ────────────────────────────
  const legendItems: [number, string][] = [
    [0xfbbf24, 'Check-In'],
    [0xf87171, 'Seguridad'],
    [0x22d3ee, 'Embarque'],
    [0x86efac, 'Esperando'],
  ]
  legendItems.forEach(([color, label], i) => {
    const lx = 22 + i * 130
    const ly = CANVAS_H - 10
    g.lineStyle(0)
    g.beginFill(color, 0.9); g.drawCircle(lx, ly - 6, 4); g.endFill()
    const lt = new PIXI.Text(label, new PIXI.TextStyle({ fontFamily: 'sans-serif', fontSize: 9, fill: 0x9ca3af }))
    lt.x = lx + 9; lt.y = ly - 11; cont.addChild(lt)
  })
}
