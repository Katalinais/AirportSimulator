// Panel completo de métricas del simulador.
// Se activa con el botón "📊" en el header — no es la pantalla principal.

import type { SimState, SimConfig, QueueMetrics } from '../hooks/useSimulation'
import { fmtSimTime }                              from '../engine/metrics'
import {
  flightDelay, weatherImpact, accident, demandCurve,
} from '../engine/montecarlo'

// ── Erlang C (M/M/c) ─────────────────────────────────────────────────────────

function erlangC(lambda: number, mu: number, c: number): number {
  const rho = lambda / (c * mu)
  if (rho >= 1) return 1
  let sumFact = 1, partialSum = 1
  for (let n = 1; n < c; n++) {
    sumFact *= n
    partialSum += Math.pow(c * rho, n) / sumFact
  }
  let factC = sumFact * c
  const num = Math.pow(c * rho, c) / factC / (1 - rho)
  return num / (partialSum + num)
}

function wqErlang(lambda: number, mu: number, c: number): number {
  const C   = erlangC(lambda, mu, c)
  const rho = lambda / (c * mu)
  if (rho >= 1) return Infinity
  return C / (c * mu * (1 - rho))
}

// ── Helpers de formato ────────────────────────────────────────────────────────

const f2 = (n: number) => isFinite(n) ? n.toFixed(2) : '∞'
const f3 = (n: number) => isFinite(n) ? n.toFixed(3) : '∞'
const pct = (n: number) => (n * 100).toFixed(1) + '%'

// ── Subcomponentes ────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#1c2130', border: '1px solid #313a52',
      borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: '#8b94ab', letterSpacing: 1 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
      <span style={{ color: '#8b94ab', fontSize: 11 }}>{label}</span>
      <span style={{ fontFamily: "'VT323', monospace", fontSize: 22, color: accent ?? '#e7ecf6', lineHeight: 1 }}>
        {value}
      </span>
    </div>
  )
}

function QCard({ label, qm, lambda }: { label: string; qm: QueueMetrics; lambda?: number }) {
  const rhoColor = qm.rho > 0.9 ? '#f87171' : qm.rho > 0.7 ? '#fbbf24' : '#4ade80'
  return (
    <Card title={label}>
      <Row label="ρ utilización"   value={f3(qm.rho)}         accent={rhoColor} />
      <Row label="Lq (en cola)"    value={f2(qm.Lq) + ' pax'} />
      <Row label="Wq (espera)"     value={f2(qm.Wq) + ' min'} />
      <Row label="Util. servidores"value={pct(qm.utilization)} />
      {lambda !== undefined && (
        <Row label="Wq teórico (Erlang C)"
          value={f2(wqErlang(lambda, 1, 1)) + ' min'}
          accent="#93c5fd"
        />
      )}
    </Card>
  )
}

