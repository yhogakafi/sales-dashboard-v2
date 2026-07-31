'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatRupiah, formatDateLabel } from '@/lib/parseBarangTerlaris'
import { exportBarangTerlaris } from '@/lib/exportExcel'

// ─── Stock lookup helper ───────────────────────────────────────────────────────

function getStockInfo(kodeBarang, stockLookup) {
  if (!stockLookup || !kodeBarang) return { brand: '—', stock: 0, nama: null, hpp: 0, hasData: false }
  const data = stockLookup[kodeBarang]
  if (!data) return { brand: '—', stock: 0, nama: null, hpp: 0, hasData: false }
  return { brand: data.brand || '—', stock: data.stock ?? 0, nama: data.nama || null, hpp: data.hpp ?? 0, hasData: true }
}

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

// ─── "1 Bulan Terakhir" (rolling 30-day) helpers ──────────────────────────────
// Periode disimpan per bulan kalender (satu JSON per bulan), jadi window 30 hari
// bisa memotong 2 bulan sekaligus (mis. hari ini 10 Agustus → butuh Juli + Agustus).
// Solusinya: gabungkan rawRows dari 2 periode terbaru, lalu filter ulang by dateKey
// di client — tidak perlu ubah cara data disimpan.

function toDateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function last30DaysRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 29) // 30 hari termasuk hari ini
  return { dateFrom: toDateKey(from), dateTo: toDateKey(to) }
}

const ALL_MERGED_ID = 'all-merged'

// ─── Filter & aggregate helpers ───────────────────────────────────────────────

function passesFilters(r, { account, category, dateFrom, dateTo }) {
  if (dateFrom && r.dateKey < dateFrom) return false
  if (dateTo   && r.dateKey > dateTo)   return false
  if (account && r.pelanggan !== account) return false
  if (category) {
    const cat = getCategoryForAccount(r.pelanggan)
    if (cat !== category) return false
  }
  return true
}

function aggregateRows(rawRows, filters) {
  const byBarang = {}

  for (const r of rawRows) {
    if (!passesFilters(r, filters)) continue
    if (!byBarang[r.namaBarang]) {
      byBarang[r.namaBarang] = { kuantitas: 0, hargaProduk: 0, kodeBarang: r.kodeBarang || null }
    }
    byBarang[r.namaBarang].kuantitas   += r.kuantitas
    byBarang[r.namaBarang].hargaProduk += r.hargaProduk
    if (!byBarang[r.namaBarang].kodeBarang && r.kodeBarang) {
      byBarang[r.namaBarang].kodeBarang = r.kodeBarang
    }
  }

  return Object.entries(byBarang).map(([namaBarang, v]) => ({
    namaBarang,
    kodeBarang: v.kodeBarang,
    kuantitas: v.kuantitas,
    hargaProduk: v.hargaProduk,
  }))
}

// ─── Sales aggregated by kode (needed to match onto the stock master) ─────────

function aggregateSalesByKode(rawRows, filters) {
  const byKode     = {}  // { kode: { namaBarang, kuantitas, hargaProduk } } — rows that have a kodeBarang
  const byNamaOnly = {}  // { namaBarang: { kuantitas, hargaProduk } } — rows with no kodeBarang at all

  for (const r of rawRows) {
    if (!passesFilters(r, filters)) continue
    if (r.kodeBarang) {
      if (!byKode[r.kodeBarang]) {
        byKode[r.kodeBarang] = { namaBarang: r.namaBarang, kuantitas: 0, hargaProduk: 0 }
      }
      byKode[r.kodeBarang].kuantitas   += r.kuantitas
      byKode[r.kodeBarang].hargaProduk += r.hargaProduk
    } else {
      if (!byNamaOnly[r.namaBarang]) {
        byNamaOnly[r.namaBarang] = { kuantitas: 0, hargaProduk: 0 }
      }
      byNamaOnly[r.namaBarang].kuantitas   += r.kuantitas
      byNamaOnly[r.namaBarang].hargaProduk += r.hargaProduk
    }
  }

  return { byKode, byNamaOnly }
}

// ─── Stock-first row builder ───────────────────────────────────────────────
// Starts from every SKU in the stock master (underwear + sport), then matches
// in sales data by kodeBarang. Stock SKUs with no matching sales keep
// kuantitas/hargaProduk at 0 instead of being left out.

