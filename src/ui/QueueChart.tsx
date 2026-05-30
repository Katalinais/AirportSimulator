// Gráfico de líneas (Chart.js) con evolución en tiempo real de pasajeros en cola y en sala de espera

import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement,
  Tooltip, Legend, Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { MetricPoint } from '../engine/metrics'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

interface Props {
  history: MetricPoint[]
}

export function QueueChart({ history }: Props) {
  if (history.length < 2) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-600 text-sm">
        Esperando datos…
      </div>
    )
  }

  const labels = history.map(p => `${Math.floor(p.simTime)}m`)

  const data = {
    labels,
    datasets: [
      {
        label:           'Lq',
        data:            history.map(p => +p.Lq.toFixed(3)),
        borderColor:     '#f87171',
        backgroundColor: 'rgba(248,113,113,0.08)',
        borderWidth:     1.5,
        pointRadius:     0,
        tension:         0.3,
        fill:            true,
        yAxisID:         'yLq',
      },
      {
        label:           'ρ',
        data:            history.map(p => +p.rho.toFixed(3)),
        borderColor:     '#60a5fa',
        backgroundColor: 'rgba(96,165,250,0.06)',
        borderWidth:     1.5,
        pointRadius:     0,
        tension:         0.3,
        fill:            false,
        yAxisID:         'yRho',
      },
      {
        label:           'Wq (min)',
        data:            history.map(p => +p.Wq.toFixed(3)),
        borderColor:     '#fbbf24',
        backgroundColor: 'transparent',
        borderWidth:     1,
        pointRadius:     0,
        borderDash:      [4, 3],
        tension:         0.3,
        fill:            false,
        yAxisID:         'yLq',
      },
    ],
  }

  const options = {
    animation:   { duration: 0 },
    responsive:  true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        labels: {
          color:    '#9ca3af',
          boxWidth: 10,
          font:     { size: 10 },
        },
      },
      tooltip: {
        backgroundColor: '#1f2937',
        titleColor:      '#d1d5db',
        bodyColor:       '#9ca3af',
        borderColor:     '#374151',
        borderWidth:     1,
      },
    },
    scales: {
      x: {
        ticks: { color: '#6b7280', font: { size: 9 }, maxTicksLimit: 6 },
        grid:  { color: '#1f2937' },
      },
      yLq: {
        type:     'linear' as const,
        position: 'left'   as const,
        ticks:    { color: '#9ca3af', font: { size: 9 } },
        grid:     { color: '#1f2937' },
        title:    { display: true, text: 'Lq / Wq', color: '#6b7280', font: { size: 9 } },
      },
      yRho: {
        type:     'linear' as const,
        position: 'right'  as const,
        min:      0, max: 1,
        ticks:    { color: '#60a5fa', font: { size: 9 } },
        grid:     { display: false },
        title:    { display: true, text: 'ρ', color: '#6b7280', font: { size: 9 } },
      },
    },
  }

  return (
    <div className="h-44">
      <Line data={data} options={options} />
    </div>
  )
}
