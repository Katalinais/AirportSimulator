// Experimentos Monte Carlo: corre N simulaciones en paralelo y devuelve distribución estadística de resultados

import jStat from 'jstat'

// ── jStat shim ────────────────────────────────────────────────────────────────

type JStatSub = {
  uniform:     { sample: (a: number, b: number) => number }
  exponential: { sample: (rate: number) => number }
}
const jstat = jStat as unknown as JStatSub

function uniformSample(a: number, b: number): number {
  try {
    if (typeof jstat?.uniform?.sample === 'function') return jstat.uniform.sample(a, b)
  } catch { /* fallback */ }
  return a + Math.random() * (b - a)
}

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface DelayResult {
  delayed: boolean
  minutes: number
}

export interface WeatherResult {
  active:         boolean
  slowdownFactor: number
}

export interface AccidentResult {
  occurred:        boolean
  station:         'checkin' | 'security' | 'boarding' | 'runway'
  blockedServers:  number
  durationMinutes: number
}

// ── Funciones puras ───────────────────────────────────────────────────────────

/**
 * Devuelve true con probabilidad `probability`.
 */
export function randomEvent(probability: number): boolean {
  if (probability <= 0) return false
  if (probability >= 1) return true
  return Math.random() < probability
}

/**
 * Determina si un vuelo sufre retraso y, de ser así, cuántos minutos (Uniform[15,120]).
 */
export function flightDelay(prob: number): DelayResult {
  const delayed = randomEvent(prob)
  return {
    delayed,
    minutes: delayed ? uniformSample(15, 120) : 0,
  }
}

/**
 * Determina si hay condición climática adversa y su factor de ralentización (Uniform[1.2,2.5]).
 */
export function weatherImpact(prob: number): WeatherResult {
  const active = randomEvent(prob)
  return {
    active,
    slowdownFactor: active ? uniformSample(1.2, 2.5) : 1.0,
  }
}

// Estaciones posibles para accidentes
const STATIONS: AccidentResult['station'][] = ['checkin', 'security', 'boarding', 'runway']

/**
 * Determina si ocurre un accidente (prob/10) y sus características.
 * La estación afectada es uniforme entre las 4 posibles.
 * Servidores bloqueados: 1 o 2; duración: Uniform[10,60] min.
 */
export function accident(prob: number): AccidentResult {
  const occurred = randomEvent(prob / 10)
  const station  = STATIONS[Math.floor(Math.random() * STATIONS.length)]
  return {
    occurred,
    station,
    blockedServers:  occurred ? (Math.random() < 0.5 ? 1 : 2) : 0,
    durationMinutes: occurred ? uniformSample(10, 60) : 0,
  }
}

/**
 * El pasajero abandona si su tiempo de espera supera
 * patience × factor (factor ~ Uniform[0.8, 1.2]).
 */
export function passengerAbandons(waitTime: number, patience: number): boolean {
  const factor = uniformSample(0.8, 1.2)
  return waitTime > patience * factor
}

// ── Curva de demanda ──────────────────────────────────────────────────────────

// Anclas de la curva: [hora, multiplicador]
const DEMAND_ANCHORS: [number, number][] = [
  [0,  0.4],
  [3,  0.3],   // valle nocturno
  [6,  1.8],   // pico mañana
  [9,  1.2],
  [12, 1.5],   // pico mediodía
  [14, 0.8],   // valle tarde
  [18, 2.0],   // pico noche
  [21, 1.3],
  [24, 0.4],
]

/**
 * Multiplicador de λ según la hora del día (0-24).
 * Interpolación lineal entre anclas conocidas.
 */
export function demandCurve(hour: number): number {
  const h = ((hour % 24) + 24) % 24   // normalizar a [0,24)

  for (let i = 0; i < DEMAND_ANCHORS.length - 1; i++) {
    const [h0, m0] = DEMAND_ANCHORS[i]
    const [h1, m1] = DEMAND_ANCHORS[i + 1]
    if (h >= h0 && h <= h1) {
      const t = (h - h0) / (h1 - h0)
      return m0 + t * (m1 - m0)
    }
  }
  return 1.0
}

// ── Test ───────────────────────────────────────────────────────────────────────

