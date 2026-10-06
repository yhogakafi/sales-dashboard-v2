'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import AuthGate from '@/components/AuthGate'
import KpiCard from '@/components/affiliate/KpiCard'
import LemonIcon from '@/components/LemonIcon'

// Core expected statuses
const DEFAULT_CORE_STATUSES = ['Listing', 'Approaching', 'Respon', 'Dealing']

// Numeric parser helper for Followers (e.g., '10,9RB', '8.1K', '733', '1.2M')
function parseFollowers(val) {
  if (!val) return 0
  const s = String(val).trim().toUpperCase().replace(',', '.')
  const num = parseFloat(s.replace(/[^0-9.]/g, ''))
  if (isNaN(num)) return 0
  if (s.includes('RB') || s.includes('K')) return num * 1000
  if (s.includes('M') || s.includes('JT')) return num * 1000000
  return num
}

// Numeric parser helper for GMV (e.g., '203jt', '1JT+', '1,1M', '10JT-50JT')
function parseGmv(val) {
  if (!val) return 0
  const s = String(val).trim().toUpperCase().replace(',', '.')
  if (s.includes('-')) {
    const parts = s.split('-')
    return (parseGmv(parts[0]) + parseGmv(parts[1])) / 2
  }
  const num = parseFloat(s.replace(/[^0-9.]/g, ''))
  if (isNaN(num)) return 0
  if (s.includes('M')) return num * 1000000000
  if (s.includes('JT')) return num * 1000000
  if (s.includes('RB') || s.includes('K')) return num * 1000
  return num
}

// Helper to get visual config & colors for any status in the lemon citrus palette
function getStatusMeta(status) {
  const s = (status || '').trim().toLowerCase()
  if (s === 'listing') {
    return {
      label: 'Listing',
      color: '#16A34A',
      bg: '#DCFCE7',
      text: '#15803D',
      border: '#BBF7D0',
      badgeClass: 'badge-status-listing',
    }
  }
  if (s === 'approaching') {
    return {
      label: 'Approaching',
      color: '#EA580C',
      bg: '#FFEDD5',
      text: '#C2410C',
      border: '#FED7AA',
      badgeClass: 'badge-status-approaching',
    }
  }
  if (s === 'dealing') {
    return {
      label: 'Dealing',
      color: '#7C3AED',
      bg: '#F3E8FF',
      text: '#6D28D9',
      border: '#DDD6FE',
      badgeClass: 'badge-status-dealing',
    }
  }
  if (s === 'respon') {
    return {
      label: 'Respon',
      color: '#0284C7',
      bg: '#E0F2FE',
      text: '#0369A1',
      border: '#BAE6FD',
      badgeClass: 'badge-status-respon',
    }
  }
  // Dynamic fallback for any additional status detected from Google Sheets
  return {
    label: status,
    color: '#0D9488',
    bg: '#CCFBF1',
    text: '#0F766E',
    border: '#99F6E4',
    badgeClass: 'badge-status-generic',
  }
}

