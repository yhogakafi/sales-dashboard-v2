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
import { formatRupiah, formatRupiahShort, isTikTokCompleted } from '@/lib/parseAffiliate'

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

const PROGRESS_COLORS = ['#3B5BDB', '#2F9E44', '#E8590C', '#9B59B6', '#F59E0B', '#0EA5E9', '#EC4899']

export default function TikTokDashboard({
  rows = [],
  periodLabel = '',
  account = 'Semua Akun',
  onShowToast,
}) {
  // ─── Filter & Table State ───────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState(1)
  const [affMode, setAffMode] = useState('gmv') // 'gmv' | 'commission'

  const filterDesc = useMemo(() => {
    const parts = []
    if (search) parts.push(`Cari: "${search}"`)
    if (statusFilter) parts.push(`Status: ${statusFilter}`)
    return parts.join(' · ')
  }, [search, statusFilter])

  // ─── Chart Refs ─────────────────────────────────────────────────────────────
  const trendChartRef = useRef(null)
  const trendInstance = useRef(null)

  const creatorChartRef = useRef(null)
  const creatorInstance = useRef(null)

  const prodChartRef = useRef(null)
  const prodInstance = useRef(null)

  const statusChartRef = useRef(null)
  const statusInstance = useRef(null)

  // ─── Status options ─────────────────────────────────────────────────────────
  const statusOptions = useMemo(() => {
    const set = new Set()
    rows.forEach(r => {
      if (r.status) set.add(r.status)
    })
    return Array.from(set).sort()
  }, [rows])

  // ─── Filtered rows ──────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim()
    return rows.filter(r => {
      if (statusFilter && r.status !== statusFilter) return false
      if (q) {
        const combined = `${r.idPesanan} ${r.produk} ${r.kreator} ${r.status}`.toLowerCase()
        if (!combined.includes(q)) return false
      }
      return true
    })
  }, [rows, search, statusFilter])

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
    const uniqueOrders = new Set(rows.map(r => r.idPesanan).filter(Boolean)).size
    const totalGmv = rows.reduce((s, r) => s + r.gmv, 0)
    const totalExp = rows.reduce((s, r) => s + r.expense, 0)
    const ratio = totalGmv > 0 ? (totalExp / totalGmv) * 100 : 0
    const tidakCount = rows.filter(r => isTikTokCompleted(r)).length
    const completionRate = rows.length > 0 ? (tidakCount / rows.length) * 100 : 0
    return {
      orders: uniqueOrders,
      gmv: Math.round(totalGmv),
      expense: Math.round(totalExp),
      ratio: ratio.toFixed(2),
      completedCount: tidakCount,
      totalRows: rows.length,
      completionRate: completionRate.toFixed(2),
    }
  }, [rows])

  // ─── Promo Model Breakdown ──────────────────────────────────────────────────
  const promoModelData = useMemo(() => {
    const bm = {}
    rows.forEach(r => {
      const k = r.commissionModel || 'Unknown'
      if (!bm[k]) bm[k] = { orders: new Set(), gmv: 0, expense: 0 }
      bm[k].orders.add(r.idPesanan)
      bm[k].gmv += r.gmv
      bm[k].expense += r.expense
    })
    return Object.entries(bm)
      .sort((a, b) => b[1].gmv - a[1].gmv)
      .map(([model, data]) => {
        const er = data.gmv > 0 ? (data.expense / data.gmv) * 100 : 0
        return {
          model,
          ordersCount: data.orders.size,
          gmv: data.gmv,
          expense: data.expense,
          er,
        }
      })
  }, [rows])

  // ─── Content Type & Platform Breakdown ──────────────────────────────────────
  const contentTypeData = useMemo(() => {
    const map = {}
    rows.forEach(r => {
      const k = r.jenisKonten || 'Unknown'
      map[k] = (map[k] || 0) + r.gmv
    })
    const total = Object.values(map).reduce((a, b) => a + b, 0)
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([lbl, val]) => ({
        lbl,
        val,
        pct: total > 0 ? (val / total) * 100 : 0,
      }))
  }, [rows])

  const platformBreakdownData = useMemo(() => {
    const map = {}
    rows.forEach(r => {
      const k = r.platform || 'Unknown'
      map[k] = (map[k] || 0) + r.gmv
    })
    const total = Object.values(map).reduce((a, b) => a + b, 0)
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([lbl, val]) => ({
        lbl,
        val,
        pct: total > 0 ? (val / total) * 100 : 0,
      }))
  }, [rows])

  // ─── Initialize Charts ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!rows.length) return

    // 1. Daily Trend
    const dailyMap = {}
    rows.forEach(r => {
      if (r.waktuKomisiDibayar) {
        const d = new Date(r.waktuKomisiDibayar)
        if (!isNaN(d.getTime())) {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          dailyMap[key] = (dailyMap[key] || 0) + r.gmv
        }
      }
    })

    const sortedDaily = Object.entries(dailyMap).sort((a, b) => a[0].localeCompare(b[0]))
    const dailyLabels = sortedDaily.map(([k]) => {
      const [y, m, day] = k.split('-').map(Number)
      return new Date(y, m - 1, day).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
    })
    const dailyValues = sortedDaily.map(([, v]) => v)

    if (trendChartRef.current) {
      if (trendInstance.current) trendInstance.current.destroy()
      trendInstance.current = new Chart(trendChartRef.current, {
        type: 'line',
        data: {
          labels: dailyLabels,
          datasets: [
            {
              label: 'GMV',
              data: dailyValues,
              borderColor: '#3B5BDB',
              backgroundColor: 'rgba(59, 91, 219, 0.08)',
              fill: true,
              tension: 0.35,
              pointRadius: dailyLabels.length > 31 ? 0 : 4,
              pointHoverRadius: 6,
              pointBackgroundColor: '#3B5BDB',
              borderWidth: 2.5,
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

    // 2. Creators Bar Chart (with GMV / Commission mode)
    const creatorMap = {}
    rows.forEach(r => {
      const c = r.kreator || 'Unknown'
      if (!creatorMap[c]) creatorMap[c] = { gmv: 0, commission: 0 }
      creatorMap[c].gmv += r.gmv
      creatorMap[c].commission += r.expense
    })
    const sortedCreators = Object.entries(creatorMap)
      .sort((a, b) => b[1][affMode] - a[1][affMode])
      .slice(0, 10)
    const creatorFullLabels = sortedCreators.map(([k]) => k)
    const creatorLabels = sortedCreators.map(([k]) => (k.length > 18 ? k.slice(0, 16) + '…' : k))
    const creatorValues = sortedCreators.map(([, v]) => v[affMode])

    if (creatorChartRef.current) {
      if (creatorInstance.current) creatorInstance.current.destroy()
      creatorInstance.current = new Chart(creatorChartRef.current, {
        type: 'bar',
        data: {
          labels: creatorLabels,
          datasets: [
            {
              label: affMode === 'gmv' ? 'GMV' : 'Komisi',
              data: creatorValues,
              backgroundColor: Array.from({ length: creatorValues.length }, (_, i) => `rgba(59,91,219,${(0.85 - (i / 10) * 0.45).toFixed(2)})`),
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
                title: (items) => creatorFullLabels[items[0].dataIndex],
                label: (ctx) => ` ${affMode === 'gmv' ? 'GMV' : 'Komisi'}: ${formatRupiah(ctx.raw)}`,
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

    // 3. Top 10 Products
    const prodMap = {}
    rows.forEach(r => {
      const p = r.produk || 'Unknown'
      prodMap[p] = (prodMap[p] || 0) + r.gmv
    })
    const sortedProducts = Object.entries(prodMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    const prodFullLabels = sortedProducts.map(([k]) => k)
    const prodLabels = sortedProducts.map(([k]) => (k.length > 25 ? k.slice(0, 23) + '…' : k))
    const prodValues = sortedProducts.map(([, v]) => v)

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
              backgroundColor: Array.from({ length: prodValues.length }, (_, i) => `rgba(47,158,68,${(0.85 - (i / 10) * 0.45).toFixed(2)})`),
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

    // 4. Status Pesanan (Doughnut)
    const statusMap = {}
    rows.forEach(r => {
      const s = r.status || 'Unknown'
      statusMap[s] = (statusMap[s] || 0) + r.gmv
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
              backgroundColor: ['#3B5BDB', '#2F9E44', '#E8590C', '#9B59B6', '#F59E0B', '#64748B'],
              borderWidth: 2,
              borderColor: '#ffffff',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '60%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { padding: 14, font: { size: 11 }, color: '#475569', boxWidth: 12 },
            },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.label}: ${formatRupiah(ctx.raw)}`,
              },
            },
          },
        },
      })
    }

    return () => {
      trendInstance.current?.destroy()
      creatorInstance.current?.destroy()
      prodInstance.current?.destroy()
      statusInstance.current?.destroy()
    }
  }, [rows, affMode])

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

  function getStatusBadgeClass(st) {
    const lower = String(st || '').toLowerCase()
    if (lower.includes('sudah dibayar') || lower === 'paid') return 'paid'
    if (lower.includes('dalam proses') || lower === 'process') return 'process'
    if (lower.includes('tidak memenuhi') || lower === 'ineligible') return 'ineligible'
    return 'unpaid'
  }

  function formatDateDisplay(iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    if (isNaN(d.getTime())) return String(iso)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <div className="aff-panel aff-panel-tiktok">
      {/* ── Top 4 KPI Cards ── */}
      <div className="aff-kpi-grid">
        <KpiCard
          label="Total Orders"
          value={kpiData.orders.toLocaleString('id-ID')}
          sub="Unique order codes"
          color="#3B5BDB"
          raw={kpiData.orders}
          onCopy={onShowToast}
        />
        <KpiCard
          label="GMV"
          value={formatRupiah(kpiData.gmv)}
          sub="Acuan Komisi Aktual"
          color="#2F9E44"
          raw={kpiData.gmv}
          onCopy={onShowToast}
        />
        <KpiCard
          label="Total Expenses"
          value={formatRupiah(kpiData.expense)}
          sub="Pembayaran Komisi Aktual"
          color="#E8590C"
          raw={kpiData.expense}
          onCopy={onShowToast}
        />
        <KpiCard
          label="Expense Ratio"
          value={`${kpiData.ratio}%`}
          sub="Komisi / GMV"
          color="#9B59B6"
          raw={`${kpiData.ratio}%`}
          onCopy={onShowToast}
        />
        <KpiCard
          label="Penyelesaian Pesanan"
          value={`${kpiData.completionRate}%`}
          sub={`${kpiData.completedCount.toLocaleString('id-ID')} dari ${kpiData.totalRows.toLocaleString('id-ID')} tanpa pengembalian`}
          color="#0891b2"
          raw={`${kpiData.completionRate}%`}
          onCopy={onShowToast}
        />
      </div>

      {/* ── Row 1: Trend Chart ── */}
      <div className="aff-card" style={{ marginBottom: '1.5rem' }}>
        <div className="aff-card-header">
          <h4 className="aff-card-title">
            <span className="dot" style={{ background: '#3B5BDB' }}></span> Tren GMV Harian
          </h4>
          <span className="aff-card-sub">Berdasarkan Waktu Komisi Dibayar</span>
        </div>
        <div style={{ height: '270px', position: 'relative' }}>
          <canvas ref={trendChartRef} id="aff-tiktok-trend-chart" />
        </div>
      </div>

      {/* ── Row 2: Creators & Products ── */}
      <div className="aff-chart-grid" style={{ gridTemplateColumns: 'repeat(12, 1fr)', marginBottom: '1.5rem' }}>
        <div className="aff-card" style={{ gridColumn: 'span 6' }}>
          <div className="aff-card-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <h4 className="aff-card-title">
              <span className="dot" style={{ background: '#3B5BDB' }}></span> Top 10 Kreator
            </h4>
            <div className="aff-toggle-group">
              <button
                type="button"
                className={`aff-toggle-btn ${affMode === 'gmv' ? 'active' : ''}`}
                onClick={() => setAffMode('gmv')}
              >
                GMV
              </button>
              <button
                type="button"
                className={`aff-toggle-btn ${affMode === 'commission' ? 'active' : ''}`}
                onClick={() => setAffMode('commission')}
              >
                Komisi
              </button>
            </div>
          </div>
          <div style={{ height: '280px', position: 'relative' }}>
            <canvas ref={creatorChartRef} id="aff-tiktok-creator-chart" />
          </div>
        </div>

        <div className="aff-card" style={{ gridColumn: 'span 6' }}>
          <div className="aff-card-header">
            <h4 className="aff-card-title">
              <span className="dot" style={{ background: '#2F9E44' }}></span> Top 10 Produk (Berdasarkan GMV)
            </h4>
          </div>
          <div style={{ height: '280px', position: 'relative' }}>
            <canvas ref={prodChartRef} id="aff-tiktok-prod-chart" />
          </div>
        </div>
      </div>

      {/* ── Row 3: Promo Table & Status Doughnut ── */}
      <div className="aff-chart-grid" style={{ gridTemplateColumns: 'repeat(12, 1fr)', marginBottom: '1.5rem' }}>
        <div className="aff-card" style={{ gridColumn: 'span 7' }}>
          <div className="aff-card-header">
            <h4 className="aff-card-title">
              <span className="dot" style={{ background: '#E8590C' }}></span> Performa Model Komisi
            </h4>
          </div>
          <div className="table-scroll">
            <table className="aff-table">
              <thead>
                <tr>
                  <th>Model Komisi</th>
                  <th>Total Pesanan</th>
                  <th>GMV (Rp)</th>
                  <th>Pengeluaran (Rp)</th>
                  <th>Expense Ratio</th>
                </tr>
              </thead>
              <tbody>
                {promoModelData.map(m => {
                  const badgeClass = m.er < 5 ? 'low' : m.er < 10 ? 'mid' : 'high'
                  return (
                    <tr key={m.model}>
                      <td style={{ fontWeight: 600 }}>{m.model}</td>
                      <td className="mono">{m.ordersCount.toLocaleString('id-ID')}</td>
                      <td className="mono">{formatRupiah(m.gmv)}</td>
                      <td className="mono">{formatRupiah(m.expense)}</td>
                      <td>
                        <span className={`aff-ratio-pill ${badgeClass}`}>
                          {m.er.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="aff-card" style={{ gridColumn: 'span 5' }}>
          <div className="aff-card-header">
            <h4 className="aff-card-title">
              <span className="dot" style={{ background: '#9B59B6' }}></span> Status Pesanan
            </h4>
          </div>
          <div style={{ height: '260px', position: 'relative' }}>
            <canvas ref={statusChartRef} id="aff-tiktok-status-chart" />
          </div>
        </div>
      </div>

      {/* ── Row 4: Breakdown Jenis Konten & Platform ── */}
      <div className="aff-chart-grid" style={{ gridTemplateColumns: 'repeat(12, 1fr)', marginBottom: '1.5rem' }}>
        <div className="aff-card" style={{ gridColumn: 'span 6' }}>
          <div className="aff-card-header">
            <h4 className="aff-card-title">Breakdown Jenis Konten</h4>
          </div>
          <div className="aff-progress-list">
            {contentTypeData.map((item, i) => (
              <div key={item.lbl} className="aff-progress-row">
                <div className="aff-progress-lbl" title={item.lbl}>{item.lbl}</div>
                <div className="aff-progress-track">
                  <div
                    className="aff-progress-fill"
                    style={{
                      width: `${item.pct.toFixed(1)}%`,
                      backgroundColor: PROGRESS_COLORS[i % PROGRESS_COLORS.length],
                    }}
                  />
                </div>
                <div className="aff-progress-val mono">{formatRupiah(item.val)}</div>
                <div className="aff-progress-pct mono">{item.pct.toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>

        <div className="aff-card" style={{ gridColumn: 'span 6' }}>
          <div className="aff-card-header">
            <h4 className="aff-card-title">Breakdown Platform</h4>
          </div>
          <div className="aff-progress-list">
            {platformBreakdownData.map((item, i) => (
              <div key={item.lbl} className="aff-progress-row">
                <div className="aff-progress-lbl" title={item.lbl}>{item.lbl}</div>
                <div className="aff-progress-track">
                  <div
                    className="aff-progress-fill"
                    style={{
                      width: `${item.pct.toFixed(1)}%`,
                      backgroundColor: PROGRESS_COLORS[i % PROGRESS_COLORS.length],
                    }}
                  />
                </div>
                <div className="aff-progress-val mono">{formatRupiah(item.val)}</div>
                <div className="aff-progress-pct mono">{item.pct.toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Transaction Details Table ── */}
      <div className="aff-card">
        <div className="aff-table-controls">
          <div>
            <h4 className="aff-card-title">Rincian Data Transaksi TikTok</h4>
            <p className="aff-card-sub">{sortedRows.length.toLocaleString('id-ID')} transaksi ditemukan</p>
          </div>

          <div className="aff-filter-inputs">
            <input
              type="text"
              className="login-input aff-search-input"
              placeholder="Cari ID pesanan, produk, kreator…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
            />

            <select
              className="category-select"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1) }}
            >
              <option value="">Semua Status</option>
              {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
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
              platform="tiktok"
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
                <th onClick={() => handleSort('idPesanan')}>ID Pesanan {sortCol === 'idPesanan' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('produk')}>Produk {sortCol === 'produk' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('idSku')}>ID SKU {sortCol === 'idSku' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('status')}>Status {sortCol === 'status' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('kreator')}>Kreator {sortCol === 'kreator' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('jenisKonten')}>Jenis Konten {sortCol === 'jenisKonten' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('commissionModel')}>Model Komisi {sortCol === 'commissionModel' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('persentaseKomisi')} style={{ textAlign: 'right' }}>% Komisi {sortCol === 'persentaseKomisi' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('gmv')} style={{ textAlign: 'right' }}>GMV (Rp) {sortCol === 'gmv' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('expense')} style={{ textAlign: 'right' }}>Pengeluaran (Rp) {sortCol === 'expense' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('waktuPembayaran')}>Waktu Pembayaran {sortCol === 'waktuPembayaran' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('waktuKomisiDibayar')}>Komisi Dibayar {sortCol === 'waktuKomisiDibayar' && (sortDir === 1 ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('platform')}>Platform {sortCol === 'platform' && (sortDir === 1 ? '↑' : '↓')}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length === 0 && (
                <tr>
                  <td colSpan={13} style={{ textAlign: 'center', padding: '2rem' }} className="muted">
                    Tidak ada transaksi yang cocok dengan filter.
                  </td>
                </tr>
              )}
              {paginatedRows.map((r, i) => (
                <tr key={`${r.idPesanan}-${i}`}>
                  <td className="mono" title={r.idPesanan} style={{ fontWeight: 600 }}>
                    {r.idPesanan.length > 14 ? r.idPesanan.substring(0, 14) + '…' : r.idPesanan}
                  </td>
                  <td title={r.produk} style={{ maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.produk || '—'}
                  </td>
                  <td className="mono muted" title={r.idSku} style={{ fontSize: '11px' }}>
                    {r.idSku.length > 10 ? r.idSku.substring(0, 10) + '…' : r.idSku}
                  </td>
                  <td>
                    <span className={`aff-status-badge ${getStatusBadgeClass(r.status)}`}>
                      {r.status || '—'}
                    </span>
                  </td>
                  <td>{r.kreator || '—'}</td>
                  <td><span className="aff-badge aff-badge-sm">{r.jenisKonten || '—'}</span></td>
                  <td>{r.commissionModel || '—'}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{r.persentaseKomisi || '—'}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{formatRupiah(r.gmv)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{r.expense ? formatRupiah(r.expense) : '—'}</td>
                  <td className="muted mono" style={{ fontSize: '11px' }}>{formatDateDisplay(r.waktuPembayaran)}</td>
                  <td className="muted mono" style={{ fontSize: '11px' }}>{formatDateDisplay(r.waktuKomisiDibayar)}</td>
                  <td>{r.platform || '—'}</td>
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
