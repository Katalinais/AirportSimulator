import { useState, useRef, useEffect, useCallback } from 'react'

import { useSimulation, DEFAULT_CONFIG, SimConfig } from './hooks/useSimulation'
import { useMetrics } from './hooks/useMetrics'
import { fmtSimTime, fmtNum, classifyRho } from './engine/metrics'

import { ControlPanel }  from './ui/ControlPanel'
import { ToggleModules } from './ui/ToggleModules'
import { MetricsCard }   from './ui/MetricsCard'
import { QueueChart }    from './ui/QueueChart'

import { initPixiScene, destroyPixiScene, PixiScene } from './renderer/pixiApp'
import { drawBackground }                              from './renderer/drawBackground'
import { drawPassengers, clearPassengerVisuals }       from './renderer/drawPassengers'
import { drawPlanes, clearPlanePixiVisuals }           from './renderer/drawPlanes'

import type { SimState } from './hooks/useSimulation'

export default function App() {
  const [config, setConfig] = useState<SimConfig>(DEFAULT_CONFIG)
  const [showControls, setShowControls] = useState(true)
  const [showMetrics,  setShowMetrics]  = useState(false)

  const handleConfigChange = useCallback((partial: Partial<SimConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }))
  }, [])

  const { state, play, pause, reset: _reset, step } = useSimulation(config)
  const reset = useCallback(() => {
    clearPassengerVisuals()
    clearPlanePixiVisuals()
    _reset()
  }, [_reset])

  const history = useMetrics(state)

  // ── PixiJS ────────────────────────────────────────────────────────────────
  const mountRef  = useRef<HTMLDivElement>(null)
  const sceneRef  = useRef<PixiScene | null>(null)
  const stateRef  = useRef<SimState>(state)
  const configRef = useRef<SimConfig>(config)

  // mantener refs en sync sin recrear la escena
  useEffect(() => { stateRef.current  = state  }, [state])
  useEffect(() => { configRef.current = config }, [config])

  // inicializar PixiJS una sola vez
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = initPixiScene(mount, config.gates ?? 4)
    sceneRef.current = scene

    // dibujar fondo estático
    drawBackground(scene.bgGfx, scene.labelContainer, config.gates ?? 4, configRef.current.c1, configRef.current.c2)

    // ticker: aviones y pasajeros se redibujan cada frame
    scene.app.ticker.add(() => {
      const s = stateRef.current
      const c = configRef.current
      drawPassengers(scene.passengerGfx, s.passengers, c.c1, c.c2)
      drawPlanes(scene.planeGfx, scene.planeLabelCont, s.planes, s.simTime)
    })

    return () => {
      scene.app.ticker.stop()
      destroyPixiScene(scene)
      sceneRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // redibujar fondo si cambia el número de puertas
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    drawBackground(scene.bgGfx, scene.labelContainer, config.gates ?? 4, config.c1, config.c2)
  }, [config.gates, config.c1, config.c2])

  const inSystem   = state.passengers.filter(p => p.state !== 'boarded' && p.state !== 'abandoned').length
  const boarded    = state.passengers.filter(p => p.state === 'boarded').length
  const abandoned  = state.passengers.filter(p => p.state === 'abandoned').length
  const activePlan = state.planes.filter(p => !['airborne', 'cancelled'].includes(p.state)).length

  const rhoLevel = classifyRho(state.metrics.rho)

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white overflow-hidden select-none">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-800">

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowControls(v => !v)}
            title={showControls ? 'Ocultar parámetros' : 'Mostrar parámetros'}
            className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 font-mono transition-colors"
          >
            {showControls ? '◀' : '▶'}
          </button>
          <span className="text-lg">✈</span>
          <h1 className="font-semibold text-gray-100 text-sm tracking-wide">Airport Simulator</h1>
        </div>

        <div className="flex items-center gap-5">
          <span className="font-mono text-sm text-gray-300">
            t = <span className="text-white font-semibold">{fmtSimTime(state.simTime)}</span>
          </span>
          <div className="flex gap-4 text-xs font-mono text-gray-400">
            <span>Sistema <b className="text-gray-200">{inSystem}</b></span>
            <span>Abordados <b className="text-emerald-400">{boarded}</b></span>
            <span>Abandonados <b className="text-red-400">{abandoned}</b></span>
            <span>Vuelos activos <b className="text-blue-300">{activePlan}</b></span>
          </div>
          <span className={`text-xs font-mono px-2 py-0.5 rounded ${
            state.isRunning ? 'bg-emerald-900 text-emerald-400' : 'bg-gray-800 text-gray-500'
          }`}>
            {state.isRunning ? '● RUN' : '■ STOP'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ToggleModules config={config} onConfigChange={handleConfigChange} />
          <button
            onClick={() => setShowMetrics(v => !v)}
            title={showMetrics ? 'Ocultar métricas' : 'Mostrar métricas'}
            className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 font-mono transition-colors"
          >
            {showMetrics ? '▶' : '◀'}
          </button>
        </div>
      </header>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Izquierda: controles (colapsable) */}
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

        {/* Centro: contenedor PixiJS con scroll horizontal */}
        <main className="flex-1 overflow-auto bg-gray-950 p-4">
          <div
            ref={mountRef}
            style={{ width: '1800px', height: '510px', minWidth: '1800px' }}
          />
        </main>

        {/* Derecha: métricas (colapsable) */}
        <div
          className="shrink-0 overflow-hidden transition-all duration-200"
          style={{ width: showMetrics ? '272px' : '0' }}
        >
          <aside className="w-[272px] h-full bg-gray-900 border-l border-gray-800 flex flex-col gap-3 p-3 overflow-y-auto">
            <p className="text-xs font-mono text-gray-500 uppercase tracking-wider">Métricas de cola</p>
            <div className="grid grid-cols-2 gap-2">
              <MetricsCard
                label="ρ carga"
                value={fmtNum(state.metrics.rho, 3)}
                level={rhoLevel}
              />
              <MetricsCard
                label="Lq pasajeros"
                value={fmtNum(state.metrics.Lq, 2)}
                unit="pax"
                level={rhoLevel}
              />
              <MetricsCard
                label="Wq espera"
                value={fmtNum(state.metrics.Wq, 2)}
                unit="min"
                level={rhoLevel}
              />
              <MetricsCard
                label="Throughput"
                value={fmtNum(state.metrics.throughput, 2)}
                unit="/min"
                level="neutral"
              />
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
              <MetricsCard
                label="L sistema"
                value={fmtNum(state.metrics.littleL, 2)}
                unit="pax"
                level="neutral"
              />
            </div>
            <QueueChart history={history} />
          </aside>
        </div>

      </div>
    </div>
  )
}
