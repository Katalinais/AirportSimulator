// Botones de toggle para activar módulos opcionales: Monte Carlo, Agente neural, modo Peak y estadísticas avanzadas

import { SimConfig } from '../hooks/useSimulation'

interface Props {
  config:         SimConfig
  onConfigChange: (p: Partial<SimConfig>) => void
}

interface ToggleItem {
  key:    keyof Pick<SimConfig, 'peakHour' | 'abmActive'>
  label:  string
  active: string   // Tailwind classes when on
}

const TOGGLES: ToggleItem[] = [
  { key: 'peakHour',  label: '⚡ Peak',  active: 'bg-orange-700 text-white border-orange-600' },
  { key: 'abmActive', label: '🤖 ABM',   active: 'bg-violet-700 text-white border-violet-600' },
]

export function ToggleModules({ config, onConfigChange }: Props) {
  return (
    <div className="flex gap-2 items-center">
      {TOGGLES.map(({ key, label, active }) => {
        const on = config[key] as boolean
        return (
          <button
            key={key}
            onClick={() => onConfigChange({ [key]: !on })}
            className={`px-3 py-1 rounded border text-xs font-medium transition-colors ${
              on
                ? active
                : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
            }`}>
            {label}
          </button>
        )
      })}
    </div>
  )
}