export default function LaporanAffiliatePage() {
  const [activePlatform, setActivePlatform] = useState('semua') // 'semua' | 'shopee' | 'tiktok'
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Top Filters
  const [timeMode, setTimeMode] = useState('all') // 'all' | 'date'
  const [selectedDate, setSelectedDate] = useState('ALL')
  const [selectedBrand, setSelectedBrand] = useState('ALL')
  const [selectedProgress, setSelectedProgress] = useState('ALL')
  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const [selectedFollowerRange, setSelectedFollowerRange] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Table Sorting
  const [sortField, setSortField] = useState('date') // default sort by date
  const [sortDir, setSortDir] = useState('desc') // 'asc' | 'desc'
  const [contactFilter, setContactFilter] = useState('ALL') // 'ALL' | 'phone' | 'email' | 'dm'

  // Pagination
  const [pageSize, setPageSize] = useState(25) // 10 | 25 | 50 | 100 | -1 (all)
  const [currentPage, setCurrentPage] = useState(1)

  // Modals & Toast
  const [showGuideModal, setShowGuideModal] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)

  const showToast = useCallback((msg) => {
    setToastMessage(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2200)
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

  // Extract master records from data
  const rawRecords = useMemo(() => data?.affiliatorDetails || [], [data])

  // Dynamically detect all progress statuses:
  // Combines: 1) data.availableStatuses or data.progressOptions from sheet sync, 2) unique progress in records, 3) core defaults
  const allAvailableStatuses = useMemo(() => {
    const fromApi = Array.isArray(data?.availableStatuses)
      ? data.availableStatuses
      : Array.isArray(data?.progressOptions)
      ? data.progressOptions
      : []
    const fromRecords = rawRecords.map((r) => r.progress).filter(Boolean)

    const seen = new Set()
    const list = []

    // 1. Default core statuses first in logical funnel order
    for (const st of DEFAULT_CORE_STATUSES) {
      const key = st.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        list.push(st)
      }
    }
    // 2. From Google Sheet payload progressOptions / availableStatuses
    for (const st of fromApi) {
      const key = String(st).trim().toLowerCase()
      if (key && !seen.has(key)) {
        seen.add(key)
        list.push(String(st).trim())
      }
    }
    // 3. Any additional status found in individual records
    for (const st of fromRecords) {
      const key = String(st).trim().toLowerCase()
      if (key && !seen.has(key)) {
        seen.add(key)
        list.push(String(st).trim())
      }
    }

    return list
  }, [data, rawRecords])

  const availableDates = useMemo(() => {
    return [...new Set(rawRecords.map((r) => r.date).filter(Boolean))].sort().reverse()
  }, [rawRecords])

  const availableBrands = useMemo(() => {
    const fromApi = data?.availableBrands || []
    const fromRecords = rawRecords.map((r) => r.brand).filter(Boolean)
    return [...new Set([...fromApi, ...fromRecords])].sort()
  }, [data, rawRecords])

  const availableCategories = useMemo(() => {
    const fromApi = data?.availableCategories || []
    const fromRecords = rawRecords.map((r) => r.category).filter(Boolean)
    return [...new Set([...fromApi, ...fromRecords])].sort()
  }, [data, rawRecords])

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      activePlatform !== 'semua' ||
      timeMode !== 'all' ||
      selectedDate !== 'ALL' ||
      selectedBrand !== 'ALL' ||
      selectedProgress !== 'ALL' ||
      selectedCategory !== 'ALL' ||
      selectedFollowerRange !== 'ALL' ||
      contactFilter !== 'ALL' ||
      searchQuery.trim() !== '' ||
      sortField !== 'date'
    )
  }, [
    activePlatform,
    timeMode,
    selectedDate,
    selectedBrand,
    selectedProgress,
    selectedCategory,
    selectedFollowerRange,
    contactFilter,
    searchQuery,
    sortField,
  ])

  const resetAllFilters = () => {
    setActivePlatform('semua')
    setTimeMode('all')
    setSelectedDate('ALL')
    setSelectedBrand('ALL')
    setSelectedProgress('ALL')
    setSelectedCategory('ALL')
    setSelectedFollowerRange('ALL')
    setContactFilter('ALL')
    setSearchQuery('')
    setSortField('date')
    setSortDir('desc')
    setCurrentPage(1)
    showToast('Semua filter berhasil direset!')
  }

  // Primary filtered records
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
        if (item.progress?.toLowerCase() !== selectedProgress.toLowerCase()) return false
      }
      // Category filter
      if (selectedCategory !== 'ALL') {
        if (item.category !== selectedCategory) return false
      }
      // Follower range filter
      if (selectedFollowerRange !== 'ALL') {
        const count = parseFollowers(item.followers)
        if (selectedFollowerRange === 'nano' && count >= 5000) return false
        if (selectedFollowerRange === 'micro' && (count < 5000 || count > 20000)) return false
        if (selectedFollowerRange === 'macro' && count <= 20000) return false
      }
      // Contact filter
      if (contactFilter !== 'ALL') {
        const c = String(item.contact || '').toLowerCase()
        if (contactFilter === 'phone') {
          if (!/\d{7,}/.test(c)) return false
        } else if (contactFilter === 'email') {
          if (!c.includes('@')) return false
        } else if (contactFilter === 'dm') {
          if (!c.includes('dm') && !c.includes('ig')) return false
        }
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
  }, [
    rawRecords,
    activePlatform,
    timeMode,
    selectedDate,
    selectedBrand,
    selectedProgress,
    selectedCategory,
    selectedFollowerRange,
    contactFilter,
    searchQuery,
  ])

  // Dynamic KPI calculations based on filtered records
  const kpis = useMemo(() => {
    const total = filteredRecords.length
    const tt = filteredRecords.filter((r) => r.platform?.toLowerCase() === 'tiktok').length
    const sp = filteredRecords.filter((r) => r.platform?.toLowerCase() === 'shopee').length
    const brands = [...new Set(filteredRecords.map((r) => r.brand).filter(Boolean))]

    // Calculate dynamic stats for EVERY detected status
    const statusStats = {}
    for (const st of allAvailableStatuses) {
      const key = st.toLowerCase()
      const recs = filteredRecords.filter((r) => r.progress?.toLowerCase() === key)
      const count = recs.length
      const ttCount = recs.filter((r) => r.platform?.toLowerCase() === 'tiktok').length
      const spCount = recs.filter((r) => r.platform?.toLowerCase() === 'shopee').length
      const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0'
      statusStats[st] = {
        count,
        ttCount,
        spCount,
        pct,
      }
    }

    return {
      total,
      tt,
      sp,
      statusStats,
      brandCount: brands.length,
      brandsList: brands.slice(0, 2).join(', ') + (brands.length > 2 ? ` +${brands.length - 2}` : ''),
    }
  }, [filteredRecords, allAvailableStatuses])

  // Dynamic Daily Breakdown (includes ALL statuses)
  const dynamicDailyRows = useMemo(() => {
    const dates = [...new Set(filteredRecords.map((r) => r.date).filter(Boolean))].sort().reverse()
    return dates.map((d) => {
      const recs = filteredRecords.filter((r) => r.date === d)
      const statusCounts = {}
      for (const st of allAvailableStatuses) {
        statusCounts[st] = recs.filter((r) => r.progress?.toLowerCase() === st.toLowerCase()).length
      }
      return {
        date: d,
        total: recs.length,
        tiktok: recs.filter((r) => r.platform?.toLowerCase() === 'tiktok').length,
        shopee: recs.filter((r) => r.platform?.toLowerCase() === 'shopee').length,
        statusCounts,
      }
    })
  }, [filteredRecords, allAvailableStatuses])

  // Dynamic Progress Breakdown (all detected statuses)
  const dynamicProgressRows = useMemo(() => {
    const total = filteredRecords.length || 1
    return allAvailableStatuses.map((s) => {
      const recs = filteredRecords.filter((r) => r.progress?.toLowerCase() === s.toLowerCase())
      return {
        status: s,
        tiktok: recs.filter((r) => r.platform?.toLowerCase() === 'tiktok').length,
        shopee: recs.filter((r) => r.platform?.toLowerCase() === 'shopee').length,
        total: recs.length,
        pct: ((recs.length / total) * 100).toFixed(1),
      }
    })
  }, [filteredRecords, allAvailableStatuses])

  // Dynamic Brand Breakdown (includes ALL statuses)
  const dynamicBrandRows = useMemo(() => {
    const brands = [...new Set(filteredRecords.map((r) => r.brand).filter(Boolean))].sort()
    const total = filteredRecords.length || 1
    return brands.map((b) => {
      const recs = filteredRecords.filter((r) => r.brand === b)
      const statusCounts = {}
      for (const st of allAvailableStatuses) {
        statusCounts[st] = recs.filter((r) => r.progress?.toLowerCase() === st.toLowerCase()).length
      }
      return {
        brand: b,
        tiktok: recs.filter((r) => r.platform?.toLowerCase() === 'tiktok').length,
        shopee: recs.filter((r) => r.platform?.toLowerCase() === 'shopee').length,
        total: recs.length,
        pct: ((recs.length / total) * 100).toFixed(1),
        statusCounts,
      }
    })
  }, [filteredRecords, allAvailableStatuses])

  // Table sorting
  const sortedRecords = useMemo(() => {
    if (!sortField) return filteredRecords
    const dir = sortDir === 'asc' ? 1 : -1

    return [...filteredRecords].sort((a, b) => {
      const va = a[sortField]
      const vb = b[sortField]

      if (sortField === 'no') {
        const na = Number(va) || 0
        const nb = Number(vb) || 0
        return (na - nb) * dir
      }
      if (sortField === 'followers') {
        const na = parseFollowers(va)
        const nb = parseFollowers(vb)
        return (na - nb) * dir
      }
      if (sortField === 'gmv') {
        const na = parseGmv(va)
        const nb = parseGmv(vb)
        return (na - nb) * dir
      }
      if (sortField === 'date') {
        const da = String(va || '')
        const db = String(vb || '')
        return da.localeCompare(db) * dir
      }

      // Default string comparison
      const sa = String(va || '').toLowerCase()
      const sb = String(vb || '').toLowerCase()
      return sa.localeCompare(sb) * dir
    })
  }, [filteredRecords, sortField, sortDir])

  // Reset page when any filter or sort changes
  useEffect(() => {
    setCurrentPage(1)
  }, [
    activePlatform,
    timeMode,
    selectedDate,
    selectedBrand,
    selectedProgress,
    selectedCategory,
    selectedFollowerRange,
    contactFilter,
    searchQuery,
    sortField,
    sortDir,
  ])

  // Pagination slice
  const totalPages = pageSize === -1 ? 1 : Math.ceil(sortedRecords.length / pageSize) || 1
  const displayedRecords = useMemo(() => {
    if (pageSize === -1) return sortedRecords
    const start = (currentPage - 1) * pageSize
    return sortedRecords.slice(start, start + pageSize)
  }, [sortedRecords, currentPage, pageSize])

  // Header click sort handler
  const handleSort = (field) => {
    if (sortField === field) {
      if (sortDir === 'desc') setSortDir('asc')
      else {
        setSortField(null)
        setSortDir('desc')
      }
    } else {
      setSortField(field)
      if (['date', 'followers', 'gmv'].includes(field)) {
        setSortDir('desc')
      } else {
        setSortDir('asc')
      }
    }
  }

  // Export to Excel function
  const handleExportExcel = () => {
    if (!sortedRecords.length) {
      showToast('Tidak ada data untuk diekspor.')
      return
    }

    const wb = XLSX.utils.book_new()

    // 1. KPI Sheet
    const kpiData = [
      ['METRIK LAPORAN AFFILIATE', 'NILAI', 'KETERANGAN'],
      ['Total Affiliator', kpis.total, `TikTok: ${kpis.tt} | Shopee: ${kpis.sp}`],
      ...allAvailableStatuses.map((st) => {
        const s = kpis.statusStats[st]
        return [
          `Status: ${st}`,
          s?.count || 0,
          `${s?.pct || 0}% dari total (TT: ${s?.ttCount || 0}, SP: ${s?.spCount || 0})`,
        ]
      }),
      ['Brand Aktif', kpis.brandCount, kpis.brandsList || 'Semua Brand'],
      ['Terakhir Disinkronkan', data?.savedAt || '-', 'Vercel Blob Storage'],
    ]
    const wsKpi = XLSX.utils.aoa_to_sheet(kpiData)
    XLSX.utils.book_append_sheet(wb, wsKpi, 'Ringkasan KPI')

    // 2. Daily Breakdown Sheet
    const dailyData = [
      ['Tanggal', 'Total Affiliator', 'TikTok', 'Shopee', ...allAvailableStatuses],
      ...dynamicDailyRows.map((r) => [
        r.date,
        r.total,
        r.tiktok,
        r.shopee,
        ...allAvailableStatuses.map((st) => r.statusCounts[st] || 0),
      ]),
    ]
    const wsDaily = XLSX.utils.aoa_to_sheet(dailyData)
    XLSX.utils.book_append_sheet(wb, wsDaily, 'Rincian Harian')

    // 3. Progress Breakdown Sheet
    const progressData = [
      ['Status Progress', 'TikTok', 'Shopee', 'Total Affiliator', 'Persentase (%)'],
      ...dynamicProgressRows.map((r) => [r.status, r.tiktok, r.shopee, r.total, `${r.pct}%`]),
    ]
    const wsProgress = XLSX.utils.aoa_to_sheet(progressData)
    XLSX.utils.book_append_sheet(wb, wsProgress, 'Breakdown Progress')

    // 4. Brand Breakdown Sheet
    const brandData = [
      ['Brand', 'TikTok', 'Shopee', 'Total Affiliator', ...allAvailableStatuses, 'Share (%)'],
      ...dynamicBrandRows.map((b) => [
        b.brand,
        b.tiktok,
        b.shopee,
        b.total,
        ...allAvailableStatuses.map((st) => b.statusCounts[st] || 0),
        `${b.pct}%`,
      ]),
    ]
    const wsBrand = XLSX.utils.aoa_to_sheet(brandData)
    XLSX.utils.book_append_sheet(wb, wsBrand, 'Breakdown Brand')

    // 5. Details Sheet
    const detailData = [
      ['No', 'Tanggal', 'Platform', 'Username', 'Brand', 'Progress', 'GMV', 'Followers', 'Kategori', 'Kontak'],
      ...sortedRecords.map((r, i) => [
        i + 1,
        r.date,
        r.platform,
        r.username,
        r.brand,
        r.progress,
        r.gmv,
        r.followers,
        r.category,
        r.contact,
      ]),
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
        minute: '2-digit',
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
            <h1
              style={{
                color: '#1C1917',
                fontSize: '28px',
                fontWeight: 800,
                margin: '2px 0 6px',
                letterSpacing: '-0.02em',
              }}
            >
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

          <div
            className="aff-header-actions"
            style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}
          >
            {data && (
              <button
                type="button"
                className="btn-export-lemon"
                onClick={handleExportExcel}
                title="Unduh laporan dalam format Excel (.xlsx)"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
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
                style={{
                  transform: refreshing ? 'rotate(360deg)' : 'none',
                  transition: 'transform 0.8s ease',
                }}
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              <span>{refreshing ? 'Memuat...' : 'Refresh'}</span>
            </button>
          </div>
        </header>

        {/* Sync Status Banner */}
        <div className="aff-status-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span className="aff-status-pulse" />
            <span style={{ color: '#713F12' }}>
              Sumber Data: <strong style={{ color: '#451A03' }}>Google Sheets (AFFILIATE REPORT) &amp; Vercel Blob</strong>
            </span>
            <button
              type="button"
              onClick={() => setShowGuideModal(true)}
              style={{
                background: '#FEF08A',
                border: '1px solid #FDE047',
                color: '#854D0E',
                fontSize: '11.5px',
                fontWeight: 700,
                padding: '3px 9px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                marginLeft: '4px',
              }}
              title="Lihat petunjuk deteksi otomatis dropdown Google Sheet"
            >
              <span>⚙️ Deteksi Dropdown Sheet</span>
            </button>
          </div>
          <div style={{ color: '#78716C', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Terakhir Sinkron:</span>
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

        {/* Top Filter Controls Bar */}
        <div className="aff-control-bar">
          {/* Filter 1: Waktu */}
          <div className="aff-filter-group">
            <label className="aff-filter-label">Waktu:</label>
            <div className="aff-toggle-group">
              <button
                type="button"
                className={`aff-toggle-btn ${timeMode === 'all' ? 'active' : ''}`}
                onClick={() => {
                  setTimeMode('all')
                  setSelectedDate('ALL')
                }}
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
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Filter 3: Progress (Dynamic Dropdown) */}
          <div className="aff-filter-group">
            <label className="aff-filter-label">Progress:</label>
            <select
              className="aff-account-select"
              value={selectedProgress}
              onChange={(e) => setSelectedProgress(e.target.value)}
            >
              <option value="ALL">Semua Status ({allAvailableStatuses.length})</option>
              {allAvailableStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Filter 4: Kategori */}
          <div className="aff-filter-group">
            <label className="aff-filter-label">Kategori:</label>
            <select
              className="aff-account-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="ALL">Semua Kategori ({availableCategories.length})</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Filter 5: Followers Tier */}
          <div className="aff-filter-group">
            <label className="aff-filter-label">Followers:</label>
            <select
              className="aff-account-select"
              value={selectedFollowerRange}
              onChange={(e) => setSelectedFollowerRange(e.target.value)}
            >
              <option value="ALL">Semua Followers</option>
              <option value="nano">Nano (&lt; 5K)</option>
              <option value="micro">Micro (5K - 20K)</option>
              <option value="macro">Macro (&gt; 20K)</option>
            </select>
          </div>

          {/* Filter 6: Search input */}
          <div className="aff-filter-group" style={{ flex: '1 1 200px', minWidth: '180px' }}>
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
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="login-input"
                placeholder="Cari username, kontak..."
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
                  borderRadius: '8px',
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
                    padding: 0,
                  }}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Reset button if active filters */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              style={{
                height: '36px',
                padding: '0 12px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#B91C1C',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
              title="Reset semua filter ke kondisi awal"
            >
              ✕ Reset Filter
            </button>
          )}
        </div>

        {/* Content View */}
        {loading ? (
          <div
            className="aff-lemon-card"
            style={{ textAlign: 'center', padding: '3.5rem 1.5rem', marginTop: '1.5rem' }}
          >
            <div
              className="spinner"
              style={{
                width: '36px',
                height: '36px',
                borderWidth: '3px',
                borderColor: '#FEF08A',
                borderTopColor: '#EAB308',
                margin: '0 auto 14px',
              }}
            />
            <p style={{ color: '#713F12', fontSize: '14.5px', fontWeight: 600, margin: 0 }}>
              Memuat data Laporan Affiliate dari Vercel Blob...
            </p>
          </div>
        ) : !data || rawRecords.length === 0 ? (
          <div
            className="aff-lemon-card"
            style={{ textAlign: 'center', padding: '3.5rem 1.5rem', marginTop: '1.5rem' }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
              <LemonIcon size={48} />
            </div>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#1F2937', margin: '0 0 8px' }}>
              Belum ada data laporan affiliator tersimpan
            </h3>
            <p style={{ fontSize: '13.5px', color: '#78716C', maxWidth: '520px', margin: '0 auto', lineHeight: 1.5 }}>
              Buka Google Sheet Anda, pilih menu <strong>Affiliate Marketing &gt; Push Report to Dashboard (Vercel)</strong>{' '}
              untuk mengirimkan data ke web dashboard ini.
            </p>
          </div>
        ) : (
          <>
            {/* KPI Summary Cards Grid (Dynamic: Total, Listing, Approaching, Respon, Dealing, and any detected status) */}
            <div className="aff-kpi-grid">
              {/* Total Card */}
              <KpiCard
                label={timeMode === 'all' ? 'Total Affiliator (All Time)' : `Total Affiliator (${selectedDate})`}
                value={kpis.total.toLocaleString('id-ID')}
                sub={`TikTok: ${kpis.tt}  |  Shopee: ${kpis.sp}`}
                color="#EAB308"
                raw={kpis.total}
                onCopy={showToast}
              />

              {/* Status Cards (Listing, Approaching, Respon, Dealing, etc.) */}
              {allAvailableStatuses.map((st) => {
                const stat = kpis.statusStats[st] || { count: 0, ttCount: 0, spCount: 0, pct: '0' }
                const meta = getStatusMeta(st)
                return (
                  <KpiCard
                    key={st}
                    label={`Status: ${st}`}
                    value={stat.count.toLocaleString('id-ID')}
                    sub={`${stat.pct}% dari total · TT: ${stat.ttCount} | SP: ${stat.spCount}`}
                    color={meta.color}
                    raw={stat.count}
                    onCopy={showToast}
                  />
                )
              })}

              {/* Brand Aktif Card */}
              <KpiCard
                label="Brand Aktif"
                value={kpis.brandCount}
                sub={kpis.brandsList || 'Semua Brand'}
                color="#D97706"
                raw={kpis.brandCount}
                onCopy={showToast}
              />
            </div>

            {/* Section 1: Daily Breakdown Log (Includes Dealing, Respon, and all dynamic statuses) */}
            <div className="aff-lemon-card" style={{ marginBottom: '1.5rem' }}>
              <div className="aff-section-header">
                <h3 className="aff-section-title">
                  <span className="aff-section-icon-wrap yellow">
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
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
                      {allAvailableStatuses.map((st) => (
                        <th key={st} style={{ textAlign: 'center' }}>
                          {st}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dynamicDailyRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4 + allAvailableStatuses.length}
                          style={{ textAlign: 'center', padding: '24px', color: '#78716C' }}
                        >
                          Tidak ada data rincian harian untuk filter yang dipilih.
                        </td>
                      </tr>
                    ) : (
                      dynamicDailyRows.map((row) => (
                        <tr key={row.date}>
                          <td style={{ fontWeight: 700, color: '#1F2937', paddingLeft: '16px' }}>{row.date}</td>
                          <td style={{ textAlign: 'center', fontWeight: 800, color: '#111827' }}>{row.total}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#059669' }}>{row.tiktok}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#EA580C' }}>{row.shopee}</td>
                          {allAvailableStatuses.map((st) => {
                            const meta = getStatusMeta(st)
                            const val = row.statusCounts[st] || 0
                            return (
                              <td
                                key={st}
                                style={{
                                  textAlign: 'center',
                                  fontWeight: 700,
                                  color: val > 0 ? meta.color : '#9CA3AF',
                                }}
                              >
                                {val}
                              </td>
                            )
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ paddingLeft: '16px' }}>TOTAL</td>
                      <td style={{ textAlign: 'center' }}>{kpis.total}</td>
                      <td style={{ textAlign: 'center' }}>{kpis.tt}</td>
                      <td style={{ textAlign: 'center' }}>{kpis.sp}</td>
                      {allAvailableStatuses.map((st) => (
                        <td key={st} style={{ textAlign: 'center' }}>
                          {kpis.statusStats[st]?.count || 0}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Section 2: Progress & Brand Breakdown Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
                gap: '1.25rem',
                marginBottom: '1.5rem',
              }}
            >
              {/* Breakdown by Progress */}
              <div className="aff-lemon-card">
                <div className="aff-section-header">
                  <h3 className="aff-section-title">
                    <span className="aff-section-icon-wrap orange">
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
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
                      {dynamicProgressRows.map((r) => {
                        const meta = getStatusMeta(r.status)
                        return (
                          <tr key={r.status}>
                            <td style={{ paddingLeft: '14px' }}>
                              <span className={meta.badgeClass}>{r.status}</span>
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 600, color: '#059669' }}>{r.tiktok}</td>
                            <td style={{ textAlign: 'center', fontWeight: 600, color: '#EA580C' }}>{r.shopee}</td>
                            <td style={{ textAlign: 'center', fontWeight: 800, color: '#111827' }}>{r.total}</td>
                            <td style={{ textAlign: 'center' }}>
                              <span
                                style={{
                                  background: '#FEF3C7',
                                  color: '#B45309',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  fontWeight: 700,
                                  fontSize: '11px',
                                  border: '1px solid #FDE68A',
                                }}
                              >
                                {r.pct}%
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Breakdown by Brand (Includes Dealing, Respon, and all dynamic statuses) */}
              <div className="aff-lemon-card">
                <div className="aff-section-header">
                  <h3 className="aff-section-title">
                    <span className="aff-section-icon-wrap yellow">
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
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
                        {allAvailableStatuses.map((st) => (
                          <th key={st} style={{ textAlign: 'center' }}>
                            {st}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dynamicBrandRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4 + allAvailableStatuses.length}
                            style={{ textAlign: 'center', padding: '24px', color: '#78716C' }}
                          >
                            Tidak ada data brand untuk filter ini.
                          </td>
                        </tr>
                      ) : (
                        dynamicBrandRows.map((b) => (
                          <tr key={b.brand}>
                            <td style={{ paddingLeft: '14px' }}>
                              <span className="badge-brand-tag">{b.brand}</span>
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 600, color: '#059669' }}>{b.tiktok}</td>
                            <td style={{ textAlign: 'center', fontWeight: 600, color: '#EA580C' }}>{b.shopee}</td>
                            <td style={{ textAlign: 'center', fontWeight: 800, color: '#111827' }}>{b.total}</td>
                            {allAvailableStatuses.map((st) => {
                              const meta = getStatusMeta(st)
                              const val = b.statusCounts[st] || 0
                              return (
                                <td
                                  key={st}
                                  style={{
                                    textAlign: 'center',
                                    fontWeight: 700,
                                    color: val > 0 ? meta.color : '#9CA3AF',
                                  }}
                                >
                                  {val}
                                </td>
                              )
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td style={{ paddingLeft: '14px' }}>TOTAL</td>
                        <td style={{ textAlign: 'center' }}>{kpis.tt}</td>
                        <td style={{ textAlign: 'center' }}>{kpis.sp}</td>
                        <td style={{ textAlign: 'center' }}>{kpis.total}</td>
                        {allAvailableStatuses.map((st) => (
                          <td key={st} style={{ textAlign: 'center' }}>
                            {kpis.statusStats[st]?.count || 0}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {/* Section 3: Log Lengkap Affiliator (Enhanced with Interactive Sort & Reusable Filters) */}
            <div className="aff-lemon-card">
              <div className="aff-section-header">
                <h3 className="aff-section-title">
                  <span className="aff-section-icon-wrap green">
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                      <path d="M9 12h6M9 16h6" />
                    </svg>
                  </span>
                  <span>4. Log Lengkap Affiliator</span>
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="aff-counter-badge">
                    Menampilkan {sortedRecords.length} dari {rawRecords.length} affiliator
                  </span>
                </div>
              </div>

              {/* Dedicated Table Toolbar & Quick Filters */}
              <div className="aff-table-filter-bar">
                {/* Quick Status Chips */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#78716C', marginRight: '2px' }}>
                    Status:
                  </span>
                  <button
                    type="button"
                    className={`aff-filter-chip ${selectedProgress === 'ALL' ? 'is-active' : ''}`}
                    onClick={() => setSelectedProgress('ALL')}
                  >
                    <span>Semua</span>
                    <span className="aff-chip-count">{filteredRecords.length}</span>
                  </button>
                  {allAvailableStatuses.map((st) => {
                    const cnt = rawRecords.filter(
                      (r) => r.progress?.toLowerCase() === st.toLowerCase()
                    ).length
                    return (
                      <button
                        key={st}
                        type="button"
                        className={`aff-filter-chip ${selectedProgress.toLowerCase() === st.toLowerCase() ? 'is-active' : ''}`}
                        onClick={() => setSelectedProgress(selectedProgress === st ? 'ALL' : st)}
                      >
                        <span>{st}</span>
                        <span className="aff-chip-count">{cnt}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Additional Table Filter Dropdowns */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {/* Kontak filter */}
                  <select
                    value={contactFilter}
                    onChange={(e) => setContactFilter(e.target.value)}
                    style={{
                      height: '30px',
                      fontSize: '12px',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      background: '#FFFFFF',
                      color: '#334155',
                      fontWeight: 500,
                    }}
                    title="Filter berdasarkan ketersediaan kontak"
                  >
                    <option value="ALL">Semua Kontak</option>
                    <option value="phone">Ada No HP/WA</option>
                    <option value="email">Ada Email</option>
                    <option value="dm">Hanya DM/IG</option>
                  </select>

                  {/* Reset Filters button if any filter is active */}
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      style={{
                        height: '30px',
                        fontSize: '11.5px',
                        padding: '0 8px',
                        borderRadius: '6px',
                        border: '1px solid #FCD34D',
                        background: '#FEF9C3',
                        color: '#92400E',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Reset Filter
                    </button>
                  )}
                </div>
              </div>

              {/* Table with Clickable Sort Headers */}
              <div className="aff-table-scroll" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                <table className="aff-lemon-table">
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                      <th
                        className="aff-th-sortable"
                        style={{ width: '45px', textAlign: 'center' }}
                        onClick={() => handleSort('no')}
                        title="Klik untuk urutkan No"
                      >
                        No{' '}
                        <span className={`aff-sort-icon ${sortField === 'no' ? 'is-active' : ''}`}>
                          {sortField === 'no' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </th>
                      <th
                        className="aff-th-sortable"
                        onClick={() => handleSort('date')}
                        title="Klik untuk mengurutkan berdasarkan Tanggal"
                      >
                        Tanggal{' '}
                        <span className={`aff-sort-icon ${sortField === 'date' ? 'is-active' : ''}`}>
                          {sortField === 'date' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </th>
                      <th
                        className="aff-th-sortable"
                        style={{ textAlign: 'center' }}
                        onClick={() => handleSort('platform')}
                        title="Klik untuk mengurutkan berdasarkan Platform"
                      >
                        Platform{' '}
                        <span className={`aff-sort-icon ${sortField === 'platform' ? 'is-active' : ''}`}>
                          {sortField === 'platform' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </th>
                      <th
                        className="aff-th-sortable"
                        onClick={() => handleSort('username')}
                        title="Klik untuk mengurutkan berdasarkan Username (A-Z)"
                      >
                        Username{' '}
                        <span className={`aff-sort-icon ${sortField === 'username' ? 'is-active' : ''}`}>
                          {sortField === 'username' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </th>
                      <th
                        className="aff-th-sortable"
                        style={{ textAlign: 'center' }}
                        onClick={() => handleSort('brand')}
                        title="Klik untuk mengurutkan berdasarkan Brand"
                      >
                        Brand{' '}
                        <span className={`aff-sort-icon ${sortField === 'brand' ? 'is-active' : ''}`}>
                          {sortField === 'brand' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </th>
                      <th
                        className="aff-th-sortable"
                        style={{ textAlign: 'center' }}
                        onClick={() => handleSort('progress')}
                        title="Klik untuk mengurutkan berdasarkan Status Progress"
                      >
                        Progress{' '}
                        <span className={`aff-sort-icon ${sortField === 'progress' ? 'is-active' : ''}`}>
                          {sortField === 'progress' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </th>
                      <th
                        className="aff-th-sortable"
                        onClick={() => handleSort('followers')}
                        title="Klik untuk mengurutkan berdasarkan Jumlah Followers"
                      >
                        Followers{' '}
                        <span className={`aff-sort-icon ${sortField === 'followers' ? 'is-active' : ''}`}>
                          {sortField === 'followers' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </th>
                      <th
                        className="aff-th-sortable"
                        onClick={() => handleSort('gmv')}
                        title="Klik untuk mengurutkan berdasarkan GMV"
                      >
                        GMV{' '}
                        <span className={`aff-sort-icon ${sortField === 'gmv' ? 'is-active' : ''}`}>
                          {sortField === 'gmv' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </th>
                      <th
                        className="aff-th-sortable"
                        onClick={() => handleSort('category')}
                        title="Klik untuk mengurutkan berdasarkan Kategori"
                      >
                        Kategori{' '}
                        <span className={`aff-sort-icon ${sortField === 'category' ? 'is-active' : ''}`}>
                          {sortField === 'category' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </th>
                      <th
                        className="aff-th-sortable"
                        onClick={() => handleSort('contact')}
                        title="Klik untuk mengurutkan berdasarkan Kontak"
                      >
                        Kontak{' '}
                        <span className={`aff-sort-icon ${sortField === 'contact' ? 'is-active' : ''}`}>
                          {sortField === 'contact' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedRecords.length === 0 ? (
                      <tr>
                        <td colSpan={10} style={{ padding: '36px', textAlign: 'center', color: '#78716C' }}>
                          Tidak ada data affiliator yang cocok dengan filter yang dipilih.
                        </td>
                      </tr>
                    ) : (
                      displayedRecords.map((item, idx) => {
                        const rowNumber = pageSize === -1 ? idx + 1 : (currentPage - 1) * pageSize + idx + 1
                        const meta = getStatusMeta(item.progress)
                        return (
                          <tr key={`${item.platform}_${item.username}_${idx}`}>
                            <td style={{ textAlign: 'center', color: '#9CA3AF', fontWeight: 600 }}>{rowNumber}</td>
                            <td style={{ color: '#4B5563', whiteSpace: 'nowrap' }}>{item.date}</td>
                            <td style={{ textAlign: 'center' }}>
                              <span
                                className={
                                  item.platform?.toLowerCase() === 'shopee'
                                    ? 'badge-plat-shopee'
                                    : 'badge-plat-tiktok'
                                }
                              >
                                {item.platform}
                              </span>
                            </td>
                            <td style={{ fontWeight: 700, color: '#111827' }}>{item.username}</td>
                            <td style={{ textAlign: 'center' }}>
                              <span className="badge-brand-tag">{item.brand}</span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className={meta.badgeClass}>{item.progress}</span>
                            </td>
                            <td style={{ color: '#374151', fontWeight: 600 }}>{item.followers || '-'}</td>
                            <td style={{ color: '#374151', fontWeight: 600 }}>{item.gmv || '-'}</td>
                            <td style={{ color: '#4B5563' }}>{item.category || '-'}</td>
                            <td
                              style={{
                                color: '#4B5563',
                                fontSize: '12px',
                                maxWidth: '220px',
                                wordBreak: 'break-word',
                              }}
                            >
                              {item.contact || '-'}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Table Pagination Bar */}
              <div className="aff-pagination-bar">
                <div>
                  Menampilkan{' '}
                  <strong>
                    {sortedRecords.length === 0 ? 0 : pageSize === -1 ? 1 : (currentPage - 1) * pageSize + 1}
                  </strong>{' '}
                  -{' '}
                  <strong>
                    {pageSize === -1 ? sortedRecords.length : Math.min(currentPage * pageSize, sortedRecords.length)}
                  </strong>{' '}
                  dari <strong>{sortedRecords.length}</strong> affiliator
                  {sortField && (
                    <span style={{ marginLeft: '8px', color: '#B45309', fontWeight: 600 }}>
                      (Urut: {sortField} {sortDir.toUpperCase()})
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Baris per halaman */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                    <span>Baris:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      style={{
                        padding: '3px 6px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        background: '#FFFFFF',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={-1}>Semua</option>
                    </select>
                  </label>

                  {/* Paginasi buttons */}
                  {pageSize !== -1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        type="button"
                        className="aff-page-btn"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage(1)}
                        title="Halaman pertama"
                      >
                        «
                      </button>
                      <button
                        type="button"
                        className="aff-page-btn"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        title="Sebelumnya"
                      >
                        ‹
                      </button>
                      <span style={{ padding: '0 6px', fontWeight: 700, fontSize: '12px' }}>
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        className="aff-page-btn"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        title="Berikutnya"
                      >
                        ›
                      </button>
                      <button
                        type="button"
                        className="aff-page-btn"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage(totalPages)}
                        title="Halaman terakhir"
                      >
                        »
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Modal: Panduan Deteksi Dropdown Otomatis Google Sheets */}
        {showGuideModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundColor: 'rgba(0,0,0,0.45)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
            }}
            onClick={() => setShowGuideModal(false)}
          >
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '14px',
                maxWidth: '620px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                border: '1px solid #FEF08A',
                padding: '1.75rem',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '1rem',
                  borderBottom: '1px solid #FEF08A',
                  paddingBottom: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <LemonIcon size={22} />
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1C1917' }}>
                    Deteksi Opsi Dropdown Otomatis
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  style={{
                    border: 'none',
                    background: '#F1F5F9',
                    borderRadius: '50%',
                    width: '28px',
                    height: '28px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#64748B',
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.6 }}>
                <p>
                  Dashboard ini telah dilengkapi dengan <strong>sistem deteksi otomatis 2 arah</strong> sehingga kapan
                  pun Anda menambah opsi baru di Google Sheet (misal: <em>Dealing</em>, <em>Respon</em>,{' '}
                  <em>Sample Sent</em>, dll), opsi tersebut akan langsung otomatis muncul sebagai <strong>KPI Card</strong>
                  , <strong>kolom rincian harian</strong>, dan <strong>kolom per brand</strong>:
                </p>

                <div
                  style={{
                    backgroundColor: '#FEFCE8',
                    border: '1px solid #FEF08A',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    margin: '12px 0',
                  }}
                >
                  <strong style={{ color: '#854D0E' }}>Cara 1: Otomatis dari Baris Data (Zero Setup)</strong>
                  <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#713F12' }}>
                    Cukup pilih opsi status baru pada kolom <strong>Progress</strong> di Google Sheet. Setiap opsi yang
                    pernah dipilih di baris manapun akan langsung otomatis terdeteksi saat tombol <em>Push Report</em>{' '}
                    dijalankan.
                  </p>
                </div>

                <div
                  style={{
                    backgroundColor: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    margin: '12px 0',
                  }}
                >
                  <strong style={{ color: '#15803D' }}>
                    Cara 2: Mengirimkan List Dropdown Data Validation dari Apps Script
                  </strong>
                  <p style={{ margin: '4px 0 8px', fontSize: '12.5px', color: '#166534' }}>
                    Jika Anda ingin semua opsi dropdown terdaftar meskipun barisnya belum terisi, tambahkan baris berikut
                    pada Google Apps Script Anda sebelum mengirim payload JSON:
                  </p>
                  <pre
                    style={{
                      background: '#1E293B',
                      color: '#F8FAFC',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      fontSize: '11.5px',
                      overflowX: 'auto',
                      fontFamily: 'monospace',
                    }}
                  >
{`// Ambil daftar opsi validasi dropdown dari kolom Progress (misal kolom H baris 2):
var rule = sheet.getRange("H2").getDataValidation();
var progressOptions = rule ? rule.getCriteriaValues()[0] : [];

// Masukkan ke payload JSON yang di-push ke dashboard:
var payload = {
  progressOptions: progressOptions,
  affiliatorDetails: affiliatorRows,
  // ... field lainnya
};`}
                  </pre>
                </div>

                <p style={{ fontSize: '12px', color: '#64748B', margin: '14px 0 0' }}>
                  💡 <em>Status default standar: Listing, Approaching, Respon, dan Dealing sudah aktif secara permanen.</em>
                </p>
              </div>

              <div style={{ marginTop: '1.25rem', textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    background: '#EAB308',
                    color: '#713F12',
                    border: 'none',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Mengerti &amp; Tutup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        <div className={`kpi-toast ${toastVisible ? 'show' : ''}`}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#16A34A"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{toastMessage}</span>
        </div>
      </div>
    </AuthGate>
  )
}