function buildStockFirstRows(rawRows, filters, stockLookup) {
  const { byKode, byNamaOnly } = aggregateSalesByKode(rawRows, filters)
  const consumedKodes = new Set()
  const rows = []

  // 1. Every SKU from the stock master, always shown — even with zero sales.
  for (const [kode, stockEntry] of Object.entries(stockLookup)) {
    const sales = byKode[kode]
    consumedKodes.add(kode)
    rows.push({
      namaBarang: sales?.namaBarang || stockEntry.nama || kode,
      kodeBarang: kode,
      kuantitas: sales?.kuantitas || 0,
      hargaProduk: sales?.hargaProduk || 0,
    })
  }

  // 2. Sold items whose kode isn't in the current stock master (e.g. stock file
  //    is out of date) — keep them visible too, just without brand/stock info.
  for (const [kode, sales] of Object.entries(byKode)) {
    if (consumedKodes.has(kode)) continue
    rows.push({
      namaBarang: sales.namaBarang,
      kodeBarang: kode,
      kuantitas: sales.kuantitas,
      hargaProduk: sales.hargaProduk,
    })
  }

  // 3. Sold items with no kodeBarang at all — can't be matched to stock.
  for (const [namaBarang, sales] of Object.entries(byNamaOnly)) {
    rows.push({
      namaBarang,
      kodeBarang: null,
      kuantitas: sales.kuantitas,
      hargaProduk: sales.hargaProduk,
    })
  }

  return rows
}

// ─── Stock enrichment (adds brand/stock so they can be filtered & sorted) ─────

function enrichWithStock(rows, stockLookup) {
  return rows.map(r => {
    const si = getStockInfo(r.kodeBarang, stockLookup)
    return { ...r, brand: si.brand, stock: si.stock, hasStockData: si.hasData, hpp: si.hpp, totalHpp: si.hpp * si.stock }
  })
}

// ─── Sorting ────────────────────────────────────────────────────────────────

function sortRows(rows, sortBy) {
  const sorted = [...rows]
  if (sortBy === 'hargaProduk') {
    sorted.sort((a, b) => b.hargaProduk - a.hargaProduk)
  } else if (sortBy === 'namaBarang') {
    sorted.sort((a, b) => a.namaBarang.localeCompare(b.namaBarang, 'id'))
  } else if (sortBy === 'kodeBarang') {
    sorted.sort((a, b) => {
      if (!a.kodeBarang && b.kodeBarang) return 1
      if (!b.kodeBarang && a.kodeBarang) return -1
      if (!a.kodeBarang && !b.kodeBarang) return 0
      return a.kodeBarang.localeCompare(b.kodeBarang, 'id')
    })
  } else if (sortBy === 'brand') {
    sorted.sort((a, b) => {
      if (a.brand === '—' && b.brand !== '—') return 1
      if (b.brand === '—' && a.brand !== '—') return -1
      return a.brand.localeCompare(b.brand, 'id')
    })
  } else if (sortBy === 'stock') {
    sorted.sort((a, b) => b.stock - a.stock)
  } else {
    sorted.sort((a, b) => b.kuantitas - a.kuantitas)
  }
  return sorted
}

// ─── Column filter definitions ────────────────────────────────────────────────

const TEXT_OPS = [
  { value: 'contains',        label: 'Mengandung' },
  { value: 'not_contains',    label: 'Tidak mengandung' },
  { value: 'equals',          label: 'Sama dengan' },
  { value: 'not_equals',      label: 'Tidak sama dengan' },
  { value: 'starts_with',     label: 'Dimulai dengan' },
  { value: 'ends_with',       label: 'Diakhiri dengan' },
  { value: 'is_empty',        label: 'Kosong' },
  { value: 'is_not_empty',    label: 'Tidak kosong' },
]

const NUM_OPS = [
  { value: 'eq',      label: '= Sama dengan' },
  { value: 'neq',     label: '≠ Tidak sama dengan' },
  { value: 'gt',      label: '> Lebih dari' },
  { value: 'gte',     label: '≥ Lebih dari atau sama dengan' },
  { value: 'lt',      label: '< Kurang dari' },
  { value: 'lte',     label: '≤ Kurang dari atau sama dengan' },
  { value: 'between', label: '↔ Di antara' },
]

