'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatRupiah, formatDateLabel } from '@/lib/parseBarangTerlaris'
import { exportBarangTerlaris } from '@/lib/exportExcel'
import { parseSkuImageFile, lookupSkuImage } from '@/lib/parseSkuImage'

// ─── Stock lookup helper ───────────────────────────────────────────────────────

// stockLookup[kode] sekarang berbentuk { underwear: entryOrNull, sport: entryOrNull }
// — dipisah per sumber (bukan digabung jadi satu), supaya kode yang kebetulan
// ada di kedua file (mis. underwear.xls yang sebetulnya inventaris lengkap)
// bisa ditangani sesuai konteks: gabung saat "Semua", pisah saat kategori dipilih.
function getStockInfo(kodeBarang, stockLookup, category) {
  if (!stockLookup || !kodeBarang) return { brand: '—', stock: 0, unit: '', nama: null, hpp: 0, hasData: false }
  const entry = stockLookup[kodeBarang]
  if (!entry) return { brand: '—', stock: 0, unit: '', nama: null, hpp: 0, hasData: false }

  const wantedSource = category ? CATEGORY_TO_STOCK_SOURCE[category] : null

  if (wantedSource) {
    const data = entry[wantedSource]
    if (!data) return { brand: '—', stock: 0, unit: '', nama: null, hpp: 0, hasData: false }
    return { brand: data.brand || '—', stock: data.stock ?? 0, unit: data.unit || '', nama: data.nama || null, hpp: data.hpp ?? 0, hasData: true }
  }

  // "Semua" — gabungkan stock dari kedua sumber
  const u = entry.underwear
  const s = entry.sport
  if (u && s) {
    const combinedStock = (u.stock || 0) + (s.stock || 0)
    const combinedValue = (u.hpp || 0) * (u.stock || 0) + (s.hpp || 0) * (s.stock || 0)
    const combinedHpp = combinedStock > 0 ? combinedValue / combinedStock : 0
    return { brand: u.brand || s.brand || '—', stock: combinedStock, unit: u.unit || s.unit || '', nama: u.nama || s.nama || null, hpp: combinedHpp, hasData: true }
  }
  const only = u || s
  return { brand: only.brand || '—', stock: only.stock ?? 0, unit: only.unit || '', nama: only.nama || null, hpp: only.hpp ?? 0, hasData: true }
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
  if (dateTo && r.dateKey > dateTo) return false
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
    byBarang[r.namaBarang].kuantitas += r.kuantitas
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
  const byKode = {}  // { kode: { namaBarang, kuantitas, hargaProduk } } — rows that have a kodeBarang
  const byNamaOnly = {}  // { namaBarang: { kuantitas, hargaProduk } } — rows with no kodeBarang at all

  for (const r of rawRows) {
    if (!passesFilters(r, filters)) continue
    if (r.kodeBarang) {
      if (!byKode[r.kodeBarang]) {
        byKode[r.kodeBarang] = { namaBarang: r.namaBarang, kuantitas: 0, hargaProduk: 0 }
      }
      byKode[r.kodeBarang].kuantitas += r.kuantitas
      byKode[r.kodeBarang].hargaProduk += r.hargaProduk
    } else {
      if (!byNamaOnly[r.namaBarang]) {
        byNamaOnly[r.namaBarang] = { kuantitas: 0, hargaProduk: 0 }
      }
      byNamaOnly[r.namaBarang].kuantitas += r.kuantitas
      byNamaOnly[r.namaBarang].hargaProduk += r.hargaProduk
    }
  }

  return { byKode, byNamaOnly }
}

// ─── Stock-first row builder ───────────────────────────────────────────────
// Starts from every SKU in the stock master (underwear + sport), then matches
// in sales data by kodeBarang. Stock SKUs with no matching sales keep
// kuantitas/hargaProduk at 0 instead of being left out.

// Kategori pill ('Online Underwear' / 'Online Sport') → source di stock master.
const CATEGORY_TO_STOCK_SOURCE = {
  'Online Underwear': 'underwear',
  'Online Sport': 'sport',
}

