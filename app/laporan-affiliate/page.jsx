'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import AuthGate from '@/components/AuthGate'
import KpiCard from '@/components/affiliate/KpiCard'
import LemonIcon from '@/components/LemonIcon'

export default function LaporanAffiliatePage() {
  const [activePlatform, setActivePlatform] = useState('semua') // 'semua' | 'shopee' | 'tiktok'
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Filters
  const [timeMode, setTimeMode] = useState('all') // 'all' | 'date'
  const [selectedDate, setSelectedDate] = useState('ALL')
  const [selectedBrand, setSelectedBrand] = useState('ALL')
  const [selectedProgress, setSelectedProgress] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Toast
  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)

  const showToast = useCallback((msg) => {
    setToastMessage(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2000)
  }, [])

  // 1. Fetch data from API
  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const res = await fetch('/api/laporan-affiliate/data')
      if (res.ok) {
        const body = await res.json()
        if (body.data) {
          setData(body.data)
          if (isRefresh) showToast('Data berhasil diperbarui dari Vercel Blob!')
        }
      }
    } catch (err) {
      console.error('Error fetching laporan affiliate data:', err)
      showToast('Gagal memuat data laporan affiliate.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Extract master lists from data
  const rawRecords = useMemo(() => data?.affiliatorDetails || [], [data])

  const availableDates = useMemo(() => {
    return [...new Set(rawRecords.map((r) => r.date).filter(Boolean))].sort().reverse()
  }, [rawRecords])

  const availableBrands = useMemo(() => {
    return [...new Set(rawRecords.map((r) => r.brand).filter(Boolean))].sort()
  }, [rawRecords])

  const availableStatuses = useMemo(() => {
    return [...new Set(rawRecords.map((r) => r.progress).filter(Boolean))].sort()
  }, [rawRecords])

  // Filtered records
  const filteredRecords = useMemo(() => {
    return rawRecords.filter((item) => {
      // Platform filter
      if (activePlatform !== 'semua') {
        if (item.platform?.toLowerCase() !== activePlatform) return false
      }
      // Date filter
      if (timeMode === 'date' && selectedDate !== 'ALL') {
        if (item.date !== selectedDate) return false
      }
      // Brand filter
      if (selectedBrand !== 'ALL') {
        if (item.brand !== selectedBrand) return false
      }
      // Progress filter
      if (selectedProgress !== 'ALL') {
        if (item.progress !== selectedProgress) return false
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchUser = item.username?.toLowerCase().includes(q)
        const matchContact = item.contact?.toLowerCase().includes(q)
        const matchCategory = item.category?.toLowerCase().includes(q)
        if (!matchUser && !matchContact && !matchCategory) return false
      }
      return true
    })
  }, [rawRecords, activePlatform, timeMode, selectedDate, selectedBrand, selectedProgress, searchQuery])

  // Dynamic KPI calculations based on filtered records
  const kpis = useMemo(() => {
    const total = filteredRecords.length
    const tt = filteredRecords.filter((r) => r.platform?.toLowerCase() === 'tiktok').length
    const sp = filteredRecords.filter((r) => r.platform?.toLowerCase() === 'shopee').length
    const listing = filteredRecords.filter((r) => r.progress?.toLowerCase() === 'listing').length
    const approaching = filteredRecords.filter((r) => r.progress?.toLowerCase() === 'approaching').length
    const brands = [...new Set(filteredRecords.map((r) => r.brand).filter(Boolean))]

    const listingPct = total > 0 ? ((listing / total) * 100).toFixed(1) : '0'
    const approachingPct = total > 0 ? ((approaching / total) * 100).toFixed(1) : '0'

    return {
      total,
      tt,
      sp,
      listing,
      listingPct,
      approaching,
      approachingPct,
      brandCount: brands.length,
      brandsList: brands.slice(0, 2).join(', ') + (brands.length > 2 ? ` +${brands.length - 2}` : '')
    }
  }, [filteredRecords])

  // Dynamic Daily Breakdown
  const dynamicDailyRows = useMemo(() => {
    const dates = [...new Set(filteredRecords.map((r) => r.date).filter(Boolean))].sort().reverse()
    return dates.map((d) => {
      const recs = filteredRecords.filter((r) => r.date === d)
      return {
        date: d,
        total: recs.length,
        tiktok: recs.filter((r) => r.platform?.toLowerCase() === 'tiktok').length,
        shopee: recs.filter((r) => r.platform?.toLowerCase() === 'shopee').length,
        listing: recs.filter((r) => r.progress?.toLowerCase() === 'listing').length,
        approaching: recs.filter((r) => r.progress?.toLowerCase() === 'approaching').length
      }
    })
  }, [filteredRecords])

  // Dynamic Progress Breakdown
  const dynamicProgressRows = useMemo(() => {
    const statuses = [...new Set(filteredRecords.map((r) => r.progress).filter(Boolean))].sort()
    const total = filteredRecords.length || 1
    return statuses.map((s) => {
      const recs = filteredRecords.filter((r) => r.progress === s)
      return {
        status: s,
        tiktok: recs.filter((r) => r.platform?.toLowerCase() === 'tiktok').length,
        shopee: recs.filter((r) => r.platform?.toLowerCase() === 'shopee').length,
        total: recs.length,
        pct: ((recs.length / total) * 100).toFixed(1)
      }
    })
  }, [filteredRecords])

  // Dynamic Brand Breakdown
  const dynamicBrandRows = useMemo(() => {
    const brands = [...new Set(filteredRecords.map((r) => r.brand).filter(Boolean))].sort()
    const total = filteredRecords.length || 1
    return brands.map((b) => {
      const recs = filteredRecords.filter((r) => r.brand === b)
      return {
        brand: b,
        tiktok: recs.filter((r) => r.platform?.toLowerCase() === 'tiktok').length,
        shopee: recs.filter((r) => r.platform?.toLowerCase() === 'shopee').length,
        total: recs.length,
        listing: recs.filter((r) => r.progress?.toLowerCase() === 'listing').length,
        approaching: recs.filter((r) => r.progress?.toLowerCase() === 'approaching').length,
        pct: ((recs.length / total) * 100).toFixed(1)
      }
    })
  }, [filteredRecords])

  // Export to Excel function
  const handleExportExcel = () => {
    if (!filteredRecords.length) {
      showToast('Tidak ada data untuk diekspor.')
      return
    }

    const wb = XLSX.utils.book_new()

    // 1. KPI Sheet
    const kpiData = [
      ['METRIK LAPORAN AFFILIATE', 'NILAI', 'KETERANGAN'],
      ['Total Affiliator', kpis.total, `TikTok: ${kpis.tt} | Shopee: ${kpis.sp}`],
      ['Status: Listing', kpis.listing, `${kpis.listingPct}% dari total`],
      ['Status: Approaching', kpis.approaching, `${kpis.approachingPct}% dari total`],
      ['Brand Aktif', kpis.brandCount, kpis.brandsList || 'Semua Brand'],
      ['Terakhir Disinkronkan', data?.savedAt || '-', 'Vercel Blob Storage']
    ]
    const wsKpi = XLSX.utils.aoa_to_sheet(kpiData)
    XLSX.utils.book_append_sheet(wb, wsKpi, 'Ringkasan KPI')

    // 2. Daily Breakdown Sheet
    const dailyData = [
      ['Tanggal', 'Total Affiliator', 'TikTok', 'Shopee', 'Listing', 'Approaching'],
      ...dynamicDailyRows.map((r) => [r.date, r.total, r.tiktok, r.shopee, r.listing, r.approaching])
    ]
    const wsDaily = XLSX.utils.aoa_to_sheet(dailyData)
    XLSX.utils.book_append_sheet(wb, wsDaily, 'Rincian Harian')

    // 3. Progress Breakdown Sheet
    const progressData = [
      ['Status Progress', 'TikTok', 'Shopee', 'Total Affiliator', 'Persentase (%)'],
      ...dynamicProgressRows.map((r) => [r.status, r.tiktok, r.shopee, r.total, `${r.pct}%`])
    ]
    const wsProgress = XLSX.utils.aoa_to_sheet(progressData)
    XLSX.utils.book_append_sheet(wb, wsProgress, 'Breakdown Progress')

    // 4. Details Sheet
    const detailData = [
      ['No', 'Tanggal', 'Platform', 'Username', 'Brand', 'Progress', 'GMV', 'Followers', 'Kategori', 'Kontak'],
      ...filteredRecords.map((r, i) => [
        i + 1,
        r.date,
        r.platform,
        r.username,
        r.brand,
        r.progress,
        r.gmv,
        r.followers,
        r.category,
        r.contact
      ])
    ]
    const wsDetail = XLSX.utils.aoa_to_sheet(detailData)
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Log Affiliator')

    const fileName = `Laporan_Affiliate_${activePlatform}_${new Date().toISOString().slice(0, 10)}.xlsx`
    XLSX.writeFile(wb, fileName)
    showToast('File Excel berhasil diunduh!')
  }

  // Format timestamp helper
  const formattedSyncTime = useMemo(() => {
    if (!data?.savedAt) return 'Belum ada data sinkronisasi'
    try {
      const d = new Date(data.savedAt)
      return d.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return data.savedAt
    }
  }, [data?.savedAt])

  return (
    <AuthGate>
      <div className="aff-page-shell">
        {/* Top Header */}
        <header className="aff-top-header">
          <div>
            <div className="aff-lemon-eyebrow">
              <LemonIcon size={15} />
              <span>TMS ONLINE · LAPORAN AFFILIATE</span>
            </div>
            <h1 style={{ color: '#1C1917', fontSize: '28px', fontWeight: 800, margin: '2px 0 6px', letterSpacing: '-0.02em' }}>
              Laporan Affiliate
            </h1>
            <p className="aff-header-sub">
              {activePlatform === 'shopee'
                ? 'Rekap performa listing & pendekatan Shopee Affiliate dari Google Sheets'
                : activePlatform === 'tiktok'
                ? 'Rekap performa listing & pendekatan TikTok Shop Affiliate dari Google Sheets'
                : 'Rekap performa pendekatan & listing affiliator TikTok & Shopee dari Google Sheets'}
            </p>
          </div>

          <div className="aff-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {data && (
              <button
                type="button"
                className="btn-export-lemon"
                onClick={handleExportExcel}
                title="Unduh laporan dalam format Excel (.xlsx)"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
              onClick={() => fetchData(true)}
              disabled={refreshing}
              title="Sinkronkan ulang data dari Vercel Blob"
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
                style={{ transform: refreshing ? 'rotate(360deg)' : 'none', transition: 'transform 0.8s ease' }}
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              <span>{refreshing ? 'Memuat...' : 'Refresh'}</span>
            </button>
          </div>
        </header>

        {/* Sync Status Badge Bar */}
        <div className="aff-status-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="aff-status-pulse" />
            <span style={{ color: '#713F12' }}>
              Sumber Data: <strong style={{ color: '#451A03' }}>Google Sheets (AFFILIATE REPORT) &amp; Vercel Blob</strong>
            </span>
          </div>
          <div style={{ color: '#78716C', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Terakhir Sinkron:</span>
            <span style={{ background: '#FEF08A', color: '#854D0E', padding: '3px 8px', borderRadius: '6px', fontWeight: 700, border: '1px solid #FDE047' }}>
              {formattedSyncTime}
            </span>
          </div>
        </div>

        {/* Main Platform Switcher Tabs */}
        <div className="aff-platform-tabs">
          <button
            type="button"
            className={`aff-plat-btn ${activePlatform === 'semua' ? 'is-active semua' : ''}`}
            onClick={() => setActivePlatform('semua')}
          >
            <span className="dot" style={{ background: '#EAB308' }} />
            Semua Platform
          </button>
          <button
            type="button"
            className={`aff-plat-btn ${activePlatform === 'shopee' ? 'is-active shopee' : ''}`}
            onClick={() => setActivePlatform('shopee')}
          >
            <span className="dot" style={{ background: '#EA580C' }} />
            Shopee
          </button>
          <button
            type="button"
            className={`aff-plat-btn ${activePlatform === 'tiktok' ? 'is-active tiktok' : ''}`}
            onClick={() => setActivePlatform('tiktok')}
          >
            <span className="dot" style={{ background: '#16A34A' }} />
            TikTok Shop
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="aff-control-bar">
          {/* Filter 1: Waktu */}
          <div className="aff-filter-group">
            <label className="aff-filter-label">Filter Waktu:</label>
            <div className="aff-toggle-group">
              <button
                type="button"
                className={`aff-toggle-btn ${timeMode === 'all' ? 'active' : ''}`}
                onClick={() => { setTimeMode('all'); setSelectedDate('ALL') }}
              >
                All-Time
              </button>
              <button
                type="button"
                className={`aff-toggle-btn ${timeMode === 'date' ? 'active' : ''}`}
                onClick={() => setTimeMode('date')}
              >
                Pilih Tanggal
              </button>
            </div>

            {timeMode === 'date' && (
              <select
                className="aff-month-select"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              >
                <option value="ALL">Semua Tanggal ({availableDates.length})</option>
                {availableDates.map((d) => (
                  <option key={d} value={d}>
                    Tanggal {d}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Filter 2: Brand */}
          <div className="aff-filter-group">
            <label className="aff-filter-label">Brand:</label>
            <select
              className="aff-account-select"
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
            >
              <option value="ALL">Semua Brand ({availableBrands.length})</option>
              {availableBrands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Filter 3: Progress */}
          <div className="aff-filter-group">
            <label className="aff-filter-label">Progress:</label>
            <select
              className="aff-account-select"
              value={selectedProgress}
              onChange={(e) => setSelectedProgress(e.target.value)}
            >
              <option value="ALL">Semua Status ({availableStatuses.length})</option>
              {availableStatuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Filter 4: Search input */}
          <div className="aff-filter-group" style={{ flex: '1 1 220px', minWidth: '200px' }}>
            <label className="aff-filter-label">Cari:</label>
            <div style={{ position: 'relative', width: '100%', flex: 1 }}>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#78716C"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="login-input"
                placeholder="Cari username, kontak, kategori..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  height: '36px',
                  fontSize: '13px',
                  paddingLeft: '32px',
                  paddingRight: '30px',
                  backgroundColor: '#FFFFFF',
                  borderColor: '#E2E8F0',
                  color: '#1C1917',
                  borderRadius: '8px'
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  title="Hapus pencarian"
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: '#FEF08A',
                    border: 'none',
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#854D0E',
                    cursor: 'pointer',
                    fontSize: '11px',
                    padding: 0
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content View */}
        {loading ? (
          <div className="aff-lemon-card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem', marginTop: '1.5rem' }}>
            <div className="spinner" style={{ width: '36px', height: '36px', borderWidth: '3px', borderColor: '#FEF08A', borderTopColor: '#EAB308', margin: '0 auto 14px' }} />
            <p style={{ color: '#713F12', fontSize: '14.5px', fontWeight: 600, margin: 0 }}>Memuat data Laporan Affiliate dari Vercel Blob...</p>
          </div>
        ) : !data || rawRecords.length === 0 ? (
          <div className="aff-lemon-card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem', marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
              <LemonIcon size={48} />
            </div>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#1F2937', margin: '0 0 8px' }}>Belum ada data laporan affiliator tersimpan</h3>
            <p style={{ fontSize: '13.5px', color: '#78716C', maxWidth: '520px', margin: '0 auto', lineHeight: 1.5 }}>
              Buka Google Sheet Anda, pilih menu <strong>Affiliate Marketing &gt; Push Report to Dashboard (Vercel)</strong> untuk mengirimkan data ke web dashboard ini.
            </p>
          </div>
        ) : (
          <>
            {/* KPI Summary Cards */}
            <div className="aff-kpi-grid">
              <KpiCard
                label={timeMode === 'all' ? 'Total Affiliator (All Time)' : `Total Affiliator (${selectedDate})`}
                value={kpis.total.toLocaleString('id-ID')}
                sub={`TikTok: ${kpis.tt}  |  Shopee: ${kpis.sp}`}
                color="#EAB308"
                raw={kpis.total}
                onCopy={showToast}
              />
              <KpiCard
                label="In Progress: Listing"
                value={kpis.listing.toLocaleString('id-ID')}
                sub={`${kpis.listingPct}% dari total affiliator`}
                color="#16A34A"
                raw={kpis.listing}
                onCopy={showToast}
              />
              <KpiCard
                label="In Progress: Approaching"
                value={kpis.approaching.toLocaleString('id-ID')}
                sub={`${kpis.approachingPct}% dari total affiliator`}
                color="#EA580C"
                raw={kpis.approaching}
                onCopy={showToast}
              />
              <KpiCard
                label="Brand Aktif"
                value={kpis.brandCount}
                sub={kpis.brandsList || 'Semua Brand'}
                color="#D97706"
                raw={kpis.brandCount}
                onCopy={showToast}
              />
            </div>

            {/* Section 1: Daily Breakdown Log */}
            <div className="aff-lemon-card" style={{ marginBottom: '1.5rem' }}>
              <div className="aff-section-header">
                <h3 className="aff-section-title">
                  <span className="aff-section-icon-wrap yellow">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </span>
                  <span>1. Rincian Harian (Daily Affiliator Breakdown Log)</span>
                </h3>
                <span className="aff-counter-badge">
                  {dynamicDailyRows.length} tanggal tercatat
                </span>
              </div>

              <div className="aff-table-scroll">
                <table className="aff-lemon-table">
                  <thead>
                    <tr>
                      <th style={{ paddingLeft: '16px' }}>Tanggal</th>
                      <th style={{ textAlign: 'center' }}>Total Affiliator</th>
                      <th style={{ textAlign: 'center' }}>TikTok</th>
                      <th style={{ textAlign: 'center' }}>Shopee</th>
                      <th style={{ textAlign: 'center' }}>Listing</th>
                      <th style={{ textAlign: 'center' }}>Approaching</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dynamicDailyRows.map((row) => (
                      <tr key={row.date}>
                        <td style={{ fontWeight: 700, color: '#1F2937', paddingLeft: '16px' }}>{row.date}</td>
                        <td style={{ textAlign: 'center', fontWeight: 800, color: '#111827' }}>{row.total}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: '#059669' }}>{row.tiktok}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: '#EA580C' }}>{row.shopee}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: '#16A34A' }}>{row.listing}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: '#D97706' }}>{row.approaching}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ paddingLeft: '16px' }}>TOTAL</td>
                      <td style={{ textAlign: 'center' }}>{kpis.total}</td>
                      <td style={{ textAlign: 'center' }}>{kpis.tt}</td>
                      <td style={{ textAlign: 'center' }}>{kpis.sp}</td>
                      <td style={{ textAlign: 'center' }}>{kpis.listing}</td>
                      <td style={{ textAlign: 'center' }}>{kpis.approaching}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Section 2: Progress & Brand Breakdown Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
              {/* Breakdown by Progress */}
              <div className="aff-lemon-card">
                <div className="aff-section-header">
                  <h3 className="aff-section-title">
                    <span className="aff-section-icon-wrap orange">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                        <path d="M22 12A10 10 0 0 0 12 2v10z" />
                      </svg>
                    </span>
                    <span>2. Breakdown Status Progress</span>
                  </h3>
                </div>

                <div className="aff-table-scroll">
                  <table className="aff-lemon-table">
                    <thead>
                      <tr>
                        <th style={{ paddingLeft: '14px' }}>Status</th>
                        <th style={{ textAlign: 'center' }}>TikTok</th>
                        <th style={{ textAlign: 'center' }}>Shopee</th>
                        <th style={{ textAlign: 'center' }}>Total</th>
                        <th style={{ textAlign: 'center' }}>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dynamicProgressRows.map((r) => (
                        <tr key={r.status}>
                          <td style={{ paddingLeft: '14px' }}>
                            <span className={r.status.toLowerCase() === 'listing' ? 'badge-status-listing' : 'badge-status-approaching'}>
                              {r.status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600, color: '#059669' }}>{r.tiktok}</td>
                          <td style={{ textAlign: 'center', fontWeight: 600, color: '#EA580C' }}>{r.shopee}</td>
                          <td style={{ textAlign: 'center', fontWeight: 800, color: '#111827' }}>{r.total}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{
                              background: '#FEF3C7',
                              color: '#B45309',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontWeight: 700,
                              fontSize: '11px',
                              border: '1px solid #FDE68A'
                            }}>
                              {r.pct}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Breakdown by Brand */}
              <div className="aff-lemon-card">
                <div className="aff-section-header">
                  <h3 className="aff-section-title">
                    <span className="aff-section-icon-wrap yellow">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                        <line x1="7" y1="7" x2="7.01" y2="7" />
                      </svg>
                    </span>
                    <span>3. Breakdown Brand</span>
                  </h3>
                </div>

                <div className="aff-table-scroll">
                  <table className="aff-lemon-table">
                    <thead>
                      <tr>
                        <th style={{ paddingLeft: '14px' }}>Brand</th>
                        <th style={{ textAlign: 'center' }}>TikTok</th>
                        <th style={{ textAlign: 'center' }}>Shopee</th>
                        <th style={{ textAlign: 'center' }}>Total</th>
                        <th style={{ textAlign: 'center' }}>Listing</th>
                        <th style={{ textAlign: 'center' }}>Approaching</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dynamicBrandRows.map((b) => (
                        <tr key={b.brand}>
                          <td style={{ paddingLeft: '14px' }}>
                            <span className="badge-brand-tag">
                              {b.brand}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600, color: '#059669' }}>{b.tiktok}</td>
                          <td style={{ textAlign: 'center', fontWeight: 600, color: '#EA580C' }}>{b.shopee}</td>
                          <td style={{ textAlign: 'center', fontWeight: 800, color: '#111827' }}>{b.total}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#16A34A' }}>{b.listing}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#D97706' }}>{b.approaching}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Section 3: All-Time Affiliator Details Log Table */}
            <div className="aff-lemon-card">
              <div className="aff-section-header">
                <h3 className="aff-section-title">
                  <span className="aff-section-icon-wrap green">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                      <path d="M9 12h6M9 16h6" />
                    </svg>
                  </span>
                  <span>4. Log Lengkap Affiliator ({filteredRecords.length} Data)</span>
                </h3>
                <span className="aff-counter-badge">
                  Menampilkan {filteredRecords.length} dari {rawRecords.length} affiliator
                </span>
              </div>

              <div className="aff-table-scroll" style={{ maxHeight: '580px', overflowY: 'auto' }}>
                <table className="aff-lemon-table">
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                      <th style={{ width: '45px', textAlign: 'center' }}>No</th>
                      <th>Tanggal</th>
                      <th style={{ textAlign: 'center' }}>Platform</th>
                      <th>Username</th>
                      <th style={{ textAlign: 'center' }}>Brand</th>
                      <th style={{ textAlign: 'center' }}>Progress</th>
                      <th>Followers</th>
                      <th>GMV</th>
                      <th>Kategori</th>
                      <th>Kontak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan={10} style={{ padding: '36px', textAlign: 'center', color: '#78716C' }}>
                          Tidak ada data affiliator yang cocok dengan filter yang dipilih.
                        </td>
                      </tr>
                    ) : (
                      filteredRecords.map((item, idx) => (
                        <tr key={`${item.platform}_${item.username}_${idx}`}>
                          <td style={{ textAlign: 'center', color: '#9CA3AF', fontWeight: 600 }}>{idx + 1}</td>
                          <td style={{ color: '#4B5563', whiteSpace: 'nowrap' }}>{item.date}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={item.platform?.toLowerCase() === 'shopee' ? 'badge-plat-shopee' : 'badge-plat-tiktok'}>
                              {item.platform}
                            </span>
                          </td>
                          <td style={{ fontWeight: 700, color: '#111827' }}>{item.username}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="badge-brand-tag">
                              {item.brand}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={item.progress?.toLowerCase() === 'listing' ? 'badge-status-listing' : 'badge-status-approaching'}>
                              {item.progress}
                            </span>
                          </td>
                          <td style={{ color: '#374151', fontWeight: 500 }}>{item.followers || '-'}</td>
                          <td style={{ color: '#374151', fontWeight: 600 }}>{item.gmv || '-'}</td>
                          <td style={{ color: '#4B5563' }}>{item.category || '-'}</td>
                          <td style={{ color: '#4B5563', fontSize: '12px', maxWidth: '220px', wordBreak: 'break-word' }}>
                            {item.contact || '-'}
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

        {/* Toast Notification */}
        <div className={`kpi-toast ${toastVisible ? 'show' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{toastMessage}</span>
        </div>
      </div>
    </AuthGate>
  )
}
