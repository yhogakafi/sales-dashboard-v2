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
      color: '#B45309',
      bg: '#FEF3C7',
      text: '#B45309',
      border: '#FDE68A',
      badgeClass: 'badge-status-approaching',
    }
  }
  if (s === 'dealing') {
    return {
      label: 'Dealing',
      color: '#6D28D9',
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
    color: '#854D0E',
    bg: '#FEF08A',
    text: '#854D0E',
    border: '#FDE047',
    badgeClass: 'badge-status-generic',
  }
}

export default function LaporanAffiliatePage() {
  const [activePlatform, setActivePlatform] = useState('semua') // 'semua' | 'shopee' | 'tiktok'
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Filters (Global + Column filters)
  const [timeMode, setTimeMode] = useState('all') // 'all' | 'date'
  const [selectedDate, setSelectedDate] = useState('ALL')
  const [selectedBrand, setSelectedBrand] = useState('ALL')
  const [selectedProgress, setSelectedProgress] = useState('ALL')
  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const [selectedFollowerRange, setSelectedFollowerRange] = useState('ALL')
  const [selectedGmvRange, setSelectedGmvRange] = useState('ALL')
  const [contactFilter, setContactFilter] = useState('ALL') // 'ALL' | 'phone' | 'email' | 'dm' | 'none'
  const [usernameSearch, setUsernameSearch] = useState('')
  const [contactSearch, setContactSearch] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [noFilter, setNoFilter] = useState('ALL') // 'ALL' | '10' | '25' | '50' | '100'

  // Popover State for Column Filters
  const [openColFilter, setOpenColFilter] = useState(null) // null | 'no' | 'date' | 'platform' | 'username' | 'brand' | 'progress' | 'followers' | 'gmv' | 'category' | 'contact'
  const [popoverSearchBrand, setPopoverSearchBrand] = useState('')
  const [popoverSearchCat, setPopoverSearchCat] = useState('')
  const [popoverSearchDate, setPopoverSearchDate] = useState('')

  // Table Sorting
  const [sortField, setSortField] = useState('date') // default sort by date
  const [sortDir, setSortDir] = useState('desc') // 'asc' | 'desc'

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

  // Close popovers on click outside or Escape key
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (
        !e.target.closest('.aff-col-filter-popover') &&
        !e.target.closest('.aff-col-filter-btn')
      ) {
        setOpenColFilter(null)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpenColFilter(null)
        setShowGuideModal(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
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

  // Dynamically detect all progress statuses
  const allAvailableStatuses = useMemo(() => {
    const fromApi = Array.isArray(data?.availableStatuses)
      ? data.availableStatuses
      : Array.isArray(data?.progressOptions)
      ? data.progressOptions
      : []
    const fromRecords = rawRecords.map((r) => r.progress).filter(Boolean)

    const seen = new Set()
    const list = []

    for (const st of DEFAULT_CORE_STATUSES) {
      const key = st.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        list.push(st)
      }
    }
    for (const st of fromApi) {
      const key = String(st).trim().toLowerCase()
      if (key && !seen.has(key)) {
        seen.add(key)
        list.push(String(st).trim())
      }
    }
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

  // Helper to check if a specific column is currently filtered
  const isColFiltered = (colKey) => {
    switch (colKey) {
      case 'no':
        return noFilter !== 'ALL'
      case 'date':
        return selectedDate !== 'ALL'
      case 'platform':
        return activePlatform !== 'semua'
      case 'username':
        return usernameSearch.trim() !== ''
      case 'brand':
        return selectedBrand !== 'ALL'
      case 'progress':
        return selectedProgress !== 'ALL'
      case 'followers':
        return selectedFollowerRange !== 'ALL'
      case 'gmv':
        return selectedGmvRange !== 'ALL'
      case 'category':
        return selectedCategory !== 'ALL'
      case 'contact':
        return contactFilter !== 'ALL' || contactSearch.trim() !== ''
      default:
        return false
    }
  }

  // Active filter chip list for UI feedback bar
  const activeFilterList = useMemo(() => {
    const list = []
    if (activePlatform !== 'semua') {
      list.push({
        id: 'platform',
        label: `Platform: ${activePlatform === 'shopee' ? 'Shopee' : 'TikTok Shop'}`,
        clear: () => setActivePlatform('semua'),
      })
    }
    if (selectedDate !== 'ALL') {
      list.push({
        id: 'date',
        label: `Tanggal: ${selectedDate}`,
        clear: () => {
          setSelectedDate('ALL')
          setTimeMode('all')
        },
      })
    }
    if (selectedBrand !== 'ALL') {
      list.push({
        id: 'brand',
        label: `Brand: ${selectedBrand}`,
        clear: () => setSelectedBrand('ALL'),
      })
    }
    if (selectedProgress !== 'ALL') {
      list.push({
        id: 'progress',
        label: `Status: ${selectedProgress}`,
        clear: () => setSelectedProgress('ALL'),
      })
    }
    if (selectedCategory !== 'ALL') {
      list.push({
        id: 'category',
        label: `Kategori: ${selectedCategory}`,
        clear: () => setSelectedCategory('ALL'),
      })
    }
    if (selectedFollowerRange !== 'ALL') {
      const labels = {
        nano: 'Followers: Nano (< 5K)',
        micro: 'Followers: Micro (5K-20K)',
        macro: 'Followers: Macro (> 20K)',
        has_followers: 'Followers: Ada (> 0)',
        no_followers: 'Followers: Kosong (-)',
      }
      list.push({
        id: 'followers',
        label: labels[selectedFollowerRange] || `Followers: ${selectedFollowerRange}`,
        clear: () => setSelectedFollowerRange('ALL'),
      })
    }
    if (selectedGmvRange !== 'ALL') {
      const gmvLabels = {
        has_gmv: 'GMV: Ada Penjualan (> 0)',
        no_gmv: 'GMV: Belum Ada (0 / -)',
        under_10m: 'GMV: < 10 Juta',
        '10m_to_50m': 'GMV: 10JT - 50JT',
        above_50m: 'GMV: > 50 Juta',
        above_100m: 'GMV: > 100 Juta',
      }
      list.push({
        id: 'gmv',
        label: gmvLabels[selectedGmvRange] || `GMV: ${selectedGmvRange}`,
        clear: () => setSelectedGmvRange('ALL'),
      })
    }
    if (contactFilter !== 'ALL') {
      const cLabels = {
        phone: 'Kontak: Ada No HP/WA',
        email: 'Kontak: Ada Email',
        dm: 'Kontak: Hanya DM/IG',
        none: 'Kontak: Belum Ada (-)',
      }
      list.push({
        id: 'contact_type',
        label: cLabels[contactFilter] || `Kontak: ${contactFilter}`,
        clear: () => setContactFilter('ALL'),
      })
    }
    if (contactSearch.trim()) {
      list.push({
        id: 'contact_search',
        label: `Cari Kontak: "${contactSearch}"`,
        clear: () => setContactSearch(''),
      })
    }
    if (usernameSearch.trim()) {
      list.push({
        id: 'username',
        label: `Username: "${usernameSearch}"`,
        clear: () => setUsernameSearch(''),
      })
    }
    if (searchQuery.trim()) {
      list.push({
        id: 'search',
        label: `Cari: "${searchQuery}"`,
        clear: () => setSearchQuery(''),
      })
    }
    if (noFilter !== 'ALL') {
      list.push({
        id: 'no',
        label: `Tampilkan: Top ${noFilter}`,
        clear: () => setNoFilter('ALL'),
      })
    }
    return list
  }, [
    activePlatform,
    selectedDate,
    selectedBrand,
    selectedProgress,
    selectedCategory,
    selectedFollowerRange,
    selectedGmvRange,
    contactFilter,
    contactSearch,
    usernameSearch,
    searchQuery,
    noFilter,
  ])

  const hasActiveFilters = activeFilterList.length > 0 || sortField !== 'date'

  const resetAllFilters = () => {
    setActivePlatform('semua')
    setTimeMode('all')
    setSelectedDate('ALL')
    setSelectedBrand('ALL')
    setSelectedProgress('ALL')
    setSelectedCategory('ALL')
    setSelectedFollowerRange('ALL')
    setSelectedGmvRange('ALL')
    setContactFilter('ALL')
    setUsernameSearch('')
    setContactSearch('')
    setSearchQuery('')
    setNoFilter('ALL')
    setSortField('date')
    setSortDir('desc')
    setCurrentPage(1)
    setOpenColFilter(null)
    showToast('Semua filter berhasil direset!')
  }

  // Toggle individual column popover
  const toggleColumnFilter = (colKey, e) => {
    e.stopPropagation()
    setOpenColFilter((prev) => (prev === colKey ? null : colKey))
  }

  // Primary filtered records
  const filteredRecords = useMemo(() => {
    return rawRecords.filter((item) => {
      // Platform filter
      if (activePlatform !== 'semua') {
        if (item.platform?.toLowerCase() !== activePlatform.toLowerCase()) return false
      }
      // Date filter
      if (timeMode === 'date' && selectedDate !== 'ALL') {
        if (item.date !== selectedDate) return false
      } else if (selectedDate !== 'ALL') {
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
        if (selectedFollowerRange === 'has_followers' && count === 0) return false
        if (selectedFollowerRange === 'no_followers' && count > 0) return false
      }
      // GMV range filter
      if (selectedGmvRange !== 'ALL') {
        const gmvVal = parseGmv(item.gmv)
        if (selectedGmvRange === 'has_gmv' && gmvVal <= 0) return false
        if (selectedGmvRange === 'no_gmv' && gmvVal > 0) return false
        if (selectedGmvRange === 'under_10m' && (gmvVal <= 0 || gmvVal >= 10000000)) return false
        if (selectedGmvRange === '10m_to_50m' && (gmvVal < 10000000 || gmvVal > 50000000)) return false
        if (selectedGmvRange === 'above_50m' && gmvVal < 50000000) return false
        if (selectedGmvRange === 'above_100m' && gmvVal < 100000000) return false
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
        } else if (contactFilter === 'none') {
          if (c !== '-' && c.trim() !== '') return false
        }
      }
      // Contact live search
      if (contactSearch.trim()) {
        const q = contactSearch.toLowerCase().trim()
        if (!String(item.contact || '').toLowerCase().includes(q)) return false
      }
      // Username live search
      if (usernameSearch.trim()) {
        const q = usernameSearch.toLowerCase().trim()
        if (!String(item.username || '').toLowerCase().includes(q)) return false
      }
      // Search query (global)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchUser = item.username?.toLowerCase().includes(q)
        const matchContact = item.contact?.toLowerCase().includes(q)
        const matchCategory = item.category?.toLowerCase().includes(q)
        const matchBrand = item.brand?.toLowerCase().includes(q)
        if (!matchUser && !matchContact && !matchCategory && !matchBrand) return false
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
    selectedGmvRange,
    contactFilter,
    contactSearch,
    usernameSearch,
    searchQuery,
  ])

  // Dynamic KPI calculations based on filtered records
  const kpis = useMemo(() => {
    const total = filteredRecords.length
    const tt = filteredRecords.filter((r) => r.platform?.toLowerCase() === 'tiktok').length
    const sp = filteredRecords.filter((r) => r.platform?.toLowerCase() === 'shopee').length
    const brands = [...new Set(filteredRecords.map((r) => r.brand).filter(Boolean))]

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

  // Dynamic Daily Breakdown
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

  // Dynamic Progress Breakdown
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

  // Dynamic Brand Breakdown
  const dynamicBrandRows = useMemo(() => {
    const brands = [...new Set(filteredRecords.map((r) => r.brand).filter(Boolean))].sort()
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
        pct: ((recs.length / (filteredRecords.length || 1)) * 100).toFixed(1),
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

      const sa = String(va || '').toLowerCase()
      const sb = String(vb || '').toLowerCase()
      return sa.localeCompare(sb) * dir
    })
  }, [filteredRecords, sortField, sortDir])

  // Apply row limit if selected from Column No filter
  const limitedRecords = useMemo(() => {
    if (noFilter !== 'ALL') {
      const limit = parseInt(noFilter, 10)
      if (!isNaN(limit) && limit > 0) {
        return sortedRecords.slice(0, limit)
      }
    }
    return sortedRecords
  }, [sortedRecords, noFilter])

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
    selectedGmvRange,
    contactFilter,
    contactSearch,
    usernameSearch,
    searchQuery,
    sortField,
    sortDir,
    noFilter,
  ])

  // Pagination slice
  const totalPages = pageSize === -1 ? 1 : Math.ceil(limitedRecords.length / pageSize) || 1
  const displayedRecords = useMemo(() => {
    if (pageSize === -1) return limitedRecords
    const start = (currentPage - 1) * pageSize
    return limitedRecords.slice(start, start + pageSize)
  }, [limitedRecords, currentPage, pageSize])

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
    if (!limitedRecords.length) {
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
      ...limitedRecords.map((r, i) => [
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
                color: '#451A03',
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
                padding: '4px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
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
                padding: '3px 9px',
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

          {/* Filter 3: Progress */}
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
              <option value="has_followers">Ada Followers (&gt; 0)</option>
              <option value="no_followers">Kosong (-)</option>
            </select>
          </div>

          {/* Filter 6: Global Search Input */}
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
                  border: '1px solid #E2E8F0',
                  color: '#1C1917',
                  borderRadius: '8px',
                  margin: 0,
                  outline: 'none',
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
                  ✕
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
                color: '#991B1B',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
              title="Reset semua filter ke kondisi awal"
            >
              ✕ Reset Semua Filter
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
            {/* KPI Summary Cards Grid */}
            <div className="aff-kpi-grid">
              {/* Total Card */}
              <KpiCard
                label={timeMode === 'all' && selectedDate === 'ALL' ? 'Total Affiliator (All Time)' : `Total Affiliator (${selectedDate})`}
                value={kpis.total.toLocaleString('id-ID')}
                sub={`TikTok: ${kpis.tt}  |  Shopee: ${kpis.sp}`}
                color="#EAB308"
                raw={kpis.total}
                onCopy={showToast}
              />

              {/* Status Cards */}
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

            {/* Section 1: Daily Breakdown Log */}
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

              {/* Breakdown by Brand */}
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

            {/* Section 3: Log Lengkap Affiliator with Interactive Filters on ALL Columns */}
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
                    Menampilkan {limitedRecords.length} dari {rawRecords.length} affiliator
                  </span>
                </div>
              </div>

              {/* Dedicated Table Quick Toolbar */}
              <div className="aff-table-filter-bar">
                {/* Quick Status Chips */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#78716C', marginRight: '2px' }}>
                    Status Cepat:
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
                        onClick={() => setSelectedProgress(selectedProgress.toLowerCase() === st.toLowerCase() ? 'ALL' : st)}
                      >
                        <span>{st}</span>
                        <span className="aff-chip-count">{cnt}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Additional Quick Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <select
                    value={contactFilter}
                    onChange={(e) => setContactFilter(e.target.value)}
                    style={{
                      height: '32px',
                      fontSize: '12px',
                      padding: '2px 8px',
                      borderRadius: '8px',
                      border: '1px solid #FEF08A',
                      background: '#FFFDF5',
                      color: '#713F12',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    title="Filter cepat berdasarkan tipe kontak"
                  >
                    <option value="ALL">Semua Tipe Kontak</option>
                    <option value="phone">Ada No HP/WA</option>
                    <option value="email">Ada Email</option>
                    <option value="dm">Hanya DM/IG</option>
                    <option value="none">Belum Ada Kontak (-)</option>
                  </select>

                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      style={{
                        height: '32px',
                        fontSize: '12px',
                        padding: '0 10px',
                        borderRadius: '8px',
                        border: '1px solid #FECACA',
                        background: '#FEF2F2',
                        color: '#991B1B',
                        cursor: 'pointer',
                        fontWeight: 700,
                        transition: 'background 0.15s ease',
                      }}
                      title="Reset semua filter"
                    >
                      ✕ Reset Filter
                    </button>
                  )}
                </div>
              </div>

              {/* Active Filter Pills Bar (Shows active column filters with 1-click remove) */}
              {activeFilterList.length > 0 && (
                <div className="aff-active-filter-pills">
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#854D0E' }}>
                    Filter Aktif ({activeFilterList.length}):
                  </span>
                  {activeFilterList.map((f) => (
                    <span key={f.id} className="aff-active-filter-pill">
                      <span>{f.label}</span>
                      <button
                        type="button"
                        className="aff-active-filter-pill-remove"
                        onClick={f.clear}
                        title={`Hapus filter ${f.label}`}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#B91C1C',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      marginLeft: '6px',
                    }}
                  >
                    Hapus Semua
                  </button>
                </div>
              )}

              {/* Table with Interactive Column Filters on EVERY Column Header */}
              <div className="aff-table-scroll" style={{ maxHeight: '620px', overflowY: 'auto' }}>
                <table className="aff-lemon-table">
                  <thead>
                    <tr>
                      {/* 1. Kolom NO */}
                      <th
                        className="aff-th-cell aff-th-sortable"
                        style={{ width: '65px', textAlign: 'center' }}
                        onClick={() => handleSort('no')}
                        title="Klik untuk mengurutkan No"
                      >
                        <div className="aff-th-content" style={{ justifyContent: 'center' }}>
                          <span className="aff-th-label">
                            No
                            <span className={`aff-sort-icon ${sortField === 'no' ? 'is-active' : ''}`}>
                              {sortField === 'no' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                            </span>
                          </span>
                          <button
                            type="button"
                            className={`aff-col-filter-btn ${isColFiltered('no') ? 'is-active' : ''}`}
                            onClick={(e) => toggleColumnFilter('no', e)}
                            title="Filter tampilan baris No"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill={isColFiltered('no') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                            </svg>
                          </button>
                        </div>
                        {openColFilter === 'no' && (
                          <div className="aff-col-filter-popover" onClick={(e) => e.stopPropagation()}>
                            <div className="aff-col-popover-title">
                              <span>Filter Baris &amp; Urutan</span>
                              <button type="button" onClick={() => setOpenColFilter(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#78716C' }}>✕</button>
                            </div>
                            <div className="aff-col-popover-list">
                              {[
                                { key: 'ALL', label: 'Tampilkan Semua Baris' },
                                { key: '10', label: 'Hanya 10 Teratas' },
                                { key: '25', label: 'Hanya 25 Teratas' },
                                { key: '50', label: 'Hanya 50 Teratas' },
                                { key: '100', label: 'Hanya 100 Teratas' },
                              ].map((opt) => (
                                <button
                                  key={opt.key}
                                  type="button"
                                  className={`aff-col-popover-item ${noFilter === opt.key ? 'is-selected' : ''}`}
                                  onClick={() => setNoFilter(opt.key)}
                                >
                                  <span>{opt.label}</span>
                                </button>
                              ))}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                              <button
                                type="button"
                                onClick={() => { setSortField('no'); setSortDir('asc'); }}
                                style={{ flex: 1, padding: '4px', fontSize: '11px', background: '#FEFCE8', border: '1px solid #FEF08A', borderRadius: '4px', cursor: 'pointer', color: '#713F12', fontWeight: 600 }}
                              >
                                1 → N ▲
                              </button>
                              <button
                                type="button"
                                onClick={() => { setSortField('no'); setSortDir('desc'); }}
                                style={{ flex: 1, padding: '4px', fontSize: '11px', background: '#FEFCE8', border: '1px solid #FEF08A', borderRadius: '4px', cursor: 'pointer', color: '#713F12', fontWeight: 600 }}
                              >
                                N → 1 ▼
                              </button>
                            </div>
                            <div className="aff-col-popover-actions">
                              <button type="button" className="aff-col-popover-btn-clear" onClick={() => setNoFilter('ALL')}>Reset</button>
                              <button type="button" className="aff-col-popover-btn-close" onClick={() => setOpenColFilter(null)}>Tutup</button>
                            </div>
                          </div>
                        )}
                      </th>

                      {/* 2. Kolom TANGGAL */}
                      <th
                        className="aff-th-cell aff-th-sortable"
                        onClick={() => handleSort('date')}
                        title="Klik untuk mengurutkan berdasarkan Tanggal"
                      >
                        <div className="aff-th-content">
                          <span className="aff-th-label">
                            Tanggal
                            <span className={`aff-sort-icon ${sortField === 'date' ? 'is-active' : ''}`}>
                              {sortField === 'date' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                            </span>
                          </span>
                          <button
                            type="button"
                            className={`aff-col-filter-btn ${isColFiltered('date') ? 'is-active' : ''}`}
                            onClick={(e) => toggleColumnFilter('date', e)}
                            title="Filter kolom Tanggal"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill={isColFiltered('date') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                            </svg>
                          </button>
                        </div>
                        {openColFilter === 'date' && (
                          <div className="aff-col-filter-popover" onClick={(e) => e.stopPropagation()}>
                            <div className="aff-col-popover-title">
                              <span>Filter Tanggal</span>
                              <button type="button" onClick={() => setOpenColFilter(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#78716C' }}>✕</button>
                            </div>
                            {availableDates.length > 5 && (
                              <input
                                type="text"
                                className="aff-col-popover-search"
                                placeholder="Cari tanggal (YYYY-MM-DD)..."
                                value={popoverSearchDate}
                                onChange={(e) => setPopoverSearchDate(e.target.value)}
                              />
                            )}
                            <div className="aff-col-popover-list">
                              <button
                                type="button"
                                className={`aff-col-popover-item ${selectedDate === 'ALL' ? 'is-selected' : ''}`}
                                onClick={() => {
                                  setSelectedDate('ALL')
                                  setTimeMode('all')
                                }}
                              >
                                <span>Semua Tanggal</span>
                                <span className="aff-col-popover-item-count">{rawRecords.length}</span>
                              </button>
                              {availableDates
                                .filter((d) => d.toLowerCase().includes(popoverSearchDate.toLowerCase()))
                                .map((d) => {
                                  const count = rawRecords.filter((r) => r.date === d).length
                                  return (
                                    <button
                                      key={d}
                                      type="button"
                                      className={`aff-col-popover-item ${selectedDate === d ? 'is-selected' : ''}`}
                                      onClick={() => {
                                        setSelectedDate(d)
                                        setTimeMode('date')
                                      }}
                                    >
                                      <span>{d}</span>
                                      <span className="aff-col-popover-item-count">{count}</span>
                                    </button>
                                  )
                                })}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                              <button
                                type="button"
                                onClick={() => { setSortField('date'); setSortDir('desc'); }}
                                style={{ flex: 1, padding: '4px', fontSize: '11px', background: '#FEFCE8', border: '1px solid #FEF08A', borderRadius: '4px', cursor: 'pointer', color: '#713F12', fontWeight: 600 }}
                              >
                                Terbaru ▼
                              </button>
                              <button
                                type="button"
                                onClick={() => { setSortField('date'); setSortDir('asc'); }}
                                style={{ flex: 1, padding: '4px', fontSize: '11px', background: '#FEFCE8', border: '1px solid #FEF08A', borderRadius: '4px', cursor: 'pointer', color: '#713F12', fontWeight: 600 }}
                              >
                                Terlama ▲
                              </button>
                            </div>
                            <div className="aff-col-popover-actions">
                              <button type="button" className="aff-col-popover-btn-clear" onClick={() => { setSelectedDate('ALL'); setTimeMode('all'); }}>Reset</button>
                              <button type="button" className="aff-col-popover-btn-close" onClick={() => setOpenColFilter(null)}>Tutup</button>
                            </div>
                          </div>
                        )}
                      </th>

                      {/* 3. Kolom PLATFORM */}
                      <th
                        className="aff-th-cell aff-th-sortable"
                        style={{ textAlign: 'center' }}
                        onClick={() => handleSort('platform')}
                        title="Klik untuk mengurutkan berdasarkan Platform"
                      >
                        <div className="aff-th-content" style={{ justifyContent: 'center' }}>
                          <span className="aff-th-label">
                            Platform
                            <span className={`aff-sort-icon ${sortField === 'platform' ? 'is-active' : ''}`}>
                              {sortField === 'platform' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                            </span>
                          </span>
                          <button
                            type="button"
                            className={`aff-col-filter-btn ${isColFiltered('platform') ? 'is-active' : ''}`}
                            onClick={(e) => toggleColumnFilter('platform', e)}
                            title="Filter kolom Platform"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill={isColFiltered('platform') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                            </svg>
                          </button>
                        </div>
                        {openColFilter === 'platform' && (
                          <div className="aff-col-filter-popover" onClick={(e) => e.stopPropagation()}>
                            <div className="aff-col-popover-title">
                              <span>Filter Platform</span>
                              <button type="button" onClick={() => setOpenColFilter(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#78716C' }}>✕</button>
                            </div>
                            <div className="aff-col-popover-list">
                              <button
                                type="button"
                                className={`aff-col-popover-item ${activePlatform === 'semua' ? 'is-selected' : ''}`}
                                onClick={() => setActivePlatform('semua')}
                              >
                                <span>Semua Platform</span>
                                <span className="aff-col-popover-item-count">{rawRecords.length}</span>
                              </button>
                              <button
                                type="button"
                                className={`aff-col-popover-item ${activePlatform === 'shopee' ? 'is-selected' : ''}`}
                                onClick={() => setActivePlatform('shopee')}
                              >
                                <span className="badge-plat-shopee">Shopee</span>
                                <span className="aff-col-popover-item-count">
                                  {rawRecords.filter((r) => r.platform?.toLowerCase() === 'shopee').length}
                                </span>
                              </button>
                              <button
                                type="button"
                                className={`aff-col-popover-item ${activePlatform === 'tiktok' ? 'is-selected' : ''}`}
                                onClick={() => setActivePlatform('tiktok')}
                              >
                                <span className="badge-plat-tiktok">TikTok Shop</span>
                                <span className="aff-col-popover-item-count">
                                  {rawRecords.filter((r) => r.platform?.toLowerCase() === 'tiktok').length}
                                </span>
                              </button>
                            </div>
                            <div className="aff-col-popover-actions">
                              <button type="button" className="aff-col-popover-btn-clear" onClick={() => setActivePlatform('semua')}>Reset</button>
                              <button type="button" className="aff-col-popover-btn-close" onClick={() => setOpenColFilter(null)}>Tutup</button>
                            </div>
                          </div>
                        )}
                      </th>

                      {/* 4. Kolom USERNAME */}
                      <th
                        className="aff-th-cell aff-th-sortable"
                        onClick={() => handleSort('username')}
                        title="Klik untuk mengurutkan berdasarkan Username"
                      >
                        <div className="aff-th-content">
                          <span className="aff-th-label">
                            Username
                            <span className={`aff-sort-icon ${sortField === 'username' ? 'is-active' : ''}`}>
                              {sortField === 'username' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                            </span>
                          </span>
                          <button
                            type="button"
                            className={`aff-col-filter-btn ${isColFiltered('username') ? 'is-active' : ''}`}
                            onClick={(e) => toggleColumnFilter('username', e)}
                            title="Filter kolom Username"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill={isColFiltered('username') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                            </svg>
                          </button>
                        </div>
                        {openColFilter === 'username' && (
                          <div className="aff-col-filter-popover" onClick={(e) => e.stopPropagation()}>
                            <div className="aff-col-popover-title">
                              <span>Cari Username</span>
                              <button type="button" onClick={() => setOpenColFilter(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#78716C' }}>✕</button>
                            </div>
                            <input
                              type="text"
                              className="aff-col-popover-search"
                              placeholder="Ketik username affiliator..."
                              value={usernameSearch}
                              onChange={(e) => setUsernameSearch(e.target.value)}
                              autoFocus
                            />
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                              <button
                                type="button"
                                onClick={() => { setSortField('username'); setSortDir('asc'); }}
                                style={{ flex: 1, padding: '4px', fontSize: '11px', background: '#FEFCE8', border: '1px solid #FEF08A', borderRadius: '4px', cursor: 'pointer', color: '#713F12', fontWeight: 600 }}
                              >
                                Urut A → Z
                              </button>
                              <button
                                type="button"
                                onClick={() => { setSortField('username'); setSortDir('desc'); }}
                                style={{ flex: 1, padding: '4px', fontSize: '11px', background: '#FEFCE8', border: '1px solid #FEF08A', borderRadius: '4px', cursor: 'pointer', color: '#713F12', fontWeight: 600 }}
                              >
                                Urut Z → A
                              </button>
                            </div>
                            <div className="aff-col-popover-actions">
                              <button type="button" className="aff-col-popover-btn-clear" onClick={() => setUsernameSearch('')}>Reset</button>
                              <button type="button" className="aff-col-popover-btn-close" onClick={() => setOpenColFilter(null)}>Tutup</button>
                            </div>
                          </div>
                        )}
                      </th>

                      {/* 5. Kolom BRAND */}
                      <th
                        className="aff-th-cell aff-th-sortable"
                        style={{ textAlign: 'center' }}
                        onClick={() => handleSort('brand')}
                        title="Klik untuk mengurutkan berdasarkan Brand"
                      >
                        <div className="aff-th-content" style={{ justifyContent: 'center' }}>
                          <span className="aff-th-label">
                            Brand
                            <span className={`aff-sort-icon ${sortField === 'brand' ? 'is-active' : ''}`}>
                              {sortField === 'brand' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                            </span>
                          </span>
                          <button
                            type="button"
                            className={`aff-col-filter-btn ${isColFiltered('brand') ? 'is-active' : ''}`}
                            onClick={(e) => toggleColumnFilter('brand', e)}
                            title="Filter kolom Brand"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill={isColFiltered('brand') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                            </svg>
                          </button>
                        </div>
                        {openColFilter === 'brand' && (
                          <div className="aff-col-filter-popover" onClick={(e) => e.stopPropagation()}>
                            <div className="aff-col-popover-title">
                              <span>Filter Brand</span>
                              <button type="button" onClick={() => setOpenColFilter(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#78716C' }}>✕</button>
                            </div>
                            {availableBrands.length > 4 && (
                              <input
                                type="text"
                                className="aff-col-popover-search"
                                placeholder="Cari brand..."
                                value={popoverSearchBrand}
                                onChange={(e) => setPopoverSearchBrand(e.target.value)}
                              />
                            )}
                            <div className="aff-col-popover-list">
                              <button
                                type="button"
                                className={`aff-col-popover-item ${selectedBrand === 'ALL' ? 'is-selected' : ''}`}
                                onClick={() => setSelectedBrand('ALL')}
                              >
                                <span>Semua Brand</span>
                                <span className="aff-col-popover-item-count">{rawRecords.length}</span>
                              </button>
                              {availableBrands
                                .filter((b) => b.toLowerCase().includes(popoverSearchBrand.toLowerCase()))
                                .map((b) => {
                                  const count = rawRecords.filter((r) => r.brand === b).length
                                  return (
                                    <button
                                      key={b}
                                      type="button"
                                      className={`aff-col-popover-item ${selectedBrand === b ? 'is-selected' : ''}`}
                                      onClick={() => setSelectedBrand(b)}
                                    >
                                      <span className="badge-brand-tag">{b}</span>
                                      <span className="aff-col-popover-item-count">{count}</span>
                                    </button>
                                  )
                                })}
                            </div>
                            <div className="aff-col-popover-actions">
                              <button type="button" className="aff-col-popover-btn-clear" onClick={() => setSelectedBrand('ALL')}>Reset</button>
                              <button type="button" className="aff-col-popover-btn-close" onClick={() => setOpenColFilter(null)}>Tutup</button>
                            </div>
                          </div>
                        )}
                      </th>

                      {/* 6. Kolom PROGRESS */}
                      <th
                        className="aff-th-cell aff-th-sortable"
                        style={{ textAlign: 'center' }}
                        onClick={() => handleSort('progress')}
                        title="Klik untuk mengurutkan berdasarkan Status Progress"
                      >
                        <div className="aff-th-content" style={{ justifyContent: 'center' }}>
                          <span className="aff-th-label">
                            Progress
                            <span className={`aff-sort-icon ${sortField === 'progress' ? 'is-active' : ''}`}>
                              {sortField === 'progress' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                            </span>
                          </span>
                          <button
                            type="button"
                            className={`aff-col-filter-btn ${isColFiltered('progress') ? 'is-active' : ''}`}
                            onClick={(e) => toggleColumnFilter('progress', e)}
                            title="Filter kolom Status Progress"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill={isColFiltered('progress') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                            </svg>
                          </button>
                        </div>
                        {openColFilter === 'progress' && (
                          <div className="aff-col-filter-popover" onClick={(e) => e.stopPropagation()}>
                            <div className="aff-col-popover-title">
                              <span>Filter Status Progress</span>
                              <button type="button" onClick={() => setOpenColFilter(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#78716C' }}>✕</button>
                            </div>
                            <div className="aff-col-popover-list">
                              <button
                                type="button"
                                className={`aff-col-popover-item ${selectedProgress === 'ALL' ? 'is-selected' : ''}`}
                                onClick={() => setSelectedProgress('ALL')}
                              >
                                <span>Semua Status</span>
                                <span className="aff-col-popover-item-count">{rawRecords.length}</span>
                              </button>
                              {allAvailableStatuses.map((st) => {
                                const meta = getStatusMeta(st)
                                const count = rawRecords.filter((r) => r.progress?.toLowerCase() === st.toLowerCase()).length
                                return (
                                  <button
                                    key={st}
                                    type="button"
                                    className={`aff-col-popover-item ${selectedProgress.toLowerCase() === st.toLowerCase() ? 'is-selected' : ''}`}
                                    onClick={() => setSelectedProgress(st)}
                                  >
                                    <span className={meta.badgeClass}>{st}</span>
                                    <span className="aff-col-popover-item-count">{count}</span>
                                  </button>
                                )
                              })}
                            </div>
                            <div className="aff-col-popover-actions">
                              <button type="button" className="aff-col-popover-btn-clear" onClick={() => setSelectedProgress('ALL')}>Reset</button>
                              <button type="button" className="aff-col-popover-btn-close" onClick={() => setOpenColFilter(null)}>Tutup</button>
                            </div>
                          </div>
                        )}
                      </th>

                      {/* 7. Kolom FOLLOWERS */}
                      <th
                        className="aff-th-cell aff-th-sortable"
                        onClick={() => handleSort('followers')}
                        title="Klik untuk mengurutkan berdasarkan Jumlah Followers"
                      >
                        <div className="aff-th-content">
                          <span className="aff-th-label">
                            Followers
                            <span className={`aff-sort-icon ${sortField === 'followers' ? 'is-active' : ''}`}>
                              {sortField === 'followers' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                            </span>
                          </span>
                          <button
                            type="button"
                            className={`aff-col-filter-btn ${isColFiltered('followers') ? 'is-active' : ''}`}
                            onClick={(e) => toggleColumnFilter('followers', e)}
                            title="Filter kolom Followers"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill={isColFiltered('followers') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                            </svg>
                          </button>
                        </div>
                        {openColFilter === 'followers' && (
                          <div className="aff-col-filter-popover" onClick={(e) => e.stopPropagation()}>
                            <div className="aff-col-popover-title">
                              <span>Filter Tier Followers</span>
                              <button type="button" onClick={() => setOpenColFilter(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#78716C' }}>✕</button>
                            </div>
                            <div className="aff-col-popover-list">
                              {[
                                { key: 'ALL', label: 'Semua Followers' },
                                { key: 'nano', label: 'Nano (< 5K)' },
                                { key: 'micro', label: 'Micro (5K - 20K)' },
                                { key: 'macro', label: 'Macro (> 20K)' },
                                { key: 'has_followers', label: 'Ada Followers (> 0)' },
                                { key: 'no_followers', label: 'Kosong / Strip (-)' },
                              ].map((opt) => (
                                <button
                                  key={opt.key}
                                  type="button"
                                  className={`aff-col-popover-item ${selectedFollowerRange === opt.key ? 'is-selected' : ''}`}
                                  onClick={() => setSelectedFollowerRange(opt.key)}
                                >
                                  <span>{opt.label}</span>
                                </button>
                              ))}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                              <button
                                type="button"
                                onClick={() => { setSortField('followers'); setSortDir('desc'); }}
                                style={{ flex: 1, padding: '4px', fontSize: '11px', background: '#FEFCE8', border: '1px solid #FEF08A', borderRadius: '4px', cursor: 'pointer', color: '#713F12', fontWeight: 600 }}
                              >
                                Terbanyak ▼
                              </button>
                              <button
                                type="button"
                                onClick={() => { setSortField('followers'); setSortDir('asc'); }}
                                style={{ flex: 1, padding: '4px', fontSize: '11px', background: '#FEFCE8', border: '1px solid #FEF08A', borderRadius: '4px', cursor: 'pointer', color: '#713F12', fontWeight: 600 }}
                              >
                                Tersedikit ▲
                              </button>
                            </div>
                            <div className="aff-col-popover-actions">
                              <button type="button" className="aff-col-popover-btn-clear" onClick={() => setSelectedFollowerRange('ALL')}>Reset</button>
                              <button type="button" className="aff-col-popover-btn-close" onClick={() => setOpenColFilter(null)}>Tutup</button>
                            </div>
                          </div>
                        )}
                      </th>

                      {/* 8. Kolom GMV */}
                      <th
                        className="aff-th-cell aff-th-sortable"
                        onClick={() => handleSort('gmv')}
                        title="Klik untuk mengurutkan berdasarkan GMV"
                      >
                        <div className="aff-th-content">
                          <span className="aff-th-label">
                            GMV
                            <span className={`aff-sort-icon ${sortField === 'gmv' ? 'is-active' : ''}`}>
                              {sortField === 'gmv' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                            </span>
                          </span>
                          <button
                            type="button"
                            className={`aff-col-filter-btn ${isColFiltered('gmv') ? 'is-active' : ''}`}
                            onClick={(e) => toggleColumnFilter('gmv', e)}
                            title="Filter kolom GMV"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill={isColFiltered('gmv') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                            </svg>
                          </button>
                        </div>
                        {openColFilter === 'gmv' && (
                          <div className="aff-col-filter-popover" onClick={(e) => e.stopPropagation()}>
                            <div className="aff-col-popover-title">
                              <span>Filter Rentang GMV</span>
                              <button type="button" onClick={() => setOpenColFilter(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#78716C' }}>✕</button>
                            </div>
                            <div className="aff-col-popover-list">
                              {[
                                { key: 'ALL', label: 'Semua Nilai GMV' },
                                { key: 'has_gmv', label: 'Ada Nilai GMV (> 0)' },
                                { key: 'no_gmv', label: 'Belum Ada GMV (0 / -)' },
                                { key: 'under_10m', label: '< 10 Juta' },
                                { key: '10m_to_50m', label: '10 Juta - 50 Juta' },
                                { key: 'above_50m', label: '> 50 Juta' },
                                { key: 'above_100m', label: '> 100 Juta' },
                              ].map((opt) => (
                                <button
                                  key={opt.key}
                                  type="button"
                                  className={`aff-col-popover-item ${selectedGmvRange === opt.key ? 'is-selected' : ''}`}
                                  onClick={() => setSelectedGmvRange(opt.key)}
                                >
                                  <span>{opt.label}</span>
                                </button>
                              ))}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                              <button
                                type="button"
                                onClick={() => { setSortField('gmv'); setSortDir('desc'); }}
                                style={{ flex: 1, padding: '4px', fontSize: '11px', background: '#FEFCE8', border: '1px solid #FEF08A', borderRadius: '4px', cursor: 'pointer', color: '#713F12', fontWeight: 600 }}
                              >
                                Tertinggi ▼
                              </button>
                              <button
                                type="button"
                                onClick={() => { setSortField('gmv'); setSortDir('asc'); }}
                                style={{ flex: 1, padding: '4px', fontSize: '11px', background: '#FEFCE8', border: '1px solid #FEF08A', borderRadius: '4px', cursor: 'pointer', color: '#713F12', fontWeight: 600 }}
                              >
                                Terendah ▲
                              </button>
                            </div>
                            <div className="aff-col-popover-actions">
                              <button type="button" className="aff-col-popover-btn-clear" onClick={() => setSelectedGmvRange('ALL')}>Reset</button>
                              <button type="button" className="aff-col-popover-btn-close" onClick={() => setOpenColFilter(null)}>Tutup</button>
                            </div>
                          </div>
                        )}
                      </th>

                      {/* 9. Kolom KATEGORI */}
                      <th
                        className="aff-th-cell aff-th-sortable"
                        onClick={() => handleSort('category')}
                        title="Klik untuk mengurutkan berdasarkan Kategori"
                      >
                        <div className="aff-th-content">
                          <span className="aff-th-label">
                            Kategori
                            <span className={`aff-sort-icon ${sortField === 'category' ? 'is-active' : ''}`}>
                              {sortField === 'category' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                            </span>
                          </span>
                          <button
                            type="button"
                            className={`aff-col-filter-btn ${isColFiltered('category') ? 'is-active' : ''}`}
                            onClick={(e) => toggleColumnFilter('category', e)}
                            title="Filter kolom Kategori"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill={isColFiltered('category') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                            </svg>
                          </button>
                        </div>
                        {openColFilter === 'category' && (
                          <div className="aff-col-filter-popover popover-align-right" onClick={(e) => e.stopPropagation()}>
                            <div className="aff-col-popover-title">
                              <span>Filter Kategori</span>
                              <button type="button" onClick={() => setOpenColFilter(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#78716C' }}>✕</button>
                            </div>
                            {availableCategories.length > 4 && (
                              <input
                                type="text"
                                className="aff-col-popover-search"
                                placeholder="Cari kategori..."
                                value={popoverSearchCat}
                                onChange={(e) => setPopoverSearchCat(e.target.value)}
                              />
                            )}
                            <div className="aff-col-popover-list">
                              <button
                                type="button"
                                className={`aff-col-popover-item ${selectedCategory === 'ALL' ? 'is-selected' : ''}`}
                                onClick={() => setSelectedCategory('ALL')}
                              >
                                <span>Semua Kategori</span>
                                <span className="aff-col-popover-item-count">{rawRecords.length}</span>
                              </button>
                              {availableCategories
                                .filter((c) => c.toLowerCase().includes(popoverSearchCat.toLowerCase()))
                                .map((c) => {
                                  const count = rawRecords.filter((r) => r.category === c).length
                                  return (
                                    <button
                                      key={c}
                                      type="button"
                                      className={`aff-col-popover-item ${selectedCategory === c ? 'is-selected' : ''}`}
                                      onClick={() => setSelectedCategory(c)}
                                    >
                                      <span>{c}</span>
                                      <span className="aff-col-popover-item-count">{count}</span>
                                    </button>
                                  )
                                })}
                            </div>
                            <div className="aff-col-popover-actions">
                              <button type="button" className="aff-col-popover-btn-clear" onClick={() => setSelectedCategory('ALL')}>Reset</button>
                              <button type="button" className="aff-col-popover-btn-close" onClick={() => setOpenColFilter(null)}>Tutup</button>
                            </div>
                          </div>
                        )}
                      </th>

                      {/* 10. Kolom KONTAK */}
                      <th
                        className="aff-th-cell aff-th-sortable"
                        onClick={() => handleSort('contact')}
                        title="Klik untuk mengurutkan berdasarkan Kontak"
                      >
                        <div className="aff-th-content">
                          <span className="aff-th-label">
                            Kontak
                            <span className={`aff-sort-icon ${sortField === 'contact' ? 'is-active' : ''}`}>
                              {sortField === 'contact' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                            </span>
                          </span>
                          <button
                            type="button"
                            className={`aff-col-filter-btn ${isColFiltered('contact') ? 'is-active' : ''}`}
                            onClick={(e) => toggleColumnFilter('contact', e)}
                            title="Filter kolom Kontak"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill={isColFiltered('contact') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                            </svg>
                          </button>
                        </div>
                        {openColFilter === 'contact' && (
                          <div className="aff-col-filter-popover popover-align-right" onClick={(e) => e.stopPropagation()}>
                            <div className="aff-col-popover-title">
                              <span>Filter Kontak</span>
                              <button type="button" onClick={() => setOpenColFilter(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#78716C' }}>✕</button>
                            </div>
                            <input
                              type="text"
                              className="aff-col-popover-search"
                              placeholder="Cari no telp / email / DM..."
                              value={contactSearch}
                              onChange={(e) => setContactSearch(e.target.value)}
                            />
                            <div className="aff-col-popover-list">
                              {[
                                { key: 'ALL', label: 'Semua Tipe Kontak' },
                                { key: 'phone', label: 'Ada No. WhatsApp / HP' },
                                { key: 'email', label: 'Ada Email (@)' },
                                { key: 'dm', label: 'Hanya DM / Instagram' },
                                { key: 'none', label: 'Belum Ada Kontak (-)' },
                              ].map((opt) => (
                                <button
                                  key={opt.key}
                                  type="button"
                                  className={`aff-col-popover-item ${contactFilter === opt.key ? 'is-selected' : ''}`}
                                  onClick={() => setContactFilter(opt.key)}
                                >
                                  <span>{opt.label}</span>
                                </button>
                              ))}
                            </div>
                            <div className="aff-col-popover-actions">
                              <button type="button" className="aff-col-popover-btn-clear" onClick={() => { setContactFilter('ALL'); setContactSearch(''); }}>Reset</button>
                              <button type="button" className="aff-col-popover-btn-close" onClick={() => setOpenColFilter(null)}>Tutup</button>
                            </div>
                          </div>
                        )}
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
                <div style={{ color: '#713F12', fontSize: '12.5px' }}>
                  Menampilkan{' '}
                  <strong>
                    {limitedRecords.length === 0 ? 0 : pageSize === -1 ? 1 : (currentPage - 1) * pageSize + 1}
                  </strong>{' '}
                  -{' '}
                  <strong>
                    {pageSize === -1 ? limitedRecords.length : Math.min(currentPage * pageSize, limitedRecords.length)}
                  </strong>{' '}
                  dari <strong>{limitedRecords.length}</strong> affiliator
                  {rawRecords.length !== limitedRecords.length && (
                    <span style={{ color: '#854D0E', marginLeft: '4px' }}>
                      (disaring dari {rawRecords.length} total)
                    </span>
                  )}
                  {sortField && (
                    <span style={{ marginLeft: '8px', color: '#B45309', fontWeight: 600 }}>
                      · Urut: {sortField} ({sortDir.toUpperCase()})
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Baris per halaman */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#713F12' }}>
                    <span>Baris:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      style={{
                        padding: '3px 6px',
                        borderRadius: '6px',
                        border: '1px solid #FEF08A',
                        background: '#FFFFFF',
                        fontSize: '12px',
                        cursor: 'pointer',
                        color: '#713F12',
                        fontWeight: 600,
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
                      <span style={{ padding: '0 6px', fontWeight: 700, fontSize: '12px', color: '#713F12' }}>
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

        {/* Modal: Panduan Deteksi Dropdown Otomatis Google Sheets (Light Mode Lemon) */}
        {showGuideModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundColor: 'rgba(113, 63, 18, 0.35)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
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
                borderRadius: '16px',
                maxWidth: '620px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 20px 45px -5px rgba(202, 138, 4, 0.25), 0 8px 16px rgba(0,0,0,0.06)',
                border: '1.5px solid #FEF08A',
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
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#713F12' }}>
                    Deteksi Opsi Dropdown Otomatis
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  style={{
                    border: '1px solid #FEF08A',
                    background: '#FEF9C3',
                    borderRadius: '50%',
                    width: '30px',
                    height: '30px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#854D0E',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                  title="Tutup dialog"
                >
                  ✕
                </button>
              </div>

              <div style={{ fontSize: '13.5px', color: '#451A03', lineHeight: 1.6 }}>
                <p>
                  Dashboard ini telah dilengkapi dengan <strong>sistem deteksi otomatis 2 arah</strong> sehingga kapan
                  pun Anda menambah opsi baru di Google Sheet (misal: <em>Dealing</em>, <em>Respon</em>,{' '}
                  <em>Sample Sent</em>, dll), opsi tersebut akan langsung otomatis muncul sebagai <strong>KPI Card</strong>
                  , <strong>kolom rincian harian</strong>, dan <strong>kolom per brand</strong>:
                </p>

                <div
                  style={{
                    backgroundColor: '#FEFCE8',
                    border: '1.5px solid #FEF08A',
                    borderRadius: '10px',
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
                    border: '1.5px solid #BBF7D0',
                    borderRadius: '10px',
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
                      background: '#FEFCE8',
                      color: '#713F12',
                      border: '1.5px solid #FEF08A',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      overflowX: 'auto',
                      fontFamily: 'monospace',
                      lineHeight: 1.5,
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

                <p style={{ fontSize: '12px', color: '#854D0E', margin: '14px 0 0' }}>
                  💡 <em>Status default standar: Listing, Approaching, Respon, dan Dealing sudah aktif secara permanen.</em>
                </p>
              </div>

              <div style={{ marginTop: '1.25rem', textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    background: '#EAB308',
                    color: '#451A03',
                    border: '1px solid #CA8A04',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '13px',
                    boxShadow: '0 2px 6px rgba(234, 179, 8, 0.3)',
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
