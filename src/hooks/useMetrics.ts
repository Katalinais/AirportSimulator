// Hook de métricas M/M/c: calcula Lq, Wq, ρ y throughput a partir del estado de simulación cada segundo

import { useState, useEffect, useRef } from 'react'
import { SimState }    from './useSimulation'
import { MetricPoint } from '../engine/metrics'

const MAX_HISTORY = 60   // últimos 60 puntos (1 por sim-minuto)

export function useMetrics(state: SimState): MetricPoint[] {
  const [history, setHistory] = useState<MetricPoint[]>([])
  const prevFloor = useRef(-1)

  useEffect(() => {
    const floor = Math.floor(state.simTime)
    if (floor <= prevFloor.current) return
    prevFloor.current = floor

    setHistory(prev => [
      ...prev.slice(-(MAX_HISTORY - 1)),
      {
        simTime:     state.simTime,
        Lq:          state.metrics.Lq,
        Wq:          state.metrics.Wq,
        rho:         state.metrics.rho,
        throughput:  state.metrics.throughput,
        abandonRate: state.metrics.abandonRate,
      },
    ])
  }, [state.simTime, state.metrics])

  return history
}
