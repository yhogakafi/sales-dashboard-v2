'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler
)

function fmtRp(n) {
  return 'Rp' + Math.round(n || 0).toLocaleString('id-ID')
}

function fmtInt(n) {
  return Math.round(n || 0).toLocaleString('id-ID')
}

export default function LiveGrowthChart({ yearData = [], activeYear }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  const [metric, setMetric] = useState('penjualan') // 'penjualan' | 'pesanan' | 'sesi' | 'penonton'

  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) {
      chartRef.current.destroy()
    }

    if (!yearData || yearData.length === 0) return

    const labels = yearData.map((d) => d.monthName || d.displayLabel || d.label)

    let astridData = []
    let fifiData = []
    let yAxisFormatter = fmtInt

    if (metric === 'penjualan') {
      astridData = yearData.map((d) => d.astridPenjualan || 0)
      fifiData = yearData.map((d) => d.fifiPenjualan || 0)
      yAxisFormatter = (v) => {
        if (v >= 1000000) return `Rp${(v / 1000000).toFixed(1)}jt`
        if (v >= 1000) return `Rp${(v / 1000).toFixed(0)}rb`
        return `Rp${v}`
      }
    } else if (metric === 'pesanan') {
      astridData = yearData.map((d) => d.astridPesanan || 0)
      fifiData = yearData.map((d) => d.fifiPesanan || 0)
    } else if (metric === 'sesi') {
      astridData = yearData.map((d) => d.astridSesi || 0)
      fifiData = yearData.map((d) => d.fifiSesi || 0)
    } else if (metric === 'penonton') {
      astridData = yearData.map((d) => d.astridPenonton || 0)
      fifiData = yearData.map((d) => d.fifiPenonton || 0)
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Astrid (Shift Siang)',
            data: astridData,
            borderColor: '#C88A2E',
            backgroundColor: 'rgba(200, 138, 46, 0.12)',
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#C88A2E',
            pointBorderColor: '#FFFFFF',
            pointBorderWidth: 2,
            pointRadius: 4.5,
            pointHoverRadius: 6.5,
          },
          {
            label: 'Fifi (Shift Malam)',
            data: fifiData,
            borderColor: '#40396E',
            backgroundColor: 'rgba(64, 57, 110, 0.12)',
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#40396E',
            pointBorderColor: '#FFFFFF',
            pointBorderWidth: 2,
            pointRadius: 4.5,
            pointHoverRadius: 6.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 12,
              font: {
                family: 'Inter, sans-serif',
                size: 12,
                weight: '600',
              },
              color: '#451A03',
            },
          },
          tooltip: {
            backgroundColor: '#1C1917',
            titleFont: { family: 'Fraunces, serif', size: 13, weight: 'bold' },
            bodyFont: { family: 'IBM Plex Mono, monospace', size: 12 },
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (context) => {
                const val = context.parsed.y
                const formatted = metric === 'penjualan' ? fmtRp(val) : fmtInt(val)
                return ` ${context.dataset.label}: ${formatted}`
              },
            },
          },
        },
        scales: {
          x: {
            grid: {
              color: '#F4E3C4',
              display: true,
            },
            ticks: {
              font: { family: 'Inter, sans-serif', size: 11.5, weight: '500' },
              color: '#713F12',
            },
          },
          y: {
            grid: {
              color: '#F4E3C4',
            },
            ticks: {
              font: { family: 'IBM Plex Mono, monospace', size: 11 },
              color: '#713F12',
              callback: yAxisFormatter,
            },
            beginAtZero: true,
          },
        },
      },
    })

    return () => {
      if (chartRef.current) chartRef.current.destroy()
    }
  }, [yearData, metric])

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        border: '1.5px solid #FEF08A',
        padding: '20px 22px',
        boxShadow: '0 2px 10px rgba(234, 179, 8, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h3 style={{ margin: '0 0 2px', fontSize: '16.5px', color: '#1C1917', fontFamily: 'Fraunces, serif' }}>
            Grafik Pertumbuhan Host Live ({activeYear})
          </h3>
          <p style={{ margin: 0, fontSize: '12px', color: '#78716C' }}>
            Tren perbandingan performa live streaming Astrid vs Fifi antar bulan.
          </p>
        </div>

        {/* Metric Switcher */}
        <div style={{ display: 'flex', gap: '4px', background: '#FEFCE8', border: '1px solid #FEF08A', borderRadius: '8px', padding: '3px' }}>
          {[
            { id: 'penjualan', label: 'Omzet (Rp)' },
            { id: 'pesanan', label: 'Pesanan' },
            { id: 'sesi', label: 'Sesi' },
            { id: 'penonton', label: 'Penonton' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMetric(item.id)}
              style={{
                border: 'none',
                background: metric === item.id ? '#EAB308' : 'transparent',
                color: metric === item.id ? '#FFFFFF' : '#713F12',
                fontWeight: metric === item.id ? 700 : 500,
                fontSize: '11px',
                padding: '4px 8px',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', flex: 1, minHeight: '300px' }}>
        {yearData.length === 0 ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#78716C', fontSize: '13px' }}>
            Belum ada data periode untuk tahun {activeYear}.
          </div>
        ) : (
          <canvas ref={canvasRef} />
        )}
      </div>
    </div>
  )
}
