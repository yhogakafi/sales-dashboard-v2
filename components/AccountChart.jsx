'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
import { formatRupiah, formatNumber, formatDateLabel } from '@/lib/parseData'
import { dateKeyAtOffset } from '@/lib/trimAnalysis'

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

/**
 * Grafik tren harian untuk satu akun (pelanggan penagihan) yang dipilih lewat dropdown.
 *
 * mode="single": tampilkan tren omset+order akun terpilih untuk satu periode (`data`).
 * mode="compare": tampilkan dua garis omset akun terpilih, satu per periode (`dataA` vs `dataB`),
 *                 diselaraskan berdasarkan hari ke-N sejak awal masing-masing periode
 *                 (bukan tanggal kalender absolut) -- pakai `spanDays` yang sudah dihitung
 *                 oleh alignForComparison di CompareView.
 */
export default function AccountChart({ mode = 'single', data, dataA, dataB, labelA, labelB, spanDays }) {
  const accounts = useMemo(() => {
    if (mode === 'single') return data?.rankedCustomers || []
    const combinedTotals = {}
    for (const c of dataA?.rankedCustomers || []) combinedTotals[c] = (combinedTotals[c] || 0) + (dataA.customerTotals[c] || 0)
    for (const c of dataB?.rankedCustomers || []) combinedTotals[c] = (combinedTotals[c] || 0) + (dataB.customerTotals[c] || 0)
    return Object.keys(combinedTotals).sort((x, y) => combinedTotals[y] - combinedTotals[x])
  }, [mode, data, dataA, dataB])

  const [selected, setSelected] = useState('')

  useEffect(() => {
    if (accounts.length && !accounts.includes(selected)) {
      setSelected(accounts[0])
    }
  }, [accounts, selected])

  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current || !selected) return
    if (chartRef.current) chartRef.current.destroy()

    if (mode === 'single') {
      const labels = data.dateKeys.map((d) => data.daily.find((x) => x.dateKey === d)?.label || d)
      const omset = data.dateKeys.map((d) => data.pivotOmset[d]?.[selected] || 0)
      const order = data.dateKeys.map((d) => data.pivotCount[d]?.[selected] || 0)

      chartRef.current = new Chart(canvasRef.current, {
        data: {
          labels,
          datasets: [
            { type: 'bar', label: 'Omset', data: omset, backgroundColor: '#3B3A8C', borderRadius: 4, yAxisID: 'y' },
            { type: 'line', label: 'Jumlah order', data: order, borderColor: '#D85A30', backgroundColor: '#D85A30', tension: 0.3, pointRadius: 3, yAxisID: 'y1' },
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
                label: (ctx) => ctx.dataset.label === 'Omset' ? `Omset: ${formatRupiah(ctx.raw)}` : `Order: ${ctx.raw}`,
              },
            },
          },
          scales: {
            y: { position: 'left', ticks: { callback: (v) => 'Rp' + (v / 1e6).toFixed(1) + 'jt' }, grid: { color: 'rgba(0,0,0,0.06)' } },
            y1: { position: 'right', grid: { display: false } },
          },
        },
      })
    } else {
      const span = spanDays || Math.min(dataA.dateKeys.length, dataB.dateKeys.length)
      const labels = Array.from({ length: span }, (_, i) => `Hari ke-${i + 1}`)
      const omsetA = Array.from({ length: span }, (_, i) => {
        const key = dateKeyAtOffset(dataA.firstDateKey, i)
        // null (bukan 0) kalau hari ini di luar rentang data A -- misalnya saat
        // membandingkan periode penuh yang panjangnya beda (31 hari vs 30 hari),
        // supaya batangnya kosong bukan kelihatan seperti omset anjlok ke nol.
        return dataA.pivotOmset[key] ? (dataA.pivotOmset[key][selected] || 0) : null
      })
      const omsetB = Array.from({ length: span }, (_, i) => {
        const key = dateKeyAtOffset(dataB.firstDateKey, i)
        return dataB.pivotOmset[key] ? (dataB.pivotOmset[key][selected] || 0) : null
      })
      const dateLabelsA = Array.from({ length: span }, (_, i) => formatDateLabel(dateKeyAtOffset(dataA.firstDateKey, i)))
      const dateLabelsB = Array.from({ length: span }, (_, i) => formatDateLabel(dateKeyAtOffset(dataB.firstDateKey, i)))

      chartRef.current = new Chart(canvasRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: labelA, data: omsetA, backgroundColor: '#3B3A8C', borderRadius: 4 },
            { label: labelB, data: omsetB, backgroundColor: '#D85A30', borderRadius: 4 },
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
                title: (items) => {
                  const i = items[0].dataIndex
                  return `Hari ke-${i + 1}`
                },
                label: (ctx) => {
                  const i = ctx.dataIndex
                  const dl = ctx.dataset.label === labelA ? dateLabelsA[i] : dateLabelsB[i]
                  if (ctx.raw == null) return `${ctx.dataset.label}: tidak ada data (di luar periode)`
                  return `${ctx.dataset.label} (${dl}): ${formatRupiah(ctx.raw)}`
                },
              },
            },
          },
          scales: {
            y: { ticks: { callback: (v) => 'Rp' + (v / 1e6).toFixed(1) + 'jt' }, grid: { color: 'rgba(0,0,0,0.06)' } },
          },
        },
      })
    }

    return () => chartRef.current?.destroy()
  }, [mode, data, dataA, dataB, selected, spanDays, labelA, labelB])

  if (!accounts.length) return null

  return (
    <div className="chart-block account-chart-block">
      <div className="table-block-header">
        <h3 className="block-title">Grafik per akun</h3>
        <select className="category-select" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {accounts.map((acc) => (
            <option key={acc} value={acc}>{acc}</option>
          ))}
        </select>
      </div>
      {mode === 'single' ? (
        <div className="chart-legend">
          <span><i className="dot dot-purple" />Omset (Rp)</span>
          <span><i className="dot-line" />Jumlah order</span>
        </div>
      ) : (
        <div className="chart-legend">
          <span><i className="dot" style={{ background: '#3B3A8C' }} />{labelA}</span>
          <span><i className="dot" style={{ background: '#D85A30' }} />{labelB}</span>
        </div>
      )}
      <div className="chart-canvas-wrap">
        <canvas ref={canvasRef} role="img" aria-label={`Grafik tren harian untuk akun ${selected}`} />
      </div>
    </div>
  )
}
