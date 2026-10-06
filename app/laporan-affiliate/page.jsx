'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import AuthGate from '@/components/AuthGate'
import KpiCard from '@/components/affiliate/KpiCard'

// Helper: Parse follower strings like "3.1K", "7,9RB", "1,1M", "733", "78" into numeric values
function parseFollowersCount(val) {
  if (!val) return 0
  let str = String(val).trim().toUpperCase().replace(/\n/g, '').replace(/,/g, '.')
  let mul = 1
  if (str.includes('M')) {
    mul = 1000000
    str = str.replace('M', '')
  } else if (str.includes('K') || str.includes('RB')) {
    mul = 1000
    str = str.replace('K', '').replace('RB', '')
  }
  const num = parseFloat(str)
  return isNaN(num) ? 0 : num * mul
}

// Helper: Parse GMV strings like "203jt", "1JT+", "1JT-2JT", "10JT-50JT", "1,1M" into numeric values
function parseGmvAmount(val) {
  if (!val) return 0
  let str = String(val).trim().toLowerCase().replace(/\n/g, '').replace(/,/g, '.')
  let mul = 1000000
  if (str.includes('m')) mul = 1000000000
  else if (str.includes('jt')) mul = 1000000

  const match = str.match(/([0-9.]+)/)
  if (match) {
    const num = parseFloat(match[1])
    return isNaN(num) ? 0 : num * mul
  }
  return 0
}

// Color palette for status badges and cards
const STATUS_COLORS = {
  listing: { bg: 'rgba(16, 185, 129, 0.15)', text: '#34D399', hex: '#10B981' },
  approaching: { bg: 'rgba(245, 158, 11, 0.15)', text: '#FBBF24', hex: '#F59E0B' },
  respon: { bg: 'rgba(2, 132, 199, 0.15)', text: '#38BDF8', hex: '#0284C7' },
  dealing: { bg: 'rgba(139, 92, 246, 0.15)', text: '#A78BFA', hex: '#8B5CF6' },
  default: { bg: 'rgba(148, 163, 184, 0.15)', text: '#CBD5E1', hex: '#64748B' }
}