const EMPTY_COL_FILTER = { op: '', value: '', value2: '' }

function applyColFilter(rows, colFilters) {
  return rows.filter(row => {
    for (const [col, f] of Object.entries(colFilters)) {
      if (!f.op) continue
      const noVal = ['is_empty', 'is_not_empty'].includes(f.op)
      if (!noVal && f.value === '' && f.op !== 'between') continue
      if (f.op === 'between' && f.value === '' && f.value2 === '') continue

      if (col === 'namaBarang' || col === 'brand' || col === 'kodeBarang') {
        const rawCell = col === 'namaBarang' ? row.namaBarang
          : col === 'brand' ? row.brand
          : row.kodeBarang
        const cell = (!rawCell || rawCell === '—' ? '' : rawCell).toLowerCase()
        const val  = f.value.toLowerCase()
        if (f.op === 'contains'     && !cell.includes(val))    return false
        if (f.op === 'not_contains' && cell.includes(val))     return false
        if (f.op === 'equals'       && cell !== val)           return false
        if (f.op === 'not_equals'   && cell === val)           return false
        if (f.op === 'starts_with'  && !cell.startsWith(val))  return false
        if (f.op === 'ends_with'    && !cell.endsWith(val))    return false
        if (f.op === 'is_empty'     && cell.trim() !== '')     return false
        if (f.op === 'is_not_empty' && cell.trim() === '')     return false
      } else {
        const cell = row[col]
        const val  = parseFloat(f.value)
        const val2 = parseFloat(f.value2)
        if (f.op === 'eq'      && cell !== val)              return false
        if (f.op === 'neq'     && cell === val)              return false
        if (f.op === 'gt'      && !(cell > val))             return false
        if (f.op === 'gte'     && !(cell >= val))            return false
        if (f.op === 'lt'      && !(cell < val))             return false
        if (f.op === 'lte'     && !(cell <= val))            return false
        if (f.op === 'between' && !(cell >= val && cell <= val2)) return false
      }
    }
    return true
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FilterBar({ accounts, filters, onChange, onQuickLast30Days }) {
  const categories = ['Online Underwear', 'Online Sport']

  return (
    <div className="bt-filter-bar">
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

      <div className="period-picker-group" style={{ justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="pill-btn"
          onClick={onQuickLast30Days}
          title="Gabungkan semua periode & set tanggal ke 30 hari terakhir"
        >
          30 hari terakhir
        </button>
      </div>

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
      <mark style={{ background: '#fde68a', color: 'inherit', borderRadius: 2, padding: '0 2px' }}>
        {text.slice(idx, idx + keyword.length)}
      </mark>
      {text.slice(idx + keyword.length)}
    </>
  )
}

// ── Column filter popover ─────────────────────────────────────────────────────

function ColFilterPopover({ col, filter, onChange, onClose, anchorRef }) {
  const isText  = col === 'namaBarang' || col === 'brand' || col === 'kodeBarang'
  const ops     = isText ? TEXT_OPS : NUM_OPS
  const ref     = useRef(null)

  // Close on outside click
  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target) &&
          anchorRef.current && !anchorRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [onClose, anchorRef])

  const noValueOps  = ['is_empty', 'is_not_empty']
  const isBetween   = filter.op === 'between'
  const hideInput   = noValueOps.includes(filter.op)

  const inputStyle = {
    width: '100%', padding: '6px 10px', borderRadius: 6,
    border: '1px solid var(--border, #ddd)',
    background: 'var(--surface, #fff)',
    color: 'var(--ink, #111)',
    fontSize: 13, marginTop: 6, boxSizing: 'border-box',
  }

  return (
    <div ref={ref} style={{
      position: 'absolute',
      top: '100%',
      left: 0,
      zIndex: 200,
      background: 'var(--surface, #fff)',
      border: '1px solid var(--border, #ddd)',
      borderRadius: 10,
      boxShadow: '0 8px 24px rgba(0,0,0,.12)',
      padding: '0.85rem',
      minWidth: 240,
      marginTop: 4,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Op selector */}
      <select
        value={filter.op}
        onChange={e => onChange({ ...filter, op: e.target.value, value: '', value2: '' })}
        style={{ ...inputStyle, marginTop: 0 }}
      >
        <option value="">— Pilih kondisi —</option>
        {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {/* Value input(s) */}
      {filter.op && !hideInput && (
        <>
          <input
            type={isText ? 'text' : 'number'}
            placeholder={isBetween ? 'Nilai minimum' : 'Nilai'}
            value={filter.value}
            onChange={e => onChange({ ...filter, value: e.target.value })}
            style={inputStyle}
            autoFocus
          />
          {isBetween && (
            <input
              type="number"
              placeholder="Nilai maksimum"
              value={filter.value2}
              onChange={e => onChange({ ...filter, value2: e.target.value })}
              style={inputStyle}
            />
          )}
        </>
      )}

      {/* Footer buttons */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
        <button
          onClick={() => { onChange(EMPTY_COL_FILTER); onClose() }}
          style={{
            padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border, #ddd)',
            background: 'none', cursor: 'pointer', fontSize: 12,
            color: 'var(--muted, #888)',
          }}
        >
          Hapus
        </button>
        <button
          onClick={onClose}
          style={{
            padding: '5px 12px', borderRadius: 6, border: 'none',
            background: 'var(--ink, #111)', color: '#fff',
            cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}
        >
          Terapkan
        </button>
      </div>
    </div>
  )
}

// ── Column header with sort + filter ─────────────────────────────────────────

function ColHeader({ col, label, align = 'left', sortBy, onSortChange, colFilters, onColFilterChange }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const filter  = colFilters[col] || EMPTY_COL_FILTER
  const isActive = !!(filter.op && (
    ['is_empty', 'is_not_empty'].includes(filter.op) || filter.value !== ''
  ))

  return (
    <th
      style={{
        textAlign: align,
        whiteSpace: 'nowrap',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* Sort trigger (whole cell minus filter btn) */}
      <span
        onClick={() => onSortChange(col)}
        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2 }}
        title={`Urutkan berdasarkan ${label}`}
      >
        {align === 'right' && <SortIcon active={sortBy === col} />}
        {label}
        {align === 'left'  && <SortIcon active={sortBy === col} asc={true} />}
      </span>

      {/* Filter button */}
      <button
        ref={btnRef}
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        title="Filter kolom"
        style={{
          marginLeft: 5,
          padding: '1px 5px',
          borderRadius: 4,
          border: `1px solid ${isActive ? 'var(--accent-2, #6366f1)' : 'var(--border, #ddd)'}`,
          background: isActive ? 'var(--accent-2, #6366f1)' : 'transparent',
          color: isActive ? '#fff' : 'var(--muted, #888)',
          cursor: 'pointer',
          fontSize: 11,
          lineHeight: 1.4,
          verticalAlign: 'middle',
        }}
      >
        {isActive ? '▼●' : '▼'}
      </button>

      {/* Popover */}
      {open && (
        <ColFilterPopover
          col={col}
          filter={filter}
          onChange={f => onColFilterChange(col, f)}
          onClose={() => setOpen(false)}
          anchorRef={btnRef}
        />
      )}
    </th>
  )
}

// ── Main table component ──────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [
  { value: 50,  label: '50' },
  { value: 100, label: '100' },
  { value: 200, label: '200' },
  { value: 'all', label: 'Semua' },
]

function Pagination({ page, totalPages, pageSize, onPageChange, onPageSizeChange, totalRows }) {
  const startRow = totalRows === 0 ? 0 : (page - 1) * (pageSize === 'all' ? totalRows : pageSize) + 1
  const endRow   = pageSize === 'all' ? totalRows : Math.min(page * pageSize, totalRows)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: '0.6rem', marginTop: '0.75rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-muted)' }}>
        <span>Baris per halaman</span>
        <select
          value={pageSize}
          onChange={e => {
            const raw = e.target.value
            onPageSizeChange(raw === 'all' ? 'all' : Number(raw))
          }}
          style={{
            padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border, #ddd)',
            background: 'var(--surface, #fff)', fontSize: 13, cursor: 'pointer',
          }}
        >
          {PAGE_SIZE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <span className="mono">
          {totalRows === 0 ? '0' : `${startRow}–${endRow}`} dari {totalRows}
        </span>
      </div>

      {pageSize !== 'all' && totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
            style={pagerBtnStyle(page <= 1)}
            title="Halaman pertama"
          >«</button>
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            style={pagerBtnStyle(page <= 1)}
            title="Sebelumnya"
          >‹</button>
          <span className="mono" style={{ fontSize: 13, padding: '0 4px' }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            style={pagerBtnStyle(page >= totalPages)}
            title="Berikutnya"
          >›</button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
            style={pagerBtnStyle(page >= totalPages)}
            title="Halaman terakhir"
          >»</button>
        </div>
      )}
    </div>
  )
}

function pagerBtnStyle(disabled) {
  return {
    padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border, #ddd)',
    background: disabled ? 'var(--surface-2, #f5f5f5)' : 'var(--surface, #fff)',
    color: disabled ? 'var(--ink-muted)' : 'var(--ink)',
    cursor: disabled ? 'default' : 'pointer', fontSize: 14, lineHeight: 1,
  }
}

function BestSellerTable({
  rows, loading, sortBy, onSortChange,
  searchQuery, onSearchChange,
  colFilters, onColFilterChange,
  stockLookup,
}) {
  const totalKuantitas   = rows.reduce((s, r) => s + r.kuantitas, 0)
  const totalHargaProduk = rows.reduce((s, r) => s + r.hargaProduk, 0)
  const totalHpp         = rows.reduce((s, r) => s + (r.totalHpp || 0), 0)
  const totalStockPcs    = rows.reduce((s, r) => s + (r.stock || 0), 0)
  const hasStock = stockLookup !== null

  const colHeaderProps = { sortBy, onSortChange, colFilters, onColFilterChange }

  // ── Pagination (client-side; slices the already-filtered `rows`) ──
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(1)

  // Reset to page 1 whenever the underlying row set changes (new filter, search, sort…)
  useEffect(() => {
    setPage(1)
  }, [rows])

  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = pageSize === 'all'
    ? rows
    : rows.slice((safePage - 1) * pageSize, safePage * pageSize)

  return (
    <>
      {/* ── Search bar ── */}
      <div style={{ marginBottom: '0.75rem', position: 'relative' }}>
        <span style={{
          position: 'absolute', left: '0.75rem', top: '50%',
          transform: 'translateY(-50%)', fontSize: 15,
          color: 'var(--muted, #888)', pointerEvents: 'none',
        }}>🔍</span>
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
              position: 'absolute', right: '0.6rem', top: '50%',
              transform: 'translateY(-50%)', background: 'none', border: 'none',
              cursor: 'pointer', fontSize: 16, color: 'var(--muted, #888)',
              lineHeight: 1, padding: '0 4px',
            }}
            title="Hapus pencarian"
          >✕</button>
        )}
      </div>

      {loading && <p className="loading-text">Memuat data…</p>}

      {!loading && !rows.length && (
        <div className="upload-zone has-error" style={{ textAlign: 'center', padding: '2.5rem' }}>
          <p className="upload-title">Tidak ada produk ditemukan</p>
          <p className="upload-sub">
            {searchQuery
              ? `Tidak ada produk yang cocok dengan "${searchQuery}". Coba kata kunci lain.`
              : 'Coba ubah filter kolom, tanggal, akun, atau kategori.'}
          </p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          {/* ── Grand total summary ── */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{
              flex: 1, minWidth: 140,
              background: 'var(--surface-2, #f5f5f5)', borderRadius: 8, padding: '0.6rem 1rem',
            }}>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>Total Kuantitas</p>
              <p className="mono" style={{ fontSize: 18, fontWeight: 700, margin: '2px 0 0' }}>
                {totalKuantitas.toLocaleString('id-ID')}
              </p>
            </div>
            <div style={{
              flex: 1, minWidth: 140,
              background: 'var(--surface-2, #f5f5f5)', borderRadius: 8, padding: '0.6rem 1rem',
            }}>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>Total Harga Produk</p>
              <p className="mono" style={{ fontSize: 18, fontWeight: 700, margin: '2px 0 0' }}>
                {formatRupiah(totalHargaProduk)}
              </p>
            </div>
            {hasStock && (
              <>
                <div style={{
                  flex: 1, minWidth: 140,
                  background: 'var(--surface-2, #f5f5f5)', borderRadius: 8, padding: '0.6rem 1rem',
                }}>
                  <p className="muted" style={{ fontSize: 12, margin: 0 }}>Total HPP</p>
                  <p className="mono" style={{ fontSize: 18, fontWeight: 700, margin: '2px 0 0' }}>
                    {formatRupiah(totalHpp)}
                  </p>
                </div>
                <div style={{
                  flex: 1, minWidth: 140,
                  background: 'var(--surface-2, #f5f5f5)', borderRadius: 8, padding: '0.6rem 1rem',
                }}>
                  <p className="muted" style={{ fontSize: 12, margin: 0 }}>Stock PCS</p>
                  <p className="mono" style={{ fontSize: 18, fontWeight: 700, margin: '2px 0 0' }}>
                    {totalStockPcs.toLocaleString('id-ID')}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* ── Search result count ── */}
          {searchQuery.trim() && (
            <p className="period-note" style={{ marginBottom: '0.5rem', marginTop: 0 }}>
              Menampilkan {rows.length} produk untuk pencarian &ldquo;{searchQuery}&rdquo;
            </p>
          )}

          {!hasStock && (
            <p className="period-note" style={{ marginBottom: '0.5rem', color: 'var(--ink-muted)' }}>
              ℹ️ Data stock belum diupload. Upload file stock di halaman Admin untuk melihat kolom Brand dan Stock.
            </p>
          )}

          {/* ── Table ── */}
          <div className="table-scroll" style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <ColHeader col="kodeBarang"   label="Kode Barang"   align="left"  {...colHeaderProps} />
                  <ColHeader col="namaBarang"   label="Nama Barang"   align="left"  {...colHeaderProps} />
                  {hasStock && <ColHeader col="brand" label="Brand" align="left"  {...colHeaderProps} />}
                  <ColHeader col="kuantitas"    label="Kuantitas"     align="right" {...colHeaderProps} />
                  <ColHeader col="hargaProduk"  label="Harga Produk"  align="right" {...colHeaderProps} />
                  {hasStock && <ColHeader col="stock" label="Stock" align="right" {...colHeaderProps} />}
                  {hasStock && <ColHeader col="hpp" label="HPP PCS" align="right" {...colHeaderProps} />}
                  {hasStock && <ColHeader col="totalHpp" label="Total HPP" align="right" {...colHeaderProps} />}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const si = hasStock ? { brand: row.brand, stock: row.stock, hasData: row.hasStockData } : null
                  return (
                    <tr key={row.kodeBarang ? `k-${row.kodeBarang}` : `r-${row.rank}`}>
                      <td className="muted mono" style={{ textAlign: 'center' }}>{row.rank}</td>
                      <td className="muted mono" style={{ whiteSpace: 'nowrap' }}>
                        {row.kodeBarang || '—'}
                      </td>
                      <td style={{ fontWeight: 500 }}>
                        <HighlightText text={row.namaBarang} query={searchQuery} />
                      </td>
                      {hasStock && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {si.brand !== '—'
                            ? <span className="badge-brand">{si.brand}</span>
                            : <span className="muted">—</span>}
                        </td>
                      )}
                      <td className="mono" style={{ textAlign: 'right' }}>
                        {row.kuantitas.toLocaleString('id-ID')}
                      </td>
                      <td className="mono" style={{ textAlign: 'right' }}>
                        {formatRupiah(row.hargaProduk)}
                      </td>
                      {hasStock && (
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {si.hasData
                            ? <span style={{ color: si.stock === 0 ? 'var(--accent, #D85A30)' : 'inherit' }}>
                                {si.stock.toLocaleString('id-ID')}
                              </span>
                            : <span className="muted">0</span>}
                        </td>
                      )}
                      {hasStock && (
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {row.hpp ? formatRupiah(row.hpp) : <span className="muted">—</span>}
                        </td>
                      )}
                      {hasStock && (
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {row.totalHpp ? formatRupiah(row.totalHpp) : <span className="muted">—</span>}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            page={safePage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            totalRows={rows.length}
          />
        </>
      )}
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProdukTerlarisPage() {
  const [loggedIn, setLoggedIn]               = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [password, setPassword]               = useState('')
  const [loginError, setLoginError]           = useState(null)
  const [loginLoading, setLoginLoading]       = useState(false)

  // Periods
  const [periods, setPeriods]       = useState([])
  const [selectedId, setSelectedId] = useState('')

  // Data
  const [payload, setPayload]         = useState(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError]     = useState(null)

  // Date / account / category filters
  const [filters, setFilters] = useState({
    account:  '',
    category: '',
    dateFrom: '',
    dateTo:   '',
  })

  // Sort
  const [sortBy, setSortBy] = useState('kuantitas')

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  // Column filters — { namaBarang: {op,value,value2}, kuantitas: {...}, hargaProduk: {...} }
  const [colFilters, setColFilters] = useState({})

  // Stock lookup: { kodeBarang: { brand, stock } } — digabung dari underwear + sport
  const [stockLookup, setStockLookup] = useState(null)

  const handleColFilterChange = useCallback((col, f) => {
    setColFilters(prev => ({ ...prev, [col]: f }))
  }, [])

  const loadStock = useCallback(async () => {
    try {
      const res = await fetch('/api/stock-data', { cache: 'no-store' })
      if (!res.ok) return
      const body = await res.json()
      setStockLookup(body.byKodePenuh || {})
    } catch {
      // Stock tidak kritis — kalau gagal, kolom tetap tampil dengan nilai 0/—
    }
  }, [])

  // ── Session check ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/session', { cache: 'no-store' })
      .then(async (res) => {
        setCheckingSession(false)
        if (!res.ok) return
        setLoggedIn(true)
        loadPeriods()
        loadData('')
        loadStock()
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

  // "Semua Periode (gabungan)" — gabungkan rawRows dari SEMUA periode (JSON bulan)
  // yang tersimpan jadi satu pool. Setelah ini, filter Tanggal mulai/akhir yang
  // sudah ada bisa dipakai bebas untuk rentang berapa pun (30 hari, 60 hari, dst)
  // tanpa dibatasi cuma 2 periode terbaru. Optional dateRangeOverride dipakai oleh
  // tombol preset "30 hari terakhir" supaya bisa switch pool + set tanggal sekaligus.
  const loadAllPeriodsMerged = useCallback(async (periodList, dateRangeOverride) => {
    setDataLoading(true)
    setDataError(null)
    try {
      const idsToFetch = periodList.map(p => p.id) // semua periode tersimpan
      if (idsToFetch.length === 0) {
        throw new Error('Belum ada periode data yang tersimpan.')
      }

      const results = await Promise.all(idsToFetch.map(id => fetchBTData(id)))

      const rawRows  = results.flatMap(r => r?.analysis?.rawRows || [])
      const accounts = Array.from(new Set(results.flatMap(r => r?.analysis?.accounts || [])))

      if (!rawRows.length) {
        throw new Error('Tidak ada transaksi pada periode yang tersimpan.')
      }

      const sortedKeys   = rawRows.map(r => r.dateKey).sort()
      const firstDateKey = sortedKeys[0]
      const lastDateKey  = sortedKeys[sortedKeys.length - 1]

      setPayload({
        periodId: ALL_MERGED_ID,
        analysis: {
          rawRows,
          accounts,
          firstDateKey,
          lastDateKey,
          periodLabel: `Semua Periode (gabungan) — ${formatDateLabel(firstDateKey)} – ${formatDateLabel(lastDateKey)}`,
        },
      })

      if (dateRangeOverride) {
        setFilters(f => ({ ...f, dateFrom: dateRangeOverride.dateFrom, dateTo: dateRangeOverride.dateTo }))
      }
    } catch (err) {
      setDataError(err.message)
      setPayload(null)
    } finally {
      setDataLoading(false)
    }
  }, [])

  const handlePeriodChange = useCallback((newId) => {
    setSelectedId(newId)
    if (newId === ALL_MERGED_ID) {
      loadAllPeriodsMerged(periods)
    } else {
      loadData(newId)
    }
  }, [loadData, loadAllPeriodsMerged, periods])

  // Preset "30 hari terakhir" — tombol di sebelah filter tanggal manual (bukan
  // opsi dropdown), supaya tidak ada 2 kontrol yang rebutan makna atas
  // filters.dateFrom/dateTo. Ini cuma mengisi tanggal seperti kalau user
  // ketik manual, sekali pakai — bukan mode yang "menempel" terus di dropdown.
  const handleQuickLast30Days = useCallback(() => {
    const range = last30DaysRange()
    if (selectedId === ALL_MERGED_ID) {
      setFilters(f => ({ ...f, dateFrom: range.dateFrom, dateTo: range.dateTo }))
    } else {
      setSelectedId(ALL_MERGED_ID)
      loadAllPeriodsMerged(periods, range)
    }
  }, [selectedId, periods, loadAllPeriodsMerged])

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
      loadStock()
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setLoginLoading(false)
    }
  }, [password, loadPeriods, loadData, loadStock])

  // ── Derived data ──────────────────────────────────────────────────────────────
  const analysis = payload?.analysis
  const rawRows  = analysis?.rawRows  || []
  const accounts = analysis?.accounts || []
  const hasStock = stockLookup !== null

  useEffect(() => {
    if (!analysis) return
    setFilters(f => ({
      ...f,
      dateFrom: f.dateFrom || analysis.firstDateKey || '',
      dateTo:   f.dateTo   || analysis.lastDateKey  || '',
    }))
  }, [analysis?.firstDateKey, analysis?.lastDateKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredRows = useMemo(() => {
    const hasStockMaster = !!stockLookup && Object.keys(stockLookup).length > 0

    // 1. base rows — every stock SKU first (matched with sales by kode), or the
    //    old sales-grouped view if no stock master has been uploaded yet
    let rows = hasStockMaster
      ? buildStockFirstRows(rawRows, filters, stockLookup)
      : aggregateRows(rawRows, filters)

    // 2. merge in brand/stock so they can be filtered & sorted like any other column
    rows = enrichWithStock(rows, stockLookup)

    // 3. global search (substring, case-insensitive)
    if (searchQuery.trim()) {
      const kw = searchQuery.trim().toLowerCase()
      rows = rows.filter(r => r.namaBarang.toLowerCase().includes(kw))
    }

    // 4. column filters (namaBarang, brand, kuantitas, hargaProduk, stock)
    rows = applyColFilter(rows, colFilters)

    // 5. sort
    rows = sortRows(rows, sortBy)

    // 6. re-rank after all filters
    return rows.map((r, i) => ({ ...r, rank: i + 1 }))
  }, [rawRows, filters, sortBy, searchQuery, colFilters, stockLookup])

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
    // add active column filters
    const colLabels = {
      kodeBarang: 'Kode Barang', namaBarang: 'Nama Barang', kuantitas: 'Kuantitas', hargaProduk: 'Harga Produk',
      brand: 'Brand', stock: 'Stock',
    }
    for (const [col, f] of Object.entries(colFilters)) {
      if (!f.op) continue
      const noVal = ['is_empty', 'is_not_empty'].includes(f.op)
      if (!noVal && f.value === '' && f.op !== 'between') continue
      const opLabel = [...TEXT_OPS, ...NUM_OPS].find(o => o.value === f.op)?.label || f.op
      const valPart = noVal ? '' : f.op === 'between' ? ` ${f.value}–${f.value2}` : ` "${f.value}"`
      parts.push(`${colLabels[col]}: ${opLabel}${valPart}`)
    }
    return parts.length ? parts.join(' · ') : null
  }, [filters, analysis, colFilters])

  // Count active column filters for badge
  const activeColFilterCount = useMemo(() => {
    return Object.values(colFilters).filter(f => {
      if (!f.op) return false
      if (['is_empty', 'is_not_empty'].includes(f.op)) return true
      return f.value !== ''
    }).length
  }, [colFilters])

  const resetColFilters = () => setColFilters({})

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
              <option value={ALL_MERGED_ID}>Semua Periode (gabungan)</option>
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
              {activeColFilterCount > 0 && (
                <button
                  className="pill-btn"
                  onClick={resetColFilters}
                  style={{
                    background: 'var(--accent-2, #6366f1)',
                    color: '#fff',
                    border: 'none',
                    fontSize: 12,
                  }}
                >
                  ✕ Reset filter kolom ({activeColFilterCount})
                </button>
              )}
              {filteredRows.length > 0 && (
                <button
                  className="btn-export"
                  style={{ padding: '7px 14px', fontSize: 13 }}
                  onClick={() => exportBarangTerlaris(filteredRows, {
                    periodLabel: analysis?.periodLabel,
                    filterDesc: activeFilterDesc,
                    hasStock,
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
              onQuickLast30Days={handleQuickLast30Days}
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
            colFilters={colFilters}
            onColFilterChange={handleColFilterChange}
            stockLookup={stockLookup}
          />
        </div>
      )}
    </div>
  )
}
