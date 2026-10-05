'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import AuthGate from '@/components/AuthGate'
import KpiCard from '@/components/affiliate/KpiCard'

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
            <h1>Laporan Affiliate</h1>
            <p className="aff-header-sub">
              {activePlatform === 'shopee'
                ? 'Rekap performa listing & pendekatan Shopee Affiliate dari Google Sheets'
                : activePlatform === 'tiktok'
                ? 'Rekap performa listing & pendekatan TikTok Shop Affiliate dari Google Sheets'
                : 'Rekap performa pendekatan & listing affiliator TikTok & Shopee dari Google Sheets'}
            </p>
          </div>

          <div className="aff-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {data && (
              <button
                type="button"
                className="btn-export"
                onClick={handleExportExcel}
                title="Unduh laporan dalam format Excel (.xlsx)"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Ekspor Excel
              </button>
            )}

            <button
              type="button"
              className="btn-secondary"
              onClick={() => fetchData(true)}
              disabled={refreshing}
              title="Sinkronkan ulang data dari Vercel Blob"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 12px', fontSize: '13px' }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transform: refreshing ? 'rotate(360deg)' : 'none', transition: 'transform 0.8s ease' }}
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              {refreshing ? 'Memuat...' : 'Refresh'}
            </button>
          </div>
        </header>

        {/* Sync Status Badge Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.07)',
          borderRadius: '10px',
          padding: '8px 14px',
          marginBottom: '1rem',
          fontSize: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: data ? '#22c55e' : '#f59e0b',
              boxShadow: data ? '0 0 8px #22c55e' : 'none'
            }} />
            <span style={{ color: '#94a3b8' }}>
              Sumber: <strong>Google Sheets (AFFILIATE REPORT) +' Vercel Blob</strong>
            </span>
          </div>
          <div style={{ color: '#cbd5e1', fontSize: '11.5px' }}>
            Terakhir Sinkron: <span style={{ color: '#818cf8', fontWeight: 600 }}>{formattedSyncTime}</span>
          </div>
        </div>

        {/* Main Platform Switcher Tabs */}
        <div className="aff-platform-tabs">
          <button
            type="button"
            className={`aff-plat-btn ${activePlatform === 'semua' ? 'is-active semua' : ''}`}
            onClick={() => setActivePlatform('semua')}
          >
            <span className="dot" style={{ background: '#7c3aed' }} />
            Semua Platform
          </button>
          <button
            type="button"
            className={`aff-plat-btn ${activePlatform === 'shopee' ? 'is-active shopee' : ''}`}
            onClick={() => setActivePlatform('shopee')}
          >
            <span className="dot" style={{ background: '#ea580c' }} />
            Shopee
          </button>
          <button
            type="button"
            className={`aff-plat-btn ${activePlatform === 'tiktok' ? 'is-active tiktok' : ''}`}
            onClick={() => setActivePlatform('tiktok')}
          >
            <span className="dot" style={{ background: '#3B5BDB' }} />
            TikTok Shop
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="aff-control-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'flex-end' }}>
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
                className="category-select aff-month-select"
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
              className="category-select aff-account-select"
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
              className="category-select aff-account-select"
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
          <div className="aff-filter-group" style={{ flex: '1 1 200px' }}>
            <label className="aff-filter-label">Cari Username / Kontak:</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="login-input"
                placeholder="Cari affiliator..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', height: '36px', fontSize: '13px', paddingRight: '28px' }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  o 
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content View */}
        {loading ? (
          <div className="aff-loading-box">
            <div className="spinner" />
            <p className="loading-text">Memuat data Laporan Affiliate dari Vercel Blob...</p>
          </div>
        ) : !data || rawRecords.length === 0 ? (
          <div className="placeholder-block" style={{ marginTop: '2rem' }}>
            <div className="placeholder-icon">dY"S</div>
            <h3 className="placeholder-title">Belum ada data laporan affiliator tersimpan</h3>
            <p className="placeholder-sub">
              Buka Google Sheet Anda, pilih menu <strong>?" Affiliate Marketing +' 🚀 Push Report to Dashboard (Vercel)</strong> untuk mengirimkan data ke web dashboard ini.
            </p>
          </div>
        ) : (
          <>
            {/* KPI Summary Cards */}
            <div className="aff-kpi-grid" style={{ marginBottom: '1.75rem' }}>
              <KpiCard
                label={timeMode === 'all' ? 'Total Affiliator (All Time)' : `Total Affiliator (${selectedDate})`}
                value={kpis.total.toLocaleString('id-ID')}
                sub={`TikTok: ${kpis.tt}  |  Shopee: ${kpis.sp}`}
                color="#4F46E5"
                raw={kpis.total}
                onCopy={showToast}
              />
              <KpiCard
                label="In Progress: Listing"
                value={kpis.listing.toLocaleString('id-ID')}
                sub={`${kpis.listingPct}% dari total affiliator`}
                color="#10B981"
                raw={kpis.listing}
                onCopy={showToast}
              />
              <KpiCard
                label="In Progress: Approaching"
                value={kpis.approaching.toLocaleString('id-ID')}
                sub={`${kpis.approachingPct}% dari total affiliator`}
                color="#F59E0B"
                raw={kpis.approaching}
                onCopy={showToast}
              />
              <KpiCard
                label="Brand Aktif"
                value={kpis.brandCount}
                sub={kpis.brandsList || 'Semua Brand'}
                color="#8B5CF6"
                raw={kpis.brandCount}
                onCopy={showToast}
              />
            </div>

            {/* Section 1: Daily Breakdown Log */}
            <div className="aff-card-section" style={{
              background: '#1E293B',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '1.25rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>dY"</span> 1. Rincian Harian (Daily Affiliator Breakdown Log)
                </h3>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {dynamicDailyRows.length} tanggal tercatat
                </span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#0F172A', color: '#E2E8F0', borderBottom: '2px solid #334155' }}>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>Tanggal</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'center' }}>Total Affiliator</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'center' }}>TikTok</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'center' }}>Shopee</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'center' }}>Listing</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'center' }}>Approaching</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dynamicDailyRows.map((row, idx) => (
                      <tr
                        key={row.date}
                        style={{
                          background: idx % 2 === 0 ? '#1E293B' : 'rgba(255, 255, 255, 0.02)',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                        }}
                      >
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#93C5FD' }}>{row.date}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#F8FAFC' }}>{row.total}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#93C5FD' }}>{row.tiktok}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#FB923C' }}>{row.shopee}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#34D399', fontWeight: 600 }}>{row.listing}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#FBBF24', fontWeight: 600 }}>{row.approaching}</td>
                      </tr>
                    ))}
                    {/* Summary row */}
                    <tr style={{ background: '#0F172A', fontWeight: 700, color: '#F8FAFC', borderTop: '2px solid #475569' }}>
                      <td style={{ padding: '10px 12px' }}>TOTAL</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>{kpis.total}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#93C5FD' }}>{kpis.tt}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#FB923C' }}>{kpis.sp}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#34D399' }}>{kpis.listing}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#FBBF24' }}>{kpis.approaching}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 2: Progress & Brand Breakdown Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
              {/* Breakdown by Progress */}
              <div style={{
                background: '#1E293B',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '1.25rem'
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#F8FAFC', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>dY"S</span> 2. Breakdown Berdasarkan Status Progress
                </h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#0F172A', color: '#94A3B8' }}>
                      <th style={{ padding: '8px 10px' }}>Status</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>TikTok</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Shopee</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Total</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dynamicProgressRows.map((r, i) => (
                      <tr key={r.status} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            background: r.status.toLowerCase() === 'listing' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                            color: r.status.toLowerCase() === 'listing' ? '#34D399' : '#FBBF24',
                          }}>
                            {r.status}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', color: '#93C5FD' }}>{r.tiktok}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', color: '#FB923C' }}>{r.shopee}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>{r.total}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', color: '#A78BFA', fontWeight: 600 }}>{r.pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Breakdown by Brand */}
              <div style={{
                background: '#1E293B',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '1.25rem'
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#F8FAFC', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>dYÅ</span> 3. Breakdown Berdasarkan Brand
                </h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#0F172A', color: '#94A3B8' }}>
                      <th style={{ padding: '8px 10px' }}>Brand</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>TikTok</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Shopee</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Total</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Listing</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Approaching</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dynamicBrandRows.map((b) => (
                      <tr key={b.brand} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: '#C084FC' }}>{b.brand}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', color: '#93C5FD' }}>{b.tiktok}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', color: '#FB923C' }}>{b.shopee}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>{b.total}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', color: '#34D399' }}>{b.listing}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', color: '#FBBF24' }}>{b.approaching}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 3: All-Time Affiliator Details Log Table */}
            <div style={{
              background: '#1E293B',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '1.25rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>dY"</span> 4. Log Lengkap Affiliator ({filteredRecords.length} Data)
                </h3>
                <div style={{ fontSize: '12px', color: '#94A3B8' }}>
                  Menampilkan {filteredRecords.length} dari {rawRecords.length} affiliator
                </div>
              </div>

              <div style={{ overflowX: 'auto', maxHeight: '560px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr style={{ background: '#0F172A', color: '#E2E8F0', borderBottom: '2px solid #334155' }}>
                      <th style={{ padding: '10px 10px', width: '40px', textAlign: 'center' }}>No</th>
                      <th style={{ padding: '10px 10px' }}>Tanggal</th>
                      <th style={{ padding: '10px 10px', textAlign: 'center' }}>Platform</th>
                      <th style={{ padding: '10px 10px' }}>Username</th>
                      <th style={{ padding: '10px 10px', textAlign: 'center' }}>Brand</th>
                      <th style={{ padding: '10px 10px', textAlign: 'center' }}>Progress</th>
                      <th style={{ padding: '10px 10px' }}>Followers</th>
                      <th style={{ padding: '10px 10px' }}>GMV</th>
                      <th style={{ padding: '10px 10px' }}>Kategori</th>
                      <th style={{ padding: '10px 10px' }}>Kontak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan={10} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                          Tidak ada data affiliator yang cocok dengan filter.
                        </td>
                      </tr>
                    ) : (
                      filteredRecords.map((item, idx) => (
                        <tr
                          key={`${item.platform}_${item.username}_${idx}`}
                          style={{
                            background: idx % 2 === 0 ? '#1E293B' : 'rgba(255, 255, 255, 0.02)',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                          }}
                        >
                          <td style={{ padding: '8px 10px', textAlign: 'center', color: '#64748B' }}>{idx + 1}</td>
                          <td style={{ padding: '8px 10px', color: '#94A3B8', whiteSpace: 'nowrap' }}>{item.date}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '999px',
                              fontSize: '10.5px',
                              fontWeight: 600,
                              background: item.platform?.toLowerCase() === 'shopee' ? 'rgba(234, 88, 12, 0.15)' : 'rgba(59, 91, 219, 0.15)',
                              color: item.platform?.toLowerCase() === 'shopee' ? '#FB923C' : '#93C5FD'
                            }}>
                              {item.platform}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', fontWeight: 600, color: '#F8FAFC' }}>{item.username}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 7px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: 'rgba(168, 85, 247, 0.15)',
                              color: '#C084FC'
                            }}>
                              {item.brand}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: item.progress?.toLowerCase() === 'listing' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                              color: item.progress?.toLowerCase() === 'listing' ? '#34D399' : '#FBBF24'
                            }}>
                              {item.progress}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', color: '#E2E8F0' }}>{item.followers || '-'}</td>
                          <td style={{ padding: '8px 10px', color: '#E2E8F0' }}>{item.gmv || '-'}</td>
                          <td style={{ padding: '8px 10px', color: '#94A3B8' }}>{item.category || '-'}</td>
                          <td style={{ padding: '8px 10px', color: '#94A3B8', fontSize: '11.5px', maxWidth: '200px', wordBreak: 'break-word' }}>
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
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{toastMessage}</span>
        </div>
      </div>
    </AuthGate>
  )
}