function runTest() {
  const N    = 10_000
  const PROB = 0.20

  console.log('\n══════════════════════════════════════════════════════')
  console.log('  Test Monte Carlo')
  console.log('══════════════════════════════════════════════════════')

  // ── Convergencia de flightDelay ───────────────────────────────────────────
  let delayed       = 0
  let sumMinutes    = 0
  let minDelay      = Infinity
  let maxDelay      = -Infinity

  for (let i = 0; i < N; i++) {
    const r = flightDelay(PROB)
    if (r.delayed) {
      delayed++
      sumMinutes += r.minutes
      if (r.minutes < minDelay) minDelay = r.minutes
      if (r.minutes > maxDelay) maxDelay = r.minutes
    }
  }

  const pctDelayed = delayed / N
  const meanDelay  = sumMinutes / delayed
  const errPct     = Math.abs(pctDelayed - PROB) / PROB * 100

  console.log(`\n── flightDelay  (N=${N.toLocaleString()}, prob=${PROB}) ───────────────`)
  console.log(`  Retrasos reales : ${delayed}  (${(pctDelayed * 100).toFixed(2)}%  esperado ${PROB * 100}%)`)
  console.log(`  Error relativo  : ${errPct.toFixed(2)}%  (≤5% esperado)`)
  console.log(`  Media minutos   : ${meanDelay.toFixed(2)}  (esperado 67.5)`)
  console.log(`  Rango           : [${minDelay.toFixed(1)}, ${maxDelay.toFixed(1)}]  (esperado [15, 120]`)
  console.log(`  ✓ Converge a 20%: ${errPct < 5}`)

  // ── weatherImpact ─────────────────────────────────────────────────────────
  let weatherActive = 0
  let sumSlowdown   = 0
  for (let i = 0; i < N; i++) {
    const r = weatherImpact(0.15)
    if (r.active) { weatherActive++; sumSlowdown += r.slowdownFactor }
  }
  const pctWeather   = weatherActive / N
  const meanSlowdown = sumSlowdown / weatherActive
  console.log(`\n── weatherImpact  (prob=0.15) ──────────────────────`)
  console.log(`  Activos   : ${(pctWeather * 100).toFixed(2)}%  (esperado 15%)`)
  console.log(`  Slowdown  : media ${meanSlowdown.toFixed(3)}  (esperado 1.85)`)

  // ── accident ──────────────────────────────────────────────────────────────
  let accidents = 0
  const stationCount: Record<string, number> = {}
  for (let i = 0; i < N; i++) {
    const r = accident(0.50)   // prob/10 = 0.05
    if (r.occurred) {
      accidents++
      stationCount[r.station] = (stationCount[r.station] ?? 0) + 1
    }
  }
  console.log(`\n── accident  (prob=0.50 → real 0.05) ──────────────`)
  console.log(`  Ocurridos : ${accidents}  (${(accidents / N * 100).toFixed(2)}%  esperado 5%)`)
  console.log(`  Estaciones: ${JSON.stringify(stationCount)}`)

  // ── passengerAbandons ─────────────────────────────────────────────────────
  const cases = [
    { wait: 3, patience: 5,  expectAbandons: false },
    { wait: 5, patience: 5,  expectAbandons: null  },   // zona gris
    { wait: 8, patience: 5,  expectAbandons: true  },
  ]
  console.log(`\n── passengerAbandons ────────────────────────────────`)
  for (const { wait, patience, expectAbandons } of cases) {
    let abandons = 0
    for (let i = 0; i < N; i++) {
      if (passengerAbandons(wait, patience)) abandons++
    }
    const pctAb = (abandons / N * 100).toFixed(1)
    const mark  = expectAbandons === true  ? (abandons / N > 0.7 ? '✓' : '✗')
                : expectAbandons === false ? (abandons / N < 0.3 ? '✓' : '✗')
                : '~'
    console.log(`  wait=${wait} patience=${patience}  → abandons ${pctAb}%  ${mark}`)
  }

  // ── demandCurve ───────────────────────────────────────────────────────────
  console.log(`\n── demandCurve  (horas clave) ──────────────────────`)
  const checkHours = [0, 3, 6, 9, 12, 14, 18, 21]
  for (const h of checkHours) {
    const m = demandCurve(h)
    console.log(`  ${String(h).padStart(2, '0')}:00  →  ×${m.toFixed(3)}`)
  }
  console.log(`  Pico 06:00 = 1.8: ${demandCurve(6)  === 1.8}`)
  console.log(`  Pico 12:00 = 1.5: ${demandCurve(12) === 1.5}`)
  console.log(`  Pico 18:00 = 2.0: ${demandCurve(18) === 2.0}`)
  console.log(`  Valle 03:00 = 0.3: ${demandCurve(3) === 0.3}`)
}