function SectionTitle({ text }: { text: string }) {
  return (
    <div style={{
      fontFamily: "'Press Start 2P', monospace", fontSize: 9,
      color: '#ffce4d', letterSpacing: 1.5, paddingTop: 8, paddingBottom: 2,
      borderBottom: '1px solid #313a52',
    }}>
      {text}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  state:  SimState
  config: SimConfig
  onClose: () => void
}

export function MetricsDashboard({ state, config, onClose }: Props) {
  const { queueMetrics: qm, metrics: m, planes, passengers, simTime } = state
  const elapsed = Math.max(simTime, 0.001)

  // Cómputos derivados
  const lambdaEff    = qm.arrived  / elapsed
  const inSystem     = passengers.filter(p => !['boarded', 'abandoned'].includes(p.state)).length
  const abandoned    = qm.abandoned
  const boarded      = qm.boarded

  // Monte Carlo con config actual (muestras representativas)
  const mcDelay      = flightDelay(config.delayProb)
  const mcWeather    = weatherImpact(config.weatherProb)
  const mcAccident   = accident(config.crashProb)
  const demandHours  = [0, 3, 6, 9, 12, 14, 18, 21].map(h => ({ h, mult: demandCurve(h) }))

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(10,12,22,0.92)',
      backdropFilter: 'blur(8px)',
      overflowY: 'auto',
      fontFamily: "'DM Mono', ui-monospace, monospace",
      color: '#e7ecf6',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 60px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 13, color: '#ffce4d' }}>
              PANEL DE MÉTRICAS
            </span>
            <span style={{ fontFamily: "'VT323', monospace", fontSize: 20, color: '#8b94ab' }}>
              t = {fmtSimTime(simTime)}
            </span>
          </div>
          <button onClick={onClose} style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 9,
            background: '#2a1f00', border: '2px solid #ffce4d', borderRadius: 7,
            color: '#ffce4d', padding: '8px 14px', cursor: 'pointer',
          }}>
            ✕ CERRAR
          </button>
        </div>

        {/* ── RESUMEN GLOBAL ───────────────────────────────────────────────── */}
        <SectionTitle text="▸ RESUMEN GLOBAL" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 10 }}>
          <Card title="TIEMPO SIM.">
            <Row label="Transcurrido"  value={fmtSimTime(simTime)} />
            <Row label="λ efectiva"    value={f2(lambdaEff) + '/min'} />
          </Card>
          <Card title="FLUJO">
            <Row label="Llegados"      value={String(qm.arrived)} />
            <Row label="Abordados"     value={String(boarded)} accent="#4ade80" />
            <Row label="Abandonados"   value={String(abandoned)} accent="#f87171" />
          </Card>
          <Card title="SISTEMA ACTUAL">
            <Row label="En sistema"    value={String(inSystem)} />
            <Row label="Throughput"    value={f2(m.throughput) + '/min'} />
            <Row label="Tasa abandono" value={pct(m.abandonRate)}
              accent={m.abandonRate > 0.15 ? '#f87171' : m.abandonRate > 0.05 ? '#fbbf24' : '#4ade80'} />
          </Card>
          <Card title="LEY DE LITTLE">
            <Row label="L = λ·Wq"     value={f2(m.littleL) + ' pax'} />
            <Row label="Wq total"      value={f2(m.Wq) + ' min'} />
            <Row label="ρ promedio"    value={f3(m.rho)}
              accent={m.rho > 0.9 ? '#f87171' : m.rho > 0.7 ? '#fbbf24' : '#4ade80'} />
          </Card>
        </div>

        {/* ── TEORÍA DE COLAS ──────────────────────────────────────────────── */}
        <SectionTitle text="▸ TEORÍA DE COLAS — M/M/c · M/G/c" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 10 }}>

          <Card title={`CHECK-IN  M/M/${config.c1}  (c₁=${config.c1}, μ₁=${config.mu1}/min)`}>
            <Row label="ρ simulado"    value={f3(qm.checkin.rho)}
              accent={qm.checkin.rho > 0.9 ? '#f87171' : qm.checkin.rho > 0.7 ? '#fbbf24' : '#4ade80'} />
            <Row label="Lq simulado"   value={f2(qm.checkin.Lq) + ' pax'} />
            <Row label="Wq simulado"   value={f2(qm.checkin.Wq) + ' min'} />
            <Row label="Util. srvs."   value={pct(qm.checkin.utilization)} />
            <div style={{ borderTop: '1px dashed #313a52', marginTop: 4, paddingTop: 4 }}>
              <Row label="ρ teórico (λ/c₁μ₁)"
                value={f3(lambdaEff / (config.c1 * config.mu1))} accent="#93c5fd" />
              <Row label="Wq Erlang C"
                value={f2(wqErlang(lambdaEff, config.mu1, config.c1)) + ' min'} accent="#93c5fd" />
              <Row label="C(c,ρ)"
                value={f3(erlangC(lambdaEff, config.mu1, config.c1))} accent="#93c5fd" />
            </div>
          </Card>

          <Card title={`SEGURIDAD  M/G/${config.c2}  (c₂=${config.c2}, μ₂=${config.mu2}/min)`}>
            <Row label="ρ simulado"    value={f3(qm.security.rho)}
              accent={qm.security.rho > 0.9 ? '#f87171' : qm.security.rho > 0.7 ? '#fbbf24' : '#4ade80'} />
            <Row label="Lq simulado"   value={f2(qm.security.Lq) + ' pax'} />
            <Row label="Wq simulado"   value={f2(qm.security.Wq) + ' min'} />
            <Row label="Util. srvs."   value={pct(qm.security.utilization)} />
            <div style={{ borderTop: '1px dashed #313a52', marginTop: 4, paddingTop: 4 }}>
              <Row label="ρ teórico (λ/c₂μ₂)"
                value={f3(lambdaEff / (config.c2 * config.mu2))} accent="#93c5fd" />
              <Row label="σ nivel"     value={config.sigmaLevel} accent="#93c5fd" />
              <Row label="Wq Erlang C"
                value={f2(wqErlang(lambdaEff, config.mu2, config.c2)) + ' min'} accent="#93c5fd" />
            </div>
          </Card>

          <Card title={`EMBARQUE  M/M/2  (${config.gates} puertas, 2 srvs. c/u)`}>
            {qm.boarding.map((bm, i) => (
              <div key={i} style={{ borderBottom: i < qm.boarding.length - 1 ? '1px dashed #313a52' : 'none', paddingBottom: 4, marginBottom: 4 }}>
                <div style={{ color: '#b07cff', fontSize: 10, marginBottom: 2 }}>Puerta {i + 1}</div>
                <Row label="ρ"   value={f3(bm.rho)}
                  accent={bm.rho > 0.9 ? '#f87171' : bm.rho > 0.7 ? '#fbbf24' : '#4ade80'} />
                <Row label="Lq"  value={f2(bm.Lq) + ' pax'} />
                <Row label="Wq"  value={f2(bm.Wq) + ' min'} />
              </div>
            ))}
          </Card>
        </div>

        {/* ── VUELOS ───────────────────────────────────────────────────────── */}
        <SectionTitle text="▸ VUELOS ACTIVOS" />
        <div style={{ marginTop: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: '#8b94ab', textAlign: 'left', fontSize: 10,
                fontFamily: "'Press Start 2P', monospace" }}>
                {['ID', 'PUERTA', 'ESTADO', 'PASAJEROS', 'CAPACIDAD', 'RETRASO', 'PROG. SALIDA'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', borderBottom: '1px solid #313a52' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {planes.map(pl => {
                const stateColor: Record<string, string> = {
                  boarding: '#4ade80', at_gate: '#93c5fd', delayed: '#fbbf24',
                  taxiing_out: '#fbbf24', takeoff: '#f97316', airborne: '#60a5fa',
                  crashed: '#f87171', mechanical: '#fb923c', cancelled: '#9ca3af',
                  approaching: '#a78bfa', landing: '#a78bfa', taxiing_in: '#a78bfa',
                }
                return (
                  <tr key={pl.id} style={{ borderBottom: '1px solid #1e2637' }}>
                    <td style={{ padding: '5px 10px', fontFamily: "'VT323', monospace", fontSize: 18, color: '#8b94ab' }}>#{pl.id}</td>
                    <td style={{ padding: '5px 10px' }}>P{pl.gateId + 1}</td>
                    <td style={{ padding: '5px 10px', color: stateColor[pl.state] ?? '#e7ecf6', textTransform: 'uppercase', fontSize: 11 }}>
                      {pl.state}
                    </td>
                    <td style={{ padding: '5px 10px', fontFamily: "'VT323', monospace", fontSize: 20, color: '#4ade80' }}>
                      {pl.passengersBoarded}
                    </td>
                    <td style={{ padding: '5px 10px', color: '#8b94ab' }}>{pl.capacity}</td>
                    <td style={{ padding: '5px 10px', color: pl.delayMinutes > 0 ? '#fbbf24' : '#8b94ab' }}>
                      {pl.delayMinutes > 0 ? `+${pl.delayMinutes.toFixed(0)}m` : '—'}
                    </td>
                    <td style={{ padding: '5px 10px', fontFamily: "'VT323', monospace", fontSize: 16, color: '#8b94ab' }}>
                      {fmtSimTime(pl.scheduledDeparture)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── INCIDENTES ────────────────────────────────────────────────────── */}
        <SectionTitle text="▸ INCIDENTES" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 10 }}>
          <Card title="COLISIONES">
            <Row label="Total"          value={String(state.crashes)} accent={state.crashes > 0 ? '#f87171' : '#4ade80'} />
            <Row label="P(colisión)"    value={pct(config.crashProb)} />
          </Card>
          <Card title="FALLAS MECÁNICAS">
            <Row label="Total"          value={String(state.mechanical)} accent={state.mechanical > 0 ? '#fb923c' : '#4ade80'} />
            <Row label="P(falla)"       value={pct(config.mechanicalProb)} />
          </Card>
          <Card title="CLIMA ADVERSO">
            <Row label="Total"          value={String(state.weather)} accent={state.weather > 0 ? '#93c5fd' : '#4ade80'} />
            <Row label="P(clima)"       value={pct(config.weatherProb)} />
          </Card>
        </div>

        {/* ── MONTE CARLO ──────────────────────────────────────────────────── */}
        <SectionTitle text="▸ MONTE CARLO — muestras con parámetros actuales" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 10 }}>

          <Card title="flightDelay( prob )">
            <Row label="P(retraso)"   value={pct(config.delayProb)} />
            <Row label="Esta muestra" value={mcDelay.delayed ? `${mcDelay.minutes.toFixed(0)} min` : 'Sin retraso'}
              accent={mcDelay.delayed ? '#fbbf24' : '#4ade80'} />
            <Row label="Rango"        value="Uniform[15, 120] min" />
            <Row label="Media teórica"value="67.5 min" accent="#93c5fd" />
          </Card>

          <Card title="weatherImpact( prob )">
            <Row label="P(clima)"     value={pct(config.weatherProb)} />
            <Row label="Esta muestra" value={mcWeather.active ? `×${mcWeather.slowdownFactor.toFixed(2)} lentitud` : 'Sin efecto'}
              accent={mcWeather.active ? '#93c5fd' : '#4ade80'} />
            <Row label="Rango factor" value="Uniform[1.2, 2.5]" />
            <Row label="Media teórica"value="×1.85" accent="#93c5fd" />
          </Card>

          <Card title="accident( prob )">
            <Row label="P(accidente)" value={pct(config.crashProb / 10)} />
            <Row label="Esta muestra" value={mcAccident.occurred ? `${mcAccident.station} · ${mcAccident.durationMinutes.toFixed(0)}m` : 'Sin accidente'}
              accent={mcAccident.occurred ? '#f87171' : '#4ade80'} />
            <Row label="Srvs. afect." value={mcAccident.occurred ? String(mcAccident.blockedServers) : '0'} />
          </Card>

          <Card title="demandCurve( hora ) — multiplicador λ">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
              {demandHours.map(({ h, mult }) => (
                <div key={h} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'VT323', monospace", fontSize: 22,
                    color: mult >= 1.8 ? '#f87171' : mult >= 1.2 ? '#fbbf24' : '#4ade80' }}>
                    ×{mult.toFixed(1)}
                  </div>
                  <div style={{ fontSize: 10, color: '#8b94ab' }}>{String(h).padStart(2,'0')}h</div>
                </div>
              ))}
            </div>
          </Card>
        </div>

      </div>
    </div>
  )
}
