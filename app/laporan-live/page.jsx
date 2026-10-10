'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import AuthGate from '@/components/AuthGate'
import LemonIcon from '@/components/LemonIcon'
import {
  INDONESIAN_DAYS,
  applyHostOverrides,
  summarizeSessions,
  formatDurationHM,
} from '@/lib/parseLaporanLive'

function fmtRp(n) {
  return 'Rp' + Math.round(n || 0).toLocaleString('id-ID')
}

function fmtInt(n) {
  return Math.round(n || 0).toLocaleString('id-ID')
}

export default function LaporanLivePage() {
  const [indexData, setIndexData] = useState({ customers: [] })
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedPeriodId, setSelectedPeriodId] = useState('')

  const [periodData, setPeriodData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)

  // Local overrides state (can be modified interactively)
  const [dayOverrides, setDayOverrides] = useState({})
  const [sessionOverrides, setSessionOverrides] = useState({})
  const [savingOverrides, setSavingOverrides] = useState(false)

  // Filter & Search
  const [currentFilter, setCurrentFilter] = useState('all') // 'all' | 'Astrid' | 'Fifi'
  const [searchQuery, setSearchQuery] = useState('')
  const [showOverrideSection, setShowOverrideSection] = useState(false)

  // Toast
  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)

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
        // Find URL params or default to first customer and latest period
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
        setDayOverrides(body.data.dayOverrides || {})
        setSessionOverrides(body.data.sessionOverrides || {})
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

  // Apply overrides to raw rows
  const activeRows = useMemo(() => {
    if (!periodData || !periodData.rows) return []
    return applyHostOverrides(periodData.rows, dayOverrides, sessionOverrides)
  }, [periodData, dayOverrides, sessionOverrides])

  // Save overrides to backend
  const saveOverridesToServer = async (nextDayOverrides, nextSessionOverrides) => {
    if (!selectedCustomerId || !selectedPeriodId) return
    setSavingOverrides(true)
    try {
      const res = await fetch('/api/laporan-live/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          periodId: selectedPeriodId,
          dayOverrides: nextDayOverrides,
          sessionOverrides: nextSessionOverrides,
        }),
      })
      if (!res.ok) throw new Error('Gagal menyimpan penugasan.')
      showToast('Penugasan host berhasil disimpan.')
    } catch (err) {
      console.error(err)
      showToast('Gagal menyimpan penugasan ke storage.')
    } finally {
      setSavingOverrides(false)
    }
  }

  // Day override toggle
  const handleDayOverrideChange = (dateKey, choice) => {
    const next = { ...dayOverrides }
    if (choice === 'auto') {
      delete next[dateKey]
    } else {
      next[dateKey] = choice
    }
    setDayOverrides(next)
    saveOverridesToServer(next, sessionOverrides)
  }

  // Session override toggle
  const handleSessionOverrideChange = (rowId, choice) => {
    const next = { ...sessionOverrides }
    if (choice === 'auto') {
      delete next[rowId]
    } else {
      next[rowId] = choice
    }
    setSessionOverrides(next)
    saveOverridesToServer(dayOverrides, next)
  }

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

  // Daily summary list (chronological) with Indonesian day name!
  const dailySummaryList = useMemo(() => {
    const dateMap = new Map()

    activeRows.forEach((r) => {
      if (!dateMap.has(r.dateKey)) {
        dateMap.set(r.dateKey, {
          dateKey: r.dateKey,
          dayName: r.dayName,
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
            dayName: d.dayName,
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

    return list
  }, [activeRows])

  // Unique calendar days for day overrides
  const uniqueCalendarDays = useMemo(() => {
    const byDate = new Map()
    activeRows.forEach((r) => {
      if (!byDate.has(r.dateKey)) {
        byDate.set(r.dateKey, {
          dateKey: r.dateKey,
          dayName: r.dayName,
          sortTimestamp: r.startTimestamp,
          astrid: 0,
          fifi: 0,
        })
      }
      const entry = byDate.get(r.dateKey)
      if (r.autoHost === 'Astrid') entry.astrid++
      else entry.fifi++
    })
    return Array.from(byDate.values()).sort((a, b) => a.sortTimestamp - b.sortTimestamp)
  }, [activeRows])

  // Filtered detailed rows
  const filteredRows = useMemo(() => {
    return activeRows.filter((r) => {
      if (currentFilter !== 'all' && r.host !== currentFilter) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const matchTitle = (r.nama || '').toLowerCase().includes(q)
        const matchDate = (r.dateKey || '').toLowerCase().includes(q)
        const matchDay = (r.dayName || '').toLowerCase().includes(q)
        if (!matchTitle && !matchDate && !matchDay) return false
      }
      return true
    })
  }, [activeRows, currentFilter, searchQuery])

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

  // Export Excel Function
  const handleExportExcel = () => {
    if (!activeRows.length) {
      showToast('Tidak ada data untuk diekspor.')
      return
    }

    const wb = XLSX.utils.book_new()

    // 1. Ringkasan per Host
    const summaryRows = ['Astrid', 'Fifi'].map((h) => {
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
    })
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows)
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan per Host')

    // 2. Laporan Harian per Host (dengan Hari dalam Bahasa Indonesia)
    const dailyExportRows = dailySummaryList.map((item) => ({
      Hari: item.dayName,
      Tanggal: item.dateKey,
      Host: item.host,
      'Sesi Live': item.count,
      'Total Penonton': item.penonton,
      'Pesanan Dibuat': item.pesananDibuat,
      'Produk Terjual': item.produkDibuat,
      'Penjualan Dibuat (Rp)': item.penjualanDibuat,
    }))
    const wsDaily = XLSX.utils.json_to_sheet(dailyExportRows)
    XLSX.utils.book_append_sheet(wb, wsDaily, 'Laporan Harian per Host')

    // 3. Detail Sesi Live (dengan Hari dalam Bahasa Indonesia)
    const detailExportRows = filteredRows.map((r, i) => ({
      No: i + 1,
      Host: r.host,
      'Penugasan Manual':
        r.overrideSource === 'session'
          ? `Ya (Sesi, otomatis: ${r.autoHost})`
          : r.overrideSource === 'day'
          ? `Ya (Hari, otomatis: ${r.autoHost})`
          : 'Otomatis',
      Hari: r.dayName,
      Tanggal: r.dateKey,
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

  // Available periods for the current customer
  const currentCustomerObj = indexData.customers?.find((c) => c.id === selectedCustomerId)
  const availablePeriods = currentCustomerObj?.periods || []

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
              Analisis performa shift live streaming (Astrid &amp; Fifi), rincian harian omzet, dan kontrol penugasan host.
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
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#713F12' }}>Periode:</label>
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
              Silakan masuk ke menu Admin untuk mengunggah file Excel laporan live streaming (misalnya file ekspor Shopee Live).
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
            {/* ── Summary Host Cards (Astrid vs Fifi) ── */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '16px',
                marginBottom: '1.5rem',
              }}
            >
              {/* Astrid Card */}
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

              {/* Fifi Card */}
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

            {/* ── Day Overrides Accordion (Kelola Penugasan Host Harian) ── */}
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E6DACB',
                padding: '20px 24px',
                marginBottom: '1.5rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
                onClick={() => setShowOverrideSection(!showOverrideSection)}
              >
                <div>
                  <h3 style={{ margin: '0 0 2px', fontSize: '16.5px', color: '#2A1F2A', fontFamily: 'Fraunces, serif' }}>
                    ⚙️ Atur Penugasan Host per Hari ({uniqueCalendarDays.length} Hari)
                  </h3>
                  <p style={{ margin: 0, fontSize: '12.5px', color: '#6B5D67' }}>
                    Secara default sistem membagi otomatis berdasarkan jam selesai sesi live. Anda dapat mengubah penugasan host per tanggal di sini.
                  </p>
                </div>
                <button
                  type="button"
                  className="pill-btn"
                  style={{ fontSize: '12px', padding: '4px 10px', marginLeft: '10px' }}
                >
                  {showOverrideSection ? 'Tutup ▲' : 'Buka Pengaturan ▼'}
                </button>
              </div>

              {showOverrideSection && (
                <div style={{ marginTop: '16px', borderTop: '1px solid #E6DACB', paddingTop: '16px' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                      gap: '10px',
                    }}
                  >
                    {uniqueCalendarDays.map((d) => {
                      const current = dayOverrides[d.dateKey] || 'auto'
                      const isOverridden = !!dayOverrides[d.dateKey]
                      return (
                        <div
                          key={d.dateKey}
                          style={{
                            border: isOverridden ? '1.5px solid #C88A2E' : '1px solid #E6DACB',
                            background: isOverridden ? '#FFFDF5' : '#FEFCFA',
                            borderRadius: '10px',
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: '12.5px', color: '#2A1F2A', fontFamily: 'IBM Plex Mono, monospace' }}>
                              {d.dayName}, {d.dateKey}
                            </span>
                          </div>
                          <span style={{ fontSize: '11px', color: '#6B5D67' }}>
                            Otomatis: {d.astrid} Astrid · {d.fifi} Fifi
                          </span>
                          <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                            {['auto', 'Astrid', 'Fifi'].map((choice) => {
                              const isActive = current === choice
                              let bg = '#FFFFFF'
                              let col = '#6B5D67'
                              let bColor = '#E6DACB'
                              if (isActive) {
                                if (choice === 'Astrid') {
                                  bg = '#C88A2E'
                                  col = '#FFFFFF'
                                  bColor = '#C88A2E'
                                } else if (choice === 'Fifi') {
                                  bg = '#40396E'
                                  col = '#FFFFFF'
                                  bColor = '#40396E'
                                } else {
                                  bg = '#2A1F2A'
                                  col = '#FFFFFF'
                                  bColor = '#2A1F2A'
                                }
                              }
                              return (
                                <button
                                  key={choice}
                                  type="button"
                                  onClick={() => handleDayOverrideChange(d.dateKey, choice)}
                                  disabled={savingOverrides}
                                  style={{
                                    flex: 1,
                                    padding: '4px 0',
                                    fontSize: '11px',
                                    fontWeight: isActive ? 700 : 500,
                                    background: bg,
                                    color: col,
                                    border: `1px solid ${bColor}`,
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontFamily: 'IBM Plex Mono, monospace',
                                    transition: 'all 0.15s ease',
                                  }}
                                >
                                  {choice === 'auto' ? 'Otomatis' : choice}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Laporan Harian per Host (Daily Summary Table with Indonesian Day) ── */}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h3 style={{ margin: '0 0 2px', fontSize: '18px', color: '#1C1917', fontFamily: 'Fraunces, serif' }}>
                    Laporan Harian per Host
                  </h3>
                  <p style={{ margin: 0, fontSize: '12.5px', color: '#78716C' }}>
                    Rekapitulasi performa per tanggal dan shift host, dilengkapi nama hari (Senin, Selasa, dll).
                  </p>
                </div>
                <span
                  style={{
                    fontSize: '12px',
                    background: '#FEF9C3',
                    border: '1px solid #FEF08A',
                    color: '#854D0E',
                    padding: '3px 9px',
                    borderRadius: '6px',
                    fontWeight: 600,
                  }}
                >
                  {dailySummaryList.length} Baris Harian
                </span>
              </div>

              <div className="aff-table-scroll">
                <table className="aff-lemon-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: '90px' }}>Hari</th>
                      <th style={{ minWidth: '100px' }}>Tanggal</th>
                      <th style={{ minWidth: '95px' }}>Host</th>
                      <th style={{ textAlign: 'right', minWidth: '85px' }}>Sesi Live</th>
                      <th style={{ textAlign: 'right', minWidth: '105px' }}>Total Penonton</th>
                      <th style={{ textAlign: 'right', minWidth: '105px' }}>Pesanan Dibuat</th>
                      <th style={{ textAlign: 'right', minWidth: '105px' }}>Produk Terjual</th>
                      <th style={{ textAlign: 'right', minWidth: '130px' }}>Penjualan (Rp)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailySummaryList.map((row, idx) => (
                      <tr key={`${row.dateKey}-${row.host}-${idx}`}>
                        <td style={{ fontWeight: 600, color: '#451A03' }}>{row.dayName}</td>
                        <td style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#1C1917' }}>{row.dateKey}</td>
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
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Detail Sesi Live (Detailed Session Table) ── */}
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
                    Daftar lengkap seluruh sesi dengan durasi, jam tayang, metrik penonton, serta konversi pesanan.
                  </p>
                </div>

                {/* Filter Tabs & Search Controls */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div className="aff-toggle-group">
                    <button
                      type="button"
                      className={`aff-toggle-btn ${currentFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setCurrentFilter('all')}
                    >
                      Semua ({activeRows.length})
                    </button>
                    <button
                      type="button"
                      className={`aff-toggle-btn ${currentFilter === 'Astrid' ? 'active' : ''}`}
                      onClick={() => setCurrentFilter('Astrid')}
                    >
                      Astrid ({astridRows.length})
                    </button>
                    <button
                      type="button"
                      className={`aff-toggle-btn ${currentFilter === 'Fifi' ? 'active' : ''}`}
                      onClick={() => setCurrentFilter('Fifi')}
                    >
                      Fifi ({fifiRows.length})
                    </button>
                  </div>

                  <div style={{ position: 'relative', minWidth: '220px' }}>
                    <input
                      type="text"
                      placeholder="Cari judul / tanggal…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
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
                Menampilkan <strong>{filteredRows.length}</strong> dari {activeRows.length} sesi livestream.
              </div>

              <div className="aff-table-scroll">
                <table className="aff-lemon-table">
                  <thead>
                    <tr>
                      <th style={{ width: '45px', textAlign: 'center' }}>No</th>
                      <th style={{ minWidth: '150px' }}>Host Penugasan</th>
                      <th style={{ minWidth: '85px' }}>Hari</th>
                      <th style={{ minWidth: '95px' }}>Tanggal</th>
                      <th style={{ minWidth: '70px' }}>Mulai</th>
                      <th style={{ minWidth: '70px' }}>Selesai</th>
                      <th style={{ minWidth: '80px' }}>Durasi</th>
                      <th style={{ minWidth: '220px' }}>Nama Livestream</th>
                      <th style={{ textAlign: 'right', minWidth: '85px' }}>Aktif</th>
                      <th style={{ textAlign: 'right', minWidth: '85px' }}>Komentar</th>
                      <th style={{ textAlign: 'right', minWidth: '85px' }}>Keranjang</th>
                      <th style={{ textAlign: 'right', minWidth: '85px' }}>Penonton</th>
                      <th style={{ textAlign: 'right', minWidth: '85px' }}>Pesanan</th>
                      <th style={{ textAlign: 'right', minWidth: '95px' }}>Siap Kirim</th>
                      <th style={{ textAlign: 'right', minWidth: '85px' }}>Produk</th>
                      <th style={{ textAlign: 'right', minWidth: '125px' }}>Penjualan (Rp)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r, i) => {
                      const selVal = sessionOverrides[r.id] || 'auto'
                      const autoLabel =
                        r.overrideSource === 'day' ? `Otomatis (hari: ${r.host})` : `Otomatis (${r.autoHost})`
                      return (
                        <tr key={r.id}>
                          <td style={{ textAlign: 'center', fontFamily: 'IBM Plex Mono, monospace', color: '#78716C' }}>
                            {i + 1}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <select
                                value={selVal}
                                onChange={(e) => handleSessionOverrideChange(r.id, e.target.value)}
                                style={{
                                  fontSize: '11.5px',
                                  padding: '3px 6px',
                                  borderRadius: '6px',
                                  border:
                                    r.host === 'Astrid' ? '1.5px solid #C88A2E' : '1.5px solid #40396E',
                                  background: r.host === 'Astrid' ? '#FFFDF5' : '#F5F3FF',
                                  color: r.host === 'Astrid' ? '#8A5D1A' : '#342E59',
                                  fontWeight: 600,
                                }}
                              >
                                <option value="auto">{autoLabel}</option>
                                <option value="Astrid">Astrid</option>
                                <option value="Fifi">Fifi</option>
                              </select>
                              {r.overrideSource === 'session' && (
                                <span
                                  title="Diubah manual untuk sesi ini"
                                  style={{
                                    width: '7px',
                                    height: '7px',
                                    borderRadius: '50%',
                                    background: '#D97706',
                                    display: 'inline-block',
                                  }}
                                />
                              )}
                            </div>
                          </td>
                          <td style={{ fontWeight: 600, color: '#451A03' }}>{r.dayName}</td>
                          <td style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#1C1917' }}>{r.dateKey}</td>
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
                      )
                    })}
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
