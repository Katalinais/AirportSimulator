// Generador de llegadas Poisson: tiempos entre eventos con distribución exponencial vía jStat

import jStat from 'jstat'

// jStat se exporta como función con métodos estáticos de distribuciones
// El .d.ts oficial no tipifica todos los métodos; se acota aquí el subconjunto usado
type JStatExponential = {
  sample: (rate: number) => number
  inv:    (p: number, rate: number) => number
  mean:   (rate: number) => number
}
type JStatSub = { exponential: JStatExponential }
const jstat = jStat as unknown as JStatSub

// ── Función auxiliar ───────────────────────────────────────────────────────────

/**
 * Muestrea una variable aleatoria exponencial con tasa `lambda`.
 * Usa jStat cuando está disponible; de lo contrario aplica la fórmula analítica.
 * Fórmula: –ln(U) / λ   donde U ~ Uniform(0,1)
 */
export function exponentialSample(lambda: number): number {
  if (lambda <= 0) throw new Error(`lambda debe ser > 0 (recibido: ${lambda})`)
  try {
    if (typeof jstat?.exponential?.sample === 'function') {
      return jstat.exponential.sample(lambda)
    }
  } catch { /* jStat no disponible → fallback */ }
  return -Math.log(Math.random()) / lambda
}

// ── Clase PoissonGenerator ────────────────────────────────────────────────────

export class PoissonGenerator {
  #baseLambda: number
  #effectiveLambda: number
  readonly #peakMultiplier: number
  #isPeak: boolean

  constructor(lambda: number, peakMultiplier = 2.0) {
    if (lambda <= 0)        throw new Error('lambda debe ser > 0')
    if (peakMultiplier <= 0) throw new Error('peakMultiplier debe ser > 0')
    this.#baseLambda      = lambda
    this.#effectiveLambda = lambda
    this.#peakMultiplier  = peakMultiplier
    this.#isPeak          = false
  }

  // Devuelve el instante de la próxima llegada a partir de currentTime
  nextArrivalTime(currentTime: number): number {
    return currentTime + exponentialSample(this.#effectiveLambda)
  }

  // Activa o desactiva el modo pico; en pico λ se multiplica por peakMultiplier
  setPeak(active: boolean): void {
    this.#isPeak          = active
    this.#effectiveLambda = active
      ? this.#baseLambda * this.#peakMultiplier
      : this.#baseLambda
  }

  // Reemplaza el λ base y recalcula el efectivo según el modo actual
  setLambda(lambda: number): void {
    if (lambda <= 0) throw new Error('lambda debe ser > 0')
    this.#baseLambda      = lambda
    this.#effectiveLambda = this.#isPeak
      ? lambda * this.#peakMultiplier
      : lambda
  }

  // λ actualmente en uso (base o base × peakMultiplier)
  getLambda(): number {
    return this.#effectiveLambda
  }

  get isPeak():    boolean { return this.#isPeak }
  get baseLambda(): number { return this.#baseLambda }

  // Desactiva el pico y vuelve al λ base
  reset(): void {
    this.#isPeak          = false
    this.#effectiveLambda = this.#baseLambda
  }
}

// ── Test ───────────────────────────────────────────────────────────────────────

function sampleIntervals(gen: PoissonGenerator, n: number): number[] {
  const intervals: number[] = []
  let t = 0
  for (let i = 0; i < n; i++) {
    const next = gen.nextArrivalTime(t)
    intervals.push(next - t)
    t = next
  }
  return intervals
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function runTest() {
  const LAMBDA   = 10
  const N_SHOW   = 20    // llegadas a mostrar
  const N_STAT   = 2000  // muestra grande para validación estadística

  console.log('\n══════════════════════════════════════════════════════')
  console.log('  Test PoissonGenerator')
  console.log('══════════════════════════════════════════════════════\n')

  // ── Verificar que jStat está en uso ───────────────────────────────────────
  const usingJStat = typeof jstat?.exponential?.sample === 'function'
  console.log(`jStat disponible: ${usingJStat}  (${usingJStat ? 'usando jStat' : 'usando fallback analítico'})\n`)

  // ── 20 tiempos de llegada con λ=10 ────────────────────────────────────────
  const gen = new PoissonGenerator(LAMBDA)
  const intervals20 = sampleIntervals(gen, N_SHOW)

  // Tiempos acumulados
  const times: number[] = []
  let acc = 0
  for (const iv of intervals20) { acc += iv; times.push(acc) }

  console.log(`λ = ${gen.getLambda()}  |  Intervalo esperado = ${(1 / LAMBDA).toFixed(4)} min`)
  console.log(`\n${N_SHOW} tiempos de llegada:`)
  console.log('  ' + times.map(t => t.toFixed(3)).join('  '))
  console.log(`\n${N_SHOW} intervalos entre llegadas:`)
  console.log('  ' + intervals20.map(i => i.toFixed(3)).join('  '))
  console.log(`\nIntervalo promedio (${N_SHOW} muestras): ${avg(intervals20).toFixed(4)}  (esperado ≈ 0.1000)`)

  // ── Validación estadística con N=2000 ─────────────────────────────────────
  gen.reset()
  const statNormal = sampleIntervals(gen, N_STAT)
  const meanNormal = avg(statNormal)

  gen.setPeak(true)
  console.log(`\n── setPeak(true) → λ = ${gen.getLambda()} (×${LAMBDA} × ${gen.isPeak ? gen.getLambda() / gen.baseLambda : 1}) ──`)
  const statPeak = sampleIntervals(gen, N_STAT)
  const meanPeak = avg(statPeak)

  console.log(`\nValidación estadística (N = ${N_STAT}):`)
  console.log(`  Intervalo medio normal : ${meanNormal.toFixed(5)}  (esperado 0.10000)`)
  console.log(`  Intervalo medio peak   : ${meanPeak.toFixed(5)}  (esperado 0.05000)`)
  console.log(`  Ratio normal / peak    : ${(meanNormal / meanPeak).toFixed(3)}×  (esperado 2.000×)`)
  console.log(`  ✓ Peak duplica la tasa: ${(meanNormal / meanPeak) > 1.85 && (meanNormal / meanPeak) < 2.15}`)

  // ── Verificar setLambda y reset ───────────────────────────────────────────
  console.log('\n── setLambda / reset ──')
  gen.reset()
  console.log(`  Tras reset()           → λ = ${gen.getLambda()}  (esperado ${LAMBDA})`)
  gen.setLambda(5)
  console.log(`  setLambda(5) normal    → λ = ${gen.getLambda()}  (esperado 5)`)
  gen.setPeak(true)
  console.log(`  setPeak(true)          → λ = ${gen.getLambda()}  (esperado 10)`)
  gen.setLambda(4)
  console.log(`  setLambda(4) en peak   → λ = ${gen.getLambda()}  (esperado 8)`)
  gen.reset()
  console.log(`  reset()                → λ = ${gen.getLambda()}  (esperado 4)`)
}

