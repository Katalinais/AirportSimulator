// Capa de presentación principal: integra el motor TypeScript con el
// renderer pixel-art de canvas/.

import { useState, useRef, useEffect, useCallback } from 'react'

import { useSimulation, DEFAULT_CONFIG } from './hooks/useSimulation'
import type { SimConfig }                 from './hooks/useSimulation'
import { useMetrics }                     from './hooks/useMetrics'
import { fmtSimTime, fmtNum, classifyRho } from './engine/metrics'

import { ControlPanel }     from './ui/ControlPanel'
import { ToggleModules }    from './ui/ToggleModules'
import { MetricsCard }      from './ui/MetricsCard'
import { QueueChart }       from './ui/QueueChart'
import { MetricsDashboard } from './ui/MetricsDashboard'

import { draw }             from './canvas/render'
import { buildWorld }       from './canvas/worldAdapter'
import type { PassengerAnim } from './canvas/worldAdapter'
import type { PlaneVisual } from './canvas/types'
import {
  useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle,
} from './canvas/TweaksPanel'
import './canvas/canvas.css'

// ── Constantes ────────────────────────────────────────────────────────────────

const SIZE_MAP: Record<string, number> = { pequeño: 0.85, normal: 1, grande: 1.2 }

const TWEAK_DEFAULTS = {
  theme:      'dia'   as 'dia' | 'atardecer' | 'noche',
  perspective:'plano' as 'plano' | 'inclinada',
  personSize: 'normal'as string,
  showPaths:  false,
}

// ── Helpers de stats ──────────────────────────────────────────────────────────

