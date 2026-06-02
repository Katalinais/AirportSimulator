// Hook principal: bucle requestAnimationFrame con mutableRef, avance de pasajeros y aviones, HUD cada 100 ms

import { useRef, useState, useEffect, useCallback } from 'react'
import { EventLoop }          from '../engine/eventLoop'
import { Passenger }          from '../engine/passenger'
import { Plane }              from '../engine/plane'
import type { QueueMetrics }  from '../engine/queue'

export type { QueueMetrics }

// ── Tipos del hook ────────────────────────────────────────────────────────────

export type SigmaLevel = 'low' | 'medium' | 'high'

const SIGMA_MAP: Record<SigmaLevel, number> = { low: 0.05, medium: 0.15, high: 0.35 }

export interface SimConfig {
  lambda:             number
  vipPercent:         number
  peakHour:           boolean
  c1:                 number
  mu1:                number
  capacity1:          number
  c2:                 number
  mu2:                number
  sigmaLevel:         SigmaLevel
  gates:              number
  delayProb:          number
  patienceThreshold:  number
  speed:              number
  abmActive:          boolean
  mechanicalProb:     number
  crashProb:          number
  weatherProb:        number
}

export interface SimMetrics {
  Lq:          number
  Wq:          number
  rho:         number
  throughput:  number   // pasajeros abordados por minuto
  abandonRate: number   // fracción de abandonos sobre llegadas
  littleL:     number   // número medio de pasajeros en el sistema (Lq + en servicio)
}

export interface RawQueueMetrics {
  checkin:  QueueMetrics
  security: QueueMetrics
  boarding: QueueMetrics[]
  arrived:  number
  boarded:  number
  abandoned:number
}

export interface SimState {
  passengers:   Passenger[]
  planes:       Plane[]
  metrics:      SimMetrics
  queueMetrics: RawQueueMetrics
  isRunning:    boolean
  simTime:      number
  crashes:      number
  mechanical:   number
  weather:      number
}

// ── Config inicial ────────────────────────────────────────────────────────────

export const DEFAULT_CONFIG: SimConfig = {
  lambda:            4,
  vipPercent:        10,
  peakHour:          false,
  c1:                3,
  mu1:               3,
  capacity1:         50,
  c2:                2,
  mu2:               2,
  sigmaLevel:        'medium',
  gates:             3,
  delayProb:         0.10,
  patienceThreshold: 8,
  speed:             1,
  abmActive:         false,
  mechanicalProb:    0.25,
  crashProb:         0.05,
  weatherProb:       0.5,
}

const DT = 1 / 60   // ~1 tick por frame a 60 fps (minutos de simulación por frame)

// ── Conversión de config ──────────────────────────────────────────────────────

function toEngineConfig(cfg: SimConfig) {
  return {
    lambda:            cfg.lambda,
    peakHour:          cfg.peakHour,
    c1:                cfg.c1,
    mu1:               cfg.mu1,
    capacity1:         cfg.capacity1,
    c2:                cfg.c2,
    mu2:               cfg.mu2,
    sigma2:            SIGMA_MAP[cfg.sigmaLevel],
    gates:             cfg.gates,
    delayProb:         cfg.delayProb,
    patienceThreshold: cfg.patienceThreshold,
    speed:             cfg.speed,
    mechanicalProb:    cfg.mechanicalProb,
    crashProb:         cfg.crashProb,
    weatherProb:       cfg.weatherProb,
  }
}

// ── Cálculo de métricas compuestas ────────────────────────────────────────────