function buildStockFirstRows(rawRows, filters, stockLookup) {
  const { byKode, byNamaOnly } = aggregateSalesByKode(rawRows, filters)
  const consumedKodes = new Set()
  const rows = []

  // Kalau pill kategori aktif, batasi SKU stock yang ditampilkan ke sumber file
  // yang sesuai (underwear.json / sport.json) — bukan cuma memfilter penjualannya.
  const wantedSource = filters.category ? CATEGORY_TO_STOCK_SOURCE[filters.category] : null

  // 1. Every SKU from the stock master, always shown — even with zero sales.
  for (const [kode, stockEntry] of Object.entries(stockLookup)) {
    if (wantedSource && !stockEntry[wantedSource]) continue
    const sales = byKode[kode]
    consumedKodes.add(kode)
    // stockEntry sekarang { underwear, sport } (dipisah per sumber) — ambil nama
    // dari sumber yang sedang aktif kalau ada pill kategori, atau dari sumber
    // manapun yang punya datanya kalau "Semua".
    const stockNama = wantedSource
      ? stockEntry[wantedSource]?.nama
      : (stockEntry.underwear?.nama || stockEntry.sport?.nama)
    rows.push({
      namaBarang: sales?.namaBarang || stockNama || kode,
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

function enrichWithStock(rows, stockLookup, category) {
  return rows.map(r => {
    const si = getStockInfo(r.kodeBarang, stockLookup, category)
    const totalHpp = si.hpp * si.stock
    const ssr = r.kuantitas > 0 ? si.stock / r.kuantitas : null
    return { ...r, brand: si.brand, stock: si.stock, unit: si.unit, hasStockData: si.hasData, hpp: si.hpp, totalHpp, ssr }
  })
}

// ─── Sorting ────────────────────────────────────────────────────────────────

const TEXT_SORT_COLS = ['namaBarang', 'kodeBarang', 'brand', 'tipe']

// ─── Kelompokkan per SKU induk (dipakai mode "Per SKU Gabungan") ──────────────
// Logic sama seperti tool Rekap SKU Induk: kode dengan titik (mis. 105132.3.02)
// digabung ke induknya (105132) dan angka-angkanya dijumlahkan; kode TANPA
// titik selalu berdiri sendiri (tipe "tunggal"), tidak pernah ikut digabung.
function groupByParentSku(rows) {
  const groups = {}
  const standalone = []

  rows.forEach(r => {
    const kode = String(r.kodeBarang || '').trim()
    const hasDot = kode.includes('.')

    if (!kode || !hasDot) {
      standalone.push({ ...r, tipe: 'tunggal', variantCount: 1 })
      return
    }

    const parent = kode.split('.')[0]
    if (!groups[parent]) {
      groups[parent] = {
        kodeBarang: parent, brand: r.brand,
        kuantitas: 0, hargaProduk: 0, stock: 0, totalHpp: 0,
        variantCount: 0, hasStockData: false,
        bestNama: r.namaBarang, bestKuantitas: -1,
        unit: r.unit || '',
      }
    }
    const g = groups[parent]
    g.kuantitas += r.kuantitas
    g.hargaProduk += r.hargaProduk
    g.stock += r.stock || 0
    g.totalHpp += r.totalHpp || 0
    g.variantCount += 1
    g.hasStockData = g.hasStockData || r.hasStockData
    if (!g.unit && r.unit) g.unit = r.unit
    if (r.kuantitas > g.bestKuantitas) {
      g.bestKuantitas = r.kuantitas
      g.bestNama = r.namaBarang
      g.brand = r.brand
    }
  })

  const groupRows = Object.values(groups).map(g => {
    const hpp = g.stock > 0 ? g.totalHpp / g.stock : 0
    const ssr = g.kuantitas > 0 ? g.stock / g.kuantitas : null
    return {
      kodeBarang: g.kodeBarang, namaBarang: g.bestNama, brand: g.brand,
      kuantitas: g.kuantitas, hargaProduk: g.hargaProduk, stock: g.stock,
      unit: g.unit, hpp, totalHpp: g.totalHpp, ssr, hasStockData: g.hasStockData,
      tipe: 'gabungan', variantCount: g.variantCount,
    }
  })

  return [...groupRows, ...standalone]
}

function sortRows(rows, sortBy, sortDir = 'desc') {
  const col = sortBy || 'kuantitas'
  const mult = sortDir === 'asc' ? 1 : -1
  const sorted = [...rows]

  sorted.sort((a, b) => {
    if (col === 'namaBarang') {
      return mult * a.namaBarang.localeCompare(b.namaBarang, 'id')
    }
    if (col === 'kodeBarang') {
      if (!a.kodeBarang && b.kodeBarang) return 1
      if (!b.kodeBarang && a.kodeBarang) return -1
      if (!a.kodeBarang && !b.kodeBarang) return 0
      return mult * a.kodeBarang.localeCompare(b.kodeBarang, 'id')
    }
    if (col === 'brand') {
      if (a.brand === '—' && b.brand !== '—') return 1
      if (b.brand === '—' && a.brand !== '—') return -1
      if (a.brand === '—' && b.brand === '—') return 0
      return mult * a.brand.localeCompare(b.brand, 'id')
    }
    if (col === 'tipe') {
      // Cuma ada di mode "Per SKU Gabungan" — kalau kepanggil di mode lain
      // (row.tipe undefined semua), biarkan urutan aslinya (bukan NaN sort).
      return mult * String(a.tipe || '').localeCompare(String(b.tipe || ''), 'id')
    }
    // Numeric columns: kuantitas, hargaProduk, stock, hpp, totalHpp, ssr…
    // Missing/null values (mis. SSR saat terjual = 0) selalu di akhir,
    // terlepas dari arah urutan — bukan ikut kebalik pas toggle ke ascending.
    const av = a[col]
    const bv = b[col]
    const aNull = av == null
    const bNull = bv == null
    if (aNull && bNull) return 0
    if (aNull) return 1
    if (bNull) return -1
    return mult * (av - bv)
  })

  return sorted
}

// ─── Column filter definitions ────────────────────────────────────────────────

const TEXT_OPS = [
  { value: 'contains', label: 'Mengandung' },
  { value: 'not_contains', label: 'Tidak mengandung' },
  { value: 'equals', label: 'Sama dengan' },
  { value: 'not_equals', label: 'Tidak sama dengan' },
  { value: 'starts_with', label: 'Dimulai dengan' },
  { value: 'ends_with', label: 'Diakhiri dengan' },
  { value: 'is_empty', label: 'Kosong' },
  { value: 'is_not_empty', label: 'Tidak kosong' },
]

const NUM_OPS = [
  { value: 'eq', label: '= Sama dengan' },
  { value: 'neq', label: '≠ Tidak sama dengan' },
  { value: 'gt', label: '> Lebih dari' },
  { value: 'gte', label: '≥ Lebih dari atau sama dengan' },
  { value: 'lt', label: '< Kurang dari' },
  { value: 'lte', label: '≤ Kurang dari atau sama dengan' },
  { value: 'between', label: '↔ Di antara' },
]

const EMPTY_COL_FILTER = { op: '', value: '', value2: '' }

function applyColFilter(rows, colFilters) {
  return rows.filter(row => {
    for (const [col, f] of Object.entries(colFilters)) {
      if (!f.op) continue

      // Checklist multi-select (dipakai kolom Brand) — beda struktur dari filter teks/angka biasa
      if (f.op === 'in') {
        if (!f.values || f.values.length === 0) return false // semua di-uncheck = tidak ada yang cocok
        const rawCell = row[col]
        const cell = (!rawCell || rawCell === '—') ? '' : rawCell
        if (!f.values.includes(cell)) return false
        continue
      }

      const noVal = ['is_empty', 'is_not_empty'].includes(f.op)
      if (!noVal && f.value === '' && f.op !== 'between') continue
      if (f.op === 'between' && f.value === '' && f.value2 === '') continue

      if (col === 'namaBarang' || col === 'brand' || col === 'kodeBarang' || col === 'tipe') {
        const rawCell = col === 'namaBarang' ? row.namaBarang
          : col === 'brand' ? row.brand
            : row.kodeBarang
        const cell = (!rawCell || rawCell === '—' ? '' : rawCell).toLowerCase()
        const val = f.value.toLowerCase()
        if (f.op === 'contains' && !cell.includes(val)) return false
        if (f.op === 'not_contains' && cell.includes(val)) return false
        if (f.op === 'equals' && cell !== val) return false
        if (f.op === 'not_equals' && cell === val) return false
        if (f.op === 'starts_with' && !cell.startsWith(val)) return false
        if (f.op === 'ends_with' && !cell.endsWith(val)) return false
        if (f.op === 'is_empty' && cell.trim() !== '') return false
        if (f.op === 'is_not_empty' && cell.trim() === '') return false
      } else {
        const cell = row[col]
        const val = parseFloat(f.value)
        const val2 = parseFloat(f.value2)
        if (f.op === 'eq' && cell !== val) return false
        if (f.op === 'neq' && cell === val) return false
        if (f.op === 'gt' && !(cell > val)) return false
        if (f.op === 'gte' && !(cell >= val)) return false
        if (f.op === 'lt' && !(cell < val)) return false
        if (f.op === 'lte' && !(cell <= val)) return false
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
                className={`pill-btn ${filters.category === cat ? 'is-active' : ''} ${cat.includes('Underwear') ? 'pill-underwear' : 'pill-sport'
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

function SortIcon({ active, dir }) {
  return (
    <span style={{ marginLeft: 4, opacity: active ? 1 : 0.25, fontSize: 11 }}>
      {active && dir === 'asc' ? '↑' : '↓'}
    </span>
  )
}

function HighlightText({ text, query }) {
  const keywords = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (keywords.length === 0) return <>{text}</>

  const lower = text.toLowerCase()

  // Find every match range (for every keyword), then merge overlapping ones
  // so words like "HOOK" and "HITAM" both get highlighted independently
  // inside "BRA HOOK-01-HITAM".
  const ranges = []
  for (const kw of keywords) {
    let from = 0
    while (from <= lower.length) {
      const idx = lower.indexOf(kw, from)
      if (idx === -1) break
      ranges.push([idx, idx + kw.length])
      from = idx + kw.length
    }
  }
  if (ranges.length === 0) return <>{text}</>

  ranges.sort((a, b) => a[0] - b[0])
  const merged = [ranges[0]]
  for (const [start, end] of ranges.slice(1)) {
    const last = merged[merged.length - 1]
    if (start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }

  const parts = []
  let cursor = 0
  merged.forEach(([start, end], i) => {
    if (start > cursor) parts.push(<span key={`t${i}`}>{text.slice(cursor, start)}</span>)
    parts.push(
      <mark key={`m${i}`} style={{ background: '#fde68a', color: 'inherit', borderRadius: 2, padding: '0 2px' }}>
        {text.slice(start, end)}
      </mark>
    )
    cursor = end
  })
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>)

  return <>{parts}</>
}

// ── Column filter popover ─────────────────────────────────────────────────────

function ColFilterPopover({ col, filter, options, onChange, onClose, anchorRef }) {
  const isText = col === 'namaBarang' || col === 'brand' || col === 'kodeBarang' || col === 'tipe'
  const isBrand = col === 'brand'
  const ops = isText ? TEXT_OPS : NUM_OPS
  const ref = useRef(null)
  const [brandSearch, setBrandSearch] = useState('')
  const [pos, setPos] = useState(null)

  // Popover ini di-portal ke document.body dan diposisikan fixed berdasarkan
  // posisi tombol filternya di layar — bukan position:absolute relatif ke <th>.
  // Soalnya <th> ada di dalam .table-scroll yang overflow-x:auto, jadi kalau
  // masih position:absolute, popovernya kepotong di tepi area scroll tabel.
  useLayoutEffect(() => {
    if (!anchorRef.current) return
    const updatePos = () => {
      const rect = anchorRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left })
    }
    updatePos()
    window.addEventListener('resize', updatePos)
    return () => window.removeEventListener('resize', updatePos)
  }, [anchorRef])

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

  // Kalau tabel (atau apapun) di-scroll, posisi tombolnya berubah relatif ke
  // viewport, jadi popover fixed-position bakal nyangkut di tempat lama —
  // paling aman langsung ditutup aja daripada ngambang salah tempat.
  useEffect(() => {
    const handleScroll = (e) => {
      if (ref.current && ref.current.contains(e.target)) return // scroll di dalam popover sendiri (list brand) — jangan ditutup
      onClose()
    }
    window.addEventListener('scroll', handleScroll, true)
    return () => window.removeEventListener('scroll', handleScroll, true)
  }, [onClose])

  if (!pos) return null // tunggu posisi anchor didapat dulu (1 tick pertama)

  const basePos = { position: 'fixed', top: pos.top, left: pos.left, zIndex: 500 }

  if (isBrand) {
    const allOptions = options || []
    // Kalau belum ada filter aktif ('in' belum diset), anggap semua brand ke-checklist
    const checked = filter.op === 'in' ? (filter.values || []) : allOptions
    const visibleOptions = brandSearch.trim()
      ? allOptions.filter(b => b.toLowerCase().includes(brandSearch.trim().toLowerCase()))
      : allOptions

    const toggleBrand = (brand) => {
      const current = filter.op === 'in' ? (filter.values || []) : allOptions
      const next = current.includes(brand) ? current.filter(b => b !== brand) : [...current, brand]
      if (next.length === allOptions.length) {
        onChange(EMPTY_COL_FILTER) // semua ke-checklist lagi = sama saja dengan tidak difilter
      } else {
        onChange({ ...EMPTY_COL_FILTER, op: 'in', values: next })
      }
    }

    return createPortal((
      <div ref={ref} style={{
        ...basePos,
        background: 'var(--surface, #fff)', border: '1px solid var(--border, #ddd)',
        borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)',
        padding: '0.75rem', minWidth: 220,
        display: 'flex', flexDirection: 'column',
      }}>
        <input
          type="text"
          placeholder="Cari brand…"
          value={brandSearch}
          onChange={e => setBrandSearch(e.target.value)}
          style={{
            width: '100%', padding: '6px 10px', borderRadius: 6,
            border: '1px solid var(--border, #ddd)', background: 'var(--surface, #fff)',
            color: 'var(--ink, #111)', fontSize: 13, marginBottom: 6, boxSizing: 'border-box',
          }}
          autoFocus
        />

        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button
            onClick={() => onChange(EMPTY_COL_FILTER)}
            style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border, #ddd)', background: 'none', cursor: 'pointer', fontSize: 11.5, color: 'var(--muted, #888)' }}
          >
            Pilih Semua
          </button>
          <button
            onClick={() => onChange({ ...EMPTY_COL_FILTER, op: 'in', values: [] })}
            style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border, #ddd)', background: 'none', cursor: 'pointer', fontSize: 11.5, color: 'var(--muted, #888)' }}
          >
            Kosongkan
          </button>
        </div>

        <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, paddingRight: 2 }}>
          {visibleOptions.length === 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--muted, #888)', margin: '4px 0' }}>Tidak ada brand yang cocok.</p>
          )}
          {visibleOptions.map(brand => (
            <label key={brand} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, cursor: 'pointer', padding: '2px 2px' }}>
              <input
                type="checkbox"
                checked={checked.includes(brand)}
                onChange={() => toggleBrand(brand)}
              />
              {brand}
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button
            onClick={onClose}
            style={{
              padding: '5px 12px', borderRadius: 6, border: 'none',
              background: 'var(--ink, #111)', color: '#fff',
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >
            Selesai
          </button>
        </div>
      </div>
    ), document.body)
  }

  const noValueOps = ['is_empty', 'is_not_empty']
  const isBetween = filter.op === 'between'
  const hideInput = noValueOps.includes(filter.op)

  const inputStyle = {
    width: '100%', padding: '6px 10px', borderRadius: 6,
    border: '1px solid var(--border, #ddd)',
    background: 'var(--surface, #fff)',
    color: 'var(--ink, #111)',
    fontSize: 13, marginTop: 6, boxSizing: 'border-box',
  }

  return createPortal((
    <div ref={ref} style={{
      ...basePos,
      background: 'var(--surface, #fff)',
      border: '1px solid var(--border, #ddd)',
      borderRadius: 10,
      boxShadow: '0 8px 24px rgba(0,0,0,.12)',
      padding: '0.85rem',
      minWidth: 240,
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
  ), document.body)
}

// ── Column header with sort + filter ─────────────────────────────────────────

function ColHeader({ col, label, align = 'left', sortBy, sortDir, onSortChange, colFilters, onColFilterChange, brandOptions }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const filter = colFilters[col] || EMPTY_COL_FILTER
  const isActive = filter.op === 'in'
    ? !!(filter.values && filter.values.length > 0)
    : !!(filter.op && (
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
        {align === 'right' && <SortIcon active={sortBy === col} dir={sortDir} />}
        {label}
        {align === 'left' && <SortIcon active={sortBy === col} dir={sortDir} />}
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
          options={brandOptions}
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
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 200, label: '200' },
  { value: 'all', label: 'Semua' },
]

function Pagination({ page, totalPages, pageSize, onPageChange, onPageSizeChange, totalRows }) {
  const startRow = totalRows === 0 ? 0 : (page - 1) * (pageSize === 'all' ? totalRows : pageSize) + 1
  const endRow = pageSize === 'all' ? totalRows : Math.min(page * pageSize, totalRows)

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
  rows, loading, sortBy, sortDir, onSortChange,
  searchQuery, onSearchChange,
  colFilters, onColFilterChange,
  stockLookup, brandOptions,
  groupMode, onGroupModeChange,
  imageLookup, imageFileName, imageUploadError, imageUploading,
  onImageFile, showImages, onToggleShowImages,
}) {
  const totalKuantitas = rows.reduce((s, r) => s + r.kuantitas, 0)
  const totalHargaProduk = rows.reduce((s, r) => s + r.hargaProduk, 0)
  const totalHpp = rows.reduce((s, r) => s + (r.totalHpp || 0), 0)
  const totalStockPcs = rows.reduce((s, r) => s + (r.stock || 0), 0)
  const totalHppTerjual = rows.reduce((s, r) => s + (r.hpp || 0) * (r.kuantitas || 0), 0) // Σ (HPP PCS × Terjual)
  const ssrGrand = totalKuantitas > 0 ? totalStockPcs / totalKuantitas : null      // Stock PCS / Terjual
  const ssrHppGrand = totalHppTerjual > 0 ? totalHpp / totalHppTerjual : null       // Total HPP / Σ(HPP × Terjual)
  const hasStock = stockLookup !== null
  const showImageCol = showImages && !!imageLookup

  const colHeaderProps = { sortBy, sortDir, onSortChange, colFilters, onColFilterChange, brandOptions }

  const imageInputRef = useRef(null)

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
      {/* ── Mode tampilan: per varian vs per SKU induk (gabungan) ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '0.75rem' }}>
        <button
          type="button"
          className="pill-btn"
          onClick={() => onGroupModeChange('variant')}
          title="Tampilkan setiap varian SKU sebagai baris terpisah (perilaku biasa)"
          style={groupMode === 'variant' ? { background: 'var(--primary, #3B3A8C)', color: '#fff', borderColor: 'transparent' } : undefined}
        >
          Per Varian
        </button>
        <button
          type="button"
          className="pill-btn"
          onClick={() => onGroupModeChange('induk')}
          title="Gabungkan varian dengan kode yang sama sebelum titik (mis. 105132.3.02) ke SKU induknya (105132). Kode tanpa titik tetap tampil sendiri."
          style={groupMode === 'induk' ? { background: 'var(--primary, #3B3A8C)', color: '#fff', borderColor: 'transparent' } : undefined}
        >
          Per SKU Gabungan
        </button>
      </div>

      {/* ── Upload gambar SKU + toggle tampilkan gambar ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          ref={imageInputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onImageFile(file)
            e.target.value = '' // biar bisa upload file yang sama lagi kalau perlu
          }}
        />
        <button
          type="button"
          className="pill-btn"
          onClick={() => imageInputRef.current?.click()}
          disabled={imageUploading}
          title="Upload file .xlsx berisi kolom SKU dan IMAGE (link CDN gambar produk)"
        >
          {imageUploading ? 'Mengupload…' : (imageFileName ? '📤 Ganti File Gambar SKU' : '📤 Upload Gambar SKU')}
        </button>
        <button
          type="button"
          className="pill-btn"
          onClick={onToggleShowImages}
          disabled={!imageLookup}
          title={!imageLookup ? 'Upload file gambar SKU dulu' : (showImages ? 'Sembunyikan kolom gambar' : 'Tampilkan kolom gambar')}
          style={showImages ? { background: 'var(--primary, #3B3A8C)', color: '#fff', borderColor: 'transparent' } : undefined}
        >
          {showImages ? '🖼️ Sembunyikan Gambar' : '🖼️ Tampilkan Gambar'}
        </button>
        {imageFileName && (
          <span className="muted" style={{ fontSize: 12.5 }}>
            {imageFileName}{imageLookup ? ` · ${Object.keys(imageLookup).length} SKU` : ''}
          </span>
        )}
      </div>
      {imageUploadError && (
        <p className="upload-error" style={{ marginTop: 0, marginBottom: '0.75rem' }}>⚠️ {imageUploadError}</p>
      )}

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

      {!loading && (
        <>
          {/* ── Grand total summary ── */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{
              flex: 1, minWidth: 140,
              background: 'var(--surface-2, #f5f5f5)', borderRadius: 8, padding: '0.6rem 1rem',
            }}>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>Total Terjual</p>
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
                <div style={{
                  flex: 1, minWidth: 140,
                  background: 'var(--surface-2, #f5f5f5)', borderRadius: 8, padding: '0.6rem 1rem',
                }}>
                  <p className="muted" style={{ fontSize: 12, margin: 0 }}>SSR</p>
                  <p className="mono" style={{ fontSize: 18, fontWeight: 700, margin: '2px 0 0' }}>
                    {ssrGrand != null ? ssrGrand.toFixed(2) : '—'}
                  </p>
                </div>
                <div style={{
                  flex: 1, minWidth: 140,
                  background: 'var(--surface-2, #f5f5f5)', borderRadius: 8, padding: '0.6rem 1rem',
                }}>
                  <p className="muted" style={{ fontSize: 12, margin: 0 }}>SSR (HPP)</p>
                  <p className="mono" style={{ fontSize: 18, fontWeight: 700, margin: '2px 0 0' }}>
                    {ssrHppGrand != null ? ssrHppGrand.toFixed(2) : '—'}
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

          {hasStock && (
            <p className="period-note" style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem', alignItems: 'center' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 24, height: 24, borderRadius: 5, background: 'rgb(255, 162, 162)', display: 'inline-block' }} />
                SSR &lt; 1 = stock tidak cukup untuk 1 bulan.
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 24, height: 24, borderRadius: 5, background: 'rgb(255, 235, 156)', display: 'inline-block' }} />
                SSR 1 – 2 = stock hanya cukup untuk 1-2 bulan, segera restock.
              </span>
            </p>
          )}

          {/* ── Table ── */}
          <div className="table-scroll" style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <ColHeader col="kodeBarang" label="Kode Barang" align="left"  {...colHeaderProps} />
                  {groupMode === 'induk' && <ColHeader col="tipe" label="Tipe" align="left" {...colHeaderProps} />}
                  {showImageCol && <th style={{ width: 60, textAlign: 'center' }}>Gambar</th>}
                  <ColHeader col="namaBarang" label="Nama Barang" align="left"  {...colHeaderProps} />
                  {hasStock && <ColHeader col="brand" label="Brand" align="left"  {...colHeaderProps} />}
                  <ColHeader col="kuantitas" label="Terjual" align="right" {...colHeaderProps} />
                  <ColHeader col="hargaProduk" label="Harga Produk" align="right" {...colHeaderProps} />
                  {hasStock && <ColHeader col="stock" label="Stock" align="right" {...colHeaderProps} />}
                  {hasStock && <ColHeader col="unit" label="Unit" align="left" {...colHeaderProps} />}
                  {hasStock && <ColHeader col="hpp" label="HPP PCS" align="right" {...colHeaderProps} />}
                  {hasStock && <ColHeader col="totalHpp" label="Total HPP" align="right" {...colHeaderProps} />}
                  {hasStock && <ColHeader col="ssr" label="SSR" align="right" {...colHeaderProps} />}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={(hasStock ? 10 : 5) + (groupMode === 'induk' ? 1 : 0) + (showImageCol ? 1 : 0)} style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                      <p className="upload-title" style={{ margin: '0 0 4px' }}>Tidak ada produk ditemukan</p>
                      <p className="upload-sub" style={{ margin: 0 }}>
                        {searchQuery
                          ? `Tidak ada produk yang cocok dengan "${searchQuery}". Coba kata kunci lain.`
                          : 'Coba ubah filter kolom, tanggal, akun, atau kategori — termasuk checklist Brand, kalau semua brand-nya sedang dikosongkan.'}
                      </p>
                    </td>
                  </tr>
                )}
                {pageRows.map((row) => {
                  const si = hasStock ? { brand: row.brand, stock: row.stock, hasData: row.hasStockData } : null
                  const lowSsr = hasStock && row.ssr != null && row.ssr < 1
                  const restockSoonSsr = hasStock && row.ssr != null && row.ssr >= 1 && row.ssr <= 2
                  const rowStyle = lowSsr
                    ? { background: 'rgb(255, 162, 162)' }
                    : restockSoonSsr
                      ? { background: 'rgb(255, 235, 156)' }
                      : undefined
                  const rowTitle = lowSsr
                    ? 'SSR < 1 — stock lebih sedikit dari yang terjual'
                    : restockSoonSsr
                      ? 'SSR 1–2 — stock menipis, pertimbangkan untuk restock'
                      : undefined
                  return (
                    <tr
                      key={row.kodeBarang ? `k-${row.kodeBarang}-${row.tipe || 'v'}` : `r-${row.rank}`}
                      style={rowStyle}
                      title={rowTitle}
                    >
                      <td className="mono" style={{ textAlign: 'center' }}>{row.rank}</td>
                      <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                        {row.kodeBarang || '—'}
                      </td>
                      {groupMode === 'induk' && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {row.tipe === 'gabungan'
                            ? <span className="badge-brand" style={{ background: 'var(--surface-2, #f0eefc)' }}>Gabungan ({row.variantCount}x)</span>
                            : <span className="mono" style={{ fontSize: 12.5 }}>Tunggal</span>}
                        </td>
                      )}
                      {showImageCol && (() => {
                        const imgUrl = lookupSkuImage(row.kodeBarang, imageLookup)
                        return (
                          <td style={{ textAlign: 'center' }}>
                            {imgUrl
                              ? <img
                                  src={imgUrl}
                                  alt={row.namaBarang || row.kodeBarang || ''}
                                  style={{ height: 40, width: 'auto', borderRadius: 4, objectFit: 'cover', verticalAlign: 'middle' }}
                                  loading="lazy"
                                  onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                                />
                              : <span className="muted">—</span>}
                          </td>
                        )
                      })()}
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
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {row.unit
                            ? <span>{row.unit}</span>
                            : <span className="muted">—</span>}
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
                      {hasStock && (
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {row.ssr != null ? row.ssr.toFixed(2) : <span className="muted">—</span>}
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
  const [loggedIn, setLoggedIn] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState(null)
  const [loginLoading, setLoginLoading] = useState(false)

  // Periods
  const [periods, setPeriods] = useState([])
  const [selectedId, setSelectedId] = useState('')

  // Data
  const [payload, setPayload] = useState(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState(null)

  // Date / account / category filters
  const [filters, setFilters] = useState({
    account: '',
    category: '',
    dateFrom: '',
    dateTo: '',
  })

  // Sort
  const [sortBy, setSortBy] = useState('kuantitas')
  const [groupMode, setGroupMode] = useState('variant') // 'variant' | 'induk'

  // Kolom "Tipe" cuma ada di mode "Per SKU Gabungan" — kalau filternya masih
  // aktif terus mode dipindah ke "Per Varian", baris di mode itu jadi gak
  // punya field `tipe` sama sekali dan filternya bakal cocok ke NOL baris
  // (tabel kelihatan kosong tanpa penjelasan). Makanya filter Tipe di-reset
  // tiap kali mode ganti.
  const handleGroupModeChange = useCallback((mode) => {
    setGroupMode(mode)
    setColFilters(prev => {
      if (!prev.tipe) return prev
      const next = { ...prev }
      delete next.tipe
      return next
    })
  }, [])
  const [sortDir, setSortDir] = useState('desc')

  // Kolom teks (Nama Barang, Kode Barang, Brand) default ascending (A→Z) saat
  // pertama diklik; kolom angka default descending (terbesar dulu) — klik lagi
  // di kolom yang sama membalik arahnya.
  const handleSortChange = useCallback((col) => {
    if (sortBy === col) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(col)
      setSortDir(TEXT_SORT_COLS.includes(col) ? 'asc' : 'desc')
    }
  }, [sortBy])

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  // Column filters — { namaBarang: {op,value,value2}, kuantitas: {...}, hargaProduk: {...} }
  const [colFilters, setColFilters] = useState({})

  // Stock lookup: { kodeBarang: { brand, stock } } — digabung dari underwear + sport
  const [stockLookup, setStockLookup] = useState(null)
  const [stockError, setStockError] = useState(null)

  // Gambar per SKU — { bySku: { kode: urlGambar } } dari file Excel yang diupload
  // manual di halaman ini (tidak disimpan ke server, cuma untuk sesi ini).
  const [imageLookup, setImageLookup] = useState(null)
  const [imageFileName, setImageFileName] = useState('')
  const [imageUploadError, setImageUploadError] = useState(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [showImages, setShowImages] = useState(false) // default: sembunyi

  const handleImageFile = useCallback((file) => {
    setImageUploading(true)
    setImageUploadError(null)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const { bySku, count } = parseSkuImageFile(reader.result)
        setImageLookup(bySku)
        setImageFileName(file.name)
        setShowImages(true) // langsung nyalakan toggle setelah upload berhasil
        void count
      } catch (err) {
        setImageUploadError(err.message || 'Gagal membaca file gambar SKU.')
      } finally {
        setImageUploading(false)
      }
    }
    reader.onerror = () => {
      setImageUploadError('Gagal membaca file.')
      setImageUploading(false)
    }
    reader.readAsArrayBuffer(file)
  }, [])

  const handleToggleShowImages = useCallback(() => {
    setShowImages(v => !v)
  }, [])

  const handleColFilterChange = useCallback((col, f) => {
    setColFilters(prev => ({ ...prev, [col]: f }))
  }, [])

  // Ambil underwear & sport TERPISAH (bukan satu request gabungan) — supaya
  // masing-masing response tetap kecil. Kalau digabung jadi satu response di
  // server, totalnya bisa kelewat batas 4.5MB Vercel Function begitu salah
  // satu katalog (mis. underwear) sudah puluhan ribu SKU — request itu gagal
  // dengan 413, dan sebelumnya kegagalan itu didiamkan begitu saja sehingga
  // stock (termasuk punya kategori lain yang sebetulnya baik-baik saja)
  // kelihatan "hilang" tanpa pesan apapun.
  const loadStock = useCallback(async () => {
    setStockError(null)
    const results = await Promise.allSettled([
      fetch('/api/stock-data?type=underwear', { cache: 'no-store' }).then(async res => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Gagal memuat stock underwear (${res.status})`)
        return res.json()
      }),
      fetch('/api/stock-data?type=sport', { cache: 'no-store' }).then(async res => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Gagal memuat stock sport (${res.status})`)
        return res.json()
      }),
    ])

    const [underwearResult, sportResult] = results
    const merged = {}
    // Kalau kode yang sama ada di dua file (di data kamu: SEMUA 616 kode sport
    // ternyata juga ada di file underwear — kemungkinan besar underwear.xls
    // adalah export inventaris LENGKAP, bukan katalog khusus underwear), kedua
    // versinya disimpan terpisah per kode (bukan yang satu menimpa yang lain).
    // Nanti getStockInfo() yang memutuskan: gabungkan stock-nya saat filter
    // kategori "Semua", atau pakai cuma salah satu saat pill Underwear/Sport dipilih.
    if (sportResult.status === 'fulfilled') {
      for (const [kode, entry] of Object.entries(sportResult.value.byKodePenuh || {})) {
        merged[kode] = { sport: entry, underwear: null }
      }
    }
    if (underwearResult.status === 'fulfilled') {
      for (const [kode, entry] of Object.entries(underwearResult.value.byKodePenuh || {})) {
        merged[kode] = merged[kode] ? { ...merged[kode], underwear: entry } : { underwear: entry, sport: null }
      }
    }

    const failures = []
    if (underwearResult.status === 'rejected') failures.push(`Underwear: ${underwearResult.reason.message}`)
    if (sportResult.status === 'rejected') failures.push(`Sport: ${sportResult.reason.message}`)

    if (failures.length) {
      setStockError(`Sebagian data stock gagal dimuat — ${failures.join(' · ')}. Kolom Brand/Stock/HPP/SSR untuk kategori itu mungkin tidak akurat.`)
    }
    setStockLookup(merged)
  }, [])

  // ── Session check ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/session', { cache: 'no-store' })
      .then(async (res) => {
        setCheckingSession(false)
        if (!res.ok) return
        setLoggedIn(true)
        loadStock()

        // Default halaman pertama kali dibuka: "30 hari terakhir" (gabungan semua
        // periode, difilter ke 30 hari terakhir) — bukan cuma periode terbaru.
        const list = await loadPeriods()
        if (list.length > 0) {
          setSelectedId(ALL_MERGED_ID)
          loadAllPeriodsMerged(list, last30DaysRange())
        } else {
          loadData('') // belum ada periode tersimpan sama sekali — fallback lama
        }
      })
      .catch(() => setCheckingSession(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load periods ─────────────────────────────────────────────────────────────
  const loadPeriods = useCallback(async () => {
    const res = await fetch('/api/barang-terlaris-periods', { cache: 'no-store' })
    if (!res.ok) return []
    const list = await res.json()
    setPeriods(list)
    return list
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

      const rawRows = results.flatMap(r => r?.analysis?.rawRows || [])
      const accounts = Array.from(new Set(results.flatMap(r => r?.analysis?.accounts || [])))

      if (!rawRows.length) {
        throw new Error('Tidak ada transaksi pada periode yang tersimpan.')
      }

      const sortedKeys = rawRows.map(r => r.dateKey).sort()
      const firstDateKey = sortedKeys[0]
      const lastDateKey = sortedKeys[sortedKeys.length - 1]

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

  // Ganti periode = reset filter tanggal manual. Tanpa ini, tanggal dari periode
  // sebelumnya (mis. Juli) bisa nyangkut dan bikin periode baru (mis. Juni)
  // kelihatan kosong padahal datanya ada, cuma ketutup filter tanggal yang stale.
  const handlePeriodChange = useCallback((newId) => {
    setSelectedId(newId)
    setFilters(f => ({ ...f, dateFrom: '', dateTo: '' }))
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
  const rawRows = analysis?.rawRows || []
  const accounts = analysis?.accounts || []
  const hasStock = stockLookup !== null

  useEffect(() => {
    if (!analysis) return
    setFilters(f => ({
      ...f,
      dateFrom: f.dateFrom || analysis.firstDateKey || '',
      dateTo: f.dateTo || analysis.lastDateKey || '',
    }))
  }, [analysis?.firstDateKey, analysis?.lastDateKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const enrichedRows = useMemo(() => {
    const hasStockMaster = !!stockLookup && Object.keys(stockLookup).length > 0

    // 1. base rows — every stock SKU first (matched with sales by kode), or the
    //    old sales-grouped view if no stock master has been uploaded yet
    let rows = hasStockMaster
      ? buildStockFirstRows(rawRows, filters, stockLookup)
      : aggregateRows(rawRows, filters)

    // 2. merge in brand/stock so they can be filtered & sorted like any other column
    rows = enrichWithStock(rows, stockLookup, filters.category)

    return rows
  }, [rawRows, filters, stockLookup])

  // Semua brand yang ada untuk periode/filter tanggal saat ini — dipakai buat
  // checklist di kolom Brand. Diambil SEBELUM search/kolom-filter lain supaya
  // daftar pilihannya tidak ikut menyusut saat sedang milih brand.
  const brandOptions = useMemo(() => {
    return Array.from(new Set(
      enrichedRows.map(r => r.brand).filter(b => b && b !== '—')
    )).sort((a, b) => a.localeCompare(b, 'id'))
  }, [enrichedRows])

  const filteredRows = useMemo(() => {
    let rows = groupMode === 'induk' ? groupByParentSku(enrichedRows) : enrichedRows

    // 3. global search — flexible/fuzzy: split query into words and require
    //    every word to appear somewhere in the product name (in any order,
    //    ignoring separators like "-"). This way "BRA HOOK HITAM" or just
    //    "HOOK HITAM" will still match a name like "BRA HOOK-01-HITAM".
    if (searchQuery.trim()) {
      const keywords = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean)
      rows = rows.filter(r => {
        const name = r.namaBarang.toLowerCase()
        return keywords.every(kw => name.includes(kw))
      })
    }

    // 4. column filters (namaBarang, brand, kuantitas, hargaProduk, stock)
    rows = applyColFilter(rows, colFilters)

    // 5. sort
    rows = sortRows(rows, sortBy, sortDir)

    // 6. re-rank after all filters
    return rows.map((r, i) => ({ ...r, rank: i + 1 }))
  }, [enrichedRows, groupMode, searchQuery, colFilters, sortBy, sortDir])

  // ── Active filter description ──────────────────────────────────────────────────
  const activeFilterDesc = useMemo(() => {
    const parts = []
    if (filters.account) parts.push(`Akun: ${filters.account}`)
    if (filters.category) parts.push(`Kategori: ${filters.category}`)
    if (filters.dateFrom || filters.dateTo) {
      const from = filters.dateFrom || analysis?.firstDateKey || '…'
      const to = filters.dateTo || analysis?.lastDateKey || '…'
      parts.push(`Tanggal: ${from} s.d. ${to}`)
    }
    // add active column filters
    const colLabels = {
      kodeBarang: 'Kode Barang', namaBarang: 'Nama Barang', kuantitas: 'Terjual', hargaProduk: 'Harga Produk',
      brand: 'Brand', stock: 'Stock', hpp: 'HPP PCS', totalHpp: 'Total HPP', ssr: 'SSR', tipe: 'Tipe',
    }
    for (const [col, f] of Object.entries(colFilters)) {
      if (!f.op) continue
      if (f.op === 'in') {
        if (!f.values || f.values.length === 0) continue
        parts.push(`${colLabels[col]}: ${f.values.join(', ')}`)
        continue
      }
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
      if (f.op === 'in') return !!(f.values && f.values.length > 0)
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
    <div className="app-shell app-shell--wide">
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

      {stockError && (
        <div className="upload-zone has-error" style={{ marginBottom: '1rem' }}>
          <p className="upload-sub">⚠️ {stockError}</p>
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
            sortDir={sortDir}
            onSortChange={handleSortChange}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            colFilters={colFilters}
            onColFilterChange={handleColFilterChange}
            stockLookup={stockLookup}
            brandOptions={brandOptions}
            groupMode={groupMode}
            onGroupModeChange={handleGroupModeChange}
            imageLookup={imageLookup}
            imageFileName={imageFileName}
            imageUploadError={imageUploadError}
            imageUploading={imageUploading}
            onImageFile={handleImageFile}
            showImages={showImages}
            onToggleShowImages={handleToggleShowImages}
          />
        </div>
      )}
    </div>
  )
}
