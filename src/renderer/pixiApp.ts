import * as PIXI from 'pixi.js'

// ── Dimensiones ───────────────────────────────────────────────────────────────
export const CANVAS_W = 1800
export const CANVAS_H = 510

// ── Zonas horizontales ────────────────────────────────────────────────────────
export const CHECKIN_X  = 10,   CHECKIN_W  = 510
export const SECURITY_X = 540,  SECURITY_W = 510
export const GATES_X    = 1070, GATES_W    = 720

// ── Áreas de cola (dentro de cada zona) ───────────────────────────────────────
export const CHECKIN_QX0  = 40,  CHECKIN_QW  = 440   // x 40–480
export const SECURITY_QX0 = 570, SECURITY_QW = 440   // x 570–1010

// ── Coordenadas verticales clave ──────────────────────────────────────────────
export const TERMINAL_BOTTOM = 418
export const CORRIDOR_Y      = 418   // pasillo
export const CORRIDOR_H      = 20
export const APRON_Y         = 440
export const TAXIWAY_Y       = 455
export const RUNWAY_Y        = 478

// ── Posiciones de puertas (máx 5) ─────────────────────────────────────────────
export const GATE_POS = [
  { x: 1142, y: 68 },
  { x: 1322, y: 68 },
  { x: 1502, y: 68 },
  { x: 1682, y: 68 },
  { x: 1862, y: 68 },
]

// ── Helpers de posición de cola ────────────────────────────────────────────────
export function checkinLaneX(lane: number, c1: number): number {
  return CHECKIN_QX0 + (lane + 0.5) * (CHECKIN_QW / c1)
}
export function securityLaneX(lane: number, c2: number): number {
  return SECURITY_QX0 + (lane + 0.5) * (SECURITY_QW / c2)
}

// ── Escena PixiJS ─────────────────────────────────────────────────────────────
export interface PixiScene {
  app:             PIXI.Application
  bgGfx:           PIXI.Graphics
  passengerGfx:    PIXI.Graphics
  planeGfx:        PIXI.Graphics
  planeLabelCont:  PIXI.Container
  labelContainer:  PIXI.Container
}

export function initPixiScene(mount: HTMLElement, _gates: number): PixiScene {
  const app = new PIXI.Application({
    width:           CANVAS_W,
    height:          CANVAS_H,
    backgroundColor: 0x0f172a,
    antialias:       true,
    resolution:      window.devicePixelRatio || 1,
    autoDensity:     true,
  })

  const canvas = app.view as HTMLCanvasElement
  canvas.style.width        = `${CANVAS_W}px`
  canvas.style.height       = `${CANVAS_H}px`
  canvas.style.borderRadius = '12px'
  canvas.style.border       = '1px solid #1f2937'
  canvas.style.display      = 'block'
  mount.appendChild(canvas)

  const bgGfx          = new PIXI.Graphics()
  const passengerGfx   = new PIXI.Graphics()
  const planeGfx       = new PIXI.Graphics()
  const planeLabelCont = new PIXI.Container()
  const labelContainer = new PIXI.Container()

  app.stage.addChild(bgGfx)
  app.stage.addChild(labelContainer)
  app.stage.addChild(passengerGfx)
  app.stage.addChild(planeGfx)
  app.stage.addChild(planeLabelCont)

  return { app, bgGfx, passengerGfx, planeGfx, planeLabelCont, labelContainer }
}

export function destroyPixiScene(scene: PixiScene): void {
  scene.app.destroy(true, { children: true })
}