function computeMetrics(loop: EventLoop, simTime: number): SimMetrics {
  const state    = loop.getState()
  const checkin  = state.metrics.checkin
  const security = state.metrics.security

  // Lq y Wq ponderados: check-in domina el cuello de botella
  const Lq  = checkin.Lq  + security.Lq
  const Wq  = checkin.Wq  + security.Wq
  const rho = (checkin.rho + security.rho) / 2

  const elapsed    = Math.max(simTime, 1e-9)
  const throughput = loop.totalBoarded   / elapsed
  const arrived    = loop.totalArrived
  const abandonRate = arrived > 0 ? loop.totalAbandoned / arrived : 0

  // Little: L = λ·W  (aproximación con λ efectiva = arrived/elapsed)
  const lambdaEff = arrived / elapsed
  const littleL   = lambdaEff * Wq

  return { Lq, Wq, rho, throughput, abandonRate, littleL }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSimulation(config: SimConfig) {
  // Motor: mutable ref, nunca causa re-render
  const loopRef      = useRef<EventLoop | null>(null)
  const rafRef       = useRef<number>(0)
  const lastTimeRef  = useRef<number>(0)
  const logTimerRef  = useRef<number>(0)   // para console.log cada segundo real
  const isRunningRef = useRef(false)

  // Estado React: solo para re-render de UI
  const EMPTY_QM: QueueMetrics = { Lq: 0, Wq: 0, rho: 0, utilization: 0 }
  const [state, setState] = useState<SimState>({
    passengers:   [],
    planes:       [],
    metrics:      { Lq: 0, Wq: 0, rho: 0, throughput: 0, abandonRate: 0, littleL: 0 },
    queueMetrics: { checkin: EMPTY_QM, security: EMPTY_QM, boarding: [], arrived: 0, boarded: 0, abandoned: 0 },
    isRunning:    false,
    simTime:      0,
    crashes:      0,
    mechanical:   0,
    weather:      0,
  })

  // ── Inicializar motor ────────────────────────────────────────────────────
  if (loopRef.current === null) {
    loopRef.current = new EventLoop(toEngineConfig(config))
  }

  // ── Sincronizar config sin reiniciar ─────────────────────────────────────
  const configRef = useRef(config)
  useEffect(() => {
    if (!loopRef.current) return
    loopRef.current.updateConfig(toEngineConfig(config))
    configRef.current = config
  }, [
    config.lambda, config.peakHour,
    config.c1, config.mu1, config.capacity1,
    config.c2, config.mu2, config.sigmaLevel,
    config.gates, config.delayProb, config.patienceThreshold, config.speed,
    config.mechanicalProb, config.crashProb, config.weatherProb,
  ])

  // ── Función de snapshot: lee el motor y actualiza React state ────────────
  const snapshot = useCallback(() => {
    const loop = loopRef.current
    if (!loop) return
    const engineState = loop.getState()
    setState(prev => ({
      ...prev,
      passengers:   engineState.passengers,
      planes:       engineState.planes,
      metrics:      computeMetrics(loop, engineState.currentTime),
      queueMetrics: {
        checkin:  engineState.metrics.checkin,
        security: engineState.metrics.security,
        boarding: engineState.metrics.boarding,
        arrived:  loop.totalArrived,
        boarded:  loop.totalBoarded,
        abandoned:loop.totalAbandoned,
      },
      simTime:    engineState.currentTime,
      crashes:    loop.totalCrashes,
      mechanical: loop.totalMechanical,
      weather:    loop.totalWeather,
    }))
  }, [])

  // ── Frame loop ───────────────────────────────────────────────────────────
  const frame = useCallback((now: number) => {
    if (!isRunningRef.current) return

    const wallDt    = Math.min((now - lastTimeRef.current) / 1000, 0.1)   // segundos reales, max 100 ms
    lastTimeRef.current = now

    const loop = loopRef.current!
    loop.tick(DT * configRef.current.speed * (wallDt / (1 / 60)))   // escalar al dt real del frame

    // Console.log cada segundo real de ejecución
    logTimerRef.current += wallDt
    if (logTimerRef.current >= 1) {
      logTimerRef.current = 0
      const s = loop.getState()
      const m = computeMetrics(loop, s.currentTime)
      console.log(
        `[sim t=${s.currentTime.toFixed(1)}min]` +
        `  llegados=${loop.totalArrived}` +
        `  abordados=${loop.totalBoarded}` +
        `  abandonados=${loop.totalAbandoned}` +
        `  Lq=${m.Lq.toFixed(3)}` +
        `  Wq=${m.Wq.toFixed(3)}` +
        `  ρ=${m.rho.toFixed(3)}`,
      )
    }

    snapshot()
    rafRef.current = requestAnimationFrame(frame)
  }, [snapshot])

  // ── Controles ────────────────────────────────────────────────────────────

  const play = useCallback(() => {
    if (isRunningRef.current) return
    isRunningRef.current = true
    lastTimeRef.current  = performance.now()
    setState(prev => ({ ...prev, isRunning: true }))
    rafRef.current = requestAnimationFrame(frame)
  }, [frame])

  const pause = useCallback(() => {
    isRunningRef.current = false
    cancelAnimationFrame(rafRef.current)
    setState(prev => ({ ...prev, isRunning: false }))
    snapshot()
  }, [snapshot])

  const reset = useCallback(() => {
    isRunningRef.current = false
    cancelAnimationFrame(rafRef.current)
    logTimerRef.current = 0
    Passenger.resetCounter()
    Plane.resetCounter()
    loopRef.current = new EventLoop(toEngineConfig(configRef.current))
    const EQM: QueueMetrics = { Lq: 0, Wq: 0, rho: 0, utilization: 0 }
    setState({
      passengers:   [],
      planes:       [],
      metrics:      { Lq: 0, Wq: 0, rho: 0, throughput: 0, abandonRate: 0, littleL: 0 },
      queueMetrics: { checkin: EQM, security: EQM, boarding: [], arrived: 0, boarded: 0, abandoned: 0 },
      isRunning:    false,
      simTime:      0,
      crashes:      0,
      mechanical:   0,
      weather:      0,
    })
  }, [])

  const step = useCallback(() => {
    if (isRunningRef.current) return   // no permitir step mientras corre
    const loop = loopRef.current!
    loop.tick(DT * configRef.current.speed)
    snapshot()
  }, [snapshot])

  // ── Limpieza al desmontar ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      isRunningRef.current = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return { state, play, pause, reset, step }
}
