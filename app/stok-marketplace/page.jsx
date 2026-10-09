'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import Link from 'next/link'
import AuthGate from '@/components/AuthGate'
import KpiCard from '@/components/affiliate/KpiCard'
import LemonIcon from '@/components/LemonIcon'

export default function StokMarketplacePage() {
  // ─── Data State ─────────────────────────────────────────────────────────────
  const [customers, setCustomers] = useState([])
  const [activeCustomerId, setActiveCustomerId] = useState(null)
  const [customerDataMap, setCustomerDataMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // ─── Filters & Search ───────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL') // 'ALL' | 'available' | 'low' | 'empty'
  const [colSearchKodeProduk, setColSearchKodeProduk] = useState('')
  const [colSearchKodeVariasi, setColSearchKodeVariasi] = useState('')
  const [colSearchNama, setColSearchNama] = useState('')
  const [colSearchSku, setColSearchSku] = useState('')
  const [colStokRange, setColStokRange] = useState('ALL') // 'ALL' | '0' | '1-5' | '6-20' | '>20'
  const [previewModalImage, setPreviewModalImage] = useState(null)

  // Popover state for column filters
  const [openColFilter, setOpenColFilter] = useState(null) // null | 'kodeProduk' | 'kodeVariasi' | 'nama' | 'sku' | 'stok' | 'status'

  // ─── Sorting & Pagination ──────────────────────────────────────────────────
  const [sortField, setSortField] = useState('stok') // default sort by stok
  const [sortDir, setSortDir] = useState('desc') // 'asc' | 'desc'
  const [pageSize, setPageSize] = useState(25) // 10 | 25 | 50 | 100 | -1 (all)
  const [currentPage, setCurrentPage] = useState(1)

  // ─── Toast Feedback ────────────────────────────────────────────────────────
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
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // 1. Fetch index (list of customers)
  const fetchIndex = useCallback(async (preferredId = null) => {
    try {
      const res = await fetch('/api/stok-marketplace/index')
      if (res.ok) {
        const body = await res.json()
        const custList = body.customers || []
        setCustomers(custList)

        if (custList.length > 0) {
          // If preferredId exists in list, use it; otherwise use first customer
          const found = preferredId && custList.some((c) => c.id === preferredId)
          const targetId = found ? preferredId : custList[0].id
          setActiveCustomerId((prev) => (prev && custList.some((c) => c.id === prev) ? prev : targetId))
        } else {
          setActiveCustomerId(null)
        }
      }
    } catch (err) {
      console.error('Error fetching marketplace stock index:', err)
      showToast('Gagal memuat daftar toko marketplace.')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    // Check URL query param for default customer
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const qCust = params.get('customer')
      fetchIndex(qCust)
    } else {
      fetchIndex()
    }
  }, [fetchIndex])

  // 2. Fetch customer detail data when activeCustomerId changes
  const fetchCustomerData = useCallback(async (customerId, forceRefresh = false) => {
    if (!customerId) return
    if (!forceRefresh && customerDataMap[customerId]) return // already cached

    setDataLoading(true)
    try {
      const res = await fetch(`/api/stok-marketplace/data?customer=${encodeURIComponent(customerId)}`)
      if (res.ok) {
        const body = await res.json()
        if (body.data) {
          setCustomerDataMap((prev) => ({
            ...prev,
            [customerId]: body.data,
          }))
        }
      }
    } catch (err) {
      console.error('Error fetching customer stock data:', err)
      showToast('Gagal memuat detail data stok toko.')
    } finally {
      setDataLoading(false)
    }
  }, [customerDataMap, showToast])

  useEffect(() => {
    if (activeCustomerId) {
      fetchCustomerData(activeCustomerId)
    }
  }, [activeCustomerId, fetchCustomerData])

  // Refresh handler
  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchIndex(activeCustomerId)
      if (activeCustomerId) {
        await fetchCustomerData(activeCustomerId, true)
      }
      showToast('Data stok marketplace berhasil disinkronkan!')
    } finally {
      setRefreshing(false)
    }
  }

  // Active customer object & raw items
  const activeCustomer = useMemo(() => {
    return customers.find((c) => c.id === activeCustomerId) || null
  }, [customers, activeCustomerId])

  const activeData = useMemo(() => {
    return activeCustomerId ? customerDataMap[activeCustomerId] : null
  }, [customerDataMap, activeCustomerId])

  const rawItems = useMemo(() => {
    return activeData?.items || []
  }, [activeData])

  // Summary recap stats (from activeData or activeCustomer summary)
  const recap = useMemo(() => {
    const s = activeData?.summary || activeCustomer?.summary || {}
    return {
      totalItems: s.totalItems || 0,
      totalStock: s.totalStock || 0,
      totalNilaiStok: s.totalNilaiStok || 0,
      availableStockCount: s.availableStockCount || 0,
      availableStockPct: s.availableStockPct || 0,
      emptyStockCount: s.emptyStockCount || 0,
      emptyStockPct: s.emptyStockPct || 0,
      lowStockCount: s.lowStockCount || 0,
      lowStockPct: s.lowStockPct || 0,
      avgStock: s.avgStock || 0,
    }
  }, [activeData, activeCustomer])

  // Toggle individual column popover
  const toggleColumnFilter = (colKey, e) => {
    e.stopPropagation()
    setOpenColFilter((prev) => (prev === colKey ? null : colKey))
  }

  // Helper: check if a specific column is currently filtered
  const isColFiltered = (colKey) => {
    switch (colKey) {
      case 'kodeProduk':
        return colSearchKodeProduk.trim() !== ''
      case 'kodeVariasi':
        return colSearchKodeVariasi.trim() !== ''
      case 'nama':
        return colSearchNama.trim() !== ''
      case 'sku':
        return colSearchSku.trim() !== ''
      case 'stok':
        return colStokRange !== 'ALL'
      case 'status':
        return statusFilter !== 'ALL'
      default:
        return false
    }
  }

  // Active filter chip list for UI bar
  const activeFilterList = useMemo(() => {
    const list = []
    if (searchQuery.trim()) {
      list.push({
        id: 'search',
        label: `Cari: "${searchQuery}"`,
        clear: () => setSearchQuery(''),
      })
    }
    if (statusFilter !== 'ALL') {
      const labels = {
        available: 'Status: Stok Tersedia (> 5)',
        low: 'Status: Stok Menipis (1-5)',
        empty: 'Status: Stok Kosong (0)',
      }
      list.push({
        id: 'status',
        label: labels[statusFilter] || `Status: ${statusFilter}`,
        clear: () => setStatusFilter('ALL'),
      })
    }
    if (colSearchKodeProduk.trim()) {
      list.push({
        id: 'col_kode_produk',
        label: `Kode Produk: "${colSearchKodeProduk}"`,
        clear: () => setColSearchKodeProduk(''),
      })
    }
    if (colSearchKodeVariasi.trim()) {
      list.push({
        id: 'col_kode_variasi',
        label: `Kode Variasi: "${colSearchKodeVariasi}"`,
        clear: () => setColSearchKodeVariasi(''),
      })
    }
    if (colSearchNama.trim()) {
      list.push({
        id: 'col_nama',
        label: `Filter Nama: "${colSearchNama}"`,
        clear: () => setColSearchNama(''),
      })
    }
    if (colSearchSku.trim()) {
      list.push({
        id: 'col_sku',
        label: `Filter SKU: "${colSearchSku}"`,
        clear: () => setColSearchSku(''),
      })
    }
    if (colStokRange !== 'ALL') {
      const rangeLabels = {
        '0': 'Stok: 0 pcs',
        '1-5': 'Stok: 1 - 5 pcs',
        '6-20': 'Stok: 6 - 20 pcs',
        '>20': 'Stok: > 20 pcs',
      }
      list.push({
        id: 'col_stok',
        label: rangeLabels[colStokRange] || `Stok: ${colStokRange}`,
        clear: () => setColStokRange('ALL'),
      })
    }
    return list
  }, [searchQuery, statusFilter, colSearchKodeProduk, colSearchKodeVariasi, colSearchNama, colSearchSku, colStokRange])

  const resetAllFilters = () => {
    setSearchQuery('')
    setStatusFilter('ALL')
    setColSearchKodeProduk('')
    setColSearchKodeVariasi('')
    setColSearchNama('')
    setColSearchSku('')
    setColStokRange('ALL')
    setSortField('stok')
    setSortDir('desc')
    setCurrentPage(1)
    setOpenColFilter(null)
    showToast('Semua filter berhasil direset!')
  }

  // Filter records
  const filteredItems = useMemo(() => {
    return rawItems.filter((item) => {
      // 1. Global Search (matches Nama, SKU, Kode Produk, Kode Variasi)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchNama = (item.namaProduk || '').toLowerCase().includes(q)
        const matchSku = (item.sku || '').toLowerCase().includes(q)
        const matchKodeProduk = (item.kodeProduk || '').toLowerCase().includes(q)
        const matchKodeVariasi = (item.kodeVariasi || '').toLowerCase().includes(q)
        if (!matchNama && !matchSku && !matchKodeProduk && !matchKodeVariasi) return false
      }

      // 2. Status Filter
      if (statusFilter === 'available' && item.stok <= 5) return false
      if (statusFilter === 'low' && (item.stok < 1 || item.stok > 5)) return false
      if (statusFilter === 'empty' && item.stok !== 0) return false

      // 3. Column Kode Produk Search
      if (colSearchKodeProduk.trim()) {
        const q = colSearchKodeProduk.toLowerCase()
        if (!(item.kodeProduk || '').toLowerCase().includes(q)) return false
      }

      // 4. Column Kode Variasi Search
      if (colSearchKodeVariasi.trim()) {
        const q = colSearchKodeVariasi.toLowerCase()
        if (!(item.kodeVariasi || '').toLowerCase().includes(q)) return false
      }

      // 5. Column Nama Search
      if (colSearchNama.trim()) {
        const q = colSearchNama.toLowerCase()
        if (!(item.namaProduk || '').toLowerCase().includes(q)) return false
      }

      // 6. Column SKU Search
      if (colSearchSku.trim()) {
        const q = colSearchSku.toLowerCase()
        if (!(item.sku || '').toLowerCase().includes(q)) return false
      }

      // 7. Column Stok Range
      if (colStokRange === '0' && item.stok !== 0) return false
      if (colStokRange === '1-5' && (item.stok < 1 || item.stok > 5)) return false
      if (colStokRange === '6-20' && (item.stok < 6 || item.stok > 20)) return false
      if (colStokRange === '>20' && item.stok <= 20) return false

      return true
    })
  }, [rawItems, searchQuery, statusFilter, colSearchKodeProduk, colSearchKodeVariasi, colSearchNama, colSearchSku, colStokRange])

  // Sort records
  const sortedItems = useMemo(() => {
    if (!sortField) return filteredItems
    const dir = sortDir === 'asc' ? 1 : -1

    return [...filteredItems].sort((a, b) => {
      if (sortField === 'kodeProduk') {
        const sa = String(a.kodeProduk || '').toLowerCase()
        const sb = String(b.kodeProduk || '').toLowerCase()
        return sa.localeCompare(sb) * dir
      }
      if (sortField === 'kodeVariasi') {
        const sa = String(a.kodeVariasi || '').toLowerCase()
        const sb = String(b.kodeVariasi || '').toLowerCase()
        return sa.localeCompare(sb) * dir
      }
      if (sortField === 'stok') {
        const na = a.stok ?? 0
        const nb = b.stok ?? 0
        return (na - nb) * dir
      }
      if (sortField === 'harga') {
        const ha = a.harga ?? 0
        const hb = b.harga ?? 0
        return (ha - hb) * dir
      }
      if (sortField === 'namaProduk') {
        const sa = String(a.namaProduk || '').toLowerCase()
        const sb = String(b.namaProduk || '').toLowerCase()
        return sa.localeCompare(sb) * dir
      }
      if (sortField === 'sku') {
        const sa = String(a.sku || '').toLowerCase()
        const sb = String(b.sku || '').toLowerCase()
        return sa.localeCompare(sb) * dir
      }
      if (sortField === 'status') {
        // status weight: empty (0) -> low (1) -> available (2)
        const getWeight = (stok) => (stok === 0 ? 0 : stok <= 5 ? 1 : 2)
        return (getWeight(a.stok) - getWeight(b.stok)) * dir
      }
      return 0
    })
  }, [filteredItems, sortField, sortDir])

  // Reset page when any filter or sort changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter, colSearchKodeProduk, colSearchKodeVariasi, colSearchNama, colSearchSku, colStokRange, sortField, sortDir, activeCustomerId])

  // Pagination slice
  const totalPages = pageSize === -1 ? 1 : Math.ceil(sortedItems.length / pageSize) || 1
  const displayedItems = useMemo(() => {
    if (pageSize === -1) return sortedItems
    const start = (currentPage - 1) * pageSize
    return sortedItems.slice(start, start + pageSize)
  }, [sortedItems, currentPage, pageSize])

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
      if (field === 'stok') {
        setSortDir('desc')
      } else {
        setSortDir('asc')
      }
    }
  }

  // Export to Excel function
  const handleExportExcel = () => {
    if (!sortedItems.length) {
      showToast('Tidak ada data untuk diekspor.')
      return
    }

    const wb = XLSX.utils.book_new()

    // Sheet 1: Recap Summary
    const custName = activeCustomer?.name || 'Semua'
    const kpiRows = [
      ['METRIK STOK MARKETPLACE', 'NILAI', 'KETERANGAN'],
      ['Nama Pelanggan / Toko', custName, 'Marketplace Channel'],
      ['Total Stok Fisik', recap.totalStock, 'Total unit produk'],
      ['Estimasi Nilai Stok', recap.totalNilaiStok ? `Rp ${recap.totalNilaiStok.toLocaleString('id-ID')}` : 'Rp 0', 'Berdasarkan harga normal x unit stok'],
      ['Total SKU / Varian', recap.totalItems, 'Varian aktif terdaftar'],
      ['Stok Tersedia', recap.availableStockCount, `${recap.availableStockPct}% dari total varian (> 0 pcs)`],
      ['Stok Kosong / Habis', recap.emptyStockCount, `${recap.emptyStockPct}% dari total varian (0 pcs)`],
      ['Stok Menipis', recap.lowStockCount, `${recap.lowStockPct}% dari total varian (1 - 5 pcs)`],
      ['Rata-rata Stok per SKU', recap.avgStock, 'Unit per varian'],
      ['File Sumber', Array.isArray(activeCustomer?.fileNames) ? activeCustomer.fileNames.join(', ') : '-', 'Ekspor massal Shopee'],
      ['Terakhir Disimpan', activeCustomer?.savedAt || '-', 'Vercel Blob Storage'],
    ]
    const wsKpi = XLSX.utils.aoa_to_sheet(kpiRows)
    XLSX.utils.book_append_sheet(wb, wsKpi, 'Ringkasan Stok')

    // Sheet 2: Products Table
    const detailRows = [
      ['No', 'Kode Produk', 'Kode Variasi', 'Nama Produk', 'SKU', 'Stok', 'Harga', 'Status Stok'],
      ...sortedItems.map((item, i) => {
        const statusLabel = item.stok === 0 ? 'Habis / Kosong' : item.stok <= 5 ? 'Menipis' : 'Tersedia'
        return [
          i + 1,
          item.kodeProduk || '-',
          item.kodeVariasi || '-',
          item.namaProduk,
          item.sku,
          item.stok,
          item.harga || 0,
          statusLabel,
        ]
      }),
    ]
    const wsDetail = XLSX.utils.aoa_to_sheet(detailRows)
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Daftar Produk')

    const safeName = (custName || 'marketplace').replace(/[^a-zA-Z0-9_-]/g, '_')
    const fileName = `Stok_Marketplace_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`
    XLSX.writeFile(wb, fileName)
    showToast('File Excel berhasil diunduh!')
  }

  // Format timestamp helper
  const formattedSyncTime = useMemo(() => {
    const rawTime = activeCustomer?.savedAt || activeData?.savedAt
    if (!rawTime) return 'Belum ada data sinkronisasi'
    try {
      const d = new Date(rawTime)
      return d.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return rawTime
    }
  }, [activeCustomer?.savedAt, activeData?.savedAt])

  return (
    <AuthGate>
      <div className="aff-page-shell">
        {/* Top Header */}
        <header className="aff-top-header">
          <div>
            <div className="aff-lemon-eyebrow">
              <LemonIcon size={15} />
              <span>TMS ONLINE · STOK MARKETPLACE</span>
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
              Stok Marketplace
            </h1>
            <p className="aff-header-sub">
              Rekap ketersediaan dan status stok fisik produk per channel toko &amp; marketplace
            </p>
          </div>

          <div
            className="aff-header-actions"
            style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}
          >
            {activeData && sortedItems.length > 0 && (
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
              onClick={handleRefresh}
              disabled={refreshing}
              title="Sinkronkan ulang data dari Storage Blob"
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
              Sumber Data: <strong style={{ color: '#451A03' }}>Storage Blob &amp; Ekspor Stok Excel</strong>
            </span>
            <span style={{ color: '#A8A29E' }}>·</span>
            <span style={{ color: '#854D0E', fontSize: '12.5px' }}>
              Terakhir Disinkronkan: <strong>{formattedSyncTime}</strong>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link
              href="/admin"
              style={{
                background: '#FEF08A',
                border: '1px solid #FDE047',
                color: '#854D0E',
                fontSize: '11.5px',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '6px',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              ⚙️ Kelola di Admin
            </Link>
          </div>
        </div>

        {/* ── Tabs for Each Nama Pelanggan ── */}
        {customers.length > 0 && (
          <div className="aff-platform-tabs" style={{ marginTop: '1rem', marginBottom: '1.25rem' }}>
            {customers.map((cust) => {
              const isActive = cust.id === activeCustomerId
              const itemCount = cust.summary?.totalItems || 0
              return (
                <button
                  key={cust.id}
                  type="button"
                  onClick={() => setActiveCustomerId(cust.id)}
                  className={`aff-plat-btn ${isActive ? 'is-active semua' : ''}`}
                >
                  <span className="dot" style={{ background: isActive ? '#FEF08A' : '#F59E0B' }} />
                  <span>{cust.name}</span>
                  <span
                    style={{
                      background: isActive ? 'rgba(255,255,255,0.25)' : '#FEF9C3',
                      color: isActive ? '#FFFFFF' : '#854D0E',
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '1px 6px',
                      borderRadius: '999px',
                      marginLeft: '2px',
                    }}
                  >
                    {itemCount.toLocaleString('id-ID')}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Loading Indicator */}
        {loading && (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#78716C' }}>
            <div className="spinner-sm" style={{ width: '28px', height: '28px', border: '3px solid #FDE047', borderTopColor: '#EAB308', margin: '0 auto 10px' }} />
            <p style={{ margin: 0, fontWeight: 600 }}>Memuat data stok marketplace…</p>
          </div>
        )}

        {/* Empty State when no customers exist */}
        {!loading && customers.length === 0 && (
          <div
            style={{
              padding: '3rem 1.5rem',
              textAlign: 'center',
              background: '#FFFFFF',
              border: '1.5px dashed #FDE047',
              borderRadius: '16px',
              marginTop: '1.5rem',
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>📦</div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#451A03', margin: '0 0 8px' }}>
              Belum Ada Data Stok Marketplace
            </h2>
            <p style={{ color: '#78716C', maxWidth: '520px', margin: '0 auto 1.5rem', fontSize: '13.5px', lineHeight: 1.5 }}>
              Unggah file Excel ekspor massal stok marketplace (misalnya dari Shopee) di menu admin.
              Sistem akan otomatis mengekstrak Nama Produk, SKU, dan Stok per pelanggan.
            </p>
            <Link
              href="/admin"
              className="btn-export"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 22px',
                fontSize: '13.5px',
                textDecoration: 'none',
              }}
            >
              <span>Unggah File di Menu Admin ↗</span>
            </Link>
          </div>
        )}

        {/* ── Main Content Area when customer data exists ── */}
        {!loading && activeCustomer && (
          <>
            {/* ── KPI Recap Cards ── */}
            <div className="stock-grid-cards">
              <KpiCard
                label="TOTAL STOK FISIK"
                value={`${recap.totalStock.toLocaleString('id-ID')} pcs`}
                sub={`Total unit dari ${recap.totalItems.toLocaleString('id-ID')} SKU`}
                color="#0369A1"
                raw={recap.totalStock}
                onCopy={showToast}
              />

              <KpiCard
                label="TOTAL SKU / VARIAN"
                value={`${recap.totalItems.toLocaleString('id-ID')} SKU`}
                sub={`Varian produk ${activeCustomer.name}`}
                color="#713F12"
                raw={recap.totalItems}
                onCopy={showToast}
              />

              <KpiCard
                label="STOK TERSEDIA"
                value={`${recap.availableStockCount.toLocaleString('id-ID')} SKU`}
                sub={`${recap.availableStockPct}% dari total varian (> 0 pcs)`}
                color="#15803D"
                raw={recap.availableStockCount}
                onCopy={showToast}
              />

              <KpiCard
                label="STOK KOSONG / HABIS"
                value={`${recap.emptyStockCount.toLocaleString('id-ID')} SKU`}
                sub={`${recap.emptyStockPct}% dari total varian (0 pcs)`}
                color="#DC2626"
                raw={recap.emptyStockCount}
                onCopy={showToast}
              />

              <KpiCard
                label="STOK MENIPIS"
                value={`${recap.lowStockCount.toLocaleString('id-ID')} SKU`}
                sub={`${recap.lowStockPct}% dari total varian (1 - 5 pcs)`}
                color="#D97706"
                raw={recap.lowStockCount}
                onCopy={showToast}
              />

              <KpiCard
                label="RATA-RATA STOK / SKU"
                value={`${recap.avgStock} pcs`}
                sub={`Rasio per varian produk`}
                color="#6366F1"
                raw={recap.avgStock}
                onCopy={showToast}
              />
            </div>

            {/* ── Controls & Filter Bar ── */}
            <div className="aff-control-bar">
              {/* Global search */}
              <div style={{ flex: '1 1 260px', position: 'relative', display: 'flex', alignItems: 'center' }}>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#92400E"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 1 }}
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari Nama Produk atau SKU..."
                  style={{
                    width: '100%',
                    height: '36px',
                    boxSizing: 'border-box',
                    padding: '8px 30px 8px 36px',
                    fontSize: '13px',
                    border: '1px solid #FEF08A',
                    borderRadius: '8px',
                    background: '#FFFDF5',
                    outline: 'none',
                    color: 'inherit',
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '14px',
                      color: '#92400E',
                      padding: 0,
                      lineHeight: 1,
                    }}
                    title="Hapus pencarian"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Status filter pills */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#713F12', marginRight: '2px' }}>
                  Status:
                </span>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`pill-btn ${statusFilter === 'ALL' ? 'is-active' : ''}`}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    background: statusFilter === 'ALL' ? '#FEF08A' : 'transparent',
                    borderColor: statusFilter === 'ALL' ? '#EAB308' : '#E2E8F0',
                    color: statusFilter === 'ALL' ? '#713F12' : '#6B7280',
                    fontWeight: statusFilter === 'ALL' ? 700 : 500,
                  }}
                >
                  Semua ({recap.totalItems.toLocaleString('id-ID')})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('available')}
                  className={`pill-btn ${statusFilter === 'available' ? 'is-active' : ''}`}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    background: statusFilter === 'available' ? '#DCFCE7' : 'transparent',
                    borderColor: statusFilter === 'available' ? '#86EFAC' : '#E2E8F0',
                    color: statusFilter === 'available' ? '#15803D' : '#6B7280',
                    fontWeight: statusFilter === 'available' ? 700 : 500,
                  }}
                >
                  Tersedia ({recap.availableStockCount.toLocaleString('id-ID')})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('low')}
                  className={`pill-btn ${statusFilter === 'low' ? 'is-active' : ''}`}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    background: statusFilter === 'low' ? '#FEF3C7' : 'transparent',
                    borderColor: statusFilter === 'low' ? '#FDE68A' : '#E2E8F0',
                    color: statusFilter === 'low' ? '#B45309' : '#6B7280',
                    fontWeight: statusFilter === 'low' ? 700 : 500,
                  }}
                >
                  Menipis ({recap.lowStockCount.toLocaleString('id-ID')})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('empty')}
                  className={`pill-btn ${statusFilter === 'empty' ? 'is-active' : ''}`}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    background: statusFilter === 'empty' ? '#FEE2E2' : 'transparent',
                    borderColor: statusFilter === 'empty' ? '#FCA5A5' : '#E2E8F0',
                    color: statusFilter === 'empty' ? '#DC2626' : '#6B7280',
                    fontWeight: statusFilter === 'empty' ? 700 : 500,
                  }}
                >
                  Kosong ({recap.emptyStockCount.toLocaleString('id-ID')})
                </button>
              </div>

              {/* Rows per page selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                <span style={{ fontSize: '12px', color: '#78716C', fontWeight: 600 }}>Tampilkan:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  style={{
                    padding: '5px 8px',
                    fontSize: '12px',
                    border: '1px solid #FEF08A',
                    borderRadius: '6px',
                    background: '#FFFDF5',
                    color: '#713F12',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={-1}>Semua</option>
                </select>
              </div>
            </div>

            {/* ── Active Filters Bar ── */}
            {activeFilterList.length > 0 && (
              <div className="aff-active-filters-bar" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#713F12' }}>Filter Aktif:</span>
                  {activeFilterList.map((chip) => (
                    <span key={chip.id} className="aff-filter-chip">
                      <span>{chip.label}</span>
                      <button type="button" onClick={chip.clear} title="Hapus filter">
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
                      padding: '2px 6px',
                      textDecoration: 'underline',
                    }}
                  >
                    Reset Semua Filter
                  </button>
                </div>
              </div>
            )}

            {/* ── Table Block ── */}
            <div className="aff-table-wrap">
              {dataLoading && (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#78716C' }}>
                  <div className="spinner-sm" style={{ width: '22px', height: '22px', border: '3px solid #FDE047', borderTopColor: '#EAB308', margin: '0 auto 8px' }} />
                  <span>Memuat produk…</span>
                </div>
              )}

              {!dataLoading && (
                <table className="aff-table">
                  <thead>
                    <tr>
                      {/* Column: No */}
                      <th style={{ width: '50px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <span>No</span>
                        </div>
                      </th>

                      {/* Column: Gambar */}
                      <th style={{ width: '70px', textAlign: 'center' }}>
                        <span>Gambar</span>
                      </th>

                      {/* Column: Kode Produk */}
                      <th style={{ width: '160px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                          <span
                            onClick={() => handleSort('kodeProduk')}
                            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title="Urutkan berdasarkan Kode Produk"
                          >
                            <span>Kode Produk</span>
                            {sortField === 'kodeProduk' && (
                              <span style={{ fontSize: '10px', color: '#EAB308' }}>
                                {sortDir === 'asc' ? '▲' : '▼'}
                              </span>
                            )}
                          </span>

                          <div style={{ position: 'relative' }}>
                            <button
                              type="button"
                              className={`aff-col-filter-btn ${isColFiltered('kodeProduk') ? 'is-active' : ''}`}
                              onClick={(e) => toggleColumnFilter('kodeProduk', e)}
                              title="Filter Kode Produk"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                              </svg>
                            </button>

                            {openColFilter === 'kodeProduk' && (
                              <div className="aff-col-filter-popover" onClick={(e) => e.stopPropagation()}>
                                <div className="aff-col-popover-title">
                                  <span>Filter Kode Produk</span>
                                  <button
                                    type="button"
                                    onClick={() => setOpenColFilter(null)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}
                                  >
                                    ✕
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  value={colSearchKodeProduk}
                                  onChange={(e) => setColSearchKodeProduk(e.target.value)}
                                  placeholder="Ketik kode produk..."
                                  className="aff-col-popover-search"
                                  autoFocus
                                />
                                <div className="aff-col-popover-actions">
                                  <button
                                    type="button"
                                    className="aff-col-popover-btn-clear"
                                    onClick={() => setColSearchKodeProduk('')}
                                  >
                                    Reset
                                  </button>
                                  <button
                                    type="button"
                                    className="aff-col-popover-btn-close"
                                    onClick={() => setOpenColFilter(null)}
                                  >
                                    Terapkan
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </th>

                      {/* Column: Kode Variasi */}
                      <th style={{ width: '160px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                          <span
                            onClick={() => handleSort('kodeVariasi')}
                            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title="Urutkan berdasarkan Kode Variasi"
                          >
                            <span>Kode Variasi</span>
                            {sortField === 'kodeVariasi' && (
                              <span style={{ fontSize: '10px', color: '#EAB308' }}>
                                {sortDir === 'asc' ? '▲' : '▼'}
                              </span>
                            )}
                          </span>

                          <div style={{ position: 'relative' }}>
                            <button
                              type="button"
                              className={`aff-col-filter-btn ${isColFiltered('kodeVariasi') ? 'is-active' : ''}`}
                              onClick={(e) => toggleColumnFilter('kodeVariasi', e)}
                              title="Filter Kode Variasi"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                              </svg>
                            </button>

                            {openColFilter === 'kodeVariasi' && (
                              <div className="aff-col-filter-popover" onClick={(e) => e.stopPropagation()}>
                                <div className="aff-col-popover-title">
                                  <span>Filter Kode Variasi</span>
                                  <button
                                    type="button"
                                    onClick={() => setOpenColFilter(null)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}
                                  >
                                    ✕
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  value={colSearchKodeVariasi}
                                  onChange={(e) => setColSearchKodeVariasi(e.target.value)}
                                  placeholder="Ketik kode variasi..."
                                  className="aff-col-popover-search"
                                  autoFocus
                                />
                                <div className="aff-col-popover-actions">
                                  <button
                                    type="button"
                                    className="aff-col-popover-btn-clear"
                                    onClick={() => setColSearchKodeVariasi('')}
                                  >
                                    Reset
                                  </button>
                                  <button
                                    type="button"
                                    className="aff-col-popover-btn-close"
                                    onClick={() => setOpenColFilter(null)}
                                  >
                                    Terapkan
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </th>

                      {/* Column: SKU */}
                      <th style={{ width: '260px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                          <span
                            onClick={() => handleSort('sku')}
                            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title="Urutkan berdasarkan SKU"
                          >
                            <span>SKU</span>
                            {sortField === 'sku' && (
                              <span style={{ fontSize: '10px', color: '#EAB308' }}>
                                {sortDir === 'asc' ? '▲' : '▼'}
                              </span>
                            )}
                          </span>

                          <div style={{ position: 'relative' }}>
                            <button
                              type="button"
                              className={`aff-col-filter-btn ${isColFiltered('sku') ? 'is-active' : ''}`}
                              onClick={(e) => toggleColumnFilter('sku', e)}
                              title="Filter SKU"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                              </svg>
                            </button>

                            {openColFilter === 'sku' && (
                              <div className="aff-col-filter-popover" onClick={(e) => e.stopPropagation()}>
                                <div className="aff-col-popover-title">
                                  <span>Filter SKU</span>
                                  <button
                                    type="button"
                                    onClick={() => setOpenColFilter(null)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}
                                  >
                                    ✕
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  value={colSearchSku}
                                  onChange={(e) => setColSearchSku(e.target.value)}
                                  placeholder="Ketik kode SKU..."
                                  className="aff-col-popover-search"
                                  autoFocus
                                />
                                <div className="aff-col-popover-actions">
                                  <button
                                    type="button"
                                    className="aff-col-popover-btn-clear"
                                    onClick={() => setColSearchSku('')}
                                  >
                                    Reset
                                  </button>
                                  <button
                                    type="button"
                                    className="aff-col-popover-btn-close"
                                    onClick={() => setOpenColFilter(null)}
                                  >
                                    Terapkan
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </th>

                      {/* Column: Stok */}
                      <th style={{ width: '130px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          <span
                            onClick={() => handleSort('stok')}
                            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title="Urutkan berdasarkan Jumlah Stok"
                          >
                            <span>Stok</span>
                            {sortField === 'stok' && (
                              <span style={{ fontSize: '10px', color: '#EAB308' }}>
                                {sortDir === 'asc' ? '▲' : '▼'}
                              </span>
                            )}
                          </span>

                          <div style={{ position: 'relative' }}>
                            <button
                              type="button"
                              className={`aff-col-filter-btn ${isColFiltered('stok') ? 'is-active' : ''}`}
                              onClick={(e) => toggleColumnFilter('stok', e)}
                              title="Filter Rentang Stok"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                              </svg>
                            </button>

                            {openColFilter === 'stok' && (
                              <div className="aff-col-filter-popover popover-align-right" onClick={(e) => e.stopPropagation()}>
                                <div className="aff-col-popover-title">
                                  <span>Filter Rentang Stok</span>
                                  <button
                                    type="button"
                                    onClick={() => setOpenColFilter(null)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}
                                  >
                                    ✕
                                  </button>
                                </div>
                                <div className="aff-col-popover-list">
                                  {[
                                    { key: 'ALL', label: 'Semua Stok' },
                                    { key: '0', label: 'Stok Kosong (0)' },
                                    { key: '1-5', label: 'Stok Menipis (1 - 5)' },
                                    { key: '6-20', label: 'Stok Sedang (6 - 20)' },
                                    { key: '>20', label: 'Stok Banyak (> 20)' },
                                  ].map((opt) => (
                                    <button
                                      key={opt.key}
                                      type="button"
                                      className={`aff-col-popover-item ${colStokRange === opt.key ? 'is-selected' : ''}`}
                                      onClick={() => {
                                        setColStokRange(opt.key)
                                        setOpenColFilter(null)
                                      }}
                                    >
                                      <span>{opt.label}</span>
                                      {colStokRange === opt.key && <span>✓</span>}
                                    </button>
                                  ))}
                                </div>
                                <div className="aff-col-popover-actions">
                                  <button
                                    type="button"
                                    className="aff-col-popover-btn-clear"
                                    onClick={() => setColStokRange('ALL')}
                                  >
                                    Reset
                                  </button>
                                  <button
                                    type="button"
                                    className="aff-col-popover-btn-close"
                                    onClick={() => setOpenColFilter(null)}
                                  >
                                    Tutup
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </th>

                      {/* Column: Harga */}
                      <th style={{ width: '140px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          <span
                            onClick={() => handleSort('harga')}
                            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title="Urutkan berdasarkan Harga"
                          >
                            <span>Harga</span>
                            {sortField === 'harga' && (
                              <span style={{ fontSize: '10px', color: '#EAB308' }}>
                                {sortDir === 'asc' ? '▲' : '▼'}
                              </span>
                            )}
                          </span>
                        </div>
                      </th>

                      {/* Column: Status */}
                      <th style={{ width: '140px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <span
                            onClick={() => handleSort('status')}
                            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title="Urutkan berdasarkan Status Ketersediaan"
                          >
                            <span>Status</span>
                            {sortField === 'status' && (
                              <span style={{ fontSize: '10px', color: '#EAB308' }}>
                                {sortDir === 'asc' ? '▲' : '▼'}
                              </span>
                            )}
                          </span>

                          <div style={{ position: 'relative' }}>
                            <button
                              type="button"
                              className={`aff-col-filter-btn ${isColFiltered('status') ? 'is-active' : ''}`}
                              onClick={(e) => toggleColumnFilter('status', e)}
                              title="Filter Status Stok"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                              </svg>
                            </button>

                            {openColFilter === 'status' && (
                              <div className="aff-col-filter-popover popover-align-right" onClick={(e) => e.stopPropagation()}>
                                <div className="aff-col-popover-title">
                                  <span>Filter Status Stok</span>
                                  <button
                                    type="button"
                                    onClick={() => setOpenColFilter(null)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}
                                  >
                                    ✕
                                  </button>
                                </div>
                                <div className="aff-col-popover-list">
                                  {[
                                    { key: 'ALL', label: 'Semua Status' },
                                    { key: 'available', label: 'Tersedia (> 5)' },
                                    { key: 'low', label: 'Menipis (1 - 5)' },
                                    { key: 'empty', label: 'Habis / Kosong (0)' },
                                  ].map((opt) => (
                                    <button
                                      key={opt.key}
                                      type="button"
                                      className={`aff-col-popover-item ${statusFilter === opt.key ? 'is-selected' : ''}`}
                                      onClick={() => {
                                        setStatusFilter(opt.key)
                                        setOpenColFilter(null)
                                      }}
                                    >
                                      <span>{opt.label}</span>
                                      {statusFilter === opt.key && <span>✓</span>}
                                    </button>
                                  ))}
                                </div>
                                <div className="aff-col-popover-actions">
                                  <button
                                    type="button"
                                    className="aff-col-popover-btn-clear"
                                    onClick={() => setStatusFilter('ALL')}
                                  >
                                    Reset
                                  </button>
                                  <button
                                    type="button"
                                    className="aff-col-popover-btn-close"
                                    onClick={() => setOpenColFilter(null)}
                                  >
                                    Tutup
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {displayedItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '3rem 1rem', color: '#78716C' }}>
                          Tidak ada produk yang cocok dengan filter yang dipilih.
                        </td>
                      </tr>
                    ) : (
                      displayedItems.map((item, idx) => {
                        const rowNum = pageSize === -1 ? idx + 1 : (currentPage - 1) * pageSize + idx + 1
                        const isAvailable = item.stok > 5
                        const isLow = item.stok >= 1 && item.stok <= 5
                        const isEmpty = item.stok === 0

                        return (
                          <tr key={`${item.sku}-${idx}`}>
                            {/* No */}
                            <td style={{ textAlign: 'center', color: '#94A3B8', fontSize: '12px' }}>
                              {rowNum}
                            </td>

                            {/* Gambar */}
                            <td style={{ textAlign: 'center', width: '70px', padding: '6px 4px' }}>
                              {item.gambar ? (
                                <img
                                  src={item.gambar}
                                  alt={item.namaProduk || item.sku}
                                  referrerPolicy="no-referrer"
                                  style={{
                                    width: '42px',
                                    height: '42px',
                                    objectFit: 'cover',
                                    borderRadius: '6px',
                                    border: '1px solid #E2E8F0',
                                    cursor: 'pointer',
                                    verticalAlign: 'middle',
                                    background: '#F8FAFC',
                                    transition: 'transform 0.15s ease',
                                  }}
                                  loading="lazy"
                                  title="Klik untuk memperbesar gambar"
                                  onClick={() => setPreviewModalImage({ url: item.gambar, alt: item.namaProduk || item.sku })}
                                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                                />
                              ) : (
                                <span style={{ color: '#CBD5E1', fontSize: '11px' }}>—</span>
                              )}
                            </td>

                            {/* Kode Produk */}
                            <td style={{ fontFamily: 'monospace', fontSize: '12px', color: '#1E293B' }}>
                              <span
                                style={{
                                  background: '#F8FAFC',
                                  border: '1px solid #E2E8F0',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  display: 'inline-block',
                                }}
                              >
                                {item.kodeProduk || '-'}
                              </span>
                            </td>

                            {/* Kode Variasi */}
                            <td style={{ fontFamily: 'monospace', fontSize: '12px', color: '#475569' }}>
                              <span
                                style={{
                                  background: '#F8FAFC',
                                  border: '1px solid #E2E8F0',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  display: 'inline-block',
                                }}
                              >
                                {item.kodeVariasi || '-'}
                              </span>
                            </td>

                            {/* SKU with copy-able tooltip for Nama Produk */}
                            <td style={{ fontFamily: 'monospace', fontSize: '12.5px', color: '#334155' }}>
                              <div className="sku-cell-container">
                                <span
                                  style={{
                                    background: '#F8FAFC',
                                    border: '1px solid #E2E8F0',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    display: 'inline-block',
                                    cursor: 'default',
                                    fontWeight: 600,
                                  }}
                                >
                                  {item.sku}
                                </span>

                                {/* Tooltip on hover containing copy-able Nama Produk */}
                                <div className="sku-hover-tooltip" onClick={(e) => e.stopPropagation()}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '5px' }}>
                                    <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748B', fontWeight: 700 }}>
                                      Nama Produk
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (item.namaProduk && navigator.clipboard?.writeText) {
                                          navigator.clipboard.writeText(item.namaProduk)
                                          showToast('Nama produk berhasil disalin!')
                                        }
                                      }}
                                      style={{
                                        fontSize: '11px',
                                        padding: '2px 7px',
                                        borderRadius: '4px',
                                        border: '1px solid #CBD5E1',
                                        background: '#F1F5F9',
                                        color: '#1E293B',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px',
                                      }}
                                      title="Salin nama produk ke clipboard"
                                    >
                                      📋 Salin
                                    </button>
                                  </div>
                                  <div
                                    style={{
                                      fontSize: '12px',
                                      color: '#0F172A',
                                      lineHeight: 1.45,
                                      fontFamily: 'system-ui, -apple-system, sans-serif',
                                      fontWeight: 500,
                                      userSelect: 'text',
                                      cursor: 'text',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {item.namaProduk || '—'}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Stok */}
                            <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '14px' }}>
                              <span
                                style={{
                                  color: isEmpty ? '#DC2626' : isLow ? '#D97706' : '#15803D',
                                }}
                              >
                                {item.stok.toLocaleString('id-ID')}
                              </span>
                            </td>

                            {/* Harga */}
                            <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '13px', color: '#0F172A', fontFamily: 'monospace' }}>
                              Rp {(item.harga || 0).toLocaleString('id-ID')}
                            </td>

                            {/* Status Stok */}
                            <td style={{ textAlign: 'center' }}>
                              {isEmpty && (
                                <span className="badge-stock-empty">
                                  ● Kosong
                                </span>
                              )}
                              {isLow && (
                                <span className="badge-stock-low">
                                  ▲ Menipis ({item.stok})
                                </span>
                              )}
                              {isAvailable && (
                                <span className="badge-stock-available">
                                  ● Tersedia
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* ── Pagination Bar ── */}
            {sortedItems.length > 0 && pageSize !== -1 && (
              <div className="aff-pagination-bar" style={{ marginTop: '1.25rem' }}>
                <div style={{ fontSize: '13px', color: '#78716C' }}>
                  Menampilkan{' '}
                  <strong style={{ color: '#1C1917' }}>
                    {((currentPage - 1) * pageSize + 1).toLocaleString('id-ID')}
                  </strong>{' '}
                  -{' '}
                  <strong style={{ color: '#1C1917' }}>
                    {Math.min(currentPage * pageSize, sortedItems.length).toLocaleString('id-ID')}
                  </strong>{' '}
                  dari{' '}
                  <strong style={{ color: '#1C1917' }}>
                    {sortedItems.length.toLocaleString('id-ID')}
                  </strong>{' '}
                  produk
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    type="button"
                    className="aff-page-btn"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    title="Halaman Pertama"
                  >
                    «
                  </button>
                  <button
                    type="button"
                    className="aff-page-btn"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    title="Halaman Sebelumnya"
                  >
                    ‹
                  </button>

                  {/* Page number buttons */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = currentPage - 2 + i
                    if (currentPage <= 3) pageNum = i + 1
                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i
                    if (pageNum < 1 || pageNum > totalPages) return null

                    return (
                      <button
                        key={pageNum}
                        type="button"
                        className={`aff-page-btn ${pageNum === currentPage ? 'is-active' : ''}`}
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </button>
                    )
                  })}

                  <button
                    type="button"
                    className="aff-page-btn"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    title="Halaman Berikutnya"
                  >
                    ›
                  </button>
                  <button
                    type="button"
                    className="aff-page-btn"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    title="Halaman Terakhir"
                  >
                    »
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Toast Feedback */}
        {toastVisible && (
          <div
            style={{
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              background: '#1C1917',
              color: '#FEF08A',
              padding: '10px 18px',
              borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
              zIndex: 9999,
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              animation: 'affDropdownFade 0.2s ease-out',
            }}
          >
            <span>✨</span>
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Image Zoom Preview Modal */}
        {previewModalImage && (
          <div
            onClick={() => setPreviewModalImage(null)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
              background: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem',
              animation: 'affDropdownFade 0.15s ease-out',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#FFFFFF',
                borderRadius: '14px',
                padding: '1.25rem',
                maxWidth: '440px',
                width: '100%',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                textAlign: 'center',
                position: 'relative',
              }}
            >
              <button
                type="button"
                onClick={() => setPreviewModalImage(null)}
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '12px',
                  background: '#F1F5F9',
                  border: 'none',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  color: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
              <img
                src={previewModalImage.url}
                alt={previewModalImage.alt}
                referrerPolicy="no-referrer"
                style={{
                  width: '100%',
                  maxHeight: '380px',
                  objectFit: 'contain',
                  borderRadius: '8px',
                  background: '#F8FAFC',
                }}
              />
              <p style={{ margin: '12px 0 0', fontSize: '13px', fontWeight: 600, color: '#1E293B', lineHeight: 1.4 }}>
                {previewModalImage.alt}
              </p>
            </div>
          </div>
        )}

        {/* Global styles for SKU hover tooltip */}
        <style>{`
          .sku-cell-container {
            position: relative;
            display: inline-block;
          }
          .sku-hover-tooltip {
            position: absolute;
            bottom: calc(100% + 6px);
            left: 0;
            z-index: 99;
            width: 290px;
            max-width: 320px;
            background: #FFFFFF;
            border: 1px solid #CBD5E1;
            border-radius: 8px;
            padding: 8px 10px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.18), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transition: opacity 0.15s ease, visibility 0.15s ease;
          }
          .sku-hover-tooltip::after {
            content: '';
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            height: 10px;
          }
          .sku-cell-container:hover .sku-hover-tooltip,
          .sku-hover-tooltip:hover {
            opacity: 1;
            visibility: visible;
            pointer-events: auto;
          }
        `}</style>
      </div>
    </AuthGate>
  )
}
