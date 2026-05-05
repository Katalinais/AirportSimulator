export const STATES = [
  'arriving',
  'checkin_queue',
  'checkin_service',
  'security_queue',
  'security_service',
  'waiting_gate',
  'boarding_queue',
  'boarding_service',
  'boarded',
  'abandoned',
]

const QUEUE_STATES = new Set([
  'checkin_queue',
  'security_queue',
  'boarding_queue',
])

let _nextId = 1

export class Passenger {
  constructor(type = 'standard', arrivedAt = 0, patience = 20) {
    this.id = _nextId++
    this.type = type
    this.state = 'arriving'
    this.arrivedAt = arrivedAt
    this.serviceStartAt = null
    this.serviceDoneAt = null
    this.patience = patience
    this.position = { x: 0, y: 0, z: 0 }
    this.currentStation = null

    this._queueEntries = []
    this._activeQueueEntry = null
  }

  setState(newState, currentTime) {
    if (!STATES.includes(newState)) {
      throw new Error(`Estado inválido: "${newState}"`)
    }

    if (this._activeQueueEntry !== null) {
      this._activeQueueEntry.leftAt = currentTime
      this._queueEntries.push(this._activeQueueEntry)
      this._activeQueueEntry = null
    }

    this.state = newState

    if (QUEUE_STATES.has(newState)) {
      this._activeQueueEntry = { state: newState, enteredAt: currentTime, leftAt: null }
    }

    if (newState === 'checkin_service' ||
        newState === 'security_service' ||
        newState === 'boarding_service') {
      this.serviceStartAt = currentTime
    }

    if (newState === 'boarded' || newState === 'abandoned') {
      this.serviceDoneAt = currentTime
    }
  }

  isPatient(currentTime) {
    const entry = this._activeQueueEntry
    if (entry === null) return true
    return (currentTime - entry.enteredAt) < this.patience
  }

  getTotalWaitTime() {
    let total = 0
    for (const entry of this._queueEntries) {
      if (entry.leftAt !== null) {
        total += entry.leftAt - entry.enteredAt
      }
    }
    return total
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      state: this.state,
      arrivedAt: this.arrivedAt,
      serviceStartAt: this.serviceStartAt,
      serviceDoneAt: this.serviceDoneAt,
      patience: this.patience,
      position: { ...this.position },
      currentStation: this.currentStation,
      totalWaitTime: this.getTotalWaitTime(),
      queueHistory: this._queueEntries.map(e => ({ ...e })),
    }
  }
}

export function resetPassengerCounter() {
  _nextId = 1
}