function stationOf(state: string): 'checkin' | 'security' | 'gate' | 'none' {
  if (['arriving', 'checkin_q', 'checkin_s'].includes(state))     return 'checkin'
  if (['security_q', 'security_s'].includes(state))               return 'security'
  if (['waiting_gate', 'boarding_q', 'boarding_s'].includes(state)) return 'gate'
  return 'none'
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function App() {
  const [config, setConfig] = useState<SimConfig>(DEFAULT_CONFIG)

  const handleConfigChange = useCallback((partial: Partial<SimConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }))
  }, [])

  const { state, play, pause, reset: _reset, step } = useSimulation(config)

  // Posiciones y ángulos visuales de aviones (mutable, no causa re-render)
  const planeVisualsRef    = useRef<Map<number, PlaneVisual>>(new Map())
  const passengerAnimRef   = useRef<Map<number, PassengerAnim>>(new Map())
  const lastSimTimeRef     = useRef(0)

  const reset = useCallback(() => {
    planeVisualsRef.current.clear()
    passengerAnimRef.current.clear()
    lastSimTimeRef.current = 0
    _reset()
  }, [_reset])

  const history = useMetrics(state)

  // ── Tweaks visuales (tema, perspectiva, tamaño persona) ───────────────────
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS)

  // ── Paneles colapsables ───────────────────────────────────────────────────
  const [showControls,   setShowControls]   = useState(true)
  const [showMetrics,    setShowMetrics]    = useState(false)
  const [showDashboard,  setShowDashboard]  = useState(false)

  // ── Notificaciones de incidentes (paso 6) ─────────────────────────────────
  interface Notif { id: number; kind: 'crash' | 'mechanical' | 'weather'; text: string }
  const [notifs, setNotifs] = useState<Notif[]>([])
  const notifCounter = useRef(0)

  const pushNotif = useCallback((kind: Notif['kind'], text: string) => {
    const id = ++notifCounter.current
    setNotifs(prev => [...prev, { id, kind, text }])
    setTimeout(() => setNotifs(prev => prev.filter(n => n.id !== id)), 4500)
  }, [])

  const prevCrashes    = useRef(0)
  const prevMechanical = useRef(0)
  const prevWeather    = useRef(0)

  useEffect(() => {
    if (state.crashes > prevCrashes.current) {
      // Buscar aviones que acaban de colapsar (crashedAt cercano al tiempo actual)
      const recent = state.planes
        .filter(p => p.state === 'crashed' && p.crashedAt !== null
                  && state.simTime - (p.crashedAt ?? 0) < 3)
        .sort((a, b) => a.gateId - b.gateId)
      const nombres = recent.length > 0
        ? recent.map(p => `Avión ${p.gateId + 1}`).join(' y ')
        : 'vuelo'
      pushNotif('crash', `COLISION EN PISTA\n${nombres} cancelado (total: ${state.crashes})`)
    }
    prevCrashes.current = state.crashes
  }, [state.crashes, state.planes, state.simTime, pushNotif])

  useEffect(() => {
    if (state.mechanical > prevMechanical.current) {
      // Buscar el avión en estado mechanical (puede haber más de uno)
      const afectados = state.planes
        .filter(p => p.state === 'mechanical')
        .sort((a, b) => a.gateId - b.gateId)
      const nombres = afectados.length > 0
        ? afectados.map(p => `Avión ${p.gateId + 1}`).join(' y ')
        : 'avión'
      pushNotif('mechanical', `FALLA MECANICA\n${nombres} en reparacion (total: ${state.mechanical})`)
    }
    prevMechanical.current = state.mechanical
  }, [state.mechanical, state.planes, pushNotif])

  useEffect(() => {
    if (state.weather > prevWeather.current)
      pushNotif('weather', `CLIMA ADVERSO\ntodos los vuelos retrasados (total: ${state.weather})`)
    prevWeather.current = state.weather
  }, [state.weather, pushNotif])

  // ── Canvas pixel-art (nueva-ui) ───────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    // dt en sim-minutos desde el último frame (≥0; 0 tras reset)
    const dt = Math.max(0, state.simTime - lastSimTimeRef.current)
    lastSimTimeRef.current = state.simTime

    const world = buildWorld(state, config, planeVisualsRef.current, passengerAnimRef.current, dt)
    draw(ctx, world, {
      theme:     t.theme,
      showPaths: t.showPaths,
      size:      SIZE_MAP[t.personSize] ?? 1,
    })
  }, [state, config, t])

  // ── Stats para la barra inferior (nueva-ui) ───────────────────────────────
  const active    = state.passengers.filter(p => !['boarded', 'abandoned'].includes(p.state))
  const checkinP  = active.filter(p => stationOf(p.state) === 'checkin')
  const securityP = active.filter(p => stationOf(p.state) === 'security')
  const gateP     = active.filter(p => stationOf(p.state) === 'gate')
  const esperando = state.planes.filter(p => p.state === 'taxiing_out').length
  const waitSec   = (state.metrics.Wq * 60).toFixed(1)
  const volados   = state.passengers.filter(p => p.state === 'boarded').length
  const vuelos    = state.planes.filter(p => p.state === 'airborne').length

  const STAT_CARDS = [
    { label: 'EN EL AEROPUERTO', value: active.length,     accent: '#cbd2dc' },
    { label: 'CHECK-IN',          value: checkinP.length,  accent: '#2fd0b8' },
    { label: 'SEGURIDAD',         value: securityP.length, accent: '#5b9bff' },
    { label: 'EMBARQUE',          value: gateP.length,     accent: '#b07cff' },
    { label: 'ESPERAN PISTA',     value: esperando,         accent: '#ff9f6b' },
    { label: 'ESPERA PROM.',      value: `${waitSec}s`,    accent: '#ff9f6b', wide: true },
    { label: 'EMBARCADOS',        value: volados,            accent: '#7ee08a' },
    { label: 'VUELOS',            value: vuelos,             accent: '#7ee08a' },
  ]

  // Perspectiva CSS para la cámara inclinada
  const tilt = t.perspective === 'inclinada'
    ? 'perspective(760px) rotateX(32deg) scale(1.02)'
    : 'none'

  const rhoLevel = classifyRho(state.metrics.rho)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="nu-root min-h-screen flex flex-col select-none"
      style={{ fontFamily: "'DM Mono', ui-monospace, monospace" }}
    >

      {/* ── Notificaciones (toast, paso 6) ─────────────────────────────────── */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col-reverse gap-2 z-50 pointer-events-none items-center">
        {notifs.map(n => (
          <div key={n.id} className={`nu-toast ${n.kind}`} style={{ whiteSpace: 'pre-line' }}>
            {n.text}
          </div>
        ))}
      </div>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 border-b"
              style={{ borderColor: 'var(--nu-line)', background: 'var(--nu-panel)' }}>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowControls(v => !v)}
            className="nu-btn ghost text-xs px-2 py-1"
            title={showControls ? 'Ocultar parámetros' : 'Mostrar parámetros'}
          >
            {showControls ? '◀' : '▶'}
          </button>
          <div className="nu-logo-mark">✈</div>
          <span className="nu-logo-text">AIRPORT SIM</span>
        </div>

        <div className="flex items-center gap-5 text-sm">
          <span style={{ fontFamily: 'var(--nu-mono, monospace)', color: 'var(--nu-muted)' }}>
            t = <b style={{ color: 'var(--nu-amber)', fontFamily: "'VT323', monospace", fontSize: 20 }}>
              {fmtSimTime(state.simTime)}
            </b>
          </span>
          <div className="flex gap-4 text-xs" style={{ color: 'var(--nu-muted)' }}>
            <span>Sistema <b style={{ color: 'var(--nu-ink)' }}>{active.length}</b></span>
            <span>Abordados <b style={{ color: '#7ee08a' }}>{volados}</b></span>
            <span>Abandonados <b style={{ color: '#f87171' }}>
              {state.passengers.filter(p => p.state === 'abandoned').length}
            </b></span>
            <span>Vuelos activos <b style={{ color: '#93c5fd' }}>
              {state.planes.filter(p => !['airborne','cancelled'].includes(p.state)).length}
            </b></span>
          </div>
          <span
            className="text-xs px-2 py-0.5 rounded font-mono"
            style={{
              background: state.isRunning ? '#14532d' : '#1f2937',
              color:      state.isRunning ? '#4ade80'  : '#6b7280',
            }}
          >
            {state.isRunning ? '● RUN' : '■ STOP'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ToggleModules config={config} onConfigChange={handleConfigChange} />
          <button
            onClick={() => setShowDashboard(true)}
            className="nu-btn"
            style={{ fontSize: 8, padding: '8px 12px' }}
            title="Panel de métricas completo"
          >
            📊 MÉTRICAS
          </button>
          <button
            onClick={() => setShowMetrics(v => !v)}
            className="nu-btn ghost text-xs px-2 py-1"
            title={showMetrics ? 'Ocultar métricas' : 'Mostrar métricas'}
          >
            {showMetrics ? '▶' : '◀'}
          </button>
        </div>
      </header>

      {/* ── Área principal ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar izquierda: parámetros (colapsable) */}
        <div
          className="shrink-0 overflow-hidden transition-all duration-200"
          style={{ width: showControls ? '288px' : '0' }}
        >
          <ControlPanel
            config={config}
            isRunning={state.isRunning}
            onConfigChange={handleConfigChange}
            onPlay={play}
            onPause={pause}
            onReset={reset}
            onStep={step}
          />
        </div>

        {/* Centro: canvas + controles + stats */}
        <main className="flex-1 min-w-0 overflow-auto flex flex-col gap-4 p-4">

          {/* Tablero pixel-art — ocupa todo el ancho disponible */}
          <div className="nu-board-wrap">
            <div className="nu-board-shadow" style={{ transform: tilt }}>
              <div className="nu-board">
                <canvas
                  ref={canvasRef}
                  width={640}
                  height={360}
                  className="nu-screen"
                />
              </div>
            </div>
          </div>

          {/* Controles principales (paso 5) */}
          <div className="nu-controls w-full">

            {/* Play / Pause */}
            <button
              className={`nu-btn primary${state.isRunning ? ' running' : ''}`}
              onClick={state.isRunning ? pause : play}
            >
              {state.isRunning ? '❚❚ PAUSA' : '▶ INICIAR'}
            </button>

            {/* Velocidad */}
            <div className="nu-seg">
              <span className="nu-seg-label">VELOCIDAD</span>
              {([0.5, 1, 2, 3, 5] as const).map(s => (
                <button
                  key={s}
                  className={`nu-segbtn${config.speed === s ? ' active' : ''}`}
                  onClick={() => handleConfigChange({ speed: s })}
                >
                  {s}×
                </button>
              ))}
            </div>

            {/* Paso único */}
            <button
              className="nu-btn ghost"
              onClick={step}
              disabled={state.isRunning}
              style={{ opacity: state.isRunning ? 0.35 : 1 }}
            >
              ⊡ PASO
            </button>

            {/* Reset */}
            <button className="nu-btn ghost" onClick={reset}>
              ↺ RESET
            </button>
          </div>

          {/* Estadísticas (paso 5) */}
          <div className="nu-stats w-full">
            {STAT_CARDS.map(({ label, value, accent, wide }) => (
              <div key={label} className={`nu-stat${wide ? ' wide' : ''}`}>
                <div className="nu-stat-num" style={{ color: accent }}>{value}</div>
                <div className="nu-stat-label">{label}</div>
              </div>
            ))}
          </div>

        </main>

        {/* Sidebar derecha: métricas avanzadas (colapsable) */}
        <div
          className="shrink-0 relative overflow-hidden transition-all duration-200"
          style={{ width: showMetrics ? '272px' : '0' }}
        >
          <aside
            className="absolute inset-0 w-[272px] flex flex-col gap-3 p-3 overflow-y-auto border-l"
            style={{ background: 'var(--nu-panel)', borderColor: 'var(--nu-line)' }}
          >
            <p className="text-xs font-mono uppercase tracking-wider" style={{ color: 'var(--nu-muted)' }}>
              Métricas de cola
            </p>
            <div className="grid grid-cols-2 gap-2">
              <MetricsCard label="ρ carga"     value={fmtNum(state.metrics.rho, 3)} level={rhoLevel} />
              <MetricsCard label="Lq pasajeros" value={fmtNum(state.metrics.Lq,  2)} unit="pax" level={rhoLevel} />
              <MetricsCard label="Wq espera"   value={fmtNum(state.metrics.Wq,  2)} unit="min" level={rhoLevel} />
              <MetricsCard label="Throughput"  value={fmtNum(state.metrics.throughput, 2)} unit="/min" level="neutral" />
              <MetricsCard
                label="Abandono"
                value={fmtNum(state.metrics.abandonRate * 100, 1)}
                unit="%"
                level={
                  state.metrics.abandonRate > 0.15 ? 'danger'
                  : state.metrics.abandonRate > 0.05 ? 'warn'
                  : 'ok'
                }
              />
              <MetricsCard label="L sistema" value={fmtNum(state.metrics.littleL, 2)} unit="pax" level="neutral" />
            </div>

            <p className="text-xs font-mono uppercase tracking-wider mt-2" style={{ color: 'var(--nu-muted)' }}>
              Incidentes
            </p>
            <div className="grid grid-cols-2 gap-2">
              <MetricsCard label="Colisiones" value={String(state.crashes)}   level={state.crashes   > 0 ? 'danger' : 'ok'} />
              <MetricsCard label="Fallas mec."value={String(state.mechanical)}level={state.mechanical> 0 ? 'warn'   : 'ok'} />
            </div>

            <QueueChart history={history} />
          </aside>
        </div>

      </div>

      {/* TweaksPanel flotante (apariencia visual) */}
      <TweaksPanel title="Apariencia">
        <TweakSection label="Ambiente" />
        <TweakRadio
          label="Tema"
          value={t.theme}
          options={['dia', 'atardecer', 'noche']}
          onChange={v => setTweak('theme', v)}
        />
        <TweakSection label="Cámara" />
        <TweakRadio
          label="Vista"
          value={t.perspective}
          options={['plano', 'inclinada']}
          onChange={v => setTweak('perspective', v)}
        />
        <TweakSection label="Personas" />
        <TweakRadio
          label="Tamaño"
          value={t.personSize}
          options={['pequeño', 'normal', 'grande']}
          onChange={v => setTweak('personSize', v)}
        />
        <TweakToggle
          label="Guías de fila"
          value={t.showPaths}
          onChange={v => setTweak('showPaths', v)}
        />
      </TweaksPanel>

      {/* Panel de métricas completo (modal) */}
      {showDashboard && (
        <MetricsDashboard
          state={state}
          config={config}
          onClose={() => setShowDashboard(false)}
        />
      )}

    </div>
  )
}
