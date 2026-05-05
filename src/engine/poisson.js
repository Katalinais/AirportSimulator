
export function exponential(lambda) {
  if (lambda <= 0) throw new Error('lambda debe ser mayor que 0')
  return -Math.log(1 - Math.random()) / lambda
}

export class PoissonGenerator {
  constructor(lambda, peakMultiplier = 2.0) {
    if (lambda <= 0) throw new Error('lambda debe ser mayor que 0')
    this._baseLambda = lambda
    this._lambda = lambda
    this._peakMultiplier = peakMultiplier
    this._isPeak = false
  }

  nextArrivalTime(currentTime) {
    return currentTime + exponential(this._lambda)
  }

  setPeak(active) {
    this._isPeak = active
    this._lambda = active
      ? this._baseLambda * this._peakMultiplier
      : this._baseLambda
  }

  setLambda(newLambda) {
    if (newLambda <= 0) throw new Error('lambda debe ser mayor que 0')
    this._baseLambda = newLambda
    this._lambda = this._isPeak
      ? newLambda * this._peakMultiplier
      : newLambda
  }

  get lambda() { return this._lambda }
  get isPeak() { return this._isPeak }
}