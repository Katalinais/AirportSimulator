// Tarjeta individual de métrica: label, valor numérico grande, subtexto y color condicional por umbral de alerta

import { RhoLevel } from '../engine/metrics'

interface Props {
  label:    string
  value:    string
  unit?:    string
  sub?:     string
  level?:   RhoLevel | 'neutral'
}

const LEVEL_COLOR: Record<string, string> = {
  ok:      'text-emerald-400',
  warn:    'text-yellow-400',
  danger:  'text-red-400',
  neutral: 'text-blue-300',
}

const LEVEL_BG: Record<string, string> = {
  ok:      'border-emerald-900/40',
  warn:    'border-yellow-900/40',
  danger:  'border-red-900/40',
  neutral: 'border-gray-700',
}

export function MetricsCard({ label, value, unit, sub, level = 'neutral' }: Props) {
  return (
    <div className={`rounded-lg bg-gray-900 border p-3 ${LEVEL_BG[level]}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-2xl font-mono font-semibold leading-none ${LEVEL_COLOR[level]}`}>
        {value}
        {unit && <span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>}
      </p>
      {sub && <p className="text-xs text-gray-600 mt-1">{sub}</p>}
    </div>
  )
}
