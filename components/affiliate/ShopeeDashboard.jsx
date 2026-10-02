'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Chart,
  LineController,
  BarController,
  DoughnutController,
  LineElement,
  BarElement,
  PointElement,
  ArcElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import KpiCard from './KpiCard'
import AffiliateExportBtn from './AffiliateExportBtn'
import { formatRupiah, formatRupiahShort } from '@/lib/parseAffiliate'

Chart.register(
  LineController,
  BarController,
  DoughnutController,
  LineElement,
  BarElement,
  PointElement,
  ArcElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler
)

export default function ShopeeDashboard({
  rows = [],
  periodLabel = '',
  account = 'Semua Akun',
  onShowToast,
}) {
  // ─── Table & Filter State ───────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [platFilter, setPlatFilter] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState(1) // 1 asc, -1 desc

  const filterDesc = useMemo(() => {
    const parts = []
    if (search) parts.push(`Cari: "${search}"`)
    if (statusFilter) parts.push(`Status: ${statusFilter}`)
    if (typeFilter) parts.push(`Tipe: ${typeFilter}`)
    if (platFilter) parts.push(`Platform: ${platFilter}`)
    return parts.join(' · ')
  }, [search, statusFilter, typeFilter, platFilter])

  // ─── Chart Refs ─────────────────────────────────────────────────────────────
  const dailyChartRef = useRef(null)
  const dailyInstance = useRef(null)

  const statusChartRef = useRef(null)
  const statusInstance = useRef(null)

  const affChartRef = useRef(null)
  const affInstance = useRef(null)

  const prodChartRef = useRef(null)
  const prodInstance = useRef(null)

  const typeChartRef = useRef(null)
  const typeInstance = useRef(null)

  const platChartRef = useRef(null)
  const platInstance = useRef(null)

  // ─── Unique dropdown options ────────────────────────────────────────────────
  const filterOptions = useMemo(() => {
    const statuses = new Set()
    const types = new Set()
    const plats = new Set()
    rows.forEach(r => {
      if (r.statusPesanan) statuses.add(r.statusPesanan)
      if (r.tipePesanan) types.add(r.tipePesanan)
      if (r.platform) plats.add(r.platform)
    })
    return {
      statuses: Array.from(statuses).sort(),
      types: Array.from(types).sort(),
      plats: Array.from(plats).sort(),
    }
  }, [rows])

  // ─── Filtered rows ──────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim()
    return rows.filter(r => {
      if (statusFilter && r.statusPesanan !== statusFilter) return false
      if (typeFilter && r.tipePesanan !== typeFilter) return false
      if (platFilter && r.platform !== platFilter) return false
      if (q) {
        const combined = `${r.kodePesanan} ${r.namaProduk} ${r.namaAffiliate} ${r.usernameAffiliate}`.toLowerCase()
        if (!combined.includes(q)) return false
      }
      return true
    })
  }, [rows, search, statusFilter, typeFilter, platFilter])

  // ─── Sorted rows ────────────────────────────────────────────────────────────
  const sortedRows = useMemo(() => {
    if (!sortCol) return filteredRows
    const list = [...filteredRows]
    list.sort((a, b) => {
      let av = a[sortCol] ?? ''
      let bv = b[sortCol] ?? ''
      if (sortCol === 'gmv' || sortCol === 'expense') {
        av = Number(av) || 0
        bv = Number(bv) || 0
        return (av - bv) * sortDir
      }
      return String(av).localeCompare(String(bv), 'id') * sortDir
    })
    return list
  }, [filteredRows, sortCol, sortDir])

  // ─── KPIs Calculation ───────────────────────────────────────────────────────
  const kpiData = useMemo(() => {
    const uniqueOrders = new Set(rows.map(r => r.kodePesanan).filter(Boolean)).size
    const totalGmv = rows.reduce((s, r) => s + r.gmv, 0)
    const totalExp = rows.reduce((s, r) => s + r.expense, 0)
    const ratio = totalGmv > 0 ? (totalExp / totalGmv) * 100 : 0
    return {
      orders: uniqueOrders,
      gmv: Math.round(totalGmv),
      expense: Math.round(totalExp),
      ratio: ratio.toFixed(2),
    }
  }, [rows])

  // ─── Promo Performance Calculation ──────────────────────────────────────────
  const promoData = useMemo(() => {
    const totGmv = rows.reduce((s, r) => s + r.gmv, 0)
    const bp = {}
    rows.forEach(r => {
      const p = r.jenisPromo || 'Tidak Ada'
      if (!bp[p]) bp[p] = { count: 0, gmv: 0, exp: 0 }
      bp[p].count++
      bp[p].gmv += r.gmv
      bp[p].exp += r.expense
    })
    return Object.entries(bp)
      .sort((a, b) => b[1].gmv - a[1].gmv)
      .map(([promo, d]) => {
        const er = d.gmv > 0 ? (d.exp / d.gmv) * 100 : 0
        const avg = d.count > 0 ? d.gmv / d.count : 0
        const share = totGmv > 0 ? (d.gmv / totGmv) * 100 : 0
        return { promo, ...d, er, avg, share }
      })
  }, [rows])

  // ─── Initialize / Update Charts ─────────────────────────────────────────────
  useEffect(() => {
    if (!rows.length) return

    // 1. Daily Trend
    const dailyMap = {}
    rows.forEach(r => {
      let key = ''
      if (r.dateIso) {
        const d = new Date(r.dateIso)
        if (!isNaN(d.getTime())) {
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        }
      }
      if (!key && r.waktuPesanan) {
        const d = new Date(r.waktuPesanan)
        if (!isNaN(d.getTime())) {
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        }
      }
      if (key) {
        dailyMap[key] = (dailyMap[key] || 0) + r.gmv
      }
    })

    const sortedDaily = Object.entries(dailyMap).sort((a, b) => a[0].localeCompare(b[0]))
    const dailyLabels = sortedDaily.map(([k]) => {
      const [y, m, day] = k.split('-').map(Number)
      return new Date(y, m - 1, day).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
    })
    const dailyValues = sortedDaily.map(([, v]) => v)

    if (dailyChartRef.current) {
      if (dailyInstance.current) dailyInstance.current.destroy()
      dailyInstance.current = new Chart(dailyChartRef.current, {
        type: 'line',
        data: {
          labels: dailyLabels,
          datasets: [
            {
              label: 'GMV',
              data: dailyValues,
              borderColor: '#ea580c',
              backgroundColor: 'rgba(234, 88, 12, 0.08)',
              fill: true,
              tension: 0.35,
              pointRadius: dailyLabels.length > 31 ? 0 : 4,
              pointHoverRadius: 6,
              pointBackgroundColor: '#ea580c',
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: { label: (ctx) => ' GMV: ' + formatRupiah(ctx.raw) },
            },
          },
          scales: {
            x: {
              grid: { color: 'rgba(226,232,240,0.6)' },
              ticks: { color: '#64748b', font: { size: 11 }, maxTicksLimit: 15 },
            },
            y: {
              grid: { color: 'rgba(226,232,240,0.6)' },
              ticks: { color: '#64748b', font: { size: 11 }, callback: (v) => formatRupiahShort(v) },
            },
          },
        },
      })
    }

    // 2. Status Pesanan (Doughnut)
    const statusMap = {}
    rows.forEach(r => {
      const s = r.statusPesanan || 'Unknown'
      statusMap[s] = (statusMap[s] || 0) + 1
    })
    const statusLabels = Object.keys(statusMap)
    const statusValues = Object.values(statusMap)

    if (statusChartRef.current) {
      if (statusInstance.current) statusInstance.current.destroy()
      statusInstance.current = new Chart(statusChartRef.current, {
        type: 'doughnut',
        data: {
          labels: statusLabels,
          datasets: [
            {
              data: statusValues,
              backgroundColor: ['#16a34a', '#dc2626', '#2563eb', '#ea580c', '#7c3aed', '#b45309', '#64748b'],
              borderWidth: 2,
              borderColor: '#ffffff',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: { color: '#475569', font: { size: 11 }, padding: 12, boxWidth: 12 },
            },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.label}: ${ctx.raw.toLocaleString('id-ID')} pesanan`,
              },
            },
          },
          cutout: '62%',
        },
      })
    }

    // 3. Top 10 Affiliates (Horizontal Bar)
    const affMap = {}
    rows.forEach(r => {
      const a = r.namaAffiliate || 'Unknown'
      affMap[a] = (affMap[a] || 0) + r.gmv
    })
    const topAff = Object.entries(affMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    const affFullLabels = topAff.map(([k]) => k)
    const affLabels = topAff.map(([k]) => (k.length > 18 ? k.slice(0, 16) + '…' : k))
    const affValues = topAff.map(([, v]) => v)

    if (affChartRef.current) {
      if (affInstance.current) affInstance.current.destroy()
      affInstance.current = new Chart(affChartRef.current, {
        type: 'bar',
        data: {
          labels: affLabels,
          datasets: [
            {
              label: 'GMV',
              data: affValues,
              backgroundColor: 'rgba(22, 163, 74, 0.7)',
              borderColor: '#16a34a',
              borderWidth: 1,
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
                title: (items) => affFullLabels[items[0].dataIndex],
                label: (ctx) => ' GMV: ' + formatRupiah(ctx.raw),
              },
            },
          },
          scales: {
            x: {
              grid: { color: 'rgba(226,232,240,0.6)' },
              ticks: { color: '#64748b', font: { size: 10 }, callback: (v) => formatRupiahShort(v) },
            },
            y: {
              grid: { display: false },
              ticks: { color: '#475569', font: { size: 11 } },
            },
          },
        },
      })
    }

    // 4. Top 10 Products (Horizontal Bar)
    const prodMap = {}
    rows.forEach(r => {
      const p = r.namaProduk || 'Unknown'
      prodMap[p] = (prodMap[p] || 0) + r.gmv
    })
    const topProd = Object.entries(prodMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    const prodFullLabels = topProd.map(([k]) => k)
    const prodLabels = topProd.map(([k]) => (k.length > 25 ? k.slice(0, 23) + '…' : k))
    const prodValues = topProd.map(([, v]) => v)

    if (prodChartRef.current) {
      if (prodInstance.current) prodInstance.current.destroy()
      prodInstance.current = new Chart(prodChartRef.current, {
        type: 'bar',
        data: {
          labels: prodLabels,
          datasets: [
            {
              label: 'GMV',
              data: prodValues,
              backgroundColor: 'rgba(124, 58, 237, 0.7)',
              borderColor: '#7c3aed',
              borderWidth: 1,
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
                title: (items) => prodFullLabels[items[0].dataIndex],
                label: (ctx) => ' GMV: ' + formatRupiah(ctx.raw),
              },
            },
          },
          scales: {
            x: {
              grid: { color: 'rgba(226,232,240,0.6)' },
              ticks: { color: '#64748b', font: { size: 10 }, callback: (v) => formatRupiahShort(v) },
            },
            y: {
              grid: { display: false },
              ticks: { color: '#475569', font: { size: 11 } },
            },
          },
        },
      })
    }

    // 5. Tipe Pesanan (Bar)
    const typeMap = {}
    rows.forEach(r => {
      const t = r.tipePesanan || 'Unknown'
      typeMap[t] = (typeMap[t] || 0) + r.gmv
    })
    const typeLabels = Object.keys(typeMap)
    const typeValues = Object.values(typeMap)
    const typeColors = ['#ea580c', '#2563eb', '#16a34a', '#7c3aed']

    if (typeChartRef.current) {
      if (typeInstance.current) typeInstance.current.destroy()
      typeInstance.current = new Chart(typeChartRef.current, {
        type: 'bar',
        data: {
          labels: typeLabels,
          datasets: [
            {
              data: typeValues,
              backgroundColor: typeLabels.map((_, i) => typeColors[i % typeColors.length] + 'aa'),
              borderColor: typeLabels.map((_, i) => typeColors[i % typeColors.length]),
              borderWidth: 1,
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: { label: (ctx) => ' GMV: ' + formatRupiah(ctx.raw) },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#475569', font: { size: 11 } },
            },
            y: {
              grid: { color: 'rgba(226,232,240,0.6)' },
              ticks: { color: '#64748b', font: { size: 10 }, callback: (v) => formatRupiahShort(v) },
            },
          },
        },
      })
    }

    // 6. Platform (Bar)
    const platMap = {}
    rows.forEach(r => {
      const pl = r.platform || 'Unknown'
      platMap[pl] = (platMap[pl] || 0) + r.gmv
    })
    const sortedPlat = Object.entries(platMap).sort((a, b) => b[1] - a[1])
    const platLabels = sortedPlat.map(([k]) => k)
    const platValues = sortedPlat.map(([, v]) => v)

    if (platChartRef.current) {
      if (platInstance.current) platInstance.current.destroy()
      platInstance.current = new Chart(platChartRef.current, {
        type: 'bar',
        data: {
          labels: platLabels,
          datasets: [
            {
              data: platValues,
              backgroundColor: 'rgba(14, 165, 233, 0.7)',
              borderColor: '#0284c7',
              borderWidth: 1,
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: { label: (ctx) => ' GMV: ' + formatRupiah(ctx.raw) },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#475569', font: { size: 11 } },
            },
            y: {
              grid: { color: 'rgba(226,232,240,0.6)' },
              ticks: { color: '#64748b', font: { size: 10 }, callback: (v) => formatRupiahShort(v) },
            },
          },
        },
      })
    }

    return () => {
      dailyInstance.current?.destroy()
      statusInstance.current?.destroy()
      affInstance.current?.destroy()
      prodInstance.current?.destroy()
      typeInstance.current?.destroy()
      platInstance.current?.destroy()
    }
  }, [rows])

  // ─── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.ceil(sortedRows.length / pageSize) || 1
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, currentPage, pageSize])

  const handleSort = (key) => {
    if (sortCol === key) {
      setSortDir(d => -d)
    } else {
      setSortCol(key)
      setSortDir(1)
    }
    setCurrentPage(1)
  }

  return (
    <div className="aff-panel aff-panel-shopee">
      {/* ── Top 4 KPI Cards ── */}
      <div className="aff-kpi-grid">
        <KpiCard
          label="Total Pesanan"
          value={kpiData.orders.toLocaleString('id-ID')}
          sub="Unique order codes"
          color="#ea580c"
          raw={kpiData.orders}
          onCopy={onShowToast}
        />
        <KpiCard
          label="Total GMV"
          value={formatRupiah(kpiData.gmv)}
          sub="Nilai Pembelian"
          color="#16a34a"
          raw={kpiData.gmv}
          onCopy={onShowToast}
        />
        <KpiCard
          label="Total Pengeluaran"
          value={formatRupiah(kpiData.expense)}
          sub="Total Expenses"
          color="#2563eb"
          raw={kpiData.expense}
          onCopy={onShowToast}
        />
        <KpiCard
          label="Expense Ratio"
          value={`${kpiData.ratio}%`}
          sub="Pengeluaran / GMV"
          color="#7c3aed"
          raw={`${kpiData.ratio}%`}
          onCopy={onShowToast}
        />
      </div>

      {/* ── Row 1 Charts: Trend & Status ── */}
      <div className="aff-chart-grid" style={{ gridTemplateColumns: 'repeat(12, 1fr)', marginBottom: '1.5rem' }}>
        <div className="aff-card" style={{ gridColumn: 'span 8' }}>
          <div className="aff-card-header">
            <h4 className="aff-card-title">
              <span className="dot" style={{ background: '#ea580c' }}></span> Tren GMV Harian
            </h4>
          </div>
          <div style={{ height: '270px', position: 'relative' }}>
            <canvas ref={dailyChartRef} id="aff-shopee-daily-chart" />
          </div>
        </div>

        <div className="aff-card" style={{ gridColumn: 'span 4' }}>
          <div className="aff-card-header">
            <h4 className="aff-card-title">
              <span className="dot" style={{ background: '#16a34a' }}></span> Status Pesanan
            </h4>
          </div>
          <div style={{ height: '270px', position: 'relative' }}>
            <canvas ref={statusChartRef} id="aff-shopee-status-chart" />
          </div>
        </div>
      </div>

      {/* ── Row 2 Charts: Top Affiliates & Top Products ── */}
      <div className="aff-chart-grid" style={{ gridTemplateColumns: 'repeat(12, 1fr)', marginBottom: '1.5rem' }}>
        <div className="aff-card" style={{ gridColumn: 'span 6' }}>
          <div className="aff-card-header">
            <h4 className="aff-card-title">
              <span className="dot" style={{ background: '#16a34a' }}></span> Top 10 Affiliate (Berdasarkan GMV)
            </h4>
          </div>
          <div style={{ height: '280px', position: 'relative' }}>
            <canvas ref={affChartRef} id="aff-shopee-aff-chart" />
          </div>
        </div>

        <div className="aff-card" style={{ gridColumn: 'span 6' }}>
          <div className="aff-card-header">
            <h4 className="aff-card-title">
              <span className="dot" style={{ background: '#7c3aed' }}></span> Top 10 Produk Terlaris (Berdasarkan GMV)
            </h4>
          </div>
          <div style={{ height: '280px', position: 'relative' }}>
            <canvas ref={prodChartRef} id="aff-shopee-prod-chart" />
          </div>
        </div>
      </div>

      {/* ── Row 3 Charts: Tipe Pesanan & Platform ── */}
      <div className="aff-chart-grid" style={{ gridTemplateColumns: 'repeat(12, 1fr)', marginBottom: '1.5rem' }}>
        <div className="aff-card" style={{ gridColumn: 'span 6' }}>
          <div className="aff-card-header">
            <h4 className="aff-card-title">
              <span className="dot" style={{ background: '#2563eb' }}></span> Tipe Pesanan
            </h4>
          </div>
          <div style={{ height: '220px', position: 'relative' }}>
            <canvas ref={typeChartRef} id="aff-shopee-type-chart" />
          </div>
        </div>

        <div className="aff-card" style={{ gridColumn: 'span 6' }}>
          <div className="aff-card-header">
            <h4 className="aff-card-title">
              <span className="dot" style={{ background: '#0284c7' }}></span> Platform
            </h4>
          </div>
          <div style={{ height: '220px', position: 'relative' }}>
            <canvas ref={platChartRef} id="aff-shopee-plat-chart" />
          </div>
        </div>
      </div>

      {/* ── Promo Performance Table ── */}
      <div className="aff-card" style={{ marginBottom: '1.5rem' }}>
        <div className="aff-card-header">
          <h4 className="aff-card-title">
            <span className="dot" style={{ background: '#ea580c' }}></span> Performa Jenis Promo
          </h4>
        </div>
        <div className="table-scroll">
          <table className="aff-table">
            <thead>
              <tr>
                <th>Jenis Promo</th>
                <th>Total Pesanan</th>
                <th>GMV (Rp)</th>
                <th>Pengeluaran (Rp)</th>
                <th>Expense Ratio</th>
                <th>Rata-rata GMV / Pesanan</th>
                <th>Share GMV</th>
              </tr>
            </thead>
            <tbody>
              {promoData.map((p) => {
                const ratioColor = p.er > 20 ? '#dc2626' : p.er > 10 ? '#b45309' : '#16a34a'
                return (
                  <tr key={p.promo}>
                    <td><span className="aff-badge aff-badge-shopee">{p.promo}</span></td>
                    <td className="mono">{p.count.toLocaleString('id-ID')}</td>
                    <td className="mono">{formatRupiah(p.gmv)}</td>
                    <td className="mono">{formatRupiah(p.exp)}</td>
                    <td className="mono" style={{ color: ratioColor, fontWeight: 600 }}>{p.er.toFixed(2)}%</td>
                    <td className="mono">{formatRupiah(p.avg)}</td>
                    <td className="mono">{p.share.toFixed(1)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Transaction Details Table ── */}
      <div className="aff-card">
        <div className="aff-table-controls">
          <div>
            <h4 className="aff-card-title">Rincian Data Transaksi Shopee</h4>
            <p className="aff-card-sub">{sortedRows.length.toLocaleString('id-ID')} transaksi ditemukan</p>
          </div>

          <div className="aff-filter-inputs">
            <input
              type="text"
              className="login-input aff-search-input"
              placeholder="Cari kode, produk, affiliate…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
            />

            <select
              className="category-select"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1) }}
            >
              <option value="">Semua Status</option>
              {filterOptions.statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <select
              className="category-select"
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1) }}
            >
              <option value="">Semua Tipe</option>
              {filterOptions.types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <select
              className="category-select"
              value={platFilter}
              onChange={(e) => { setPlatFilter(e.target.value); setCurrentPage(1) }}
            >
              <option value="">Semua Platform</option>
              {filterOptions.plats.map(pl => <option key={pl} value={pl}>{pl}</option>)}
            </select>

            <select
              className="category-select"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1) }}
              style={{ width: '80px' }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>

            <AffiliateExportBtn
              platform="shopee"
              allRows={rows}
              filteredRows={filteredRows}
              periodLabel={periodLabel}
              account={account}
              filterDesc={filterDesc}
              size="sm"
              onShowToast={onShowToast}
            />
          </div>
        </div>

        <div className="table-scroll">
          <table className="aff-table aff-table-interactive">
            <thead>
              <tr>
                <th onClick={() => handleSort('kodePesanan')}>Kode Pesanan {sortCol === 'kodePesanan' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('statusPesanan')}>Status {sortCol === 'statusPesanan' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('waktuPesanan')}>Waktu Pesanan {sortCol === 'waktuPesanan' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('namaProduk')}>Nama Produk {sortCol === 'namaProduk' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('namaAffiliate')}>Affiliate {sortCol === 'namaAffiliate' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('jenisPromo')}>Jenis Promo {sortCol === 'jenisPromo' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('gmv')} style={{ textAlign: 'right' }}>GMV (Rp) {sortCol === 'gmv' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('tipePesanan')}>Tipe {sortCol === 'tipePesanan' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('platform')}>Platform {sortCol === 'platform' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('expense')} style={{ textAlign: 'right' }}>Pengeluaran (Rp) {sortCol === 'expense' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('waktuPemotongan')}>Waktu Pemotongan {sortCol === 'waktuPemotongan' && (sortDir === 1 ? '↑' : '↓')}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '2rem' }} className="muted">
                    Tidak ada transaksi yang cocok dengan filter.
                  </td>
                </tr>
              )}
              {paginatedRows.map((r, i) => (
                <tr key={`${r.kodePesanan}-${i}`}>
                  <td className="mono" style={{ fontWeight: 600 }}>{r.kodePesanan}</td>
                  <td>
                    <span className={`aff-status-badge ${r.statusPesanan === 'Selesai' ? 'paid' : r.statusPesanan === 'Dibatalkan' ? 'ineligible' : 'process'}`}>
                      {r.statusPesanan || '—'}
                    </span>
                  </td>
                  <td className="muted mono" style={{ fontSize: '12px' }}>{r.waktuPesanan || '—'}</td>
                  <td title={r.namaProduk} style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.namaProduk || '—'}
                  </td>
                  <td>{r.namaAffiliate || '—'}</td>
                  <td><span className="aff-badge aff-badge-sm">{r.jenisPromo || '—'}</span></td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{formatRupiah(r.gmv)}</td>
                  <td>{r.tipePesanan || '—'}</td>
                  <td>{r.platform || '—'}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{formatRupiah(r.expense)}</td>
                  <td className="muted mono" style={{ fontSize: '12px' }}>{r.waktuPemotongan || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Pagination Footer ── */}
        <div className="aff-pagination-bar">
          <div className="aff-pagination-info">
            Menampilkan {sortedRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sortedRows.length)} dari {sortedRows.length.toLocaleString('id-ID')} data
          </div>
          <div className="aff-pagination-buttons">
            <button
              type="button"
              className="aff-page-btn"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            >
              ‹
            </button>
            {Array.from({ length: totalPages }, (_, idx) => idx + 1)
              .filter(p => p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2))
              .map((p, idx, arr) => {
                const prev = arr[idx - 1]
                return (
                  <span key={p} style={{ display: 'inline-flex' }}>
                    {prev && p - prev > 1 && <span className="aff-page-ellipsis">…</span>}
                    <button
                      type="button"
                      className={`aff-page-btn ${currentPage === p ? 'active' : ''}`}
                      onClick={() => setCurrentPage(p)}
                    >
                      {p}
                    </button>
                  </span>
                )
              })}
            <button
              type="button"
              className="aff-page-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
