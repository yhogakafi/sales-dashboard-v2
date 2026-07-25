'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatRupiah } from '@/lib/parseBarangTerlaris'
import { exportBarangTerlaris } from '@/lib/exportExcel'

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_BRAND_CATEGORY = {
  SCELTA: 'Online Underwear',
  GRAPE: 'Online Underwear',
  'GROSIR DALAMANKU': 'Online Underwear',
  TAFT: 'Online Underwear',
  RASENDRIYA: 'Online Underwear',
  'SHINE PAJAMAS': 'Online Sport',
  'ACTIVE WEAR': 'Online Sport',
  'INSPORT IDN': 'Online Sport',
  'SHINE SPORT': 'Online Sport',
  'INGAT FASHION': 'Online Sport',
  'THE PEACH & CO': 'Online Sport',
}

function getBrandFromAccount(pelanggan) {
  if (!pelanggan) return null
  const parts = pelanggan.split(' / ')
  return parts.length > 1 ? parts.slice(1).join(' / ').trim() : pelanggan.trim()
}

function getCategoryForAccount(pelanggan) {
  const brand = getBrandFromAccount(pelanggan)
  return brand ? (DEFAULT_BRAND_CATEGORY[brand] || null) : null
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchBTData(id) {
  const url = id ? `/api/barang-terlaris-data?id=${encodeURIComponent(id)}` : '/api/barang-terlaris-data'
  const res = await fetch(url, { cache: 'no-store' })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || 'Gagal memuat data.')
  return body
}

// ─── Filter & aggregate helpers ───────────────────────────────────────────────

