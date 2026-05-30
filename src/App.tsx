import { useState, useRef, useEffect, useCallback } from 'react'

import { useSimulation, DEFAULT_CONFIG, SimConfig } from './hooks/useSimulation'
import { useMetrics }    from './hooks/useMetrics'
import { classifyRho, fmtSimTime, fmtNum } from './engine/metrics'

import { ControlPanel }  from './ui/ControlPanel'
import { MetricsCard }   from './ui/MetricsCard'
import { QueueChart }    from './ui/QueueChart'
import { ToggleModules } from './ui/ToggleModules'

import { drawAirport, CANVAS_W, CANVAS_H } from './renderer/airportCanvas'
import { drawPassengers, drawLegend }      from './renderer/passengerRenderer'
import { drawPlanes }                      from './renderer/planeRenderer'

export default function App() {
  const [config, setConfig] = useState<SimConfig>(DEFAULT_CONFIG)

  const handleConfigChange = useCallback((partial: Partial<SimConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }))
  }, [])

  const { state, play, pause, reset, step } = useSimulation(config)
  const history = useMetrics(state)

  // ── Canvas ─────────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
    drawAirport(ctx, CANVAS_W, CANVAS_H)
    drawPassengers(ctx, state.passengers)
    drawPlanes(ctx, state.planes, state.simTime)
    drawLegend(ctx, 20, 452)
  }, [state])

  // ── Métricas derivadas ─────────────────────────────────────────────────────
  const { Lq, Wq, rho, throughput, abandonRate } = state.metrics
  const rhoLevel = classifyRho(rho)

  const inSystem = state.passengers.filter(
    p => p.state !== 'boarded' && p.state !== 'abandoned',
  ).length

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white overflow-hidden select-none">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between px-5 py-2 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <span className="text-lg">✈</span>
          <h1 className="font-semibold text-gray-100 text-sm tracking-wide">Airport Simulator</h1>
        </div>

        <div className="flex items-center gap-4">
          <span className="font-mono text-sm text-gray-300">
            t = <span className="text-white">{fmtSimTime(state.simTime)}</span>
          </span>
          <span className={`text-xs font-mono px-2 py-0.5 rounded ${
            state.isRunning ? 'bg-emerald-900 text-emerald-400' : 'bg-gray-800 text-gray-500'
          }`}>
            {state.isRunning ? '● RUN' : '■ STOP'}
          </span>
        </div>

        <ToggleModules config={config} onConfigChange={handleConfigChange} />
      </header>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: controls */}
        <ControlPanel
          config={config}
          isRunning={state.isRunning}
          onConfigChange={handleConfigChange}
          onPlay={play}
          onPause={pause}
          onReset={reset}
          onStep={step}
        />

        {/* Center: canvas */}
        <main className="flex-1 flex flex-col items-center justify-center gap-2 bg-gray-950 overflow-hidden p-3">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="rounded-lg border border-gray-800 max-w-full"
            style={{ imageRendering: 'pixelated' }}
          />

          {/* Contadores rápidos bajo el canvas */}
          <div className="flex gap-6 text-xs text-gray-500 font-mono">
            <span>En sistema: <b className="text-gray-300">{inSystem}</b></span>
            <span>Abordados: <b className="text-emerald-400">{
              state.passengers.filter(p => p.state === 'boarded').length
            }</b></span>
            <span>Abandonados: <b className="text-red-400">{
              state.passengers.filter(p => p.state === 'abandoned').length
            }</b></span>
            <span>Vuelos: <b className="text-gray-300">{state.planes.length}</b></span>
          </div>
        </main>

        {/* Right: metrics */}
        <aside className="w-64 shrink-0 flex flex-col gap-3 p-4 bg-gray-900 border-l border-gray-800 overflow-y-auto">

          <h2 className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest">Métricas</h2>

          <div className="grid grid-cols-2 gap-2">
            <MetricsCard
              label="Lq"
              value={fmtNum(Lq)}
              unit="pax"
              sub="Cola media"
              level={rhoLevel}
            />
            <MetricsCard
              label="Wq"
              value={fmtNum(Wq, 1)}
              unit="min"
              sub="Espera media"
              level={rhoLevel}
            />
            <MetricsCard
              label="ρ util."
              value={fmtNum(rho * 100, 0)}
              unit="%"
              sub="Utilización"
              level={rhoLevel}
            />
            <MetricsCard
              label="Abandono"
              value={fmtNum(abandonRate * 100, 0)}
              unit="%"
              sub="Tasa abandono"
              level={abandonRate > 0.3 ? 'danger' : abandonRate > 0.1 ? 'warn' : 'ok'}
            />
          </div>

          <MetricsCard
            label="Throughput"
            value={fmtNum(throughput, 2)}
            unit="pax/min"
            sub="Abordados/minuto"
            level="neutral"
          />

          <div className="mt-1">
            <h2 className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-2">
              Evolución Lq · ρ · Wq
            </h2>
            <QueueChart history={history} />
          </div>

          {/* Erlang C reference */}
          <div className="mt-1 p-2 bg-gray-800 rounded text-xs text-gray-500 font-mono space-y-0.5">
            <div className="text-gray-400 font-semibold mb-1">Erlang C (ref)</div>
            <div>λ = {config.lambda.toFixed(1)}/min</div>
            <div>c₁={config.c1}  μ₁={config.mu1.toFixed(1)}</div>
            <div>ρ₁ = {fmtNum(config.lambda / (config.c1 * config.mu1), 3)}</div>
            <div>c₂={config.c2}  μ₂={config.mu2.toFixed(1)}</div>
            <div>ρ₂ = {fmtNum(config.lambda / (config.c2 * config.mu2), 3)}</div>
          </div>

        </aside>
      </div>
    </div>
  )
}
