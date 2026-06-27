'use client'

import { useEffect, useMemo, useRef } from 'react'
import {
  Chart,
  DoughnutController,
  BarController,
  LineController,
  ArcElement,
  BarElement,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
} from 'chart.js'
import { CATEGORY_OPTIONS, UNCATEGORIZED } from './CategoryAssign'

Chart.register(
  DoughnutController,
  BarController,
  LineController,
  ArcElement,
  BarElement,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend
)

const ORDERED_CATEGORIES = [...CATEGORY_OPTIONS, UNCATEGORIZED]
const CATEGORY_COLORS = {
  'Online Underwear': '#D85A30',
  'Online Sport': '#3B3A8C',
  [UNCATEGORIZED]: '#A3A19A',
}

export default function CategoryCharts({ data, categories }) {
  const donutRef = useRef(null)
  const donutChart = useRef(null)
  const trendRef = useRef(null)
  const trendChart = useRef(null)

  const customersByCategory = useMemo(() => {
    const groups = {}
    for (const key of ORDERED_CATEGORIES) groups[key] = []
    for (const c of data.rankedCustomers) {
      const key = categories[c] || UNCATEGORIZED
      groups[key].push(c)
    }
    return groups
  }, [data.rankedCustomers, categories])

  const activeCategories = ORDERED_CATEGORIES.filter((key) => customersByCategory[key].length > 0)

  const categoryOmset = useMemo(() => {
    const result = {}
    for (const key of activeCategories) {
      result[key] = customersByCategory[key].reduce((s, c) => s + data.customerTotals[c], 0)
    }
    return result
  }, [activeCategories, customersByCategory, data.customerTotals])

  const dailyByCategory = useMemo(() => {
    const result = {}
    for (const key of activeCategories) {
      result[key] = data.dateKeys.map((d) =>
        customersByCategory[key].reduce((s, c) => s + data.pivotOmset[d][c], 0)
      )
    }
    return result
  }, [activeCategories, customersByCategory, data.dateKeys, data.pivotOmset])

  useEffect(() => {
    if (donutChart.current) donutChart.current.destroy()
    donutChart.current = new Chart(donutRef.current, {
      type: 'doughnut',
      data: {
        labels: activeCategories,
        datasets: [
          {
            data: activeCategories.map((key) => categoryOmset[key]),
            backgroundColor: activeCategories.map((key) => CATEGORY_COLORS[key]),
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
              label: (ctx) => `${ctx.label}: Rp${Math.round(ctx.raw).toLocaleString('id-ID')}`,
            },
          },
        },
      },
    })
    return () => donutChart.current?.destroy()
  }, [activeCategories, categoryOmset])

  useEffect(() => {
    if (trendChart.current) trendChart.current.destroy()
    trendChart.current = new Chart(trendRef.current, {
      type: 'bar',
      data: {
        labels: data.daily.map((d) => d.label),
        datasets: activeCategories.map((key) => ({
          label: key,
          data: dailyByCategory[key],
          backgroundColor: CATEGORY_COLORS[key],
          borderRadius: 3,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: Rp${Math.round(ctx.raw).toLocaleString('id-ID')}`,
            },
          },
        },
        scales: {
          x: { stacked: true },
          y: {
            stacked: true,
            ticks: { callback: (v) => 'Rp' + (v / 1e6).toFixed(0) + 'jt' },
            grid: { color: 'rgba(0,0,0,0.06)' },
          },
        },
      },
    })
    return () => trendChart.current?.destroy()
  }, [activeCategories, dailyByCategory, data.daily])

  const totalOmset = activeCategories.reduce((s, key) => s + categoryOmset[key], 0)

  return (
    <div className="breakdown-grid category-charts-grid">
      <div className="breakdown-block">
        <h3 className="block-title">Komposisi omset per kategori</h3>
        <div className="chart-legend">
          {activeCategories.map((key) => (
            <span key={key}>
              <i className="dot" style={{ background: CATEGORY_COLORS[key] }} />
              {key} {totalOmset > 0 ? ((categoryOmset[key] / totalOmset) * 100).toFixed(1) : '0.0'}%
            </span>
          ))}
        </div>
        <div className="chart-canvas-wrap chart-canvas-wrap--donut">
          <canvas ref={donutRef} role="img" aria-label="Diagram donat komposisi omset per kategori" />
        </div>
      </div>
      <div className="breakdown-block">
        <h3 className="block-title">Tren omset harian per kategori</h3>
        <div className="chart-legend">
          {activeCategories.map((key) => (
            <span key={key}>
              <i className="dot" style={{ background: CATEGORY_COLORS[key] }} />
              {key}
            </span>
          ))}
        </div>
        <div className="chart-canvas-wrap">
          <canvas ref={trendRef} role="img" aria-label="Grafik batang bertumpuk omset harian per kategori" />
        </div>
      </div>
    </div>
  )
}