function aggregateRows(rawRows, { account, category, dateFrom, dateTo }, sortBy = 'kuantitas') {
  const byBarang = {}

  for (const r of rawRows) {
    // Date filter
    if (dateFrom && r.dateKey < dateFrom) continue
    if (dateTo   && r.dateKey > dateTo)   continue

    // Account filter
    if (account && r.pelanggan !== account) continue

    // Category filter
    if (category) {
      const cat = getCategoryForAccount(r.pelanggan)
      if (cat !== category) continue
    }

    if (!byBarang[r.namaBarang]) byBarang[r.namaBarang] = { kuantitas: 0, hargaProduk: 0 }
    byBarang[r.namaBarang].kuantitas   += r.kuantitas
    byBarang[r.namaBarang].hargaProduk += r.hargaProduk
  }

  const sortFn = sortBy === 'hargaProduk'
    ? (a, b) => b[1].hargaProduk - a[1].hargaProduk
    : sortBy === 'namaBarang'
    ? (a, b) => a[0].localeCompare(b[0], 'id')
    : (a, b) => b[1].kuantitas - a[1].kuantitas

  return Object.entries(byBarang)
    .sort(sortFn)
    .map(([namaBarang, v], i) => ({
      rank: i + 1,
      namaBarang,
      kuantitas: v.kuantitas,
      hargaProduk: v.hargaProduk,
    }))
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FilterBar({ accounts, filters, onChange }) {
  const categories = ['Online Underwear', 'Online Sport']

  return (
    <div className="bt-filter-bar">
      {/* Account filter */}
      <div className="period-picker-group">
        <label className="period-picker-label">Akun</label>
        <select
          className="category-select"
          value={filters.account}
          onChange={e => onChange({ ...filters, account: e.target.value, category: '' })}
        >
          <option value="">Semua akun</option>
          {accounts.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Category filter (only show if no specific account is selected) */}
      {!filters.account && (
        <div className="period-picker-group">
          <label className="period-picker-label">Kategori</label>
          <div className="pill-group">
            <button
              className={`pill-btn ${!filters.category ? 'is-active' : ''}`}
              style={!filters.category ? { background: 'var(--ink)', color: '#fff' } : {}}
              onClick={() => onChange({ ...filters, category: '' })}
            >
              Semua
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                className={`pill-btn ${filters.category === cat ? 'is-active' : ''} ${
                  cat.includes('Underwear') ? 'pill-underwear' : 'pill-sport'
                }`}
                onClick={() => onChange({ ...filters, category: filters.category === cat ? '' : cat })}
              >
                {cat.replace('Online ', '')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Date range filter */}
      <div className="period-picker-group">
        <label className="period-picker-label">Tanggal mulai</label>
        <input
          type="date"
          className="login-input bt-date-input"
          value={filters.dateFrom}
          onChange={e => onChange({ ...filters, dateFrom: e.target.value })}
        />
      </div>
      <div className="period-picker-group">
        <label className="period-picker-label">Tanggal akhir</label>
        <input
          type="date"
          className="login-input bt-date-input"
          value={filters.dateTo}
          onChange={e => onChange({ ...filters, dateTo: e.target.value })}
        />
      </div>

      {/* Reset button */}
      {(filters.account || filters.category || filters.dateFrom || filters.dateTo) && (
        <div className="period-picker-group" style={{ justifyContent: 'flex-end' }}>
          <button
            className="pill-btn"
            onClick={() => onChange({ account: '', category: '', dateFrom: '', dateTo: '' })}
          >
            ✕ Reset filter
          </button>
        </div>
      )}
    </div>
  )
}

function SortIcon({ active, asc = false }) {
  return (
    <span style={{ marginLeft: 4, opacity: active ? 1 : 0.25, fontSize: 11 }}>
      {active && asc ? '↑' : '↓'}
    </span>
  )
}

function HighlightText({ text, query }) {
  if (!query.trim()) return <>{text}</>
  const keyword = query.trim().toLowerCase()
  const idx = text.toLowerCase().indexOf(keyword)
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{
        background: '#fde68a',
        color: 'inherit',
        borderRadius: 2,
        padding: '0 2px',
      }}>
        {text.slice(idx, idx + keyword.length)}
      </mark>
      {text.slice(idx + keyword.length)}
    </>
  )
}

function BestSellerTable({ rows, loading, sortBy, onSortChange, searchQuery, onSearchChange }) {
  const totalKuantitas   = rows.reduce((s, r) => s + r.kuantitas, 0)
  const totalHargaProduk = rows.reduce((s, r) => s + r.hargaProduk, 0)

  const thSort = {
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  }

  return (
    <>
      {/* ── Search bar ── */}
      <div style={{ marginBottom: '0.75rem', position: 'relative' }}>
        <span style={{
          position: 'absolute',
          left: '0.75rem',
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 15,
          color: 'var(--muted, #888)',
          pointerEvents: 'none',
        }}>
          🔍
        </span>
        <input
          type="text"
          className="login-input"
          placeholder="Cari nama barang…"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          style={{ paddingLeft: '2.25rem', paddingRight: searchQuery ? '2.25rem' : undefined }}
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            style={{
              position: 'absolute',
              right: '0.6rem',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 16,
              color: 'var(--muted, #888)',
              lineHeight: 1,
              padding: '0 4px',
            }}
            title="Hapus pencarian"
          >
            ✕
          </button>
        )}
      </div>

      {loading && <p className="loading-text">Memuat data…</p>}

      {!loading && !rows.length && (
        <div className="upload-zone has-error" style={{ textAlign: 'center', padding: '2.5rem' }}>
          <p className="upload-title">Tidak ada produk ditemukan</p>
          <p className="upload-sub">
            {searchQuery
              ? `Tidak ada produk yang cocok dengan "${searchQuery}". Coba kata kunci lain.`
              : 'Coba ubah filter tanggal, akun, atau kategori.'}
          </p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          {/* ── Grand total summary ── */}
          <div style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '0.75rem',
            flexWrap: 'wrap',
          }}>
            <div style={{
              flex: 1,
              minWidth: 140,
              background: 'var(--surface-2, #f5f5f5)',
              borderRadius: 8,
              padding: '0.6rem 1rem',
            }}>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>Total Kuantitas</p>
              <p className="mono" style={{ fontSize: 18, fontWeight: 700, margin: '2px 0 0' }}>
                {totalKuantitas.toLocaleString('id-ID')}
              </p>
            </div>
            <div style={{
              flex: 1,
              minWidth: 140,
              background: 'var(--surface-2, #f5f5f5)',
              borderRadius: 8,
              padding: '0.6rem 1rem',
            }}>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>Total Harga Produk</p>
              <p className="mono" style={{ fontSize: 18, fontWeight: 700, margin: '2px 0 0' }}>
                {formatRupiah(totalHargaProduk)}
              </p>
            </div>
          </div>

          {/* ── Search result count ── */}
          {searchQuery.trim() && (
            <p className="period-note" style={{ marginBottom: '0.5rem', marginTop: 0 }}>
              Menampilkan {rows.length} produk untuk pencarian &ldquo;{searchQuery}&rdquo;
            </p>
          )}

          {/* ── Table ── */}
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <th
                    style={thSort}
                    onClick={() => onSortChange('namaBarang')}
                    title="Urutkan berdasarkan Nama Barang"
                  >
                    Nama Barang
                    <SortIcon active={sortBy === 'namaBarang'} asc={true} />
                  </th>
                  <th
                    style={{ ...thSort, textAlign: 'right' }}
                    onClick={() => onSortChange('kuantitas')}
                    title="Urutkan berdasarkan Kuantitas"
                  >
                    Kuantitas
                    <SortIcon active={sortBy === 'kuantitas'} />
                  </th>
                  <th
                    style={{ ...thSort, textAlign: 'right' }}
                    onClick={() => onSortChange('hargaProduk')}
                    title="Urutkan berdasarkan Harga Produk"
                  >
                    Harga Produk
                    <SortIcon active={sortBy === 'hargaProduk'} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.namaBarang}>
                    <td className="muted mono" style={{ textAlign: 'center' }}>{row.rank}</td>
                    <td style={{ fontWeight: 500 }}>
                      <HighlightText text={row.namaBarang} query={searchQuery} />
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {row.kuantitas.toLocaleString('id-ID')}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {formatRupiah(row.hargaProduk)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProdukTerlarisPage() {
  const [loggedIn, setLoggedIn]             = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [password, setPassword]             = useState('')
  const [loginError, setLoginError]         = useState(null)
  const [loginLoading, setLoginLoading]     = useState(false)

  // Periods
  const [periods, setPeriods]     = useState([])
  const [selectedId, setSelectedId] = useState('')  // '' = latest

  // Data
  const [payload, setPayload]   = useState(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError]     = useState(null)

  // Filters
  const [filters, setFilters] = useState({
    account:  '',
    category: '',
    dateFrom: '',
    dateTo:   '',
  })

  // Sort
  const [sortBy, setSortBy] = useState('kuantitas') // 'kuantitas' | 'hargaProduk' | 'namaBarang'

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  // ── Session check ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/session', { cache: 'no-store' })
      .then(async (res) => {
        setCheckingSession(false)
        if (!res.ok) return
        setLoggedIn(true)
        loadPeriods()
        loadData('')
      })
      .catch(() => setCheckingSession(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load periods ─────────────────────────────────────────────────────────────
  const loadPeriods = useCallback(async () => {
    const res = await fetch('/api/barang-terlaris-periods', { cache: 'no-store' })
    if (res.ok) setPeriods(await res.json())
  }, [])

  // ── Load data ─────────────────────────────────────────────────────────────────
  const loadData = useCallback(async (id) => {
    setDataLoading(true)
    setDataError(null)
    try {
      const d = await fetchBTData(id)
      setPayload(d)
    } catch (err) {
      setDataError(err.message)
      setPayload(null)
    } finally {
      setDataLoading(false)
    }
  }, [])

  const handlePeriodChange = useCallback((newId) => {
    setSelectedId(newId)
    loadData(newId)
  }, [loadData])

  // ── Login ─────────────────────────────────────────────────────────────────────
  const handleLogin = useCallback(async (e) => {
    e.preventDefault()
    setLoginError(null)
    setLoginLoading(true)
    try {
      const res = await fetch('/api/viewer-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Password salah.')
      setLoggedIn(true)
      await loadPeriods()
      await loadData('')
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setLoginLoading(false)
    }
  }, [password, loadPeriods, loadData])

  // ── Derived: apply filters to rawRows ─────────────────────────────────────────
  const analysis   = payload?.analysis
  const rawRows    = analysis?.rawRows || []
  const accounts   = analysis?.accounts || []

  // When period changes, reset date filters to the period's own range
  useEffect(() => {
    if (!analysis) return
    setFilters(f => ({
      ...f,
      dateFrom: f.dateFrom || analysis.firstDateKey || '',
      dateTo:   f.dateTo   || analysis.lastDateKey  || '',
    }))
  }, [analysis?.firstDateKey, analysis?.lastDateKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredRows = useMemo(() => {
    const aggregated = aggregateRows(rawRows, filters, sortBy)
    if (!searchQuery.trim()) return aggregated
    const keyword = searchQuery.trim().toLowerCase()
    return aggregated
      .filter(row => row.namaBarang.toLowerCase().includes(keyword))
      .map((row, i) => ({ ...row, rank: i + 1 }))
  }, [rawRows, filters, sortBy, searchQuery])

  // ── Active filter description ──────────────────────────────────────────────────
  const activeFilterDesc = useMemo(() => {
    const parts = []
    if (filters.account)  parts.push(`Akun: ${filters.account}`)
    if (filters.category) parts.push(`Kategori: ${filters.category}`)
    if (filters.dateFrom || filters.dateTo) {
      const from = filters.dateFrom || analysis?.firstDateKey || '…'
      const to   = filters.dateTo   || analysis?.lastDateKey  || '…'
      parts.push(`Tanggal: ${from} s.d. ${to}`)
    }
    return parts.length ? parts.join(' · ') : null
  }, [filters, analysis])

  // ── Render ────────────────────────────────────────────────────────────────────

  if (checkingSession) {
    return <div className="app-shell admin-login-shell"><p className="loading-text">Memeriksa sesi…</p></div>
  }

  if (!loggedIn) {
    return (
      <div className="app-shell admin-login-shell">
        <form className="login-card" onSubmit={handleLogin}>
          <p className="eyebrow">Produk Terlaris</p>
          <h1>Masukkan password tim untuk melihat</h1>
          <input
            type="password"
            placeholder="Password tim"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="login-input"
            autoFocus
          />
          {loginError && <p className="upload-error">{loginError}</p>}
          <button type="submit" className="btn-export" disabled={loginLoading}>
            {loginLoading ? 'Memeriksa…' : 'Masuk'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Dashboard penjualan</p>
          <h1>Produk Terlaris</h1>
        </div>
      </header>

      {/* ── Period picker ── */}
      {periods.length > 0 && (
        <div className="period-picker">
          <div className="period-picker-group">
            <label className="period-picker-label">Periode data</label>
            <select
              className="category-select"
              value={selectedId}
              onChange={e => handlePeriodChange(e.target.value)}
            >
              <option value="">Terbaru ({periods[0]?.label})</option>
              {periods.map(p => (
                <option key={p.id} value={p.id}>
                  {p.label} — {p.dateRange}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ── No data yet ── */}
      {!dataLoading && dataError && (
        <div className="upload-zone has-error">
          <p className="upload-title">Belum ada data untuk ditampilkan</p>
          <p className="upload-sub">{dataError}</p>
        </div>
      )}

      {/* ── Main content ── */}
      {!dataError && (
        <div className="table-block">
          {/* Header row */}
          <div className="table-block-header">
            <h3 className="block-title">Produk paling banyak terjual</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              {analysis && (
                <span className="muted" style={{ fontSize: 13 }}>
                  {analysis.periodLabel}
                  {payload?.savedAt && (
                    <> &middot; Diperbarui {new Date(payload.savedAt).toLocaleString('id-ID')}</>
                  )}
                </span>
              )}
              {filteredRows.length > 0 && (
                <button
                  className="btn-export"
                  style={{ padding: '7px 14px', fontSize: 13 }}
                  onClick={() => exportBarangTerlaris(filteredRows, {
                    periodLabel: analysis?.periodLabel,
                    filterDesc: activeFilterDesc,
                  })}
                >
                  ↓ Ekspor Excel
                </button>
              )}
            </div>
          </div>

          {/* Filter bar */}
          {analysis && (
            <FilterBar
              accounts={accounts}
              filters={filters}
              onChange={newFilters => setFilters(newFilters)}
            />
          )}

          {/* Active filter note */}
          {activeFilterDesc && (
            <p className="period-note" style={{ marginBottom: '0.75rem', marginTop: 0 }}>
              Filter aktif: {activeFilterDesc}
              {' '}({filteredRows.length} produk)
            </p>
          )}

          {/* Table */}
          <BestSellerTable
            rows={filteredRows}
            loading={dataLoading}
            sortBy={sortBy}
            onSortChange={setSortBy}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </div>
      )}
    </div>
  )
}
