'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import * as XLSX from 'xlsx'
import AuthGate from '@/components/AuthGate'
import LemonIcon from '@/components/LemonIcon'

export default function PelangganPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedChannel, setSelectedChannel] = useState('ALL')
  const [selectedTier, setSelectedTier] = useState('ALL') // 'ALL' | 'REPEAT' | '3' | '4' | '5-9' | '10+' | 'SINGLE'

  // Sorting: Default is orderCount DESC
  const [sortField, setSortField] = useState('orderCount') // 'orderCount' | 'username' | 'lastOrder' | 'firstOrder'
  const [sortDir, setSortDir] = useState('desc') // 'desc' | 'asc'

  // Pagination
  const [pageSize, setPageSize] = useState(25)
  const [currentPage, setCurrentPage] = useState(1)

  // Active Customer for Date History Tooltip / Box Modal
  const [activeCustomerDates, setActiveCustomerDates] = useState(null)
  const [copiedDates, setCopiedDates] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      setRefreshing(true)
      const res = await fetch('/api/pelanggan/data')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Gagal memuat data pelanggan.')
      }
      const json = await res.json()
      setData(json.data)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Reset pagination to page 1 on filter or sort change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedChannel, selectedTier, sortField, sortDir, pageSize])

  // Close date modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setActiveCustomerDates(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ─── Filtered and Sorted Customers ──────────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    if (!data?.customers) return []

    return data.customers.filter((c) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        if (!c.username.toLowerCase().includes(q)) {
          return false
        }
      }

      // 2. Channel Filter
      if (selectedChannel !== 'ALL') {
        if (!c.channels.includes(selectedChannel)) {
          return false
        }
      }

      // 3. Repeat Tier Filter
      if (selectedTier === 'REPEAT') {
        if (c.orderCount <= 1) return false
      } else if (selectedTier === '3') {
        if (c.orderCount !== 3) return false
      } else if (selectedTier === '4') {
        if (c.orderCount !== 4) return false
      } else if (selectedTier === '5-9') {
        if (c.orderCount < 5 || c.orderCount > 9) return false
      } else if (selectedTier === '10+') {
        if (c.orderCount < 10) return false
      } else if (selectedTier === 'SINGLE') {
        if (c.orderCount !== 1) return false
      }

      return true
    })
  }, [data, searchQuery, selectedChannel, selectedTier])

  const sortedCustomers = useMemo(() => {
    const list = [...filteredCustomers]

    list.sort((a, b) => {
      let cmp = 0
      if (sortField === 'orderCount') {
        cmp = a.orderCount - b.orderCount
      } else if (sortField === 'username') {
        cmp = a.username.localeCompare(b.username)
      } else if (sortField === 'lastOrder') {
        cmp = (a.lastOrderIso || '').localeCompare(b.lastOrderIso || '')
      } else if (sortField === 'firstOrder') {
        cmp = (a.firstOrderIso || '').localeCompare(b.firstOrderIso || '')
      }

      if (cmp !== 0) {
        return sortDir === 'desc' ? -cmp : cmp
      }
      // Secondary fallback sort: by username
      return a.username.localeCompare(b.username)
    })

    return list
  }, [filteredCustomers, sortField, sortDir])

  // Pagination calculation
  const totalPages = pageSize === -1 ? 1 : Math.max(1, Math.ceil(sortedCustomers.length / pageSize))
  const paginatedCustomers = useMemo(() => {
    if (pageSize === -1) return sortedCustomers
    const start = (currentPage - 1) * pageSize
    return sortedCustomers.slice(start, start + pageSize)
  }, [sortedCustomers, currentPage, pageSize])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'orderCount' ? 'desc' : 'asc')
    }
  }

  const handleCopyDates = (cust) => {
    if (!cust) return
    const lines = cust.orders.map((o, idx) => `${idx + 1}. ${o.date} (${o.channel})`)
    const text = `Riwayat Pesanan Pelanggan: ${cust.username} (Total ${cust.orderCount}x)\n` + lines.join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopiedDates(true)
      setTimeout(() => setCopiedDates(false), 2000)
    })
  }

  const handleExportExcel = () => {
    if (!sortedCustomers.length) return

    const exportRows = sortedCustomers.map((c, idx) => ({
      No: idx + 1,
      'Username Pelanggan': c.username,
      'Jumlah Pesanan': c.orderCount,
      'Status Pelanggan': c.orderCount > 1 ? 'Repeat Customer' : 'Single Order',
      'Marketplace / Channel': c.channels.join(', '),
      'Pesanan Pertama': c.firstOrder,
      'Pesanan Terakhir': c.lastOrder,
      'Daftar Tanggal Order': c.orders.map((o) => `${o.date} [${o.channel}]`).join('; '),
    }))

    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pelanggan Repeat Order')
    XLSX.writeFile(wb, `Rekap_Pelanggan_Repeat_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const summary = data?.summary

  return (
    <AuthGate title="Pelanggan">
      <div className="app-shell app-shell--wide">
        {/* Header */}
        <header className="app-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LemonIcon size={22} />
              <p className="eyebrow">Data Pelanggan &amp; Analisis Repeat Order</p>
            </div>
            <h1>Pelanggan &amp; Repeat Customer</h1>
            <p className="period-note" style={{ marginTop: '4px', marginBottom: 0 }}>
              Rekap loyalitas pembeli, frekuensi pesanan ulang, dan riwayat tanggal order per username.
              {summary?.dateRange?.earliest && summary?.dateRange?.latest && (
                <span style={{ marginLeft: '8px', color: '#713F12', fontWeight: 600 }}>
                  Rentang: {summary.dateRange.earliest} – {summary.dateRange.latest}
                </span>
              )}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="pill-btn"
              onClick={fetchData}
              disabled={refreshing}
            >
              {refreshing ? 'Memperbarui…' : '🔄 Segarkan Data'}
            </button>
            <button
              type="button"
              className="btn-export"
              onClick={handleExportExcel}
              disabled={!sortedCustomers.length}
            >
              📥 Ekspor Excel
            </button>
          </div>
        </header>

        {loading && (
          <div style={{ padding: '3rem 0', textAlign: 'center' }}>
            <p className="loading-text">Memuat data pelanggan dari storage Blob…</p>
          </div>
        )}

        {error && !loading && (
          <div
            style={{
              padding: '1.5rem',
              borderRadius: '10px',
              background: '#FEF2F2',
              border: '1px solid #FCA5A5',
              color: '#991B1B',
              marginBottom: '2rem',
            }}
          >
            <p style={{ margin: 0, fontWeight: 700 }}>⚠️ Gagal memuat data pelanggan</p>
            <p style={{ margin: '6px 0 0', fontSize: '14px' }}>{error}</p>
            <p style={{ margin: '10px 0 0', fontSize: '13px' }}>
              Pastikan data sudah diunggah di menu <a href="/admin" style={{ color: '#991B1B', fontWeight: 700 }}>Admin</a>.
            </p>
          </div>
        )}

        {data && summary && !loading && (
          <main>
            {/* ─── Recap of Repeated Customer: KPI Cards ─────────────────────── */}
            <section style={{ marginBottom: '1.75rem' }}>
              <div className="pelanggan-kpi-grid">
                <div className="pelanggan-kpi-card pelanggan-kpi-highlight">
                  <p className="pelanggan-kpi-label">
                    <span>Pelanggan Repeat</span>
                    <span style={{ fontSize: '14px' }}>🔁</span>
                  </p>
                  <p className="pelanggan-kpi-val" style={{ color: '#854D0E' }}>
                    {summary.repeatCustomers.toLocaleString('id-ID')}
                  </p>
                  <p className="pelanggan-kpi-sub">
                    <span className="badge-repeat badge-repeat-vip">
                      {summary.repeatCustomerRate}% dari total user
                    </span>
                  </p>
                </div>

                <div className="pelanggan-kpi-card">
                  <p className="pelanggan-kpi-label">
                    <span>Total Transaksi Repeat</span>
                    <span style={{ fontSize: '14px' }}>📦</span>
                  </p>
                  <p className="pelanggan-kpi-val" style={{ color: '#166534' }}>
                    {summary.repeatOrdersTotal.toLocaleString('id-ID')}
                  </p>
                  <p className="pelanggan-kpi-sub">
                    <span style={{ color: '#15803D', fontWeight: 600 }}>
                      {summary.repeatOrderRate}%
                    </span>{' '}
                    dari {summary.totalOrders.toLocaleString('id-ID')} pesanan
                  </p>
                </div>

                <div className="pelanggan-kpi-card">
                  <p className="pelanggan-kpi-label">
                    <span>Total Pelanggan Unik</span>
                    <span style={{ fontSize: '14px' }}>👥</span>
                  </p>
                  <p className="pelanggan-kpi-val">
                    {summary.uniqueCustomers.toLocaleString('id-ID')}
                  </p>
                  <p className="pelanggan-kpi-sub">
                    <span>{summary.singleOrderCustomers.toLocaleString('id-ID')} user order 1x</span>
                  </p>
                </div>

                <div className="pelanggan-kpi-card">
                  <p className="pelanggan-kpi-label">
                    <span>Rata-Rata Repeat Order</span>
                    <span style={{ fontSize: '14px' }}>📊</span>
                  </p>
                  <p className="pelanggan-kpi-val" style={{ color: 'var(--primary)' }}>
                    {summary.avgRepeatOrders}x
                  </p>
                  <p className="pelanggan-kpi-sub">
                    Pesanan per pelanggan repeat
                  </p>
                </div>

                <div className="pelanggan-kpi-card">
                  <p className="pelanggan-kpi-label">
                    <span>Top Repeat Customer</span>
                    <span style={{ fontSize: '14px' }}>👑</span>
                  </p>
                  <p className="pelanggan-kpi-val" style={{ fontSize: '18px', color: '#92400E' }}>
                    {summary.topCustomer?.username}
                  </p>
                  <p className="pelanggan-kpi-sub">
                    <span className="badge-repeat badge-repeat-vip">
                      Rekor: {summary.topCustomer?.count}x Order
                    </span>
                  </p>
                </div>
              </div>

              {/* Breakdown Distribution & Channel Cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: '14px',
                }}
              >
                {/* Distribution Tiers */}
                <div className="table-block" style={{ padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 className="block-title" style={{ margin: 0, fontSize: '13px' }}>
                      Distribusi Frekuensi Repeat Order
                    </h3>
                    {selectedTier !== 'ALL' && (
                      <button
                        type="button"
                        onClick={() => setSelectedTier('ALL')}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#B45309',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        Reset Filter
                      </button>
                    )}
                  </div>
                  <p className="assign-hint" style={{ marginTop: '2px', marginBottom: '8px', fontSize: '11.5px' }}>
                    Klik kartu di bawah untuk menyaring tabel langsung:
                  </p>

                  <div className="pelanggan-dist-grid">
                    <div
                      className={`pelanggan-dist-card ${selectedTier === '2' ? 'is-active' : ''}`}
                      onClick={() => setSelectedTier(selectedTier === '2' ? 'ALL' : '2')}
                    >
                      <p className="pelanggan-dist-label">2x Order</p>
                      <p className="pelanggan-dist-val">{summary.distribution['2']?.count || 0}</p>
                      <p className="pelanggan-dist-pct">{summary.distribution['2']?.percent}%</p>
                    </div>

                    <div
                      className={`pelanggan-dist-card ${selectedTier === '3' ? 'is-active' : ''}`}
                      onClick={() => setSelectedTier(selectedTier === '3' ? 'ALL' : '3')}
                    >
                      <p className="pelanggan-dist-label">3x Order</p>
                      <p className="pelanggan-dist-val" style={{ color: '#166534' }}>
                        {summary.distribution['3']?.count || 0}
                      </p>
                      <p className="pelanggan-dist-pct">{summary.distribution['3']?.percent}%</p>
                    </div>

                    <div
                      className={`pelanggan-dist-card ${selectedTier === '4' ? 'is-active' : ''}`}
                      onClick={() => setSelectedTier(selectedTier === '4' ? 'ALL' : '4')}
                    >
                      <p className="pelanggan-dist-label">4x Order</p>
                      <p className="pelanggan-dist-val" style={{ color: '#0369A1' }}>
                        {summary.distribution['4']?.count || 0}
                      </p>
                      <p className="pelanggan-dist-pct">{summary.distribution['4']?.percent}%</p>
                    </div>

                    <div
                      className={`pelanggan-dist-card ${selectedTier === '5-9' ? 'is-active' : ''}`}
                      onClick={() => setSelectedTier(selectedTier === '5-9' ? 'ALL' : '5-9')}
                    >
                      <p className="pelanggan-dist-label">5 - 9x Order</p>
                      <p className="pelanggan-dist-val" style={{ color: '#6B21A8' }}>
                        {summary.distribution['5-9']?.count || 0}
                      </p>
                      <p className="pelanggan-dist-pct">{summary.distribution['5-9']?.percent}%</p>
                    </div>

                    <div
                      className={`pelanggan-dist-card ${selectedTier === '10+' ? 'is-active' : ''}`}
                      onClick={() => setSelectedTier(selectedTier === '10+' ? 'ALL' : '10+')}
                    >
                      <p className="pelanggan-dist-label">10+x (VIP)</p>
                      <p className="pelanggan-dist-val" style={{ color: '#92400E' }}>
                        {summary.distribution['10+']?.count || 0}
                      </p>
                      <p className="pelanggan-dist-pct">{summary.distribution['10+']?.percent}%</p>
                    </div>
                  </div>
                </div>

                {/* Marketplace / Channel Breakdown */}
                <div className="table-block" style={{ padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 className="block-title" style={{ margin: 0, fontSize: '13px' }}>
                      Distribusi Marketplace / Channel
                    </h3>
                    {selectedChannel !== 'ALL' && (
                      <button
                        type="button"
                        onClick={() => setSelectedChannel('ALL')}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#B45309',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        Reset Filter
                      </button>
                    )}
                  </div>
                  <p className="assign-hint" style={{ marginTop: '2px', marginBottom: '8px', fontSize: '11.5px' }}>
                    Sebaran pesanan berdasarkan kanal toko:
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                    {summary.channels.map((ch) => (
                      <div
                        key={ch.name}
                        onClick={() => setSelectedChannel(selectedChannel === ch.name ? 'ALL' : ch.name)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          background: selectedChannel === ch.name ? '#FEF08A' : 'var(--bg)',
                          border: `1px solid ${selectedChannel === ch.name ? '#EAB308' : 'var(--border)'}`,
                          cursor: 'pointer',
                          transition: 'all 0.12s ease',
                          fontSize: '12.5px',
                        }}
                      >
                        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{ch.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                            {ch.count.toLocaleString('id-ID')} pesanan
                          </span>
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: '#E5E7EB',
                              color: '#374151',
                              fontWeight: 600,
                            }}
                          >
                            {ch.percentage}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* ─── Search, Filter, & Table Controls ─────────────────────────── */}
            <div className="table-block" style={{ marginTop: '1.5rem' }}>
              <div className="table-block-header" style={{ marginBottom: '14px' }}>
                <div>
                  <h3 className="block-title" style={{ margin: 0 }}>Daftar Pelanggan &amp; Repeat Order</h3>
                  <p className="assign-hint" style={{ marginTop: '3px', marginBottom: 0 }}>
                    Urutan default berdasarkan jumlah repeat order terbanyak (Kolom C). Klik tombol tanggal di tiap baris untuk melihat riwayat tanggal pemesanan.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  {/* Search box */}
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      className="login-input"
                      placeholder="Cari username pelanggan…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        padding: '7px 12px',
                        fontSize: '13px',
                        width: '220px',
                        borderRadius: '8px',
                      }}
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
                          color: 'var(--ink-muted)',
                          cursor: 'pointer',
                          fontSize: '14px',
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Channel dropdown */}
                  <select
                    className="category-select"
                    value={selectedChannel}
                    onChange={(e) => setSelectedChannel(e.target.value)}
                    style={{ padding: '7px 10px', fontSize: '13px', borderRadius: '8px' }}
                  >
                    <option value="ALL">Semua Channel</option>
                    {summary.channels.map((ch) => (
                      <option key={ch.name} value={ch.name}>
                        {ch.name} ({ch.count})
                      </option>
                    ))}
                  </select>

                  {/* Repeat Tier filter */}
                  <select
                    className="category-select"
                    value={selectedTier}
                    onChange={(e) => setSelectedTier(e.target.value)}
                    style={{ padding: '7px 10px', fontSize: '13px', borderRadius: '8px' }}
                  >
                    <option value="ALL">Semua Pelanggan</option>
                    <option value="REPEAT">Hanya Repeat Order (≥ 2x)</option>
                    <option value="3">3x Order</option>
                    <option value="4">4x Order</option>
                    <option value="5-9">5 - 9x Order</option>
                    <option value="10+">10+x Order (VIP)</option>
                    <option value="SINGLE">1x Order (Belum Repeat)</option>
                  </select>

                  {/* Reset Filters button if any active */}
                  {(searchQuery || selectedChannel !== 'ALL' || selectedTier !== 'ALL') && (
                    <button
                      type="button"
                      className="pill-btn"
                      onClick={() => {
                        setSearchQuery('')
                        setSelectedChannel('ALL')
                        setSelectedTier('ALL')
                      }}
                      style={{ fontSize: '12px' }}
                    >
                      Reset Filter
                    </button>
                  )}
                </div>
              </div>

              {/* ─── Customer Table ────────────────────────────────────────── */}
              <div className="table-scroll" style={{ minHeight: '340px' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '45px', textAlign: 'center' }}>No</th>
                      <th
                        onClick={() => handleSort('username')}
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                      >
                        Username Pelanggan (Kolom C){' '}
                        {sortField === 'username' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th
                        onClick={() => handleSort('orderCount')}
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                      >
                        Jumlah Repeat Order{' '}
                        {sortField === 'orderCount' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th>Riwayat Tanggal Order</th>
                      <th>Channel / Marketplace</th>
                      <th
                        onClick={() => handleSort('firstOrder')}
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                      >
                        Order Pertama{' '}
                        {sortField === 'firstOrder' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th
                        onClick={() => handleSort('lastOrder')}
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                      >
                        Order Terakhir{' '}
                        {sortField === 'lastOrder' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--ink-muted)' }}>
                          Tidak ada data pelanggan yang cocok dengan kriteria pencarian / filter.
                        </td>
                      </tr>
                    ) : (
                      paginatedCustomers.map((cust, idx) => {
                        const rowNumber = pageSize === -1 ? idx + 1 : (currentPage - 1) * pageSize + idx + 1

                        // Badge styling based on order count
                        let badgeClass = 'badge-repeat-single'
                        if (cust.orderCount >= 10) badgeClass = 'badge-repeat-vip'
                        else if (cust.orderCount >= 5) badgeClass = 'badge-repeat-super'
                        else if (cust.orderCount >= 3) badgeClass = 'badge-repeat-loyal'
                        else if (cust.orderCount === 2) badgeClass = 'badge-repeat-mid'

                        return (
                          <tr key={cust.username}>
                            {/* No */}
                            <td style={{ textAlign: 'center', color: 'var(--ink-muted)', fontSize: '12px' }}>
                              {rowNumber}
                            </td>

                            {/* Username */}
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div
                                  style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '50%',
                                    background: '#FEF9C3',
                                    color: '#713F12',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    border: '1px solid #FEF08A',
                                  }}
                                >
                                  {cust.username.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                                    {cust.username}
                                  </strong>
                                </div>
                              </div>
                            </td>

                            {/* Order Count / Repeat */}
                            <td>
                              <span className={`badge-repeat ${badgeClass}`}>
                                {cust.orderCount}x Pesanan
                              </span>
                            </td>

                            {/* Button to show Tooltip / Box Dates */}
                            <td>
                              <button
                                type="button"
                                className="pelanggan-date-btn"
                                onClick={() => setActiveCustomerDates(cust)}
                                title={`Klik untuk melihat detail ${cust.orderCount} tanggal order`}
                              >
                                <span>📅</span>
                                <span>Lihat {cust.orderCount} Tanggal</span>
                              </button>
                            </td>

                            {/* Channels */}
                            <td>
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {cust.channels.map((ch) => {
                                  let tagClass = 'pelanggan-channel-tag'
                                  if (ch.toUpperCase().includes('SHOPEE')) tagClass += ' pelanggan-channel-shopee'
                                  else if (ch.toUpperCase().includes('TIKTOK')) tagClass += ' pelanggan-channel-tiktok'
                                  return (
                                    <span key={ch} className={tagClass}>
                                      {ch}
                                    </span>
                                  )
                                })}
                              </div>
                            </td>

                            {/* First Order */}
                            <td className="muted mono" style={{ fontSize: '12px' }}>
                              {cust.firstOrder || '—'}
                            </td>

                            {/* Last Order */}
                            <td className="muted mono" style={{ fontSize: '12px' }}>
                              {cust.lastOrder || '—'}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* ─── Pagination Bar ────────────────────────────────────────── */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 0 4px',
                  borderTop: '1px solid var(--border)',
                  marginTop: '12px',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div style={{ color: '#713F12', fontSize: '12.5px' }}>
                  Menampilkan{' '}
                  <strong>
                    {sortedCustomers.length === 0
                      ? 0
                      : pageSize === -1
                      ? 1
                      : (currentPage - 1) * pageSize + 1}
                  </strong>{' '}
                  -{' '}
                  <strong>
                    {pageSize === -1
                      ? sortedCustomers.length
                      : Math.min(currentPage * pageSize, sortedCustomers.length)}
                  </strong>{' '}
                  dari <strong>{sortedCustomers.length.toLocaleString('id-ID')}</strong> pelanggan
                  {data.customers.length !== sortedCustomers.length && (
                    <span style={{ color: '#854D0E', marginLeft: '6px' }}>
                      (disaring dari {data.customers.length.toLocaleString('id-ID')} total)
                    </span>
                  )}
                  <span style={{ marginLeft: '10px', color: '#B45309', fontWeight: 600 }}>
                    · Urut: {sortField === 'orderCount' ? 'Repeat Order' : sortField} ({sortDir.toUpperCase()})
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* Page Size Selector */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#713F12' }}>
                    <span>Baris per halaman:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid #FEF08A',
                        background: '#FFFFFF',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#713F12',
                        cursor: 'pointer',
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={250}>250</option>
                      <option value={-1}>Semua</option>
                    </select>
                  </label>

                  {/* Pagination Buttons */}
                  {pageSize !== -1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        type="button"
                        className="pill-btn"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage(1)}
                        title="Halaman Pertama"
                        style={{ padding: '3px 8px', fontSize: '12px' }}
                      >
                        «
                      </button>
                      <button
                        type="button"
                        className="pill-btn"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        title="Sebelumnya"
                        style={{ padding: '3px 8px', fontSize: '12px' }}
                      >
                        ‹
                      </button>
                      <span
                        style={{
                          padding: '0 8px',
                          fontWeight: 700,
                          fontSize: '12.5px',
                          color: '#713F12',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        className="pill-btn"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        title="Berikutnya"
                        style={{ padding: '3px 8px', fontSize: '12px' }}
                      >
                        ›
                      </button>
                      <button
                        type="button"
                        className="pill-btn"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage(totalPages)}
                        title="Halaman Terakhir"
                        style={{ padding: '3px 8px', fontSize: '12px' }}
                      >
                        »
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        )}

        {/* ─── Interactive Tooltip / Box Popover Modal for Order Dates ───────── */}
        {activeCustomerDates && (
          <div
            className="pelanggan-modal-backdrop"
            onClick={() => setActiveCustomerDates(null)}
          >
            <div
              className="pelanggan-modal-box"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="pelanggan-modal-header">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: '#FEF08A',
                        color: '#713F12',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: 700,
                      }}
                    >
                      {activeCustomerDates.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        {activeCustomerDates.username}
                      </h3>
                      <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--ink-muted)' }}>
                        Total <strong>{activeCustomerDates.orderCount} pesanan</strong> • Rentang: {activeCustomerDates.firstOrder} s/d {activeCustomerDates.lastOrder}
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveCustomerDates(null)}
                  style={{
                    background: '#F3F4F6',
                    border: 'none',
                    borderRadius: '50%',
                    width: '30px',
                    height: '30px',
                    cursor: 'pointer',
                    fontSize: '15px',
                    color: '#4B5563',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Tutup (Esc)"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body: List of Order Dates */}
              <div className="pelanggan-modal-body">
                <p style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: 600, color: 'var(--ink-muted)' }}>
                  DAFTAR TANGGAL ORDER ({activeCustomerDates.orders.length} PESANAN):
                </p>

                {activeCustomerDates.orders.map((ord, idx) => (
                  <div key={idx} className="pelanggan-date-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--ink-muted)',
                          fontFamily: 'var(--font-mono)',
                          width: '26px',
                        }}
                      >
                        #{idx + 1}
                      </span>
                      <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                        {ord.date}
                      </span>
                    </div>

                    <span
                      className={`pelanggan-channel-tag ${
                        ord.channel.toUpperCase().includes('SHOPEE')
                          ? 'pelanggan-channel-shopee'
                          : ord.channel.toUpperCase().includes('TIKTOK')
                          ? 'pelanggan-channel-tiktok'
                          : ''
                      }`}
                    >
                      {ord.channel}
                    </span>
                  </div>
                ))}
              </div>

              {/* Modal Footer */}
              <div className="pelanggan-modal-footer">
                <button
                  type="button"
                  className="pill-btn"
                  onClick={() => handleCopyDates(activeCustomerDates)}
                  style={{ fontSize: '12.5px', background: copiedDates ? '#DCFCE7' : '#FFFFFF' }}
                >
                  {copiedDates ? '✅ Berhasil Disalin!' : '📋 Salin Semua Tanggal'}
                </button>

                <button
                  type="button"
                  className="btn-export"
                  onClick={() => setActiveCustomerDates(null)}
                  style={{ padding: '6px 14px', fontSize: '13px' }}
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGate>
  )
}
