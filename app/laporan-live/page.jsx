'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import AuthGate from '@/components/AuthGate'
import LemonIcon from '@/components/LemonIcon'
import LiveGrowthChart from '@/components/LiveGrowthChart'
import {
  applyHostOverrides,
  summarizeSessions,
  formatDurationHM,
  formatDayDateIndo,
  parsePeriodMonthYear,
} from '@/lib/parseLaporanLive'

function fmtRp(n) {
  return 'Rp' + Math.round(n || 0).toLocaleString('id-ID')
}

function fmtInt(n) {
  return Math.round(n || 0).toLocaleString('id-ID')
}

function getFormattedDayDate(row) {
  if (row.dayDateFormatted) return row.dayDateFormatted
  if (row.startTimestamp) return formatDayDateIndo(row.startTimestamp)
  if (row.start) return formatDayDateIndo(row.start)
  if (row.dateKey) {
    const parts = row.dateKey.split('/')
    if (parts.length === 3) {
      const d = new Date(+parts[2], +parts[1] - 1, +parts[0])
      if (!isNaN(d.getTime())) return formatDayDateIndo(d)
    }
  }
  return row.dateKey || ''
}

export default function LaporanLivePage() {
  const [indexData, setIndexData] = useState({ customers: [] })
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedPeriodId, setSelectedPeriodId] = useState('')

  const [periodData, setPeriodData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)

  // Toast
  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)

  // ─── State for All Periods Table & Year Tab ──────────────────────────────
  const [activeYear, setActiveYear] = useState(2026)

  // ─── Filter & Sort State for Table 1: Laporan Harian per Host ─────────────
  const [dailyFilterHost, setDailyFilterHost] = useState('all') // 'all' | 'Astrid' | 'Fifi'
  const [dailySearchQuery, setDailySearchQuery] = useState('')
  const [dailySortField, setDailySortField] = useState('sortTimestamp')
  const [dailySortDir, setDailySortDir] = useState('asc') // 'asc' | 'desc'

  // ─── Filter & Sort State for Table 2: Detail Sesi Live ────────────────────
  const [sessionFilterHost, setSessionFilterHost] = useState('all') // 'all' | 'Astrid' | 'Fifi'
  const [sessionSearchQuery, setSessionSearchQuery] = useState('')
  const [sessionSalesFilter, setSessionSalesFilter] = useState('all') // 'all' | 'hasSales' | 'noSales'
  const [sessionSortField, setSessionSortField] = useState('startTimestamp')
  const [sessionSortDir, setSessionSortDir] = useState('desc') // 'asc' | 'desc'

  const showToast = useCallback((msg) => {
    setToastMessage(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2400)
  }, [])

  // 1. Fetch Index
  const fetchIndexAndInitial = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/laporan-live/index')
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.error || 'Gagal memuat index laporan live.')
      setIndexData(body)

      if (body.customers && body.customers.length > 0) {
        const url = new URL(window.location.href)
        const paramCust = url.searchParams.get('cust')
        const paramP = url.searchParams.get('p')

        const activeCust = body.customers.find((c) => c.id === paramCust) || body.customers[0]
        const custId = activeCust.id
        setSelectedCustomerId(custId)

        const activePeriod =
          activeCust.periods?.find((p) => p.id === paramP) ||
          activeCust.periods?.[activeCust.periods.length - 1]

        if (activePeriod) {
          setSelectedPeriodId(activePeriod.id)
          await loadPeriodData(custId, activePeriod.id)
        } else {
          setLoading(false)
        }
      } else {
        setLoading(false)
      }
    } catch (err) {
      setErrorMsg(err.message)
      setLoading(false)
    }
  }, [])

  // 2. Fetch specific period data
  const loadPeriodData = async (custId, periodId, isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setErrorMsg(null)

    try {
      const res = await fetch(
        `/api/laporan-live/data?customerId=${encodeURIComponent(custId)}&periodId=${encodeURIComponent(periodId)}`
      )
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.error || 'Gagal memuat data periode.')

      if (body.data) {
        setPeriodData(body.data)
      } else {
        setPeriodData(null)
      }
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchIndexAndInitial()
  }, [fetchIndexAndInitial])

  // Handle customer change
  const handleCustomerChange = async (newCustId) => {
    setSelectedCustomerId(newCustId)
    const custObj = indexData.customers?.find((c) => c.id === newCustId)
    if (custObj && custObj.periods?.length > 0) {
      const latestPeriodId = custObj.periods[custObj.periods.length - 1].id
      setSelectedPeriodId(latestPeriodId)
      await loadPeriodData(newCustId, latestPeriodId)
    } else {
      setSelectedPeriodId('')
      setPeriodData(null)
    }
  }

  // Handle period change
  const handlePeriodChange = async (newPeriodId) => {
    setSelectedPeriodId(newPeriodId)
    if (selectedCustomerId && newPeriodId) {
      await loadPeriodData(selectedCustomerId, newPeriodId)
    }
  }

  // Available periods for selected customer
  const currentCustomerObj = indexData.customers?.find((c) => c.id === selectedCustomerId)
  const availablePeriods = currentCustomerObj?.periods || []

  // Process all periods of current customer with month and year metadata
  const customerPeriodsProcessed = useMemo(() => {
    if (!availablePeriods || availablePeriods.length === 0) return []
    return availablePeriods.map((p) => {
      const parsed = parsePeriodMonthYear(p)
      return {
        ...p,
        ...parsed,
      }
    })
  }, [availablePeriods])

  // Extract unique available years
  const availableYears = useMemo(() => {
    const yearsSet = new Set(customerPeriodsProcessed.map((p) => p.year))
    if (yearsSet.size === 0) {
      yearsSet.add(new Date().getFullYear())
    }
    return Array.from(yearsSet).sort((a, b) => b - a)
  }, [customerPeriodsProcessed])

  // Sync activeYear if necessary
  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(activeYear)) {
      setActiveYear(availableYears[0])
    }
  }, [availableYears, activeYear])

  // Periods belonging to activeYear, sorted chronologically from Jan to Des
  const currentYearPeriods = useMemo(() => {
    return customerPeriodsProcessed
      .filter((p) => p.year === activeYear)
      .sort((a, b) => a.monthIndex - b.monthIndex)
  }, [customerPeriodsProcessed, activeYear])

  // Active rows with saved overrides from backend
  const activeRows = useMemo(() => {
    if (!periodData || !periodData.rows) return []
    return applyHostOverrides(periodData.rows, periodData.dayOverrides || {}, periodData.sessionOverrides || {})
  }, [periodData])

  // Summaries
  const astridRows = useMemo(() => activeRows.filter((r) => r.host === 'Astrid'), [activeRows])
  const fifiRows = useMemo(() => activeRows.filter((r) => r.host === 'Fifi'), [activeRows])

  const astridSummary = useMemo(() => summarizeSessions(astridRows), [astridRows])
  const fifiSummary = useMemo(() => summarizeSessions(fifiRows), [fifiRows])
  const totalSummary = useMemo(() => summarizeSessions(activeRows), [activeRows])

  // Comparison metrics
  const comparisonMetrics = useMemo(() => {
    const a = astridSummary
    const f = fifiSummary
    return [
      { label: 'Sesi Live', aVal: a.totalSessions, fVal: f.totalSessions, fmt: fmtInt },
      { label: 'Total Durasi (menit)', aVal: Math.round(a.durSec / 60), fVal: Math.round(f.durSec / 60), fmt: fmtInt },
      { label: 'Penonton Aktif', aVal: a.penontonAktif, fVal: f.penontonAktif, fmt: fmtInt },
      { label: 'Total Penonton', aVal: a.penonton, fVal: f.penonton, fmt: fmtInt },
      { label: 'Pesanan Dibuat', aVal: a.pesananDibuat, fVal: f.pesananDibuat, fmt: fmtInt },
      { label: 'Produk Terjual', aVal: a.produkDibuat, fVal: f.produkDibuat, fmt: fmtInt },
      { label: 'Penjualan Dibuat (Rp)', aVal: a.penjualanDibuat, fVal: f.penjualanDibuat, fmt: fmtRp },
    ]
  }, [astridSummary, fifiSummary])

  // 24h Dial SVG calculations
  const dialSvg = useMemo(() => {
    const size = 260
    const cx = size / 2
    const cy = size / 2
    const radius = 96

    const toXY = (hourFloat, r) => {
      const angle = (hourFloat / 24) * 2 * Math.PI - Math.PI / 2
      return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
    }

    const arcPath = (h1, h2, r) => {
      const [x1, y1] = toXY(h1, r)
      const [x2, y2] = toXY(h2, r)
      const large = h2 - h1 > 12 ? 1 : 0
      return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`
    }

    const dots = activeRows.map((row) => {
      const startDate = new Date(row.startTimestamp)
      const hourFloat = startDate.getHours() + startDate.getMinutes() / 60
      const [x, y] = toXY(hourFloat, radius)
      const color = row.host === 'Astrid' ? '#C88A2E' : '#40396E'
      return { x: x.toFixed(1), y: y.toFixed(1), color, id: row.id }
    })

    const ticks = []
    for (let h = 0; h < 24; h += 3) {
      const [tx, ty] = toXY(h, radius + 16)
      ticks.push({ x: tx.toFixed(1), y: ty.toFixed(1), label: String(h).padStart(2, '0') })
    }

    return {
      size,
      cx,
      cy,
      radius,
      astridArc: arcPath(6, 17, radius),
      fifiArc: arcPath(17, 30, radius),
      dots,
      ticks,
    }
  }, [activeRows])

  // ─── Table 1 Data: Laporan Harian per Host (Filtered & Sorted) ────────────
  const dailySummaryList = useMemo(() => {
    const dateMap = new Map()

    activeRows.forEach((r) => {
      if (!dateMap.has(r.dateKey)) {
        dateMap.set(r.dateKey, {
          dateKey: r.dateKey,
          dayDateFormatted: getFormattedDayDate(r),
          sortTimestamp: r.startTimestamp,
        })
      }
    })

    const sortedDays = Array.from(dateMap.values()).sort((a, b) => a.sortTimestamp - b.sortTimestamp)

    const list = []
    sortedDays.forEach((d) => {
      ;['Astrid', 'Fifi'].forEach((host) => {
        const matchingSessions = activeRows.filter((r) => r.dateKey === d.dateKey && r.host === host)
        if (matchingSessions.length > 0) {
          const s = summarizeSessions(matchingSessions)
          list.push({
            dateKey: d.dateKey,
            dayDateFormatted: d.dayDateFormatted,
            sortTimestamp: d.sortTimestamp,
            host,
            count: s.totalSessions,
            penonton: s.penonton,
            pesananDibuat: s.pesananDibuat,
            produkDibuat: s.produkDibuat,
            penjualanDibuat: s.penjualanDibuat,
          })
        }
      })
    })

    // Filter Host
    let filtered = list
    if (dailyFilterHost !== 'all') {
      filtered = filtered.filter((row) => row.host === dailyFilterHost)
    }

    // Filter Search
    if (dailySearchQuery.trim()) {
      const q = dailySearchQuery.toLowerCase()
      filtered = filtered.filter((row) => {
        return (
          row.dayDateFormatted.toLowerCase().includes(q) ||
          row.dateKey.toLowerCase().includes(q) ||
          row.host.toLowerCase().includes(q)
        )
      })
    }

    // Sorting
    const sorted = [...filtered].sort((a, b) => {
      let va = a[dailySortField]
      let vb = b[dailySortField]
      if (typeof va === 'string') va = va.toLowerCase()
      if (typeof vb === 'string') vb = vb.toLowerCase()

      if (va < vb) return dailySortDir === 'asc' ? -1 : 1
      if (va > vb) return dailySortDir === 'asc' ? 1 : -1
      return 0
    })

    return sorted
  }, [activeRows, dailyFilterHost, dailySearchQuery, dailySortField, dailySortDir])

  const handleDailySort = (field) => {
    if (dailySortField === field) {
      setDailySortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setDailySortField(field)
      setDailySortDir(field === 'sortTimestamp' ? 'asc' : 'desc')
    }
  }

  // ─── Table 2 Data: Detail Sesi Live (Filtered & Sorted) ───────────────────
  const filteredAndSortedSessions = useMemo(() => {
    let list = activeRows

    // Filter Host
    if (sessionFilterHost !== 'all') {
      list = list.filter((r) => r.host === sessionFilterHost)
    }

    // Filter Penjualan
    if (sessionSalesFilter === 'hasSales') {
      list = list.filter((r) => r.penjualanDibuat > 0)
    } else if (sessionSalesFilter === 'noSales') {
      list = list.filter((r) => r.penjualanDibuat === 0)
    }

    // Filter Search
    if (sessionSearchQuery.trim()) {
      const q = sessionSearchQuery.toLowerCase()
      list = list.filter((r) => {
        const titleMatch = (r.nama || '').toLowerCase().includes(q)
        const dayDateMatch = getFormattedDayDate(r).toLowerCase().includes(q)
        const dateMatch = (r.dateKey || '').toLowerCase().includes(q)
        return titleMatch || dayDateMatch || dateMatch
      })
    }

    // Sorting
    const sorted = [...list].sort((a, b) => {
      let va = a[sessionSortField]
      let vb = b[sessionSortField]
      if (typeof va === 'string') va = va.toLowerCase()
      if (typeof vb === 'string') vb = vb.toLowerCase()

      if (va < vb) return sessionSortDir === 'asc' ? -1 : 1
      if (va > vb) return sessionSortDir === 'asc' ? 1 : -1
      return 0
    })

    return sorted
  }, [activeRows, sessionFilterHost, sessionSalesFilter, sessionSearchQuery, sessionSortField, sessionSortDir])

  const handleSessionSort = (field) => {
    if (sessionSortField === field) {
      setSessionSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSessionSortField(field)
      setSessionSortDir(['startTimestamp', 'startTime'].includes(field) ? 'desc' : 'desc')
    }
  }

  // Export Excel Function
  const handleExportExcel = () => {
    if (!activeRows.length) {
      showToast('Tidak ada data untuk diekspor.')
      return
    }

    const wb = XLSX.utils.book_new()

    // 1. Ringkasan per Host
    const summaryRows = [
      {
        Host: 'Total 1 Bulan',
        'Shift Waktu': 'Semua Host (24 Jam)',
        'Sesi Live': totalSummary.totalSessions,
        'Total Durasi (jam)': +(totalSummary.durSec / 3600).toFixed(2),
        'Penonton Aktif': totalSummary.penontonAktif,
        Komentar: totalSummary.komentar,
        'Tambah ke Keranjang': totalSummary.atc,
        'Total Penonton': totalSummary.penonton,
        'Pesanan Dibuat': totalSummary.pesananDibuat,
        'Pesanan Siap Dikirim': totalSummary.pesananSiap,
        'Produk Terjual (Dibuat)': totalSummary.produkDibuat,
        'Produk Terjual (Siap Dikirim)': totalSummary.produkSiap,
        'Penjualan Dibuat (Rp)': totalSummary.penjualanDibuat,
        'Penjualan Siap Dikirim (Rp)': totalSummary.penjualanSiap,
      },
      ...['Astrid', 'Fifi'].map((h) => {
        const s = h === 'Astrid' ? astridSummary : fifiSummary
        return {
          Host: h,
          'Shift Waktu': h === 'Astrid' ? '06:00 – 17:00 (Siang)' : '17:00 – 06:00 (Malam)',
          'Sesi Live': s.totalSessions,
          'Total Durasi (jam)': +(s.durSec / 3600).toFixed(2),
          'Penonton Aktif': s.penontonAktif,
          Komentar: s.komentar,
          'Tambah ke Keranjang': s.atc,
          'Total Penonton': s.penonton,
          'Pesanan Dibuat': s.pesananDibuat,
          'Pesanan Siap Dikirim': s.pesananSiap,
          'Produk Terjual (Dibuat)': s.produkDibuat,
          'Produk Terjual (Siap Dikirim)': s.produkSiap,
          'Penjualan Dibuat (Rp)': s.penjualanDibuat,
          'Penjualan Siap Dikirim (Rp)': s.penjualanSiap,
        }
      }),
    ]
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows)
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan per Host')

    // 2. Laporan Semua Periode (Tahun)
    const allPeriodsExport = currentYearPeriods.map((p) => ({
      Tahun: p.year,
      'Periode / Bulan': p.displayLabel,
      'Total Durasi': formatDurationHM(p.totalDurSec || p.durSec || 0),
      'Omzet Astrid (Rp)': p.astridPenjualan || 0,
      'Omzet Fifi (Rp)': p.fifiPenjualan || 0,
      'Total Omzet (Rp)': p.totalPenjualan || 0,
    }))
    const wsAllPeriods = XLSX.utils.json_to_sheet(allPeriodsExport)
    XLSX.utils.book_append_sheet(wb, wsAllPeriods, `Laporan Periode ${activeYear}`)

    // 3. Laporan Harian per Host (Kolom gabungan Hari & Tanggal)
    const dailyExportRows = dailySummaryList.map((item) => ({
      'Hari & Tanggal': item.dayDateFormatted,
      Host: item.host,
      'Sesi Live': item.count,
      'Total Penonton': item.penonton,
      'Pesanan Dibuat': item.pesananDibuat,
      'Produk Terjual': item.produkDibuat,
      'Penjualan Dibuat (Rp)': item.penjualanDibuat,
    }))
    const wsDaily = XLSX.utils.json_to_sheet(dailyExportRows)
    XLSX.utils.book_append_sheet(wb, wsDaily, 'Laporan Harian per Host')

    // 4. Detail Sesi Live (Kolom gabungan Hari & Tanggal)
    const detailExportRows = filteredAndSortedSessions.map((r, i) => ({
      No: i + 1,
      Host: r.host,
      'Hari & Tanggal': getFormattedDayDate(r),
      'Jam Mulai': r.startTime,
      'Jam Selesai': r.endTime,
      'Durasi (menit)': Math.round(r.durSec / 60),
      'Nama Livestream': r.nama,
      'Penonton Aktif': r.penontonAktif,
      Komentar: r.komentar,
      'Tambah ke Keranjang': r.atc,
      Penonton: r.penonton,
      'Pesanan Dibuat': r.pesananDibuat,
      'Pesanan Siap Dikirim': r.pesananSiap,
      'Produk Terjual (Dibuat)': r.produkDibuat,
      'Produk Terjual (Siap Dikirim)': r.produkSiap,
      'Penjualan Dibuat (Rp)': r.penjualanDibuat,
      'Penjualan Siap Dikirim (Rp)': r.penjualanSiap,
    }))
    const wsDetail = XLSX.utils.json_to_sheet(detailExportRows)
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Detail Sesi Live')

    const safeCustName = (periodData?.customerName || 'Live').replace(/[^a-zA-Z0-9_-]/g, '_')
    const safePeriodLabel = (periodData?.periodLabel || 'Report').replace(/[^a-zA-Z0-9_-]/g, '_')
    XLSX.writeFile(wb, `Laporan_Live_${safeCustName}_${safePeriodLabel}.xlsx`)
    showToast('File Excel berhasil diunduh.')
  }

  return (
    <AuthGate>
      <div className="app-shell" style={{ maxWidth: '1240px', margin: '0 auto', paddingBottom: '4rem' }}>
        {/* Header */}
        <header className="app-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <p className="eyebrow">
              <LemonIcon size={14} /> LIVE REPORT · SHIFT PERFORMANCE
            </p>
            <h1 style={{ fontSize: 'clamp(24px, 3.5vw, 34px)', color: '#1C1917', margin: '4px 0 6px' }}>
              Laporan Live Streaming
            </h1>
            <p className="header-meta" style={{ color: '#78716C', fontSize: '13.5px' }}>
              Analisis performa shift live streaming (Astrid &amp; Fifi), rincian harian omzet, dan laporan per sesi.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '8px' }}>
            {activeRows.length > 0 && (
              <button type="button" className="btn-export" onClick={handleExportExcel} title="Ekspor laporan ke file Excel">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Ekspor Excel</span>
              </button>
            )}

            <button
              type="button"
              className="btn-refresh-lemon"
              onClick={() => {
                if (selectedCustomerId && selectedPeriodId) {
                  loadPeriodData(selectedCustomerId, selectedPeriodId, true)
                }
              }}
              disabled={refreshing || loading}
              title="Perbarui data dari server"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: refreshing ? 'rotate(360deg)' : 'none',
                  transition: 'transform 0.8s ease',
                }}
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              <span>{refreshing ? 'Memuat…' : 'Refresh'}</span>
            </button>
          </div>
        </header>

        {/* Status & Customer/Period Filter Banner */}
        <div className="aff-status-banner" style={{ marginTop: '0.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span className="aff-status-pulse" />
            <span style={{ color: '#713F12', fontWeight: 600 }}>
              Sumber Data: <strong style={{ color: '#451A03' }}>Shopee Live Export &amp; Vercel Blob</strong>
            </span>
          </div>

          {/* Customer & Period Selectors */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {indexData.customers?.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#713F12' }}>Pelanggan:</label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => handleCustomerChange(e.target.value)}
                  className="aff-month-select"
                  style={{ background: '#FFFDF5', borderColor: '#FEF08A', color: '#713F12', fontWeight: 600 }}
                >
                  {indexData.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {availablePeriods.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#713F12' }}>Periode Aktif:</label>
                <select
                  value={selectedPeriodId}
                  onChange={(e) => handlePeriodChange(e.target.value)}
                  className="aff-month-select"
                  style={{ background: '#FFFDF5', borderColor: '#FEF08A', color: '#713F12', fontWeight: 600 }}
                >
                  {availablePeriods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} ({p.totalSessions} sesi)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ color: '#78716C', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Total:</span>
              <span
                style={{
                  background: '#FEF08A',
                  color: '#854D0E',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  border: '1px solid #FDE047',
                }}
              >
                {activeRows.length} Sesi
              </span>
            </div>
          </div>
        </div>

        {/* Loading / Error / Empty States */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p className="loading-text" style={{ fontSize: '15px' }}>
              Memuat data laporan live streaming…
            </p>
          </div>
        )}

        {!loading && errorMsg && (
          <div style={{ padding: '1.25rem', borderRadius: '10px', background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B' }}>
            <p style={{ margin: 0, fontWeight: 600 }}>⚠️ Terjadi kendala saat memuat data:</p>
            <p style={{ margin: '4px 0 0', fontSize: '13px' }}>{errorMsg}</p>
          </div>
        )}

        {!loading && !errorMsg && activeRows.length === 0 && (
          <div
            style={{
              padding: '2.5rem 1.5rem',
              borderRadius: '14px',
              background: '#FFFBEB',
              border: '1.5px dashed #FDE68A',
              textAlign: 'center',
            }}
          >
            <LemonIcon size={36} />
            <h3 style={{ margin: '12px 0 6px', color: '#713F12', fontSize: '18px' }}>
              Belum Ada Data Sesi Live Streaming
            </h3>
            <p style={{ margin: '0 auto 16px', maxWidth: '480px', color: '#854D0E', fontSize: '13.5px' }}>
              Silakan masuk ke menu Admin untuk mengunggah file Excel laporan live streaming.
            </p>
            <a
              href="/admin"
              className="btn-export"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
            >
              Buka Halaman Admin ↗
            </a>
          </div>
        )}

        {!loading && !errorMsg && activeRows.length > 0 && (
          <>
            {/* ── 1. KPI Cards Row: Total 1 Bulan Paling Kiri + Astrid + Fifi ── */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
                gap: '16px',
                marginBottom: '1.5rem',
              }}
            >
              {/* Card 1 (Paling Kiri): Total 1 Bulan (Semua Host) */}
              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1.5px solid #FEF08A',
                  boxShadow: '0 4px 14px rgba(234, 179, 8, 0.1)',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div style={{ height: '5px', background: '#EAB308' }} />
                <div style={{ padding: '20px 22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h2 style={{ fontSize: '20px', margin: 0, color: '#1C1917', fontFamily: 'Fraunces, serif' }}>
                          Total 1 Bulan
                        </h2>
                        <span
                          style={{
                            background: '#FEF08A',
                            color: '#854D0E',
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            border: '1px solid #FDE047',
                          }}
                        >
                          Semua Host
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#78716C', fontFamily: 'IBM Plex Mono, monospace' }}>
                        Astrid &amp; Fifi (24 Jam)
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '20px', fontWeight: 700, color: '#854D0E', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {totalSummary.totalSessions}
                      </span>
                      <span style={{ fontSize: '12px', color: '#78716C', display: 'block' }}>sesi</span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px', marginBottom: '14px' }}>
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#78716C', display: 'block' }}>Total Durasi</span>
                      <strong style={{ fontSize: '15px', color: '#1C1917', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {formatDurationHM(totalSummary.durSec)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#78716C', display: 'block' }}>Penonton Aktif</span>
                      <strong style={{ fontSize: '15px', color: '#1C1917', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {fmtInt(totalSummary.penontonAktif)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#78716C', display: 'block' }}>Total Penonton</span>
                      <strong style={{ fontSize: '15px', color: '#1C1917', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {fmtInt(totalSummary.penonton)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#78716C', display: 'block' }}>Pesanan Dibuat</span>
                      <strong style={{ fontSize: '15px', color: '#1C1917', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {fmtInt(totalSummary.pesananDibuat)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#78716C', display: 'block' }}>Produk Terjual</span>
                      <strong style={{ fontSize: '15px', color: '#1C1917', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {fmtInt(totalSummary.produkDibuat)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#78716C', display: 'block' }}>Tambah Keranjang</span>
                      <strong style={{ fontSize: '15px', color: '#1C1917', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {fmtInt(totalSummary.atc)}
                      </strong>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #FEF08A', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#78716C' }}>Total Penjualan</span>
                    <strong style={{ fontSize: '18px', color: '#15803D', fontFamily: 'IBM Plex Mono, monospace' }}>
                      {fmtRp(totalSummary.penjualanDibuat)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Card 2: Astrid */}
              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1.5px solid #FDE68A',
                  boxShadow: '0 4px 14px rgba(200, 138, 46, 0.08)',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div style={{ height: '5px', background: '#C88A2E' }} />
                <div style={{ padding: '20px 22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h2 style={{ fontSize: '20px', margin: 0, color: '#2A1F2A', fontFamily: 'Fraunces, serif' }}>
                          Astrid
                        </h2>
                        <span
                          style={{
                            background: '#F4E3C4',
                            color: '#8A5D1A',
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '999px',
                          }}
                        >
                          Shift Siang
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6B5D67', fontFamily: 'IBM Plex Mono, monospace' }}>
                        06:00 – 17:00 WIB
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '20px', fontWeight: 700, color: '#C88A2E', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {astridSummary.totalSessions}
                      </span>
                      <span style={{ fontSize: '12px', color: '#6B5D67', display: 'block' }}>sesi</span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px', marginBottom: '14px' }}>
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#6B5D67', display: 'block' }}>Total Durasi</span>
                      <strong style={{ fontSize: '15px', color: '#2A1F2A', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {formatDurationHM(astridSummary.durSec)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#6B5D67', display: 'block' }}>Penonton Aktif</span>
                      <strong style={{ fontSize: '15px', color: '#2A1F2A', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {fmtInt(astridSummary.penontonAktif)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#6B5D67', display: 'block' }}>Total Penonton</span>
                      <strong style={{ fontSize: '15px', color: '#2A1F2A', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {fmtInt(astridSummary.penonton)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#6B5D67', display: 'block' }}>Pesanan Dibuat</span>
                      <strong style={{ fontSize: '15px', color: '#2A1F2A', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {fmtInt(astridSummary.pesananDibuat)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#6B5D67', display: 'block' }}>Produk Terjual</span>
                      <strong style={{ fontSize: '15px', color: '#2A1F2A', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {fmtInt(astridSummary.produkDibuat)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#6B5D67', display: 'block' }}>Tambah Keranjang</span>
                      <strong style={{ fontSize: '15px', color: '#2A1F2A', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {fmtInt(astridSummary.atc)}
                      </strong>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #F4E3C4', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#6B5D67' }}>Penjualan Dibuat</span>
                    <strong style={{ fontSize: '18px', color: '#95651C', fontFamily: 'IBM Plex Mono, monospace' }}>
                      {fmtRp(astridSummary.penjualanDibuat)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Card 3: Fifi */}
              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1.5px solid #DCD9EE',
                  boxShadow: '0 4px 14px rgba(64, 57, 110, 0.08)',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div style={{ height: '5px', background: '#40396E' }} />
                <div style={{ padding: '20px 22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h2 style={{ fontSize: '20px', margin: 0, color: '#2A1F2A', fontFamily: 'Fraunces, serif' }}>
                          Fifi
                        </h2>
                        <span
                          style={{
                            background: '#DCD9EE',
                            color: '#342E59',
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '999px',
                          }}
                        >
                          Shift Malam
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6B5D67', fontFamily: 'IBM Plex Mono, monospace' }}>
                        17:00 – 06:00 WIB
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '20px', fontWeight: 700, color: '#40396E', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {fifiSummary.totalSessions}
                      </span>
                      <span style={{ fontSize: '12px', color: '#6B5D67', display: 'block' }}>sesi</span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px', marginBottom: '14px' }}>
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#6B5D67', display: 'block' }}>Total Durasi</span>
                      <strong style={{ fontSize: '15px', color: '#2A1F2A', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {formatDurationHM(fifiSummary.durSec)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#6B5D67', display: 'block' }}>Penonton Aktif</span>
                      <strong style={{ fontSize: '15px', color: '#2A1F2A', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {fmtInt(fifiSummary.penontonAktif)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#6B5D67', display: 'block' }}>Total Penonton</span>
                      <strong style={{ fontSize: '15px', color: '#2A1F2A', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {fmtInt(fifiSummary.penonton)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#6B5D67', display: 'block' }}>Pesanan Dibuat</span>
                      <strong style={{ fontSize: '15px', color: '#2A1F2A', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {fmtInt(fifiSummary.pesananDibuat)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#6B5D67', display: 'block' }}>Produk Terjual</span>
                      <strong style={{ fontSize: '15px', color: '#2A1F2A', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {fmtInt(fifiSummary.produkDibuat)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#6B5D67', display: 'block' }}>Tambah Keranjang</span>
                      <strong style={{ fontSize: '15px', color: '#2A1F2A', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {fmtInt(fifiSummary.atc)}
                      </strong>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #DCD9EE', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#6B5D67' }}>Penjualan Dibuat</span>
                    <strong style={{ fontSize: '18px', color: '#40396E', fontFamily: 'IBM Plex Mono, monospace' }}>
                      {fmtRp(fifiSummary.penjualanDibuat)}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* ── 2 & 3. Section: Tabel Laporan Semua Periode + Grafik Pertumbuhan Host (Side by Side) ── */}
            <div style={{ marginBottom: '1.5rem' }}>
              {/* Tab Tahun */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#451A03' }}>Tahun Laporan:</span>
                  <div className="aff-toggle-group">
                    {availableYears.map((yr) => (
                      <button
                        key={yr}
                        type="button"
                        className={`aff-toggle-btn ${activeYear === yr ? 'active' : ''}`}
                        onClick={() => setActiveYear(yr)}
                      >
                        {yr}
                      </button>
                    ))}
                  </div>
                </div>

                <span style={{ fontSize: '12px', color: '#78716C' }}>
                  {currentYearPeriods.length} Periode / Bulan di Tahun {activeYear}
                </span>
              </div>

              {/* Side-by-Side: Tabel Semua Periode (Kiri) & Grafik Pertumbuhan (Kanan) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                  gap: '16px',
                  alignItems: 'stretch',
                }}
              >
                {/* Tabel Laporan Semua Periode */}
                <div
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1.5px solid #FEF08A',
                    padding: '20px 22px',
                    boxShadow: '0 2px 10px rgba(234, 179, 8, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div style={{ marginBottom: '12px' }}>
                    <h3 style={{ margin: '0 0 2px', fontSize: '16.5px', color: '#1C1917', fontFamily: 'Fraunces, serif' }}>
                      Rekapitulasi Semua Periode ({activeYear})
                    </h3>
                    <p style={{ margin: 0, fontSize: '12px', color: '#78716C' }}>
                      Daftar performa live streaming per bulan. Klik periode untuk beralih detail.
                    </p>
                  </div>

                  <div className="aff-table-scroll" style={{ flex: 1, maxHeight: '360px', overflowY: 'auto' }}>
                    <table className="aff-lemon-table">
                      <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#FEFCE8' }}>
                        <tr>
                          <th style={{ minWidth: '130px' }}>Periode / Bulan</th>
                          <th style={{ textAlign: 'right', minWidth: '100px' }}>Total Durasi</th>
                          <th style={{ textAlign: 'right', minWidth: '110px' }}>Astrid (Rp)</th>
                          <th style={{ textAlign: 'right', minWidth: '110px' }}>Fifi (Rp)</th>
                          <th style={{ textAlign: 'right', minWidth: '120px' }}>Total Omzet (Rp)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentYearPeriods.length === 0 ? (
                          <tr>
                            <td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem', color: '#78716C' }}>
                              Belum ada data periode yang disimpan untuk tahun {activeYear}.
                            </td>
                          </tr>
                        ) : (
                          currentYearPeriods.map((p) => {
                            const isCurrent = p.id === selectedPeriodId
                            return (
                              <tr
                                key={p.id}
                                style={{
                                  background: isCurrent ? '#FEFCE8' : undefined,
                                  cursor: 'pointer',
                                }}
                                onClick={() => handlePeriodChange(p.id)}
                                title="Klik untuk membuka detail periode ini"
                              >
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <strong style={{ color: isCurrent ? '#854D0E' : '#1C1917' }}>
                                      {p.displayLabel}
                                    </strong>
                                    {isCurrent && (
                                      <span
                                        style={{
                                          fontSize: '10px',
                                          background: '#FEF08A',
                                          color: '#854D0E',
                                          padding: '1px 5px',
                                          borderRadius: '4px',
                                          fontWeight: 700,
                                        }}
                                      >
                                        Aktif
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace' }}>
                                  {formatDurationHM(p.totalDurSec || p.durSec || 0)}
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', color: '#95651C' }}>
                                  {fmtRp(p.astridPenjualan || 0)}
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', color: '#40396E' }}>
                                  {fmtRp(p.fifiPenjualan || 0)}
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: '#15803D' }}>
                                  {fmtRp(p.totalPenjualan || 0)}
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Grafik Pertumbuhan Host Live */}
                <div>
                  <LiveGrowthChart yearData={currentYearPeriods} activeYear={activeYear} />
                </div>
              </div>
            </div>

            {/* ── Visual Dial & Comparison Section ── */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '16px',
                marginBottom: '1.5rem',
              }}
            >
              {/* 24-Hour Dial Clock */}
              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1px solid #E6DACB',
                  padding: '24px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <div style={{ width: '100%', marginBottom: '16px' }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: '17px', color: '#2A1F2A', fontFamily: 'Fraunces, serif' }}>
                    Distribusi Jam Live (24 Jam)
                  </h3>
                  <p style={{ margin: 0, fontSize: '12.5px', color: '#6B5D67' }}>
                    Setiap titik mewakili waktu mulai sesi live streaming pada lingkaran jam 24h.
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
                  <svg width={dialSvg.size} height={dialSvg.size} viewBox={`0 0 ${dialSvg.size} ${dialSvg.size}`}>
                    <path d={dialSvg.astridArc} fill="#F4E3C4" />
                    <path d={dialSvg.fifiArc} fill="#DCD9EE" />
                    <circle cx={dialSvg.cx} cy={dialSvg.cy} r={dialSvg.radius} fill="none" stroke="#E6DACB" strokeWidth="1" />
                    {dialSvg.ticks.map((t) => (
                      <text
                        key={t.label}
                        x={t.x}
                        y={t.y}
                        fontFamily="IBM Plex Mono, monospace"
                        fontSize="10"
                        fill="#8A7C86"
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {t.label}
                      </text>
                    ))}
                    {dialSvg.dots.map((d, idx) => (
                      <circle
                        key={`${d.id}-${idx}`}
                        cx={d.x}
                        cy={d.y}
                        r="3.8"
                        fill={d.color}
                        fillOpacity="0.85"
                        stroke="#fff"
                        strokeWidth="1"
                      />
                    ))}
                    <circle cx={dialSvg.cx} cy={dialSvg.cy} r="2.5" fill="#2A1F2A" />
                  </svg>
                </div>

                <div style={{ display: 'flex', gap: '18px', marginTop: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#6B5D67' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#C88A2E' }} />
                    <span>Astrid (06:00 – 17:00)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#6B5D67' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#40396E' }} />
                    <span>Fifi (17:00 – 06:00)</span>
                  </div>
                </div>
              </div>

              {/* Astrid vs Fifi Comparison Bars */}
              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1px solid #E6DACB',
                  padding: '24px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <h3 style={{ margin: '0 0 4px', fontSize: '17px', color: '#2A1F2A', fontFamily: 'Fraunces, serif' }}>
                  Perbandingan Performa Astrid vs Fifi
                </h3>
                <p style={{ margin: '0 0 18px', fontSize: '12.5px', color: '#6B5D67' }}>
                  Persentase kontribusi metrik antar kedua host pada periode ini.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {comparisonMetrics.map(({ label, aVal, fVal, fmt }) => {
                    const total = aVal + fVal || 1
                    const pa = Math.min(100, Math.max(0, +((aVal / total) * 100).toFixed(1)))
                    const pf = Math.min(100, Math.max(0, +(100 - pa).toFixed(1)))
                    return (
                      <div key={label}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '12px',
                            color: '#6B5D67',
                            marginBottom: '4px',
                            fontFamily: 'IBM Plex Mono, monospace',
                          }}
                        >
                          <span style={{ fontWeight: 600, color: '#2A1F2A' }}>{label}</span>
                          <span>
                            Astrid {fmt(aVal)} ({pa}%) · Fifi {fmt(fVal)} ({pf}%)
                          </span>
                        </div>
                        <div style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', background: '#F1EAE0' }}>
                          <div style={{ width: `${pa}%`, background: '#C88A2E', transition: 'width 0.3s ease' }} />
                          <div style={{ width: `${pf}%`, background: '#40396E', transition: 'width 0.3s ease' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* ── Tabel 1: Laporan Harian per Host (Filtered & Sortable) ── */}
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1.5px solid #FEF08A',
                padding: '24px',
                marginBottom: '1.5rem',
                boxShadow: '0 2px 10px rgba(234, 179, 8, 0.05)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ margin: '0 0 2px', fontSize: '18px', color: '#1C1917', fontFamily: 'Fraunces, serif' }}>
                    Laporan Harian per Host
                  </h3>
                  <p style={{ margin: 0, fontSize: '12.5px', color: '#78716C' }}>
                    Rekapitulasi performa per tanggal dan shift host. Klik header kolom untuk mengurutkan (sort).
                  </p>
                </div>

                {/* Filter Host & Search untuk Tabel Harian */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div className="aff-toggle-group">
                    <button
                      type="button"
                      className={`aff-toggle-btn ${dailyFilterHost === 'all' ? 'active' : ''}`}
                      onClick={() => setDailyFilterHost('all')}
                    >
                      Semua Host
                    </button>
                    <button
                      type="button"
                      className={`aff-toggle-btn ${dailyFilterHost === 'Astrid' ? 'active' : ''}`}
                      onClick={() => setDailyFilterHost('Astrid')}
                    >
                      Astrid
                    </button>
                    <button
                      type="button"
                      className={`aff-toggle-btn ${dailyFilterHost === 'Fifi' ? 'active' : ''}`}
                      onClick={() => setDailyFilterHost('Fifi')}
                    >
                      Fifi
                    </button>
                  </div>

                  <input
                    type="text"
                    placeholder="Cari hari / tanggal…"
                    value={dailySearchQuery}
                    onChange={(e) => setDailySearchQuery(e.target.value)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '12.5px',
                      border: '1.5px solid #FEF08A',
                      borderRadius: '8px',
                      minWidth: '180px',
                      background: '#FFFDF5',
                      color: '#1C1917',
                    }}
                  />

                  <span
                    style={{
                      fontSize: '12px',
                      background: '#FEF9C3',
                      border: '1px solid #FEF08A',
                      color: '#854D0E',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontWeight: 600,
                    }}
                  >
                    {dailySummaryList.length} Baris
                  </span>
                </div>
              </div>

              <div className="aff-table-scroll">
                <table className="aff-lemon-table">
                  <thead>
                    <tr>
                      <th
                        onClick={() => handleDailySort('sortTimestamp')}
                        style={{ minWidth: '160px', cursor: 'pointer', userSelect: 'none' }}
                        title="Klik untuk urutkan tanggal"
                      >
                        Hari &amp; Tanggal {dailySortField === 'sortTimestamp' ? (dailySortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => handleDailySort('host')}
                        style={{ minWidth: '95px', cursor: 'pointer', userSelect: 'none' }}
                        title="Klik untuk urutkan host"
                      >
                        Host {dailySortField === 'host' ? (dailySortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => handleDailySort('count')}
                        style={{ textAlign: 'right', minWidth: '90px', cursor: 'pointer', userSelect: 'none' }}
                        title="Klik untuk urutkan sesi live"
                      >
                        Sesi Live {dailySortField === 'count' ? (dailySortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => handleDailySort('penonton')}
                        style={{ textAlign: 'right', minWidth: '115px', cursor: 'pointer', userSelect: 'none' }}
                        title="Klik untuk urutkan total penonton"
                      >
                        Total Penonton {dailySortField === 'penonton' ? (dailySortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => handleDailySort('pesananDibuat')}
                        style={{ textAlign: 'right', minWidth: '115px', cursor: 'pointer', userSelect: 'none' }}
                        title="Klik untuk urutkan pesanan dibuat"
                      >
                        Pesanan Dibuat {dailySortField === 'pesananDibuat' ? (dailySortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => handleDailySort('produkDibuat')}
                        style={{ textAlign: 'right', minWidth: '110px', cursor: 'pointer', userSelect: 'none' }}
                        title="Klik untuk urutkan produk terjual"
                      >
                        Produk Terjual {dailySortField === 'produkDibuat' ? (dailySortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => handleDailySort('penjualanDibuat')}
                        style={{ textAlign: 'right', minWidth: '140px', cursor: 'pointer', userSelect: 'none' }}
                        title="Klik untuk urutkan total omzet dibuat"
                      >
                        Penjualan (Rp) {dailySortField === 'penjualanDibuat' ? (dailySortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailySummaryList.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '1.5rem', color: '#78716C' }}>
                          Tidak ada data harian yang cocok dengan filter atau kata kunci pencarian.
                        </td>
                      </tr>
                    ) : (
                      dailySummaryList.map((row, idx) => (
                        <tr key={`${row.dateKey}-${row.host}-${idx}`}>
                          {/* Kolom Gabungan Hari & Tanggal (misal: "Rabu, 30 Sep 2026") */}
                          <td style={{ fontWeight: 600, color: '#451A03', whiteSpace: 'nowrap' }}>
                            {row.dayDateFormatted}
                          </td>
                          <td>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                background: row.host === 'Astrid' ? '#F4E3C4' : '#DCD9EE',
                                color: row.host === 'Astrid' ? '#8A5D1A' : '#342E59',
                                border: `1px solid ${row.host === 'Astrid' ? '#C88A2E' : '#40396E'}`,
                              }}
                            >
                              {row.host}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace' }}>{row.count}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace' }}>
                            {fmtInt(row.penonton)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace' }}>
                            {fmtInt(row.pesananDibuat)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace' }}>
                            {fmtInt(row.produkDibuat)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: '#15803D' }}>
                            {fmtRp(row.penjualanDibuat)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Tabel 2: Detail Sesi Live Streaming (Read-only Badge, Filter & Sortable) ── */}
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1.5px solid #FEF08A',
                padding: '24px',
                boxShadow: '0 2px 10px rgba(234, 179, 8, 0.05)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ margin: '0 0 2px', fontSize: '18px', color: '#1C1917', fontFamily: 'Fraunces, serif' }}>
                    Detail Sesi Live Streaming
                  </h3>
                  <p style={{ margin: 0, fontSize: '12.5px', color: '#78716C' }}>
                    Daftar seluruh sesi livestream. Kolom host ditampilkan sebagai badge penugasan resmi dari admin.
                  </p>
                </div>

                {/* Filter Tabs, Dropdown Penjualan, & Search Controls */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Filter Host Tabs */}
                  <div className="aff-toggle-group">
                    <button
                      type="button"
                      className={`aff-toggle-btn ${sessionFilterHost === 'all' ? 'active' : ''}`}
                      onClick={() => setSessionFilterHost('all')}
                    >
                      Semua ({activeRows.length})
                    </button>
                    <button
                      type="button"
                      className={`aff-toggle-btn ${sessionFilterHost === 'Astrid' ? 'active' : ''}`}
                      onClick={() => setSessionFilterHost('Astrid')}
                    >
                      Astrid ({astridRows.length})
                    </button>
                    <button
                      type="button"
                      className={`aff-toggle-btn ${sessionFilterHost === 'Fifi' ? 'active' : ''}`}
                      onClick={() => setSessionFilterHost('Fifi')}
                    >
                      Fifi ({fifiRows.length})
                    </button>
                  </div>

                  {/* Filter Status Penjualan */}
                  <select
                    value={sessionSalesFilter}
                    onChange={(e) => setSessionSalesFilter(e.target.value)}
                    style={{
                      padding: '5px 10px',
                      fontSize: '12.5px',
                      border: '1.5px solid #FEF08A',
                      borderRadius: '8px',
                      background: '#FFFDF5',
                      color: '#451A03',
                      fontWeight: 600,
                    }}
                  >
                    <option value="all">Semua Sesi</option>
                    <option value="hasSales">Ada Penjualan (&gt; 0)</option>
                    <option value="noSales">Tanpa Penjualan (0)</option>
                  </select>

                  {/* Search Input */}
                  <div style={{ position: 'relative', minWidth: '220px' }}>
                    <input
                      type="text"
                      placeholder="Cari judul livestream / tanggal…"
                      value={sessionSearchQuery}
                      onChange={(e) => setSessionSearchQuery(e.target.value)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '12.5px',
                        border: '1.5px solid #FEF08A',
                        borderRadius: '8px',
                        width: '100%',
                        background: '#FFFDF5',
                        color: '#1C1917',
                      }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '12px', color: '#78716C', marginBottom: '10px' }}>
                Menampilkan <strong>{filteredAndSortedSessions.length}</strong> dari {activeRows.length} sesi livestream.
              </div>

              <div className="aff-table-scroll">
                <table className="aff-lemon-table">
                  <thead>
                    <tr>
                      <th style={{ width: '45px', textAlign: 'center' }}>No</th>
                      <th
                        onClick={() => handleSessionSort('host')}
                        style={{ minWidth: '100px', cursor: 'pointer', userSelect: 'none' }}
                        title="Klik untuk urutkan host"
                      >
                        Host {sessionSortField === 'host' ? (sessionSortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => handleSessionSort('startTimestamp')}
                        style={{ minWidth: '160px', cursor: 'pointer', userSelect: 'none' }}
                        title="Klik untuk urutkan tanggal"
                      >
                        Hari &amp; Tanggal {sessionSortField === 'startTimestamp' ? (sessionSortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => handleSessionSort('startTime')}
                        style={{ minWidth: '70px', cursor: 'pointer', userSelect: 'none' }}
                        title="Klik untuk urutkan jam mulai"
                      >
                        Mulai {sessionSortField === 'startTime' ? (sessionSortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th style={{ minWidth: '70px' }}>Selesai</th>
                      <th
                        onClick={() => handleSessionSort('durSec')}
                        style={{ minWidth: '80px', cursor: 'pointer', userSelect: 'none' }}
                        title="Klik untuk urutkan durasi"
                      >
                        Durasi {sessionSortField === 'durSec' ? (sessionSortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => handleSessionSort('nama')}
                        style={{ minWidth: '220px', cursor: 'pointer', userSelect: 'none' }}
                        title="Klik untuk urutkan judul live"
                      >
                        Nama Livestream {sessionSortField === 'nama' ? (sessionSortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => handleSessionSort('penontonAktif')}
                        style={{ textAlign: 'right', minWidth: '80px', cursor: 'pointer', userSelect: 'none' }}
                        title="Klik untuk urutkan penonton aktif"
                      >
                        Aktif {sessionSortField === 'penontonAktif' ? (sessionSortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => handleSessionSort('komentar')}
                        style={{ textAlign: 'right', minWidth: '85px', cursor: 'pointer', userSelect: 'none' }}
                      >
                        Komentar {sessionSortField === 'komentar' ? (sessionSortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => handleSessionSort('atc')}
                        style={{ textAlign: 'right', minWidth: '85px', cursor: 'pointer', userSelect: 'none' }}
                      >
                        Keranjang {sessionSortField === 'atc' ? (sessionSortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => handleSessionSort('penonton')}
                        style={{ textAlign: 'right', minWidth: '85px', cursor: 'pointer', userSelect: 'none' }}
                      >
                        Penonton {sessionSortField === 'penonton' ? (sessionSortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => handleSessionSort('pesananDibuat')}
                        style={{ textAlign: 'right', minWidth: '85px', cursor: 'pointer', userSelect: 'none' }}
                      >
                        Pesanan {sessionSortField === 'pesananDibuat' ? (sessionSortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th style={{ textAlign: 'right', minWidth: '95px' }}>Siap Kirim</th>
                      <th
                        onClick={() => handleSessionSort('produkDibuat')}
                        style={{ textAlign: 'right', minWidth: '85px', cursor: 'pointer', userSelect: 'none' }}
                      >
                        Produk {sessionSortField === 'produkDibuat' ? (sessionSortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => handleSessionSort('penjualanDibuat')}
                        style={{ textAlign: 'right', minWidth: '130px', cursor: 'pointer', userSelect: 'none' }}
                        title="Klik untuk urutkan total omzet penjualan"
                      >
                        Penjualan (Rp) {sessionSortField === 'penjualanDibuat' ? (sessionSortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedSessions.length === 0 ? (
                      <tr>
                        <td colSpan={15} style={{ textAlign: 'center', padding: '1.5rem', color: '#78716C' }}>
                          Tidak ada sesi live yang cocok dengan filter atau kata kunci pencarian.
                        </td>
                      </tr>
                    ) : (
                      filteredAndSortedSessions.map((r, i) => (
                        <tr key={r.id}>
                          <td style={{ textAlign: 'center', fontFamily: 'IBM Plex Mono, monospace', color: '#78716C' }}>
                            {i + 1}
                          </td>
                          {/* Host Read-Only Badge */}
                          <td>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                background: r.host === 'Astrid' ? '#F4E3C4' : '#DCD9EE',
                                color: r.host === 'Astrid' ? '#8A5D1A' : '#342E59',
                                border: `1px solid ${r.host === 'Astrid' ? '#C88A2E' : '#40396E'}`,
                              }}
                            >
                              {r.host}
                            </span>
                          </td>
                          {/* Kolom Gabungan Hari & Tanggal (misal: "Rabu, 30 Sep 2026") */}
                          <td style={{ fontWeight: 600, color: '#451A03', whiteSpace: 'nowrap' }}>
                            {getFormattedDayDate(r)}
                          </td>
                          <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{r.startTime}</td>
                          <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{r.endTime}</td>
                          <td style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{formatDurationHM(r.durSec)}</td>
                          <td style={{ maxWidth: '280px', wordBreak: 'break-word', fontWeight: 500 }}>{r.nama}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace' }}>
                            {fmtInt(r.penontonAktif)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace' }}>
                            {fmtInt(r.komentar)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace' }}>
                            {fmtInt(r.atc)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace' }}>
                            {fmtInt(r.penonton)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600 }}>
                            {fmtInt(r.pesananDibuat)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace' }}>
                            {fmtInt(r.pesananSiap)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace' }}>
                            {fmtInt(r.produkDibuat)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: '#15803D' }}>
                            {fmtRp(r.penjualanDibuat)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Toast Alert */}
        {toastVisible && (
          <div
            style={{
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              background: '#1C1917',
              color: '#FEF08A',
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>🍋</span>
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    </AuthGate>
  )
}
