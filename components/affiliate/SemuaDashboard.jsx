'use client'

import { useMemo, useEffect, useRef } from 'react'
import {
  Chart,
  LineController,
  DoughnutController,
  LineElement,
  PointElement,
  ArcElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import KpiCard from './KpiCard'
import { formatRupiah, formatRupiahShort } from '@/lib/parseAffiliate'

Chart.register(
  LineController,
  DoughnutController,
  LineElement,
  PointElement,
  ArcElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler
)

export default function SemuaDashboard({ shopeeEntries = [], tiktokEntries = [], onShowToast }) {
  const lineChartRef = useRef(null)
  const lineInstance = useRef(null)

  const shareChartRef = useRef(null)
  const shareInstance = useRef(null)

  // ─── Flatten all rows across all stored accounts ────────────────────────────
  const { allShopeeRows, allTikTokRows } = useMemo(() => {
    const shopee = shopeeEntries.flatMap(e => e.rows || [])
    const tiktok = tiktokEntries.flatMap(e => e.rows || [])
    return { allShopeeRows: shopee, allTikTokRows: tiktok }
  }, [shopeeEntries, tiktokEntries])

  // ─── Calculate Shopee totals ────────────────────────────────────────────────
  const shopeeStats = useMemo(() => {
    const orders = new Set(allShopeeRows.map(r => r.kodePesanan).filter(Boolean)).size
    const gmv = allShopeeRows.reduce((s, r) => s + r.gmv, 0)
    const expense = allShopeeRows.reduce((s, r) => s + r.expense, 0)
    const ratio = gmv > 0 ? (expense / gmv) * 100 : 0
    return { orders, gmv, expense, ratio: ratio.toFixed(2) }
  }, [allShopeeRows])

  // ─── Calculate TikTok totals ────────────────────────────────────────────────
  const tiktokStats = useMemo(() => {
    const orders = new Set(allTikTokRows.map(r => r.idPesanan).filter(Boolean)).size
    const gmv = allTikTokRows.reduce((s, r) => s + r.gmv, 0)
    const expense = allTikTokRows.reduce((s, r) => s + r.expense, 0)
    const ratio = gmv > 0 ? (expense / gmv) * 100 : 0
    return { orders, gmv, expense, ratio: ratio.toFixed(2) }
  }, [allTikTokRows])

  // ─── Calculate Combined totals ──────────────────────────────────────────────
  const combinedStats = useMemo(() => {
    const totalOrders = shopeeStats.orders + tiktokStats.orders
    const totalGmv = shopeeStats.gmv + tiktokStats.gmv
    const totalExpense = shopeeStats.expense + tiktokStats.expense
    const totalRatio = totalGmv > 0 ? (totalExpense / totalGmv) * 100 : 0
    const shopeeShare = totalGmv > 0 ? (shopeeStats.gmv / totalGmv) * 100 : 0
    const tiktokShare = totalGmv > 0 ? (tiktokStats.gmv / totalGmv) * 100 : 0
    return {
      orders: totalOrders,
      gmv: Math.round(totalGmv),
      expense: Math.round(totalExpense),
      ratio: totalRatio.toFixed(2),
      shopeeShare: shopeeShare.toFixed(1),
      tiktokShare: tiktokShare.toFixed(1),
    }
  }, [shopeeStats, tiktokStats])

  // ─── Account-by-Account Breakdown ───────────────────────────────────────────
  const accountBreakdown = useMemo(() => {
    const list = []

    shopeeEntries.forEach(entry => {
      const rows = entry.rows || []
      const orders = new Set(rows.map(r => r.kodePesanan).filter(Boolean)).size
      const gmv = rows.reduce((s, r) => s + r.gmv, 0)
      const expense = rows.reduce((s, r) => s + r.expense, 0)
      const ratio = gmv > 0 ? (expense / gmv) * 100 : 0
      list.push({
        platform: 'Shopee',
        account: entry.account,
        orders,
        gmv,
        expense,
        ratio: ratio.toFixed(2),
        share: combinedStats.gmv > 0 ? (gmv / combinedStats.gmv) * 100 : 0,
      })
    })

    tiktokEntries.forEach(entry => {
      const rows = entry.rows || []
      const orders = new Set(rows.map(r => r.idPesanan).filter(Boolean)).size
      const gmv = rows.reduce((s, r) => s + r.gmv, 0)
      const expense = rows.reduce((s, r) => s + r.expense, 0)
      const ratio = gmv > 0 ? (expense / gmv) * 100 : 0
      list.push({
        platform: 'TikTok',
        account: entry.account,
        orders,
        gmv,
        expense,
        ratio: ratio.toFixed(2),
        share: combinedStats.gmv > 0 ? (gmv / combinedStats.gmv) * 100 : 0,
      })
    })

    return list.sort((a, b) => b.gmv - a.gmv)
  }, [shopeeEntries, tiktokEntries, combinedStats.gmv])

  // ─── Initialize Charts ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!allShopeeRows.length && !allTikTokRows.length) return

    // Daily Combined Trends
    const daySet = new Set()
    const shopeeDaily = {}
    const tiktokDaily = {}

    allShopeeRows.forEach(r => {
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
        daySet.add(key)
        shopeeDaily[key] = (shopeeDaily[key] || 0) + r.gmv
      }
    })

    allTikTokRows.forEach(r => {
      if (r.waktuKomisiDibayar) {
        const d = new Date(r.waktuKomisiDibayar)
        if (!isNaN(d.getTime())) {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          daySet.add(key)
          tiktokDaily[key] = (tiktokDaily[key] || 0) + r.gmv
        }
      }
    })

    const sortedDays = Array.from(daySet).sort()
    const labels = sortedDays.map(k => {
      const [y, m, day] = k.split('-').map(Number)
      return new Date(y, m - 1, day).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
    })

    const shopeeSeries = sortedDays.map(k => shopeeDaily[k] || 0)
    const tiktokSeries = sortedDays.map(k => tiktokDaily[k] || 0)
    const totalSeries = sortedDays.map(k => (shopeeDaily[k] || 0) + (tiktokDaily[k] || 0))

    if (lineChartRef.current) {
      if (lineInstance.current) lineInstance.current.destroy()
      lineInstance.current = new Chart(lineChartRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Total GMV',
              data: totalSeries,
              borderColor: '#7c3aed',
              backgroundColor: 'rgba(124, 58, 237, 0.05)',
              fill: true,
              tension: 0.35,
              pointRadius: labels.length > 31 ? 0 : 3,
              borderWidth: 2.5,
            },
            {
              label: 'Shopee',
              data: shopeeSeries,
              borderColor: '#ea580c',
              tension: 0.35,
              pointRadius: labels.length > 31 ? 0 : 2,
              borderWidth: 1.8,
            },
            {
              label: 'TikTok',
              data: tiktokSeries,
              borderColor: '#3B5BDB',
              tension: 0.35,
              pointRadius: labels.length > 31 ? 0 : 2,
              borderWidth: 1.8,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: { color: '#475569', font: { size: 11 }, boxWidth: 12 },
            },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.dataset.label}: ${formatRupiah(ctx.raw)}`,
              },
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

    // Doughnut GMV Share
    if (shareChartRef.current) {
      if (shareInstance.current) shareInstance.current.destroy()
      shareInstance.current = new Chart(shareChartRef.current, {
        type: 'doughnut',
        data: {
          labels: ['Shopee', 'TikTok'],
          datasets: [
            {
              data: [shopeeStats.gmv, tiktokStats.gmv],
              backgroundColor: ['#ea580c', '#3B5BDB'],
              borderWidth: 2,
              borderColor: '#ffffff',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { padding: 14, font: { size: 11 }, color: '#475569', boxWidth: 12 },
            },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.label}: ${formatRupiah(ctx.raw)} (${((ctx.raw / (combinedStats.gmv || 1)) * 100).toFixed(1)}%)`,
              },
            },
          },
        },
      })
    }

    return () => {
      lineInstance.current?.destroy()
      shareInstance.current?.destroy()
    }
  }, [allShopeeRows, allTikTokRows, shopeeStats, tiktokStats, combinedStats.gmv])

  return (
    <div className="aff-panel aff-panel-semua">
      {/* ── Top 4 Combined KPI Cards ── */}
      <div className="aff-kpi-grid">
        <KpiCard
          label="Total Pesanan Gabungan"
          value={combinedStats.orders.toLocaleString('id-ID')}
          sub={`Shopee: ${shopeeStats.orders.toLocaleString('id-ID')} · TikTok: ${tiktokStats.orders.toLocaleString('id-ID')}`}
          color="#7c3aed"
          raw={combinedStats.orders}
          onCopy={onShowToast}
        />
        <KpiCard
          label="Total GMV Gabungan"
          value={formatRupiah(combinedStats.gmv)}
          sub={`Shopee: ${formatRupiahShort(shopeeStats.gmv)} · TikTok: ${formatRupiahShort(tiktokStats.gmv)}`}
          color="#16a34a"
          raw={combinedStats.gmv}
          onCopy={onShowToast}
        />
        <KpiCard
          label="Total Pengeluaran Gabungan"
          value={formatRupiah(combinedStats.expense)}
          sub={`Shopee: ${formatRupiahShort(shopeeStats.expense)} · TikTok: ${formatRupiahShort(tiktokStats.expense)}`}
          color="#2563eb"
          raw={combinedStats.expense}
          onCopy={onShowToast}
        />
        <KpiCard
          label="Expense Ratio Gabungan"
          value={`${combinedStats.ratio}%`}
          sub="Total Pengeluaran / Total GMV"
          color="#d97706"
          raw={`${combinedStats.ratio}%`}
          onCopy={onShowToast}
        />
      </div>

      {/* ── Side-by-side Channel Comparison Cards ── */}
      <div className="aff-chart-grid" style={{ gridTemplateColumns: 'repeat(12, 1fr)', marginBottom: '1.5rem' }}>
        <div className="aff-card aff-channel-card aff-channel-shopee" style={{ gridColumn: 'span 6' }}>
          <div className="aff-channel-header">
            <div className="aff-channel-brand">
              <span className="aff-channel-tag" style={{ background: '#ea580c' }}>Shopee</span>
              <h4>Shopee Affiliate</h4>
            </div>
            <span className="aff-channel-share">{combinedStats.shopeeShare}% Pangsa GMV</span>
          </div>

          <div className="aff-channel-body">
            <div className="aff-channel-metric">
              <span className="label">Total Pesanan</span>
              <span className="val mono">{shopeeStats.orders.toLocaleString('id-ID')}</span>
            </div>
            <div className="aff-channel-metric">
              <span className="label">Total GMV</span>
              <span className="val mono">{formatRupiah(shopeeStats.gmv)}</span>
            </div>
            <div className="aff-channel-metric">
              <span className="label">Total Pengeluaran</span>
              <span className="val mono">{formatRupiah(shopeeStats.expense)}</span>
            </div>
            <div className="aff-channel-metric">
              <span className="label">Expense Ratio</span>
              <span className="val mono" style={{ color: '#ea580c' }}>{shopeeStats.ratio}%</span>
            </div>
          </div>
          <div className="aff-channel-footer">
            {shopeeEntries.length} Akun / Pelanggan Tersimpan
          </div>
        </div>

        <div className="aff-card aff-channel-card aff-channel-tiktok" style={{ gridColumn: 'span 6' }}>
          <div className="aff-channel-header">
            <div className="aff-channel-brand">
              <span className="aff-channel-tag" style={{ background: '#3B5BDB' }}>TikTok</span>
              <h4>TikTok Shop Affiliate</h4>
            </div>
            <span className="aff-channel-share">{combinedStats.tiktokShare}% Pangsa GMV</span>
          </div>

          <div className="aff-channel-body">
            <div className="aff-channel-metric">
              <span className="label">Total Orders</span>
              <span className="val mono">{tiktokStats.orders.toLocaleString('id-ID')}</span>
            </div>
            <div className="aff-channel-metric">
              <span className="label">Total GMV</span>
              <span className="val mono">{formatRupiah(tiktokStats.gmv)}</span>
            </div>
            <div className="aff-channel-metric">
              <span className="label">Total Expenses</span>
              <span className="val mono">{formatRupiah(tiktokStats.expense)}</span>
            </div>
            <div className="aff-channel-metric">
              <span className="label">Expense Ratio</span>
              <span className="val mono" style={{ color: '#3B5BDB' }}>{tiktokStats.ratio}%</span>
            </div>
          </div>
          <div className="aff-channel-footer">
            {tiktokEntries.length} Akun / Pelanggan Tersimpan
          </div>
        </div>
      </div>

      {/* ── Visual Comparison Charts ── */}
      <div className="aff-chart-grid" style={{ gridTemplateColumns: 'repeat(12, 1fr)', marginBottom: '1.5rem' }}>
        <div className="aff-card" style={{ gridColumn: 'span 8' }}>
          <div className="aff-card-header">
            <h4 className="aff-card-title">
              <span className="dot" style={{ background: '#7c3aed' }}></span> Tren GMV Harian Gabungan
            </h4>
          </div>
          <div style={{ height: '280px', position: 'relative' }}>
            <canvas ref={lineChartRef} />
          </div>
        </div>

        <div className="aff-card" style={{ gridColumn: 'span 4' }}>
          <div className="aff-card-header">
            <h4 className="aff-card-title">
              <span className="dot" style={{ background: '#16a34a' }}></span> Distribusi Pangsa GMV
            </h4>
          </div>
          <div style={{ height: '280px', position: 'relative' }}>
            <canvas ref={shareChartRef} />
          </div>
        </div>
      </div>

      {/* ── Breakdown of All Stored Accounts in this Month ── */}
      <div className="aff-card">
        <div className="aff-card-header">
          <div>
            <h4 className="aff-card-title">Rincian Seluruh Data Akun / Pelanggan Tersimpan</h4>
            <p className="aff-card-sub">Menghitung seluruh data yang tersimpan untuk periode bulan ini</p>
          </div>
        </div>

        <div className="table-scroll">
          <table className="aff-table">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Nama Akun / Pelanggan</th>
                <th style={{ textAlign: 'right' }}>Total Pesanan</th>
                <th style={{ textAlign: 'right' }}>GMV (Rp)</th>
                <th style={{ textAlign: 'right' }}>Pengeluaran (Rp)</th>
                <th style={{ textAlign: 'right' }}>Expense Ratio</th>
                <th style={{ textAlign: 'right' }}>Kontribusi GMV</th>
              </tr>
            </thead>
            <tbody>
              {accountBreakdown.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }} className="muted">
                    Belum ada data akun yang tersimpan untuk periode bulan ini.
                  </td>
                </tr>
              )}
              {accountBreakdown.map((item, i) => (
                <tr key={`${item.platform}-${item.account}-${i}`}>
                  <td>
                    <span className={`aff-badge ${item.platform === 'Shopee' ? 'aff-badge-shopee' : 'aff-badge-tiktok'}`}>
                      {item.platform}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{item.account}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{item.orders.toLocaleString('id-ID')}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{formatRupiah(item.gmv)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{formatRupiah(item.expense)}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600, color: item.platform === 'Shopee' ? '#ea580c' : '#3B5BDB' }}>
                    {item.ratio}%
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>{item.share.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
