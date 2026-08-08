'use client'

import { useEffect, useRef } from 'react'
import {
  Chart,
  DoughnutController,
  BarController,
  ArcElement,
  BarElement,
  LinearScale,
  CategoryScale,
  Tooltip,
} from 'chart.js'
import { formatRupiah } from '@/lib/parseData'

Chart.register(
  DoughnutController,
  BarController,
  ArcElement,
  BarElement,
  LinearScale,
  CategoryScale,
  Tooltip
)

const PALETTE = ['#3B3A8C', '#D85A30', '#1D9E75', '#BA7517', '#D4537E', '#378ADD', '#888780', '#993556']

export default function BreakdownCharts({ platformTotals, brandTotals }) {
  const platformRef = useRef(null)
  const brandRef = useRef(null)
  const platformChart = useRef(null)
  const brandChart = useRef(null)

  const platformEntries = Object.entries(platformTotals).sort((a, b) => b[1] - a[1])
  const brandEntries = Object.entries(brandTotals).sort((a, b) => b[1] - a[1])
  const totalAll = platformEntries.reduce((s, [, v]) => s + v, 0)

  useEffect(() => {
    if (platformChart.current) platformChart.current.destroy()
    platformChart.current = new Chart(platformRef.current, {
      type: 'doughnut',
      data: {
        labels: platformEntries.map(([k]) => k),
        datasets: [
          {
            data: platformEntries.map(([, v]) => v),
            backgroundColor: PALETTE,
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${formatRupiah(ctx.raw)}`,
            },
          },
        },
      },
    })
    return () => platformChart.current?.destroy()
  }, [platformTotals])

  useEffect(() => {
    if (brandChart.current) brandChart.current.destroy()
    brandChart.current = new Chart(brandRef.current, {
      type: 'bar',
      data: {
        labels: brandEntries.map(([k]) => k),
        datasets: [
          {
            data: brandEntries.map(([, v]) => v),
            backgroundColor: '#3B3A8C',
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => formatRupiah(ctx.raw),
            },
          },
        },
        scales: {
          x: { ticks: { callback: (v) => 'Rp' + (v / 1e6).toFixed(0) + 'jt' } },
        },
      },
    })
    return () => brandChart.current?.destroy()
  }, [brandTotals])

  return (
    <div className="breakdown-grid">
      <div className="breakdown-block">
        <h3 className="block-title">Omset per platform</h3>
        <div className="chart-legend">
          {platformEntries.map(([k, v], i) => (
            <span key={k}>
              <i className="dot" style={{ background: PALETTE[i % PALETTE.length] }} />
              {k} {((v / totalAll) * 100).toFixed(1)}%
            </span>
          ))}
        </div>
        <div className="chart-canvas-wrap chart-canvas-wrap--donut">
          <canvas ref={platformRef} role="img" aria-label="Diagram donat pangsa omset per platform" />
        </div>
      </div>
      <div className="breakdown-block">
        <h3 className="block-title">Omset per brand/toko</h3>
        <div className="chart-canvas-wrap" style={{ height: Math.max(220, brandEntries.length * 32) }}>
          <canvas ref={brandRef} role="img" aria-label="Grafik batang omset per brand" />
        </div>
      </div>
    </div>
  )
}