function getStatusColor(statusName) {
  const key = String(statusName || '').toLowerCase()
  return STATUS_COLORS[key] || STATUS_COLORS.default
}

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
  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const [selectedFollowerRange, setSelectedFollowerRange] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Sorting
  const [sortField, setSortField] = useState('no')
  const [sortOrder, setSortOrder] = useState('asc') // 'asc' | 'desc'

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // Toast
  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)

  const showToast = useCallback((msg) => {
    setToastMessage(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2000)
  }, [])

  // 1. Fetch data
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

  // Master records
  const rawRecords = useMemo(() => data?.affiliatorDetails || [], [data])

  // Dynamic status options (Merges Google Sheet dropdown options + data values + defaults)
  const allDetectedStatuses = useMemo(() => {
    const priority = ['Listing', 'Approaching', 'Respon', 'Dealing']
    const fromApi = data?.availableStatuses || []
    const fromData = rawRecords.map((r) => r.progress).filter(Boolean)
    const combined = [...priority]

    ;[...fromApi, ...fromData].forEach((s) => {
      if (!combined.some((x) => x.toLowerCase() === s.toLowerCase())) {
        combined.push(s)
      }
    })
    return combined
  }, [data, rawRecords])

  const availableDates = useMemo(() => {
    return [...new Set(rawRecords.map((r) => r.date).filter(Boolean))].sort().reverse()
  }, [rawRecords])

  const availableBrands = useMemo(() => {
    const fromApi = data?.availableBrands || []
    const fromData = rawRecords.map((r) => r.brand).filter(Boolean)
    return [...new Set([...fromApi, ...fromData])].sort()
  }, [data, rawRecords])

  const availableCategories = useMemo(() => {
    const fromApi = data?.availableCategories || []
    const fromData = rawRecords.map((r) => r.category).filter(Boolean)
    return [...new Set([...fromApi, ...fromData])].sort()
  }, [data, rawRecords])

  // Active Filter Count
  const hasActiveFilters = useMemo(() => {
    return (
      activePlatform !== 'semua' ||
      timeMode !== 'all' ||
      selectedDate !== 'ALL' ||
      selectedBrand !== 'ALL' ||
      selectedProgress !== 'ALL' ||
      selectedCategory !== 'ALL' ||
      selectedFollowerRange !== 'ALL' ||
      searchQuery.trim() !== ''
    )
  }, [activePlatform, timeMode, selectedDate, selectedBrand, selectedProgress, selectedCategory, selectedFollowerRange, searchQuery])

  const resetAllFilters = () => {
    setActivePlatform('semua')
    setTimeMode('all')
    setSelectedDate('ALL')
    setSelectedBrand('ALL')
    setSelectedProgress('ALL')
    setSelectedCategory('ALL')
    setSelectedFollowerRange('ALL')
    setSearchQuery('')
    setCurrentPage(1)
    showToast('Semua filter direset!')
  }

  // Filter records
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
        if (item.brand?.toLowerCase() !== selectedBrand.toLowerCase()) return false
      }
      // Progress filter
      if (selectedProgress !== 'ALL') {
        if (item.progress?.toLowerCase() !== selectedProgress.toLowerCase()) return false
      }
      // Category filter
      if (selectedCategory !== 'ALL') {
        if (item.category?.toLowerCase() !== selectedCategory.toLowerCase()) return false
      }
      // Followers range filter
      if (selectedFollowerRange !== 'ALL') {
        const count = parseFollowersCount(item.followers)
        if (selectedFollowerRange === '<1k' && count >= 1000) return false
        if (selectedFollowerRange === '1k-5k' && (count < 1000 || count > 5000)) return false
        if (selectedFollowerRange === '5k-10k' && (count < 5000 || count > 10000)) return false
        if (selectedFollowerRange === '10k-50k' && (count < 10000 || count > 50000)) return false
        if (selectedFollowerRange === '>50k' && count <= 50000) return false
      }
      // Search query (Username, Kontak, GMV, Kategori)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchUser = item.username?.toLowerCase().includes(q)
        const matchContact = item.contact?.toLowerCase().includes(q)
        const matchCat = item.category?.toLowerCase().includes(q)
        const matchGmv = item.gmv?.toLowerCase().includes(q)
        const matchBrand = item.brand?.toLowerCase().includes(q)
        if (!matchUser && !matchContact && !matchCat && !matchGmv && !matchBrand) return false
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
    searchQuery
  ])

  // Sorting Handler
  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder(field === 'followers' || field === 'gmv' || field === 'date' ? 'desc' : 'asc')
    }
    setCurrentPage(1)
  }

  // Sorted Records
  const sortedRecords = useMemo(() => {
    const list = [...filteredRecords]
    list.sort((a, b) => {
      let valA, valB

      if (sortField === 'no') {
        valA = Number(a.no) || 0
        valB = Number(b.no) || 0
      } else if (sortField === 'followers') {
        valA = parseFollowersCount(a.followers)
        valB = parseFollowersCount(b.followers)
      } else if (sortField === 'gmv') {
        valA = parseGmvAmount(a.gmv)
        valB = parseGmvAmount(b.gmv)
      } else {
        valA = String(a[sortField] || '').toLowerCase()
        valB = String(b[sortField] || '').toLowerCase()
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [filteredRecords, sortField, sortOrder])

  // Paginated Records
  const paginatedRecords = useMemo(() => {
    if (pageSize === 0) return sortedRecords
    const start = (currentPage - 1) * pageSize
    return sortedRecords.slice(start, start + pageSize)
  }, [sortedRecords, currentPage, pageSize])

  const totalPages = useMemo(() => {
    if (pageSize === 0) return 1
    return Math.ceil(sortedRecords.length / pageSize) || 1
  }, [sortedRecords.length, pageSize])

  // Dynamic KPI calculations
  const kpis = useMemo(() => {
    const total = filteredRecords.length
    const tt = filteredRecords.filter((r) => r.platform?.toLowerCase() === 'tiktok').length
    const sp = filteredRecords.filter((r) => r.platform?.toLowerCase() === 'shopee').length

    // Status counts for each detected status
    const statusCounts = {}
    allDetectedStatuses.forEach((s) => {
      const count = filteredRecords.filter((r) => r.progress?.toLowerCase() === s.toLowerCase()).length
      const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0'
      statusCounts[s] = { count, pct }
    })

    const brands = [...new Set(filteredRecords.map((r) => r.brand).filter(Boolean))]

    return {
      total,
      tt,
      sp,
      statusCounts,
      brandCount: brands.length,
      brandsList: brands.slice(0, 2).join(', ') + (brands.length > 2 ? ` +${brands.length - 2}` : '')
    }
  }, [filteredRecords, allDetectedStatuses])

  // Dynamic Daily Breakdown Rows
  const dynamicDailyRows = useMemo(() => {
    const dates = [...new Set(filteredRecords.map((r) => r.date).filter(Boolean))].sort().reverse()
    return dates.map((d) => {
      const recs = filteredRecords.filter((r) => r.date === d)
      const row = {
        date: d,
        total: recs.length,
        tiktok: recs.filter((r) => r.platform?.toLowerCase() === 'tiktok').length,
        shopee: recs.filter((r) => r.platform?.toLowerCase() === 'shopee').length
      }
      allDetectedStatuses.forEach((s) => {
        row[s.toLowerCase()] = recs.filter((r) => r.progress?.toLowerCase() === s.toLowerCase()).length
      })
      return row
    })
  }, [filteredRecords, allDetectedStatuses])

  // Dynamic Brand Breakdown Rows
  const dynamicBrandRows = useMemo(() => {
    const brands = [...new Set(filteredRecords.map((r) => r.brand).filter(Boolean))].sort()
    const total = filteredRecords.length || 1
    return brands.map((b) => {
      const recs = filteredRecords.filter((r) => r.brand === b)
      const row = {
        brand: b,
        tiktok: recs.filter((r) => r.platform?.toLowerCase() === 'tiktok').length,
        shopee: recs.filter((r) => r.platform?.toLowerCase() === 'shopee').length,
        total: recs.length,
        pct: ((recs.length / total) * 100).toFixed(1)
      }
      allDetectedStatuses.forEach((s) => {
        row[s.toLowerCase()] = recs.filter((r) => r.progress?.toLowerCase() === s.toLowerCase()).length
      })
      return row
    })
  }, [filteredRecords, allDetectedStatuses])

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
      ['Total Affiliator', kpis.total, `TikTok: ${kpis.tt} | Shopee: ${kpis.sp}`]
    ]
    allDetectedStatuses.forEach((s) => {
      const st = kpis.statusCounts[s] || { count: 0, pct: '0' }
      kpiData.push([`Status: ${s}`, st.count, `${st.pct}% dari total`])
    })
    kpiData.push(['Brand Aktif', kpis.brandCount, kpis.brandsList || 'Semua Brand'])
    kpiData.push(['Terakhir Disinkronkan', data?.savedAt || '-', 'Vercel Blob Storage'])

    const wsKpi = XLSX.utils.aoa_to_sheet(kpiData)
    XLSX.utils.book_append_sheet(wb, wsKpi, 'Ringkasan KPI')

    // 2. Daily Breakdown Sheet
    const dailyHeaders = ['Tanggal', 'Total Affiliator', 'TikTok', 'Shopee', ...allDetectedStatuses]
    const dailyData = [
      dailyHeaders,
      ...dynamicDailyRows.map((r) => [
        r.date,
        r.total,
        r.tiktok,
        r.shopee,
        ...allDetectedStatuses.map((s) => r[s.toLowerCase()] || 0)
      ])
    ]
    const wsDaily = XLSX.utils.aoa_to_sheet(dailyData)
    XLSX.utils.book_append_sheet(wb, wsDaily, 'Rincian Harian')

    // 3. Progress Breakdown Sheet
    const progressData = [
      ['Status Progress', 'TikTok', 'Shopee', 'Total Affiliator', 'Persentase (%)'],
      ...allDetectedStatuses.map((s) => {
        const recs = filteredRecords.filter((r) => r.progress?.toLowerCase() === s.toLowerCase())
        const tt = recs.filter((r) => r.platform?.toLowerCase() === 'tiktok').length
        const sp = recs.filter((r) => r.platform?.toLowerCase() === 'shopee').length
        const tot = recs.length
        const pct = filteredRecords.length ? ((tot / filteredRecords.length) * 100).toFixed(1) : '0'
        return [s, tt, sp, tot, `${pct}%`]
      })
    ]
    const wsProgress = XLSX.utils.aoa_to_sheet(progressData)
    XLSX.utils.book_append_sheet(wb, wsProgress, 'Breakdown Progress')

    // 4. Brand Breakdown Sheet
    const brandHeaders = ['Brand', 'TikTok', 'Shopee', 'Total Affiliator', ...allDetectedStatuses, 'Share (%)']
    const brandData = [
      brandHeaders,
      ...dynamicBrandRows.map((b) => [
        b.brand,
        b.tiktok,
        b.shopee,
        b.total,
        ...allDetectedStatuses.map((s) => b[s.toLowerCase()] || 0),
        `${b.pct}%`
      ])
    ]
    const wsBrand = XLSX.utils.aoa_to_sheet(brandData)
    XLSX.utils.book_append_sheet(wb, wsBrand, 'Breakdown Brand')

    // 5. Details Sheet
    const detailData = [
      ['No', 'Tanggal', 'Platform', 'Username', 'Brand', 'Progress', 'Followers', 'GMV', 'Kategori', 'Kontak'],
      ...filteredRecords.map((r, i) => [
        i + 1,
        r.date,
        r.platform,
        r.username,
        r.brand,
        r.progress,
        r.followers,
        r.gmv,
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
            onClick={() => { setActivePlatform('semua'); setCurrentPage(1) }}
          >
            <span className="dot" style={{ background: '#7c3aed' }} />
            Semua Platform
          </button>
          <button
            type="button"
            className={`aff-plat-btn ${activePlatform === 'shopee' ? 'is-active shopee' : ''}`}
            onClick={() => { setActivePlatform('shopee'); setCurrentPage(1) }}
          >
            <span className="dot" style={{ background: '#ea580c' }} />
            Shopee
          </button>
          <button
            type="button"
            className={`aff-plat-btn ${activePlatform === 'tiktok' ? 'is-active tiktok' : ''}`}
            onClick={() => { setActivePlatform('tiktok'); setCurrentPage(1) }}
          >
            <span className="dot" style={{ background: '#3B5BDB' }} />
            TikTok Shop
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="aff-control-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', marginBottom: '1.25rem' }}>
          {/* Filter 1: Waktu */}
          <div className="aff-filter-group">
            <label className="aff-filter-label">Waktu:</label>
            <div className="aff-toggle-group">
              <button
                type="button"
                className={`aff-toggle-btn ${timeMode === 'all' ? 'active' : ''}`}
                onClick={() => { setTimeMode('all'); setSelectedDate('ALL'); setCurrentPage(1) }}
              >
                All-Time
              </button>
              <button
                type="button"
                className={`aff-toggle-btn ${timeMode === 'date' ? 'active' : ''}`}
                onClick={() => { setTimeMode('date'); setCurrentPage(1) }}
              >
                Pilih Tanggal
              </button>
            </div>

            {timeMode === 'date' && (
              <select
                className="category-select aff-month-select"
                value={selectedDate}
                onChange={(e) => { setSelectedDate(e.target.value); setCurrentPage(1) }}
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
              onChange={(e) => { setSelectedBrand(e.target.value); setCurrentPage(1) }}
            >
              <option value="ALL">Semua Brand ({availableBrands.length})</option>
              {availableBrands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Filter 3: Progress (Dropdown otomatis dari status terdeteksi) */}
          <div className="aff-filter-group">
            <label className="aff-filter-label">Status Progress:</label>
            <select
              className="category-select aff-account-select"
              value={selectedProgress}
              onChange={(e) => { setSelectedProgress(e.target.value); setCurrentPage(1) }}
            >
              <option value="ALL">Semua Status ({allDetectedStatuses.length})</option>
              {allDetectedStatuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Filter 4: Kategori */}
          <div className="aff-filter-group">
            <label className="aff-filter-label">Kategori:</label>
            <select
              className="category-select aff-account-select"
              value={selectedCategory}
              onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1) }}
            >
              <option value="ALL">Semua Kategori ({availableCategories.length})</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Filter 5: Rentang Followers */}
          <div className="aff-filter-group">
            <label className="aff-filter-label">Followers:</label>
            <select
              className="category-select aff-account-select"
              value={selectedFollowerRange}
              onChange={(e) => { setSelectedFollowerRange(e.target.value); setCurrentPage(1) }}
            >
              <option value="ALL">Semua Followers</option>
              <option value="<1k">&lt; 1K (Mikro)</option>
              <option value="1k-5k">1K - 5K</option>
              <option value="5k-10k">5K - 10K</option>
              <option value="10k-50k">10K - 50K</option>
              <option value=">50k">&gt; 50K (Makro)</option>
            </select>
          </div>

          {/* Filter 6: Search Input */}
          <div className="aff-filter-group" style={{ flex: '1 1 200px' }}>
            <label className="aff-filter-label">Cari Affiliator:</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="login-input"
                placeholder="Cari username, kontak, GMV..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
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

          {/* Reset Filter Button */}
          {hasActiveFilters && (
            <button
              type="button"
              className="btn-secondary"
              onClick={resetAllFilters}
              style={{ height: '36px', padding: '0 12px', fontSize: '12px', color: '#F87171', borderColor: 'rgba(239, 68, 68, 0.3)' }}
              title="Reset semua filter ke kondisi awal"
            >
              ?o Reset Filter
            </button>
          )}
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
              Buka Google Sheet Anda, pilih menu <strong>?" Affiliate Marketing +' 🚀 Push Data ke Web Dashboard (Vercel Blob)</strong> untuk mengirimkan data ke web dashboard ini.
            </p>
          </div>
        ) : (
          <>
            {/* Dynamic KPI Cards Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              marginBottom: '1.75rem'
            }}>
              {/* 1. Total Affiliators */}
              <KpiCard
                label={timeMode === 'all' ? 'Total Affiliator (All Time)' : `Total Affiliator (${selectedDate})`}
                value={kpis.total.toLocaleString('id-ID')}
                sub={`TikTok: ${kpis.tt}  |  Shopee: ${kpis.sp}`}
                color="#4F46E5"
                raw={kpis.total}
                onCopy={showToast}
              />

              {/* 2. Dynamic Progress KPI Cards (Listing, Approaching, Respon, Dealing, etc.) */}
              {allDetectedStatuses.map((statusName) => {
                const info = kpis.statusCounts[statusName] || { count: 0, pct: '0' }
                const colorObj = getStatusColor(statusName)
                return (
                  <KpiCard
                    key={statusName}
                    label={`Progress: ${statusName}`}
                    value={info.count.toLocaleString('id-ID')}
                    sub={`${info.pct}% dari total`}
                    color={colorObj.hex}
                    raw={info.count}
                    onCopy={showToast}
                  />
                )
              })}

              {/* 3. Active Brands Card */}
              <KpiCard
                label="Brand Aktif"
                value={kpis.brandCount}
                sub={kpis.brandsList || 'Semua Brand'}
                color="#E11D48"
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
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
                      {allDetectedStatuses.map((s) => (
                        <th key={s} style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'center' }}>{s}</th>
                      ))}
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
                        {allDetectedStatuses.map((s) => {
                          const val = row[s.toLowerCase()] || 0
                          const colorObj = getStatusColor(s)
                          return (
                            <td key={s} style={{ padding: '10px 12px', textAlign: 'center', color: val > 0 ? colorObj.text : '#64748B', fontWeight: val > 0 ? 600 : 400 }}>
                              {val}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                    {/* Summary Total Row */}
                    <tr style={{ background: '#0F172A', fontWeight: 700, color: '#F8FAFC', borderTop: '2px solid #475569' }}>
                      <td style={{ padding: '10px 12px' }}>TOTAL</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>{kpis.total}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#93C5FD' }}>{kpis.tt}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#FB923C' }}>{kpis.sp}</td>
                      {allDetectedStatuses.map((s) => {
                        const val = kpis.statusCounts[s]?.count || 0
                        const colorObj = getStatusColor(s)
                        return (
                          <td key={s} style={{ padding: '10px 12px', textAlign: 'center', color: colorObj.text }}>
                            {val}
                          </td>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 2: Breakdown by Brand & Progress */}
            <div className="aff-card-section" style={{
              background: '#1E293B',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '1.25rem',
              marginBottom: '1.5rem'
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#F8FAFC', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>dYÅ</span> 2. Breakdown Berdasarkan Brand &amp; Status Progress
              </h3>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: '#0F172A', color: '#94A3B8' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Brand</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>TikTok</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Shopee</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Total Affiliator</th>
                      {allDetectedStatuses.map((s) => (
                        <th key={s} style={{ padding: '10px 12px', textAlign: 'center' }}>{s}</th>
                      ))}
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Share (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dynamicBrandRows.map((b) => (
                      <tr key={b.brand} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#C084FC' }}>{b.brand}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#93C5FD' }}>{b.tiktok}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#FB923C' }}>{b.shopee}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#F8FAFC' }}>{b.total}</td>
                        {allDetectedStatuses.map((s) => {
                          const val = b[s.toLowerCase()] || 0
                          const colorObj = getStatusColor(s)
                          return (
                            <td key={s} style={{ padding: '10px 12px', textAlign: 'center', color: val > 0 ? colorObj.text : '#64748B' }}>
                              {val}
                            </td>
                          )
                        })}
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#A78BFA', fontWeight: 600 }}>{b.pct}%</td>
                      </tr>
                    ))}
                    {/* Brand Total Row */}
                    <tr style={{ background: '#0F172A', fontWeight: 700, color: '#F8FAFC', borderTop: '2px solid #475569' }}>
                      <td style={{ padding: '10px 12px' }}>TOTAL</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#93C5FD' }}>{kpis.tt}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#FB923C' }}>{kpis.sp}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>{kpis.total}</td>
                      {allDetectedStatuses.map((s) => {
                        const val = kpis.statusCounts[s]?.count || 0
                        const colorObj = getStatusColor(s)
                        return (
                          <td key={s} style={{ padding: '10px 12px', textAlign: 'center', color: colorObj.text }}>
                            {val}
                          </td>
                        )
                      })}
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#A78BFA' }}>100.0%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 3: All-Time Affiliator Details Log with Sorting & Pagination */}
            <div style={{
              background: '#1E293B',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '1.25rem'
            }}>
              {/* Header with Search Counter & Page Size Selector */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>dY"</span> 3. Log Lengkap Affiliator ({filteredRecords.length} Data)
                  </h3>
                  <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '2px' }}>
                    Klik judul kolom untuk menyortir data (A-Z / angka terbesar)
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#94a3b8' }}>
                  <span>Tampilkan:</span>
                  <select
                    className="category-select"
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1) }}
                    style={{ padding: '4px 8px', fontSize: '12px', background: '#0F172A', color: '#F8FAFC', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px' }}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={0}>Semua ({sortedRecords.length})</option>
                  </select>
                </div>
              </div>

              {/* Data Table */}
              <div style={{ overflowX: 'auto', maxHeight: '580px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr style={{ background: '#0F172A', color: '#E2E8F0', borderBottom: '2px solid #334155' }}>
                      {/* Sortable Header: No */}
                      <th
                        onClick={() => handleSort('no')}
                        style={{ padding: '10px 10px', width: '50px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                        title="Urutkan No"
                      >
                        No {sortField === 'no' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                      </th>

                      {/* Sortable Header: Tanggal */}
                      <th
                        onClick={() => handleSort('date')}
                        style={{ padding: '10px 10px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                        title="Urutkan Tanggal"
                      >
                        Tanggal {sortField === 'date' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                      </th>

                      {/* Sortable Header: Platform */}
                      <th
                        onClick={() => handleSort('platform')}
                        style={{ padding: '10px 10px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                        title="Urutkan Platform"
                      >
                        Platform {sortField === 'platform' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                      </th>

                      {/* Sortable Header: Username */}
                      <th
                        onClick={() => handleSort('username')}
                        style={{ padding: '10px 10px', cursor: 'pointer', userSelect: 'none' }}
                        title="Urutkan Username"
                      >
                        Username {sortField === 'username' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                      </th>

                      {/* Sortable Header: Brand */}
                      <th
                        onClick={() => handleSort('brand')}
                        style={{ padding: '10px 10px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                        title="Urutkan Brand"
                      >
                        Brand {sortField === 'brand' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                      </th>

                      {/* Sortable Header: Progress */}
                      <th
                        onClick={() => handleSort('progress')}
                        style={{ padding: '10px 10px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                        title="Urutkan Status Progress"
                      >
                        Progress {sortField === 'progress' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                      </th>

                      {/* Sortable Header: Followers (Numeric) */}
                      <th
                        onClick={() => handleSort('followers')}
                        style={{ padding: '10px 10px', cursor: 'pointer', userSelect: 'none' }}
                        title="Urutkan Jumlah Followers (Terbanyak / Tersedikit)"
                      >
                        Followers {sortField === 'followers' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                      </th>

                      {/* Sortable Header: GMV (Numeric) */}
                      <th
                        onClick={() => handleSort('gmv')}
                        style={{ padding: '10px 10px', cursor: 'pointer', userSelect: 'none' }}
                        title="Urutkan Nilai GMV"
                      >
                        GMV {sortField === 'gmv' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                      </th>

                      {/* Sortable Header: Kategori */}
                      <th
                        onClick={() => handleSort('category')}
                        style={{ padding: '10px 10px', cursor: 'pointer', userSelect: 'none' }}
                        title="Urutkan Kategori"
                      >
                        Kategori {sortField === 'category' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                      </th>

                      {/* Header: Kontak */}
                      <th style={{ padding: '10px 10px' }}>Kontak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRecords.length === 0 ? (
                      <tr>
                        <td colSpan={10} style={{ padding: '28px', textAlign: 'center', color: '#94a3b8' }}>
                          Tidak ada data affiliator yang cocok dengan filter.
                        </td>
                      </tr>
                    ) : (
                      paginatedRecords.map((item, idx) => {
                        const globalIndex = pageSize > 0 ? (currentPage - 1) * pageSize + idx + 1 : idx + 1
                        const colorObj = getStatusColor(item.progress)

                        return (
                          <tr
                            key={`${item.platform}_${item.username}_${idx}`}
                            style={{
                              background: idx % 2 === 0 ? '#1E293B' : 'rgba(255, 255, 255, 0.02)',
                              borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                            }}
                          >
                            <td style={{ padding: '8px 10px', textAlign: 'center', color: '#64748B' }}>
                              {globalIndex}
                            </td>
                            <td style={{ padding: '8px 10px', color: '#94A3B8', whiteSpace: 'nowrap' }}>
                              {item.date}
                            </td>
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
                            <td style={{ padding: '8px 10px', fontWeight: 600, color: '#F8FAFC' }}>
                              {item.username}
                            </td>
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
                                background: colorObj.bg,
                                color: colorObj.text
                              }}>
                                {item.progress}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px', color: '#E2E8F0', fontWeight: 500 }}>
                              {item.followers || '-'}
                            </td>
                            <td style={{ padding: '8px 10px', color: '#E2E8F0', fontWeight: 500 }}>
                              {item.gmv || '-'}
                            </td>
                            <td style={{ padding: '8px 10px', color: '#94A3B8' }}>
                              {item.category || '-'}
                            </td>
                            <td style={{ padding: '8px 10px', color: '#94A3B8', fontSize: '11.5px', maxWidth: '200px', wordBreak: 'break-word' }}>
                              {item.contact || '-'}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {pageSize > 0 && totalPages > 1 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '1rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  fontSize: '12px',
                  color: '#94A3B8',
                  flexWrap: 'wrap',
                  gap: '8px'
                }}>
                  <div>
                    Menampilkan <strong>{(currentPage - 1) * pageSize + 1}</strong> &ndash;{' '}
                    <strong>{Math.min(currentPage * pageSize, sortedRecords.length)}</strong> dari{' '}
                    <strong>{sortedRecords.length}</strong> affiliator
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      style={{ padding: '4px 10px', height: '28px', fontSize: '11.5px', opacity: currentPage === 1 ? 0.5 : 1 }}
                    >
                      &larr; Prev
                    </button>

                    <span style={{ padding: '0 8px', color: '#E2E8F0', fontWeight: 600 }}>
                      Halaman {currentPage} / {totalPages}
                    </span>

                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      style={{ padding: '4px 10px', height: '28px', fontSize: '11.5px', opacity: currentPage === totalPages ? 0.5 : 1 }}
                    >
                      Next &rarr;
                    </button>
                  </div>
                </div>
              )}
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
