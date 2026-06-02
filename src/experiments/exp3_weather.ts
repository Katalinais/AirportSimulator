// Experimento 3 — Impacto del clima adverso en Wq y tasa de abandono Pa
// Varía weatherProb y mide cómo cambian las métricas del sistema.
// Uso: npx tsx src/experiments/exp3_weather.ts

import { EventLoop } from '../engine/eventLoop'
import { Passenger } from '../engine/passenger'
import { Plane }     from '../engine/plane'

// Parámetros base (sistema estable, ρ ≈ 0.5)
const LAMBDA     = 6
const C1         = 3
const MU1        = 4
const C2         = 2
const MU2        = 3
const SIM_MIN    = 400   // suficiente para que ocurran varios eventos de clima
const DT         = 1.0
const REP        = 8     // más repeticiones porque los eventos climáticos son raros

const WEATHER_PROBS = [0, 0.1, 0.3, 0.5]

// ── Una corrida del sistema completo ──────────────────────────────────────────

interface RunResult {
  Wq:      number   // Wq check-in + seguridad
  Pa:      number   // fracción de abandonos
  weather: number   // eventos climáticos que efectivamente ocurrieron
}

function runScenario(weatherProb: number): RunResult {
  Passenger.resetCounter()
  Plane.resetCounter()

  const loop = new EventLoop({
    lambda:            LAMBDA,
    peakHour:          false,
    c1:                C1,
    mu1:               MU1,
    capacity1:         200,
    c2:                C2,
    mu2:               MU2,
    sigma2:            0.15,
    gates:             3,
    delayProb:         0,        // aislamos solo el efecto del clima
    patienceThreshold: 15,
    speed:             1,
    mechanicalProb:    0,
    crashProb:         0,
    weatherProb,
  })

  for (let t = 0; t < SIM_MIN; t++) loop.tick(DT)

  const state   = loop.getState()
  const Wq      = state.metrics.checkin.Wq + state.metrics.security.Wq
  const arrived = loop.totalArrived
  const Pa      = arrived > 0 ? loop.totalAbandoned / arrived : 0

  return { Wq, Pa, weather: loop.totalWeather }
}

// ── Ejecutar ──────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════════════════')
console.log('  Experimento 3 — Impacto del clima adverso')
console.log(`  λ=${LAMBDA}  c₁=${C1}  μ₁=${MU1}  c₂=${C2}  μ₂=${MU2}  T=${SIM_MIN} min  rep=${REP}`)
console.log('══════════════════════════════════════════════════════════════════════\n')
console.log('p_w   Wq (min)   ΔWq vs base    Pa (%)    ΔPa vs base   Eventos clima')
console.log('────  ─────────  ─────────────  ────────  ────────────  ─────────────')

let baseWq = 0, basePa = 0

for (const pw of WEATHER_PROBS) {
  let sumWq = 0, sumPa = 0, sumW = 0
  for (let r = 0; r < REP; r++) {
    const res = runScenario(pw)
    sumWq += res.Wq
    sumPa += res.Pa
    sumW  += res.weather
  }
  const Wq      = sumWq / REP
  const Pa      = sumPa / REP
  const weather = sumW  / REP

  if (pw === 0) { baseWq = Wq; basePa = Pa }

  const dWq = pw === 0
    ? '--           '
    : ((Wq - baseWq) / (baseWq || 1) * 100).toFixed(1).padStart(6) + '%       '
  const dPa = pw === 0
    ? '--          '
    : ((Pa - basePa) / (basePa || 1e-6) * 100).toFixed(1).padStart(6) + '%      '

  console.log(
    `${pw.toFixed(1).padEnd(4)}  ` +
    `${Wq.toFixed(4).padEnd(9)}  ` +
    `${dWq.padEnd(13)}  ` +
    `${(Pa * 100).toFixed(2).padEnd(8)}  ` +
    `${dPa.padEnd(12)}  ` +
    `${weather.toFixed(1)}`,
  )
}

console.log('\n→ Hipótesis: Pa crece más que proporcionalmente con p_w')
console.log('  (efecto cascada: retrasos de vuelo → espera en puerta → más abandonos)')
