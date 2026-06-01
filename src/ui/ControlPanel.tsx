// Panel lateral de controles: slider de pasajeros, botones de velocidad (0.5×–3×), pausa y reinicio de simulación

import { SimConfig, SigmaLevel } from '../hooks/useSimulation'

interface Props {
  config:               SimConfig
  isRunning:            boolean
  onConfigChange:       (p: Partial<SimConfig>) => void
  onPlay:               () => void
  onPause:              () => void
  onReset:              () => void
  onStep:               () => void
  onTriggerMechanical:  () => void
  onTriggerCrash:       () => void
}

function Slider({
  label, value, min, max, step = 1, unit = '', decimals = 0,
  onChange,
}: {
  label: string; value: number; min: number; max: number
  step?: number; unit?: string; decimals?: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="font-mono text-gray-200">{value.toFixed(decimals)}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 accent-blue-500 cursor-pointer bg-gray-800 rounded"
      />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-2">
        {title}
      </h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

const SPEEDS = [0.5, 1, 2, 3, 5] as const

export function ControlPanel({ config, isRunning, onConfigChange, onPlay, onPause, onReset, onStep, onTriggerMechanical, onTriggerCrash }: Props) {
  return (
    <aside className="w-72 shrink-0 flex flex-col gap-5 p-4 bg-gray-900 border-r border-gray-800 overflow-y-auto">

      <Section title="Llegadas">
        <Slider label="λ llegadas" value={config.lambda} min={1} max={20} step={0.5} unit="/min" decimals={1}
          onChange={v => onConfigChange({ lambda: v })} />
        <Slider label="VIP %" value={config.vipPercent} min={0} max={40} unit="%" onChange={v => onConfigChange({ vipPercent: v })} />
      </Section>

      <Section title="Check-in">
        <Slider label="Servidores c₁" value={config.c1} min={1} max={10}
          onChange={v => onConfigChange({ c1: v })} />
        <Slider label="Tasa μ₁" value={config.mu1} min={0.5} max={8} step={0.5} unit="/min" decimals={1}
          onChange={v => onConfigChange({ mu1: v })} />
        <Slider label="Cap. sala" value={config.capacity1} min={10} max={200} step={10}
          onChange={v => onConfigChange({ capacity1: v })} />
      </Section>

      <Section title="Seguridad">
        <Slider label="Servidores c₂" value={config.c2} min={1} max={8}
          onChange={v => onConfigChange({ c2: v })} />
        <Slider label="Tasa μ₂" value={config.mu2} min={0.5} max={8} step={0.5} unit="/min" decimals={1}
          onChange={v => onConfigChange({ mu2: v })} />
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-gray-400">Varianza σ</span>
          <div className="flex gap-1">
            {(['low', 'medium', 'high'] as SigmaLevel[]).map(l => (
              <button key={l} onClick={() => onConfigChange({ sigmaLevel: l })}
                className={`flex-1 text-xs py-1 rounded transition-colors ${
                  config.sigmaLevel === l
                    ? 'bg-blue-700 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}>
                {l === 'low' ? 'Baja' : l === 'medium' ? 'Media' : 'Alta'}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Vuelos">
        <Slider label="Puertas" value={config.gates} min={1} max={4}
          onChange={v => onConfigChange({ gates: v })} />
        <Slider label="Prob. retraso" value={config.delayProb} min={0} max={0.5} step={0.05} decimals={2}
          onChange={v => onConfigChange({ delayProb: v })} />
        <Slider label="Paciencia máx." value={config.patienceThreshold} min={3} max={20} unit=" min"
          onChange={v => onConfigChange({ patienceThreshold: v })} />
      </Section>

      {/* Velocidad */}
      <section>
        <h3 className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-2">Velocidad</h3>
        <div className="flex gap-1">
          {SPEEDS.map(s => (
            <button key={s} onClick={() => onConfigChange({ speed: s })}
              className={`flex-1 text-xs py-1.5 rounded font-mono transition-colors ${
                config.speed === s
                  ? 'bg-indigo-700 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}>
              {s}×
            </button>
          ))}
        </div>
      </section>

      {/* Incidentes */}
      <section>
        <h3 className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-2">Incidentes</h3>
        <div className="flex gap-1">
          <button
            onClick={onTriggerMechanical}
            title="Forzar falla mecánica en un avión aleatorio"
            className="flex-1 py-1.5 rounded text-xs bg-orange-950 hover:bg-orange-900 text-orange-300 transition-colors font-mono"
          >
            ⚙ Mecánica
          </button>
          <button
            onClick={onTriggerCrash}
            title="Forzar colisión en un avión aleatorio"
            className="flex-1 py-1.5 rounded text-xs bg-red-950 hover:bg-red-900 text-red-300 transition-colors font-mono"
          >
            💥 Colisión
          </button>
        </div>
      </section>

      {/* Acciones */}
      <section className="flex flex-col gap-2 mt-auto pt-4 border-t border-gray-800">
        <button
          onClick={isRunning ? onPause : onPlay}
          className={`w-full py-2 rounded font-semibold text-sm transition-colors ${
            isRunning
              ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}>
          {isRunning ? '⏸  Pausar' : '▶  Iniciar'}
        </button>
        <div className="flex gap-2">
          <button onClick={onStep} disabled={isRunning}
            className="flex-1 py-1.5 rounded text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-30 transition-colors">
            ⊡ Paso
          </button>
          <button onClick={onReset}
            className="flex-1 py-1.5 rounded text-sm bg-red-950 hover:bg-red-900 text-red-300 transition-colors">
            ↺ Reset
          </button>
        </div>
      </section>

    </aside>
  )
}
