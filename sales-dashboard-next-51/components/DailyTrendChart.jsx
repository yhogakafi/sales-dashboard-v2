'use client'

import { useEffect, useRef } from 'react'
import {
  Chart,
  LineController,
  BarController,
  LineElement,
  BarElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
} from 'chart.js'

Chart.register(
  LineController,
  BarController,
  LineElement,
  BarElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend
)

export default function DailyTrendChart({ daily }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) chartRef.current.destroy()

    chartRef.current = new Chart(canvasRef.current, {
      data: {
        labels: daily.map((d) => `${d.label}`),
        datasets: [
          {
            type: 'bar',
            label: 'Omset',
            data: daily.map((d) => d.omset),
            backgroundColor: '#3B3A8C',
            borderRadius: 4,
            yAxisID: 'y',
          },
          {
            type: 'line',
            label: 'Jumlah order',
            data: daily.map((d) => d.order),
            borderColor: '#D85A30',
            backgroundColor: '#D85A30',
            tension: 0.3,
            pointRadius: 3,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.dataset.label === 'Omset') {
                  return `Omset: Rp${Math.round(ctx.raw).toLocaleString('id-ID')}`
                }
                return `Order: ${ctx.raw}`
              },
            },
          },
        },
        scales: {
          y: {
            position: 'left',
            ticks: { callback: (v) => 'Rp' + (v / 1e6).toFixed(0) + 'jt' },
            grid: { color: 'rgba(0,0,0,0.06)' },
          },
          y1: {
            position: 'right',
            grid: { display: false },
          },
        },
      },
    })

    return () => chartRef.current?.destroy()
  }, [daily])

  return (
    <div className="chart-block">
      <div className="chart-legend">
        <span><i className="dot dot-purple" />Omset (Rp)</span>
        <span><i className="dot-line" />Jumlah order</span>
      </div>
      <div className="chart-canvas-wrap">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Grafik omset dan jumlah order harian"
        />
      </div>
    </div>
  )
}
