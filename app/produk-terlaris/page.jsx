'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatRupiah, formatDateLabel } from '@/lib/parseBarangTerlaris'
import { exportBarangTerlaris } from '@/lib/exportExcel'
import { lookupSkuEntry, buildSkuIndex, parseSkuImageFile } from '@/lib/parseSkuImage'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import CetakJadwalPromoModal from '@/components/CetakJadwalPromoModal'

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

// ─── MP Stock & Gambar enrichment (dari data Stok Marketplace) ───────────────
// Mencocokkan NAMA BARANG (Produk Terlaris) dengan SKU (Stok Marketplace).
// Ditambahkan sebagai field di tiap baris (bukan dihitung ulang tiap render)
// supaya bisa difilter & diurutkan persis seperti kolom lain.
function lookupMpItem(row, mpLookup) {
  if (!row || !mpLookup) return null
  const nama = String(row.namaBarang || '').trim().toLowerCase()
  const normSpace = nama.replace(/\s+/g, ' ')
  const clean = nama.replace(/[^a-z0-9]/g, '')
  const kode = String(row.kodeBarang || '').trim().toLowerCase()
  const cleanKode = kode.replace(/[^a-z0-9]/g, '')

  if (nama && mpLookup.has(nama)) return mpLookup.get(nama)
  if (normSpace && mpLookup.has(normSpace)) return mpLookup.get(normSpace)
  if (clean && mpLookup.has(clean)) return mpLookup.get(clean)
  if (kode && mpLookup.has(kode)) return mpLookup.get(kode)
  if (cleanKode && mpLookup.has(cleanKode)) return mpLookup.get(cleanKode)
  return null
}

function enrichWithMpStock(rows, mpLookup) {
  if (!mpLookup || mpLookup.size === 0) {
    return rows.map(r => ({ ...r, mpStock: null, hasMpStockData: false, gambar: null }))
  }
  return rows.map(r => {
    const matched = lookupMpItem(r, mpLookup)
    return {
      ...r,
      mpStock: matched != null ? (matched.stok ?? 0) : null,
      hasMpStockData: matched != null,
      gambar: matched?.gambar || null,
    }
  })
}

// ─── Sorting ────────────────────────────────────────────────────────────────

const TEXT_SORT_COLS = ['namaBarang', 'kodeBarang', 'brand', 'tipe', 'gambar']

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
      standalone.push({
        ...r,
        tipe: 'tunggal',
        variantCount: 1,
        gambar: r.gambar || null,
        variantCodes: kode ? [{ kode, namaBarang: r.namaBarang }] : [],
        variants: [{
          kodeBarang: kode,
          namaBarang: r.namaBarang,
          kuantitas: r.kuantitas,
          hargaProduk: r.hargaProduk,
          stock: r.stock || 0,
          hasStockData: r.hasStockData,
          ssr: r.ssr,
          hpp: r.hpp || 0,
          totalHpp: r.totalHpp || 0,
          unit: r.unit || '',
          brand: r.brand,
          gambar: r.gambar || null,
        }],
      })
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
        mpStock: 0, hasMpStockData: false,
        gambar: null,
        variantCodes: [],
        variants: [],
      }
    }
    const g = groups[parent]
    g.kuantitas += r.kuantitas
    g.hargaProduk += r.hargaProduk
    g.stock += r.stock || 0
    g.totalHpp += r.totalHpp || 0
    g.variantCount += 1
    g.hasStockData = g.hasStockData || r.hasStockData
    g.variantCodes.push({ kode, namaBarang: r.namaBarang })

    // Track variant data
    const existing = g.variants.find(v => v.kodeBarang === kode)
    if (existing) {
      existing.kuantitas += r.kuantitas
      existing.hargaProduk += r.hargaProduk
      existing.stock += r.stock || 0
      existing.hasStockData = existing.hasStockData || r.hasStockData
      existing.ssr = existing.kuantitas > 0 ? existing.stock / existing.kuantitas : null
      if (r.gambar && !existing.gambar) existing.gambar = r.gambar
    } else {
      g.variants.push({
        kodeBarang: kode,
        namaBarang: r.namaBarang,
        kuantitas: r.kuantitas,
        hargaProduk: r.hargaProduk,
        stock: r.stock || 0,
        hasStockData: r.hasStockData,
        ssr: r.ssr,
        hpp: r.hpp || 0,
        totalHpp: r.totalHpp || 0,
        unit: r.unit || '',
        brand: r.brand,
        gambar: r.gambar || null,
      })
    }

    if (r.hasMpStockData) {
      g.mpStock += r.mpStock || 0
      g.hasMpStockData = true
    }
    if (r.gambar && !g.gambar) {
      g.gambar = r.gambar
    }
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
    const sortedVariants = [...g.variants].sort((a, b) => (b.kuantitas || 0) - (a.kuantitas || 0) || a.kodeBarang.localeCompare(b.kodeBarang))
    return {
      kodeBarang: g.kodeBarang, namaBarang: g.bestNama, brand: g.brand,
      kuantitas: g.kuantitas, hargaProduk: g.hargaProduk, stock: g.stock,
      unit: g.unit, hpp, totalHpp: g.totalHpp, ssr, hasStockData: g.hasStockData,
      tipe: 'gabungan', variantCount: g.variantCount,
      mpStock: g.hasMpStockData ? g.mpStock : null, hasMpStockData: g.hasMpStockData,
      gambar: g.gambar || null,
      variantCodes: g.variantCodes,
      variants: sortedVariants,
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
    if (col === 'gambar') {
      const aHas = Boolean(a.gambar && String(a.gambar).trim() !== '') ? 1 : 0
      const bHas = Boolean(b.gambar && String(b.gambar).trim() !== '') ? 1 : 0
      return mult * (bHas - aHas)
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

// Kolom "Tipe" cuma ada 2 kemungkinan nilai (di mode "Per SKU Gabungan"),
// jadi filternya pakai checklist tetap, bukan pilih kondisi teks segala.
const TIPE_OPTIONS = ['gabungan', 'tunggal']
const TIPE_LABELS = { gabungan: 'Gabungan', tunggal: 'Tunggal' }

function applyColFilter(rows, colFilters) {
  return rows.filter(row => {
    for (const [col, f] of Object.entries(colFilters)) {
      if (!f.op && col !== 'gambar') continue

      // Filter khusus kolom Gambar: "SEMUA", "ADA GAMBAR", "TIDAK ADA GAMBAR"
      if (col === 'gambar') {
        const hasImg = Boolean(row.gambar && String(row.gambar).trim() !== '')
        if (f.value === 'ADA GAMBAR' && !hasImg) return false
        if (f.value === 'TIDAK ADA GAMBAR' && hasImg) return false
        continue
      }

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
            : col === 'tipe' ? row.tipe
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
        const cell = row[col] == null ? null : Number(row[col])
        const val = parseFloat(f.value)
        const val2 = parseFloat(f.value2)
        if (f.op === 'eq' && cell !== val) return false
        if (f.op === 'neq' && cell === val) return false
        if (f.op === 'gt' && !(cell != null && cell > val)) return false
        if (f.op === 'gte' && !(cell != null && cell >= val)) return false
        if (f.op === 'lt' && !(cell != null && cell < val)) return false
        if (f.op === 'lte' && !(cell != null && cell <= val)) return false
        if (f.op === 'between' && !(cell != null && cell >= val && cell <= val2)) return false
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
  const isChecklist = col === 'brand' || col === 'tipe'
  const showChecklistSearch = col === 'brand' // daftar brand bisa panjang; tipe cuma 2 opsi, gak perlu cari
  const optionLabel = col === 'tipe' ? (v => TIPE_LABELS[v] || v) : (v => v)
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

  if (isChecklist) {
    const allOptions = options || []
    // Kalau belum ada filter aktif ('in' belum diset), anggap semua opsi ke-checklist
    const checked = filter.op === 'in' ? (filter.values || []) : allOptions
    const visibleOptions = showChecklistSearch && brandSearch.trim()
      ? allOptions.filter(b => b.toLowerCase().includes(brandSearch.trim().toLowerCase()))
      : allOptions

    const toggleOption = (opt) => {
      const current = filter.op === 'in' ? (filter.values || []) : allOptions
      const next = current.includes(opt) ? current.filter(b => b !== opt) : [...current, opt]
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
        {showChecklistSearch && (
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
        )}

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
            <p style={{ fontSize: 12.5, color: 'var(--muted, #888)', margin: '4px 0' }}>Tidak ada opsi yang cocok.</p>
          )}
          {visibleOptions.map(opt => (
            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, cursor: 'pointer', padding: '2px 2px' }}>
              <input
                type="checkbox"
                checked={checked.includes(opt)}
                onChange={() => toggleOption(opt)}
              />
              {optionLabel(opt)}
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

function getFilterSummaryLabel(col, filter) {
  if (!filter || !filter.op) return null
  if (filter.op === 'in') {
    if (!filter.values || filter.values.length === 0) return null
    return `${filter.values.length} item`
  }
  if (filter.op === 'contains') return `Mengandung "${filter.value}"`
  if (filter.op === 'not_contains') return `≠ "${filter.value}"`
  if (filter.op === 'equals') return `"${filter.value}"`
  if (filter.op === 'not_equals') return `≠ "${filter.value}"`
  if (filter.op === 'starts_with') return `Awalan "${filter.value}"`
  if (filter.op === 'ends_with') return `Akhiran "${filter.value}"`
  if (filter.op === 'is_empty') return 'Kosong'
  if (filter.op === 'is_not_empty') return 'Terisi'
  if (filter.op === 'eq') return `= ${filter.value}`
  if (filter.op === 'neq') return `≠ ${filter.value}`
  if (filter.op === 'gt') return `> ${filter.value}`
  if (filter.op === 'gte') return `≥ ${filter.value}`
  if (filter.op === 'lt') return `< ${filter.value}`
  if (filter.op === 'lte') return `≤ ${filter.value}`
  if (filter.op === 'between') return `${filter.value}–${filter.value2}`
  if (filter.value) return filter.value
  return null
}

function ColHeader({ col, label, align = 'left', sortBy, sortDir, onSortChange, colFilters, onColFilterChange, brandOptions }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const filter = colFilters[col] || EMPTY_COL_FILTER
  const isActive = filter.op === 'in'
    ? !!(filter.values && filter.values.length > 0)
    : !!(filter.op && (
      ['is_empty', 'is_not_empty'].includes(filter.op) || filter.value !== ''
    ))

  const summaryLabel = isActive ? getFilterSummaryLabel(col, filter) : null

  return (
    <th
      style={{
        textAlign: align,
        whiteSpace: 'nowrap',
        position: 'relative',
        userSelect: 'none',
        verticalAlign: 'top',
        padding: '8px 6px',
      }}
    >
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
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
            title={`Filter kolom ${label}`}
            style={{
              marginLeft: 4,
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
        </div>

        {/* Visible Filter Badge in Table Header */}
        {isActive && summaryLabel && (
          <div
            onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
            title={`Filter aktif: ${summaryLabel}. Klik untuk ubah.`}
            style={{
              marginTop: 4,
              fontSize: 10,
              fontWeight: 700,
              color: '#3730A3',
              background: '#EEF2FF',
              border: '1px solid #C7D2FE',
              borderRadius: 4,
              padding: '1px 5px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
              lineHeight: 1.25,
            }}
          >
            <span>{summaryLabel}</span>
            <span
              onClick={e => {
                e.stopPropagation()
                onColFilterChange(col, EMPTY_COL_FILTER)
              }}
              title={`Hapus filter kolom ${label}`}
              style={{
                cursor: 'pointer',
                color: '#6366F1',
                fontWeight: 800,
                fontSize: 11,
                lineHeight: 1,
              }}
            >
              ×
            </span>
          </div>
        )}
      </div>

      {/* Popover */}
      {open && (
        <ColFilterPopover
          col={col}
          filter={filter}
          options={col === 'tipe' ? TIPE_OPTIONS : brandOptions}
          onChange={f => onColFilterChange(col, f)}
          onClose={() => setOpen(false)}
          anchorRef={btnRef}
        />
      )}
    </th>
  )
}

// ── Column filter popover for Gambar ──────────────────────────────────────────

function GambarFilterPopover({ value, onChange, onClose, anchorRef }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)
  const [selectedVal, setSelectedVal] = useState(value || 'SEMUA')

  useLayoutEffect(() => {
    if (!anchorRef.current) return
    const updatePos = () => {
      const rect = anchorRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: Math.max(10, rect.left - 60) })
    }
    updatePos()
    window.addEventListener('resize', updatePos)
    return () => window.removeEventListener('resize', updatePos)
  }, [anchorRef])

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

  useEffect(() => {
    const handleScroll = (e) => {
      if (ref.current && ref.current.contains(e.target)) return
      onClose()
    }
    window.addEventListener('scroll', handleScroll, true)
    return () => window.removeEventListener('scroll', handleScroll, true)
  }, [onClose])

  if (!pos) return null

  const options = [
    { value: 'SEMUA', label: 'SEMUA', desc: 'Tampilkan semua produk' },
    { value: 'ADA GAMBAR', label: 'ADA GAMBAR', desc: 'Hanya produk yang memiliki gambar' },
    { value: 'TIDAK ADA GAMBAR', label: 'TIDAK ADA GAMBAR', desc: 'Hanya produk tanpa gambar' },
  ]

  const handleApply = (val) => {
    const finalVal = val || selectedVal
    if (finalVal === 'SEMUA') {
      onChange(EMPTY_COL_FILTER)
    } else {
      onChange({ op: 'equals', value: finalVal })
    }
    onClose()
  }

  return createPortal((
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 500,
        background: 'var(--surface, #fff)',
        border: '1px solid var(--border, #ddd)',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,.15)',
        padding: '0.85rem',
        minWidth: 230,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--ink-muted, #6B6A66)', marginBottom: 2 }}>
        Filter Kolom Gambar
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {options.map((opt) => {
          const isSelected = selectedVal === opt.value
          return (
            <div
              key={opt.value}
              onClick={() => {
                setSelectedVal(opt.value)
                handleApply(opt.value)
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '6px 8px',
                borderRadius: 6,
                cursor: 'pointer',
                background: isSelected ? 'var(--primary-subtle, #edeefc)' : 'transparent',
                border: `1px solid ${isSelected ? 'var(--primary, #3B3A8C)' : 'transparent'}`,
                transition: 'all 0.12s ease',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.background = 'var(--surface-2, #f5f5f5)'
              }}
              onMouseLeave={(e) => {
                if (!isSelected) e.currentTarget.style.background = 'transparent'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: '50%',
                    border: `1.5px solid ${isSelected ? 'var(--primary, #3B3A8C)' : '#999'}`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isSelected && (
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary, #3B3A8C)' }} />
                  )}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--primary, #3B3A8C)' : 'var(--ink, #1C1B19)' }}>
                  {opt.label}
                </span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--ink-muted, #78716C)', marginLeft: 20 }}>
                {opt.desc}
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 4, paddingTop: 6, borderTop: '1px solid var(--border, #eee)', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => {
            onChange(EMPTY_COL_FILTER)
            onClose()
          }}
          style={{
            padding: '5px 10px',
            borderRadius: 6,
            border: '1px solid var(--border, #ddd)',
            background: 'none',
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--muted, #888)',
          }}
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => handleApply(selectedVal)}
          style={{
            padding: '5px 12px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--primary, #3B3A8C)',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Terapkan
        </button>
      </div>
    </div>
  ), document.body)
}

function GambarColHeader({ sortBy, sortDir, onSortChange, colFilters, onColFilterChange }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const filter = colFilters?.gambar || EMPTY_COL_FILTER
  const isActive = Boolean(filter.value && filter.value !== 'SEMUA')

  return (
    <th
      style={{
        width: 85,
        textAlign: 'center',
        whiteSpace: 'nowrap',
        position: 'relative',
        userSelect: 'none',
        padding: '8px 4px',
        verticalAlign: 'top',
      }}
    >
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <span
            onClick={() => onSortChange && onSortChange('gambar')}
            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2 }}
            title="Urutkan berdasarkan ketersediaan gambar"
          >
            Gambar
            {sortBy === 'gambar' && <SortIcon active={true} dir={sortDir} />}
          </span>
          <button
            ref={btnRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setOpen((v) => !v)
            }}
            title="Filter gambar (SEMUA, ADA GAMBAR, TIDAK ADA GAMBAR)"
            style={{
              marginLeft: 4,
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
        </div>

        {/* Visible Filter Badge in Table Header */}
        {isActive && (
          <div
            onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
            title={`Filter aktif: ${filter.value}. Klik untuk ubah.`}
            style={{
              marginTop: 4,
              fontSize: 9.5,
              fontWeight: 700,
              color: '#3730A3',
              background: '#EEF2FF',
              border: '1px solid #C7D2FE',
              borderRadius: 4,
              padding: '1px 4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              cursor: 'pointer',
              lineHeight: 1.25,
            }}
          >
            <span>{filter.value}</span>
            <span
              onClick={e => {
                e.stopPropagation()
                onColFilterChange('gambar', EMPTY_COL_FILTER)
              }}
              title="Hapus filter gambar"
              style={{
                marginLeft: 1,
                cursor: 'pointer',
                color: '#6366F1',
                fontWeight: 800,
                fontSize: 11,
                lineHeight: 1,
              }}
            >
              ×
            </span>
          </div>
        )}
      </div>

      {open && (
        <GambarFilterPopover
          value={filter.value || 'SEMUA'}
          onChange={(f) => onColFilterChange('gambar', f)}
          onClose={() => setOpen(false)}
          anchorRef={btnRef}
        />
      )}
    </th>
  )
}

// ── Catatan per baris (popover edit, mirip komentar cell Excel) ────────────────

function formatNoteTimestamp(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function NoteEditorPopover({ initialText, updatedAt, saving, childNotes, onSave, onDelete, onClose, anchorRef }) {
  const [text, setText] = useState(initialText || '')
  const ref = useRef(null)
  const textareaRef = useRef(null)
  const [pos, setPos] = useState(null)
  const hasChildNotes = childNotes && childNotes.length > 0

  useLayoutEffect(() => {
    if (!anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    // Coba taruh di kanan tombol; kalau kepotong tepi kanan layar, taruh di kiri.
    const width = 300
    const left = rect.right + width + 8 > window.innerWidth
      ? Math.max(8, rect.left - width - 8)
      : rect.right + 8
    setPos({ top: Math.min(rect.top, window.innerHeight - (hasChildNotes ? 340 : 220)), left })
  }, [anchorRef, hasChildNotes])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

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

  useEffect(() => {
    const handleScroll = (e) => {
      if (ref.current && ref.current.contains(e.target)) return
      onClose()
    }
    window.addEventListener('scroll', handleScroll, true)
    return () => window.removeEventListener('scroll', handleScroll, true)
  }, [onClose])

  if (!pos) return null

  const handleSave = async () => {
    const ok = await onSave(text)
    if (ok) onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave()
  }

  return createPortal((
    <div
      ref={ref}
      style={{
        position: 'fixed', top: pos.top, left: pos.left, zIndex: 500,
        background: 'var(--surface, #fff)', border: '1px solid var(--border, #ddd)',
        borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.16)',
        padding: '0.75rem', width: 300, boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', gap: 8,
        maxHeight: '70vh', overflowY: 'auto',
      }}
    >
      {hasChildNotes && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          paddingBottom: 8, borderBottom: '1px solid var(--border, #ddd)',
        }}>
          <p className="muted" style={{ margin: 0, fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>
            Catatan dari varian ({childNotes.length})
          </p>
          {childNotes.map(cn => (
            <div key={cn.kodeBarang} style={{
              background: 'var(--paper, #f6f4ef)', borderRadius: 6, padding: '6px 8px',
            }}>
              <p className="muted" style={{ margin: '0 0 2px', fontSize: 10.5, fontWeight: 600 }}>{cn.namaBarang || cn.kodeBarang}</p>
              <p style={{ margin: 0, fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{cn.text}</p>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: 10.5 }}>{formatNoteTimestamp(cn.updatedAt)}</p>
            </div>
          ))}
          <p className="muted" style={{ margin: 0, fontSize: 11 }}>
            Catatan varian diedit dari tampilan "Per Varian".
          </p>
        </div>
      )}

      <p className="muted" style={{ margin: 0, fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>
        {hasChildNotes ? 'Catatan SKU induk' : 'Catatan'}
      </p>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Tulis catatan untuk produk ini…"
        maxLength={2000}
        rows={5}
        style={{
          width: '100%', resize: 'vertical', boxSizing: 'border-box',
          padding: '8px 10px', borderRadius: 6,
          border: '1px solid var(--border, #ddd)', background: 'var(--surface, #fff)',
          color: 'var(--ink, #111)', fontSize: 13, fontFamily: 'inherit',
        }}
      />
      {updatedAt && (
        <p className="muted" style={{ margin: 0, fontSize: 11.5 }}>
          Terakhir diedit: {formatNoteTimestamp(updatedAt)}
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        {initialText
          ? (
            <button
              type="button"
              onClick={async () => { const ok = await onDelete(); if (ok) onClose() }}
              disabled={saving}
              style={{
                padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border, #ddd)',
                background: 'transparent', color: 'var(--accent, #D85A30)',
                cursor: saving ? 'default' : 'pointer', fontSize: 12,
              }}
            >
              Hapus
            </button>
          )
          : <span />}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border, #ddd)',
              background: 'transparent', color: 'var(--ink, #111)',
              cursor: saving ? 'default' : 'pointer', fontSize: 12,
            }}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '5px 12px', borderRadius: 6, border: 'none',
              background: 'var(--ink, #111)', color: '#fff',
              cursor: saving ? 'default' : 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  ), document.body)
}

function NoteCell({ kodeBarang, note, childNotes, saving, onSave, onDelete }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const hasOwnNote = !!note?.text
  const hasChildNotes = childNotes && childNotes.length > 0
  const hasNote = hasOwnNote || hasChildNotes

  if (!kodeBarang) {
    return <td style={{ textAlign: 'center' }}><span className="muted">—</span></td>
  }

  const titleParts = []
  if (hasOwnNote) titleParts.push(`${note.text}\n(diedit: ${formatNoteTimestamp(note.updatedAt)})`)
  if (hasChildNotes) {
    titleParts.push(
      `Catatan dari ${childNotes.length} varian:\n` +
      childNotes.map(cn => `• [${cn.namaBarang || cn.kodeBarang}] ${cn.text}`).join('\n')
    )
  }
  const title = titleParts.length ? titleParts.join('\n\n') : 'Tambah catatan'

  return (
    <td style={{ textAlign: 'center', position: 'relative' }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        title={title}
        style={{
          border: 'none', background: 'transparent', cursor: 'pointer',
          fontSize: 15, lineHeight: 1, padding: 4, borderRadius: 6,
          opacity: hasNote ? 1 : 0.35, position: 'relative',
        }}
      >
        {hasOwnNote ? '📝' : (hasChildNotes ? '🗂️' : '🗒️')}
        {hasChildNotes && (
          <span style={{
            position: 'absolute', top: -2, right: -2, minWidth: 13, height: 13,
            borderRadius: 7, background: 'var(--primary, #3B3A8C)', color: '#fff',
            fontSize: 9, fontWeight: 700, lineHeight: '13px', padding: '0 3px',
          }}>
            {childNotes.length}
          </span>
        )}
      </button>
      {open && (
        <NoteEditorPopover
          initialText={note?.text || ''}
          updatedAt={note?.updatedAt}
          saving={saving}
          childNotes={childNotes}
          onSave={(text) => onSave(kodeBarang, text)}
          onDelete={() => onDelete(kodeBarang)}
          onClose={() => setOpen(false)}
          anchorRef={btnRef}
        />
      )}
    </td>
  )
}

// ── Modal preview gambar produk (klik thumbnail di kolom Gambar) ───────────────

function ImagePreviewModal({ url, alt, onClose }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return createPortal((
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface, #fff)', borderRadius: 12, padding: '1rem',
          maxWidth: 'min(90vw, 640px)', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column', gap: 10,
          boxShadow: '0 20px 60px rgba(0,0,0,.35)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{alt}</p>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 20, lineHeight: 1, padding: 4, color: 'var(--ink, #111)',
            }}
            aria-label="Tutup"
          >
            ×
          </button>
        </div>
        <img
          src={url}
          alt={alt}
          referrerPolicy="no-referrer"
          style={{
            maxWidth: '100%', maxHeight: '75vh', width: 'auto', height: 'auto',
            objectFit: 'contain', borderRadius: 8, display: 'block', margin: '0 auto',
          }}
        />
      </div>
    </div>
  ), document.body)
}

// ── Modal daftar varian SKU Gabungan (klik indikator Gabungan di kolom Tipe) ─────

function GabunganVariantsModal({ row, hasStock, onClose }) {
  const [modalSearch, setModalSearch] = useState('')
  const [modalSortBy, setModalSortBy] = useState('kuantitas')
  const [modalSortDir, setModalSortDir] = useState('desc')
  const [copied, setCopied] = useState(false)

  // Lock body scroll while modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const variants = row?.variants || []
  const totalKuantitas = row?.kuantitas ?? variants.reduce((s, v) => s + (v.kuantitas || 0), 0)
  const totalStock = row?.stock ?? variants.reduce((s, v) => s + (v.stock || 0), 0)
  const ssrParent = row?.ssr != null ? row.ssr : (totalKuantitas > 0 ? totalStock / totalKuantitas : null)

  // Filtered variants
  const filteredVariants = useMemo(() => {
    const q = modalSearch.trim().toLowerCase()
    if (!q) return variants
    const words = q.split(/\s+/).filter(Boolean)
    return variants.filter(v => {
      const name = String(v.namaBarang || '').toLowerCase()
      const code = String(v.kodeBarang || '').toLowerCase()
      return words.every(w => name.includes(w) || code.includes(w))
    })
  }, [variants, modalSearch])

  // Sorted variants
  const sortedVariants = useMemo(() => {
    const mult = modalSortDir === 'asc' ? 1 : -1
    return [...filteredVariants].sort((a, b) => {
      if (modalSortBy === 'namaBarang') {
        return String(a.namaBarang || '').localeCompare(String(b.namaBarang || ''), 'id') * mult
      }
      if (modalSortBy === 'kodeBarang') {
        return String(a.kodeBarang || '').localeCompare(String(b.kodeBarang || ''), 'id') * mult
      }
      if (modalSortBy === 'stock') {
        const valA = a.stock || 0
        const valB = b.stock || 0
        return (valA - valB) * mult
      }
      if (modalSortBy === 'ssr') {
        const valA = a.ssr ?? -Infinity
        const valB = b.ssr ?? -Infinity
        return (valA - valB) * mult
      }
      // default: kuantitas
      const valA = a.kuantitas || 0
      const valB = b.kuantitas || 0
      return (valA - valB) * mult
    })
  }, [filteredVariants, modalSortBy, modalSortDir])

  const handleSort = (col) => {
    if (modalSortBy === col) {
      setModalSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setModalSortBy(col)
      setModalSortDir(['namaBarang', 'kodeBarang'].includes(col) ? 'asc' : 'desc')
    }
  }

  const renderSortIndicator = (col) => {
    if (modalSortBy !== col) {
      return <span style={{ opacity: 0.3, marginLeft: 4, fontSize: 10 }}>⇅</span>
    }
    return (
      <span style={{ color: 'var(--primary, #3B3A8C)', marginLeft: 4, fontWeight: 'bold' }}>
        {modalSortDir === 'asc' ? '▲' : '▼'}
      </span>
    )
  }

  const handleCopyTable = () => {
    const headers = hasStock
      ? ['No', 'Kode Barang', 'Nama Barang', 'Terjual', 'Stock', 'SSR']
      : ['No', 'Kode Barang', 'Nama Barang', 'Terjual']
    const rowsData = sortedVariants.map((v, i) => {
      const ssrStr = v.ssr != null ? v.ssr.toFixed(2) : '-'
      const stockStr = v.hasStockData ? (v.stock || 0) : 0
      return hasStock
        ? [i + 1, v.kodeBarang || '-', v.namaBarang || '-', v.kuantitas || 0, stockStr, ssrStr]
        : [i + 1, v.kodeBarang || '-', v.namaBarang || '-', v.kuantitas || 0]
    })
    const tsv = [headers.join('\t'), ...rowsData.map(r => r.join('\t'))].join('\n')
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(tsv).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }).catch(() => {})
    }
  }

  const renderSsrBadge = (ssrVal) => {
    if (ssrVal == null) return <span className="muted">—</span>
    if (ssrVal < 1) {
      return (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 7px',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 700,
            background: 'rgb(255, 215, 215)',
            color: '#b91c1c',
            border: '1px solid rgb(254, 178, 178)',
          }}
          title="SSR < 1 (stok tidak cukup 1 bulan)"
        >
          {ssrVal.toFixed(2)}
        </span>
      )
    }
    if (ssrVal <= 2) {
      return (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 7px',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 700,
            background: 'rgb(254, 243, 199)',
            color: '#92400e',
            border: '1px solid rgb(253, 230, 138)',
          }}
          title="SSR 1–2 (stok menipis, segera restock)"
        >
          {ssrVal.toFixed(2)}
        </span>
      )
    }
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 7px',
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 600,
          background: '#f0fdf4',
          color: '#166534',
          border: '1px solid #bbf7d0',
        }}
      >
        {ssrVal.toFixed(2)}
      </span>
    )
  }

  return createPortal((
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface, #fff)',
          borderRadius: 14,
          maxWidth: 'min(94vw, 920px)',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
          border: '1px solid var(--border, #e2e8f0)',
          overflow: 'hidden',
          animation: 'modalFadeIn 0.16s ease-out',
        }}
      >
        {/* ── Modal Header ── */}
        <div style={{
          padding: '1.1rem 1.4rem',
          borderBottom: '1px solid var(--border, #e5e3dc)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          background: 'var(--bg, #fafaf8)',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                color: 'var(--primary, #3B3A8C)',
                background: 'var(--primary-light, #EEEDFE)',
                padding: '2px 8px',
                borderRadius: 4,
              }}>
                SKU GABUNGAN
              </span>
              <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink, #1C1B19)' }}>
                {row?.kodeBarang || '—'}
              </span>
              {row?.brand && row.brand !== '—' && (
                <span className="badge-brand">{row.brand}</span>
              )}
              <span style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: 'var(--ink-muted, #6B6A66)',
                background: 'var(--surface-2, #f0eefc)',
                padding: '2px 7px',
                borderRadius: 4,
              }}>
                {variants.length} Varian
              </span>
            </div>
            <h2 style={{
              margin: 0,
              fontSize: 15.5,
              fontWeight: 600,
              color: 'var(--ink, #1C1B19)',
              lineHeight: 1.35,
            }}>
              {row?.namaBarang || '—'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 22,
              lineHeight: 1,
              width: 32,
              height: 32,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink-muted, #6B6A66)',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; e.currentTarget.style.color = 'var(--ink, #111)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-muted, #6B6A66)' }}
          >
            ×
          </button>
        </div>

        {/* ── Summary KPI Cards ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 10,
          padding: '0.85rem 1.4rem',
          background: 'var(--surface, #fff)',
          borderBottom: '1px solid var(--border, #e5e3dc)',
        }}>
          <div style={{ background: 'var(--surface-2, #f5f5f5)', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
            <p className="muted" style={{ fontSize: 11, margin: 0, textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600 }}>Total Terjual</p>
            <p className="mono" style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 0', color: 'var(--primary, #3B3A8C)' }}>
              {totalKuantitas.toLocaleString('id-ID')} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-muted)' }}>pcs</span>
            </p>
          </div>
          {hasStock && (
            <>
              <div style={{ background: 'var(--surface-2, #f5f5f5)', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
                <p className="muted" style={{ fontSize: 11, margin: 0, textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600 }}>Total Stock</p>
                <p className="mono" style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 0' }}>
                  {totalStock.toLocaleString('id-ID')} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-muted)' }}>pcs</span>
                </p>
              </div>
              <div style={{ background: 'var(--surface-2, #f5f5f5)', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
                <p className="muted" style={{ fontSize: 11, margin: 0, textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600 }}>SSR Gabungan</p>
                <p className="mono" style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 0' }}>
                  {ssrParent != null ? ssrParent.toFixed(2) : '—'}
                </p>
              </div>
            </>
          )}
          <div style={{ background: 'var(--surface-2, #f5f5f5)', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
            <p className="muted" style={{ fontSize: 11, margin: 0, textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600 }}>Jumlah Varian</p>
            <p className="mono" style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 0' }}>
              {variants.length} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-muted)' }}>item</span>
            </p>
          </div>
        </div>

        {/* ── Search & Filter Bar within Modal ── */}
        <div style={{
          padding: '0.65rem 1.4rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          background: 'var(--bg, #fafaf8)',
          borderBottom: '1px solid var(--border, #e5e3dc)',
          flexWrap: 'wrap',
        }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <span style={{
              position: 'absolute',
              left: '0.7rem',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 13,
              color: 'var(--muted, #888)',
              pointerEvents: 'none',
            }}>🔍</span>
            <input
              type="text"
              placeholder="Cari nama barang atau kode varian…"
              value={modalSearch}
              onChange={e => setModalSearch(e.target.value)}
              style={{
                width: '100%',
                height: 34,
                boxSizing: 'border-box',
                paddingLeft: '2.1rem',
                paddingRight: modalSearch ? '2rem' : '0.75rem',
                fontSize: 12.5,
                borderRadius: 6,
                border: '1px solid var(--border, #ddd)',
                background: 'var(--surface, #fff)',
                color: 'var(--ink, #1C1B19)',
                outline: 'none',
              }}
            />
            {modalSearch && (
              <button
                type="button"
                onClick={() => setModalSearch('')}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  color: 'var(--muted, #888)',
                  padding: 2,
                }}
              >
                ✕
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>
              {modalSearch ? `Menampilkan ${sortedVariants.length} dari ${variants.length} varian` : `${variants.length} varian terdaftar`}
            </span>
            <button
              type="button"
              onClick={handleCopyTable}
              className="pill-btn"
              style={{
                fontSize: 11.5,
                padding: '4px 9px',
                borderRadius: 5,
                border: '1px solid var(--border, #ddd)',
                background: 'var(--surface, #fff)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                color: 'var(--ink, #1C1B19)',
              }}
              title="Salin data tabel varian ke clipboard"
            >
              <span>{copied ? '✓ Disalin!' : '📋 Salin Tabel'}</span>
            </button>
          </div>
        </div>

        {/* ── Variants Table ── */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'auto',
          maxHeight: 'calc(90vh - 270px)',
          minHeight: 180,
        }}>
          <table className="data-table" style={{ width: '100%', margin: 0, borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface, #fff)' }}>
              <tr>
                <th style={{ width: 40, textAlign: 'center' }}>#</th>
                <th
                  onClick={() => handleSort('kodeBarang')}
                  style={{ cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap', userSelect: 'none', width: 140 }}
                  title="Klik untuk mengurutkan kode barang"
                >
                  Kode Barang {renderSortIndicator('kodeBarang')}
                </th>
                <th
                  onClick={() => handleSort('namaBarang')}
                  style={{ cursor: 'pointer', textAlign: 'left', userSelect: 'none' }}
                  title="Klik untuk mengurutkan nama barang"
                >
                  Nama Barang {renderSortIndicator('namaBarang')}
                </th>
                <th
                  onClick={() => handleSort('kuantitas')}
                  style={{ cursor: 'pointer', textAlign: 'right', whiteSpace: 'nowrap', userSelect: 'none', width: 110 }}
                  title="Klik untuk mengurutkan jumlah terjual"
                >
                  Terjual {renderSortIndicator('kuantitas')}
                </th>
                {hasStock && (
                  <>
                    <th
                      onClick={() => handleSort('stock')}
                      style={{ cursor: 'pointer', textAlign: 'right', whiteSpace: 'nowrap', userSelect: 'none', width: 110 }}
                      title="Klik untuk mengurutkan stock"
                    >
                      Stock {renderSortIndicator('stock')}
                    </th>
                    <th
                      onClick={() => handleSort('ssr')}
                      style={{ cursor: 'pointer', textAlign: 'right', whiteSpace: 'nowrap', userSelect: 'none', width: 95 }}
                      title="Klik untuk mengurutkan SSR"
                    >
                      SSR {renderSortIndicator('ssr')}
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedVariants.length === 0 && (
                <tr>
                  <td colSpan={hasStock ? 6 : 4} style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                    <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                      {modalSearch ? `Tidak ada varian yang cocok dengan "${modalSearch}".` : 'Belum ada data varian untuk SKU ini.'}
                    </p>
                  </td>
                </tr>
              )}
              {sortedVariants.map((v, idx) => {
                const lowSsr = hasStock && v.ssr != null && v.ssr < 1
                const restockSoonSsr = hasStock && v.ssr != null && v.ssr >= 1 && v.ssr <= 2
                const rowBg = lowSsr
                  ? 'rgba(255, 162, 162, 0.22)'
                  : restockSoonSsr
                    ? 'rgba(255, 235, 156, 0.28)'
                    : undefined

                return (
                  <tr
                    key={v.kodeBarang || idx}
                    style={{ background: rowBg }}
                  >
                    <td className="mono" style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-muted)' }}>
                      {idx + 1}
                    </td>
                    <td className="mono" style={{ whiteSpace: 'nowrap', fontWeight: 600, fontSize: 12.5 }}>
                      <HighlightText text={v.kodeBarang || '—'} query={modalSearch} />
                    </td>
                    <td style={{ fontWeight: 500, fontSize: 13 }}>
                      <HighlightText text={v.namaBarang || '—'} query={modalSearch} />
                    </td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 600, fontSize: 13 }}>
                      {(v.kuantitas || 0).toLocaleString('id-ID')}
                    </td>
                    {hasStock && (
                      <>
                        <td className="mono" style={{ textAlign: 'right', fontSize: 13 }}>
                          {v.hasStockData
                            ? (
                              <span style={{ color: (v.stock || 0) === 0 ? 'var(--accent, #D85A30)' : 'inherit', fontWeight: (v.stock || 0) === 0 ? 600 : 400 }}>
                                {(v.stock || 0).toLocaleString('id-ID')}
                              </span>
                            )
                            : <span className="muted">0</span>}
                        </td>
                        <td className="mono" style={{ textAlign: 'right', fontSize: 12.5 }}>
                          {renderSsrBadge(v.ssr)}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
            {sortedVariants.length > 0 && (
              <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 1, background: 'var(--surface-2, #f5f5f5)', fontWeight: 700 }}>
                <tr style={{ borderTop: '2px solid var(--border, #ddd)' }}>
                  <td colSpan={3} style={{ textAlign: 'right', padding: '9px 12px', fontSize: 13 }}>
                    Total Gabungan ({sortedVariants.length} varian):
                  </td>
                  <td className="mono" style={{ textAlign: 'right', padding: '9px 12px', fontSize: 13, color: 'var(--primary, #3B3A8C)' }}>
                    {sortedVariants.reduce((s, v) => s + (v.kuantitas || 0), 0).toLocaleString('id-ID')}
                  </td>
                  {hasStock && (
                    <>
                      <td className="mono" style={{ textAlign: 'right', padding: '9px 12px', fontSize: 13 }}>
                        {sortedVariants.reduce((s, v) => s + (v.stock || 0), 0).toLocaleString('id-ID')}
                      </td>
                      <td className="mono" style={{ textAlign: 'right', padding: '9px 12px', fontSize: 13 }}>
                        {(() => {
                          const subKuantitas = sortedVariants.reduce((s, v) => s + (v.kuantitas || 0), 0)
                          const subStock = sortedVariants.reduce((s, v) => s + (v.stock || 0), 0)
                          const subSsr = subKuantitas > 0 ? subStock / subKuantitas : null
                          return subSsr != null ? subSsr.toFixed(2) : '—'
                        })()}
                      </td>
                    </>
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* ── Modal Footer ── */}
        <div style={{
          padding: '0.85rem 1.4rem',
          borderTop: '1px solid var(--border, #e5e3dc)',
          background: 'var(--bg, #fafaf8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: 12 }}>
            {hasStock ? (
              <>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgb(255, 162, 162)', display: 'inline-block' }} />
                  SSR &lt; 1 (kritis, stok &lt; 1 bln)
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgb(255, 235, 156)', display: 'inline-block' }} />
                  SSR 1–2 (menipis, segera restock)
                </span>
              </>
            ) : (
              <span className="muted" style={{ fontSize: 12 }}>
                ℹ️ Data stock belum diunggah. Nilai Stock dan SSR akan muncul jika file master stock tersedia.
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="pill-btn"
            style={{
              padding: '6px 18px',
              borderRadius: 6,
              border: '1px solid var(--border, #ddd)',
              background: 'var(--surface, #fff)',
              color: 'var(--ink, #1C1B19)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  ), document.body)
}

// ── Modal Pembagian Promo (Acak varian SKU Gabungan ke N periode campaign) ────

const PROMO_PERIOD_COLORS = [
  { bg: '#EEEDFE', text: '#3B3A8C', border: '#C7D2FE' },
  { bg: '#E0F2FE', text: '#0369A1', border: '#BAE6FD' },
  { bg: '#D1FAE5', text: '#047857', border: '#A7F3D0' },
  { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A' },
  { bg: '#FFE4E6', text: '#BE123C', border: '#FECDD3' },
  { bg: '#EDE9FE', text: '#6D28D9', border: '#DDD6FE' },
  { bg: '#CFFAFE', text: '#0E7490', border: '#A5F3FC' },
  { bg: '#FCE7F3', text: '#9D174D', border: '#FBCFE8' },
  { bg: '#FEF9C3', text: '#854D0E', border: '#FEF08A' },
  { bg: '#E2E8F0', text: '#334155', border: '#CBD5E1' },
]

function shuffleArray(arr) {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function PembagianPromoModal({
  isOpen,
  onClose,
  selectedRows: initialSelectedRows,
  allRows = [],
  onSelectRows,
  hasStock = false,
}) {
  const [step, setStep] = useState('config') // 'config' | 'result'
  const [periodCount, setPeriodCount] = useState(3)
  const [selectedCodes, setSelectedCodes] = useState(() => new Set(initialSelectedRows.map(r => r.kodeBarang).filter(Boolean)))
  const [distributedVariants, setDistributedVariants] = useState([])
  const [selectedExportIds, setSelectedExportIds] = useState(() => new Set())
  const [activePeriodFilter, setActivePeriodFilter] = useState('all') // 'all' | number (0, 1, ...) | 'excluded'
  const [promoSearch, setPromoSearch] = useState('')
  const [promoSortBy, setPromoSortBy] = useState('periodIndex')
  const [promoSortDir, setPromoSortDir] = useState('asc')
  const [copied, setCopied] = useState(false)

  // ── Syarat & Kriteria Varian Promo ──
  const [minStock, setMinStock] = useState(10)
  const [excludeKode, setExcludeKode] = useState('OB')
  const [excludeNama, setExcludeNama] = useState('grosir')
  const [showExcludedPreview, setShowExcludedPreview] = useState(false)

  // ── Integrasi Stok Marketplace & Diskon Promo ──
  const [discountPct, setDiscountPct] = useState(10)
  const [mpCustomers, setMpCustomers] = useState([])
  const [selectedMpCustomer, setSelectedMpCustomer] = useState('all')
  const [mpStockItems, setMpStockItems] = useState([])
  const [allMpStockItems, setAllMpStockItems] = useState([])
  const [isExportingZip, setIsExportingZip] = useState(false)
  const [zipSuccessToast, setZipSuccessToast] = useState(false)

  // Muat daftar toko dari stok marketplace dan juga pre-fetch data semua toko
  useEffect(() => {
    let isMounted = true
    async function loadMpIndex() {
      try {
        const res = await fetch('/api/stok-marketplace/index')
        if (res.ok) {
          const json = await res.json()
          const list = json.customers || []
          if (isMounted) {
            setMpCustomers(list)
          }
        }
      } catch (err) {
        console.error('Error fetching marketplace stock index:', err)
      }
    }

    async function loadAllStores() {
      try {
        const res = await fetch('/api/stok-marketplace/data?customer=all')
        if (res.ok) {
          const json = await res.json()
          if (isMounted && json.data?.items) {
            setAllMpStockItems(json.data.items)
            setMpStockItems(json.data.items)
          }
        }
      } catch (err) {
        console.error('Error fetching all marketplace stock:', err)
      }
    }

    loadMpIndex()
    loadAllStores()
    return () => { isMounted = false }
  }, [])

  // Muat data stok marketplace saat toko spesifik dipilih (jika bukan 'all')
  useEffect(() => {
    if (!selectedMpCustomer || selectedMpCustomer === 'all') {
      if (allMpStockItems.length > 0) {
        setMpStockItems(allMpStockItems)
      }
      return
    }
    let isMounted = true
    async function loadMpData() {
      try {
        const res = await fetch(`/api/stok-marketplace/data?customer=${encodeURIComponent(selectedMpCustomer)}`)
        if (res.ok) {
          const json = await res.json()
          if (isMounted && json.data?.items) {
            setMpStockItems(json.data.items)
          }
        }
      } catch (err) {
        console.error('Error fetching marketplace stock items:', err)
      }
    }
    loadMpData()
    return () => { isMounted = false }
  }, [selectedMpCustomer, allMpStockItems])

  // Lookup map stok marketplace untuk matching: SKU di Stok MP vs Nama Variasi di Pembagian Promo
  const mpLookupMap = useMemo(() => {
    const map = new Map()
    const registerItem = (item) => {
      if (!item || !item.sku) return
      const rawSku = String(item.sku).trim()
      const normSku = rawSku.toLowerCase()
      if (!map.has(normSku)) map.set(normSku, item)

      const normSpace = normSku.replace(/\s+/g, ' ')
      if (!map.has(normSpace)) map.set(normSpace, item)

      const cleanSku = normSku.replace(/[^a-z0-9]/g, '')
      if (cleanSku && !map.has(cleanSku)) {
        map.set(cleanSku, item)
      }

      if (item.namaProduk) {
        const normNama = String(item.namaProduk).trim().toLowerCase()
        if (!map.has(normNama)) map.set(normNama, item)
      }
    }

    // Prioritaskan item dari toko terpilih
    for (const item of mpStockItems) {
      registerItem(item)
    }

    // Juga tambahkan fallback dari allMpStockItems jika ada varian dari toko lain
    for (const item of allMpStockItems) {
      registerItem(item)
    }

    return map
  }, [mpStockItems, allMpStockItems])

  // Helper pencocokan: "use Nama Variasi (in pembagian promo) to match the SKU (in stok marketplace)"
  const getMatchedMpItem = useCallback((v) => {
    if (!v) return null
    // Nama Variasi di tabel promo adalah v.namaBarang
    const rawNama = String(v.namaBarang || '').trim()
    const nama = rawNama.toLowerCase()
    const normSpace = nama.replace(/\s+/g, ' ')
    const cleanNama = nama.replace(/[^a-z0-9]/g, '')
    const kode = String(v.kodeBarang || '').trim().toLowerCase()
    const cleanKode = kode.replace(/[^a-z0-9]/g, '')

    // 1. Match Nama Variasi (namaBarang) di Produk Terlaris dengan SKU di Stok Marketplace
    if (mpLookupMap.has(nama)) return mpLookupMap.get(nama)
    if (mpLookupMap.has(normSpace)) return mpLookupMap.get(normSpace)
    if (cleanNama && mpLookupMap.has(cleanNama)) return mpLookupMap.get(cleanNama)

    // 2. Match Kode Barang dengan SKU di Stok Marketplace
    if (mpLookupMap.has(kode)) return mpLookupMap.get(kode)
    if (cleanKode && mpLookupMap.has(cleanKode)) return mpLookupMap.get(cleanKode)

    return null
  }, [mpLookupMap])

  // Helper info promo lengkap untuk 1 varian
  const getVariantPromoDetails = useCallback((v, discount) => {
    const matched = getMatchedMpItem(v)
    const diskonVal = Math.max(0, Math.min(100, Number(discount) || 0))

    // Harga normal murni dari Stok Marketplace (match Nama Variasi dgn SKU di Stok MP)
    const hargaNormal = (matched?.harga && matched.harga > 0) ? matched.harga : 0

    // Harga diskon: Harga normal dikurangi persentase diskon
    const hargaDiskon = hargaNormal > 0
      ? Math.max(0, Math.round(hargaNormal * (1 - (diskonVal / 100))))
      : 0

    return {
      namaVariasi: v.namaBarang || '-',
      kodeProduk: matched?.kodeProduk || '-',
      kodeVariasi: matched?.kodeVariasi || '-',
      hargaDiskon,
      hargaNormal,
      hasMatch: !!matched,
    }
  }, [getMatchedMpItem])

  // Hitung jumlah varian terdistribusi yang cocok dengan data Stok Marketplace
  const matchedVariantsCount = useMemo(() => {
    return distributedVariants.filter(v => getMatchedMpItem(v) !== null).length
  }, [distributedVariants, getMatchedMpItem])

  // Handler ekspor Excel per periode dikemas dalam file ZIP
  const handleExportPromoZip = async () => {
    // Hanya ekspor varian yang dicentang / dipilih
    const variantsToExport = distributedVariants.filter(v => selectedExportIds.has(v.uid))

    if (!variantsToExport.length) {
      alert('Tidak ada SKU / varian yang dicentang untuk diekspor ke Excel. Silakan centang minimal satu varian.')
      return
    }

    setIsExportingZip(true)
    try {
      const zip = new JSZip()
      const diskonVal = Math.max(0, Math.min(100, Number(discountPct) || 0))

      // Buat file Excel terpisah untuk setiap periode promo (Periode 1, Periode 2, ... Periode N)
      for (let p = 0; p < periodCount; p++) {
        const periodNum = p + 1
        const periodVariants = variantsToExport.filter(v => v.periodIndex === p)

        // Header sesuai template spesifik permintaan user:
        // Column A (Nama Variasi) : Nama Barang dari pembagian campaign
        // Column B (Kode Produk) : Kode Produk dari Stok Marketplace (match Nama Barang dgn SKU)
        // Column C (Kode Variasi) : Kode Variasi dari Stok Marketplace (match Nama Barang dgn SKU)
        // Column D (Harga diskon) : Harga dari Stok Marketplace substract with discount
        // Column E (Harga normal) : Harga dari Stok Marketplace
        const headers = ['Nama Variasi', 'Kode Produk', 'Kode Variasi', 'Harga diskon', 'Harga normal']
        const rows = periodVariants.map(v => {
          const det = getVariantPromoDetails(v, diskonVal)
          return [
            det.namaVariasi,
            det.kodeProduk,
            det.kodeVariasi,
            det.hargaDiskon,
            det.hargaNormal,
          ]
        })

        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
        ws['!cols'] = [
          { wch: 44 }, // Nama Variasi
          { wch: 22 }, // Kode Produk
          { wch: 22 }, // Kode Variasi
          { wch: 18 }, // Harga diskon
          { wch: 18 }, // Harga normal
        ]

        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, `Periode ${periodNum}`)
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
        zip.file(`Periode ${periodNum}.xlsx`, excelBuffer)
      }

      // ── File Excel Tambahan: Satu berkas yang memuat seluruh data periode (Semua Periode.xlsx) ──
      const allPeriodHeaders = ['Periode Promo', 'Nama Variasi', 'Kode Produk', 'Kode Variasi', 'Harga diskon', 'Harga normal']
      // Urutkan seluruh varian terpilih berdasarkan periodIndex asc, kemudian kuantitas desc
      const sortedAllVariants = [...variantsToExport].sort((a, b) => a.periodIndex - b.periodIndex || (b.kuantitas || 0) - (a.kuantitas || 0))
      const allRows = sortedAllVariants.map(v => {
        const det = getVariantPromoDetails(v, diskonVal)
        return [
          v.periodePromo || `Periode ${v.periodIndex + 1}`,
          det.namaVariasi,
          det.kodeProduk,
          det.kodeVariasi,
          det.hargaDiskon,
          det.hargaNormal,
        ]
      })

      const wbAll = XLSX.utils.book_new()

      // Sheet 1: Seluruh data periode digabung dalam satu tabel
      const wsAll = XLSX.utils.aoa_to_sheet([allPeriodHeaders, ...allRows])
      wsAll['!cols'] = [
        { wch: 16 }, // Periode Promo
        { wch: 44 }, // Nama Variasi
        { wch: 22 }, // Kode Produk
        { wch: 22 }, // Kode Variasi
        { wch: 18 }, // Harga diskon
        { wch: 18 }, // Harga normal
      ]
      XLSX.utils.book_append_sheet(wbAll, wsAll, 'Semua Periode')

      // Sheet 2..N+1: Sheet per periode di dalam workbook yang sama
      for (let p = 0; p < periodCount; p++) {
        const periodNum = p + 1
        const periodVariants = variantsToExport.filter(v => v.periodIndex === p)
        const singleHeaders = ['Nama Variasi', 'Kode Produk', 'Kode Variasi', 'Harga diskon', 'Harga normal']
        const pRows = periodVariants.map(v => {
          const det = getVariantPromoDetails(v, diskonVal)
          return [
            det.namaVariasi,
            det.kodeProduk,
            det.kodeVariasi,
            det.hargaDiskon,
            det.hargaNormal,
          ]
        })
        const wsP = XLSX.utils.aoa_to_sheet([singleHeaders, ...pRows])
        wsP['!cols'] = [
          { wch: 44 },
          { wch: 22 },
          { wch: 22 },
          { wch: 18 },
          { wch: 18 },
        ]
        XLSX.utils.book_append_sheet(wbAll, wsP, `Periode ${periodNum}`)
      }

      const allExcelBuffer = XLSX.write(wbAll, { bookType: 'xlsx', type: 'array' })
      zip.file('Semua Periode.xlsx', allExcelBuffer)

      // Kemas seluruh file Excel ke dalam berkas .zip
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Pembagian_Promo_${periodCount}_Periode_${variantsToExport.length}_SKU_Diskon_${diskonVal}pct_${new Date().toISOString().slice(0, 10)}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setZipSuccessToast(true)
      setTimeout(() => setZipSuccessToast(false), 3000)
    } catch (err) {
      console.error('Error generating promo zip export:', err)
      alert('Gagal mengemas dan mengunduh berkas promo .zip: ' + (err.message || 'Error'))
    } finally {
      setIsExportingZip(false)
    }
  }

  // Sync selectedCodes if initialSelectedRows change
  useEffect(() => {
    setSelectedCodes(new Set(initialSelectedRows.map(r => r.kodeBarang).filter(Boolean)))
  }, [initialSelectedRows])

  // Lock body scroll
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Selectable rows available in dataset (all gabungan rows plus any currently selected rows)
  const selectableModalRows = useMemo(() => {
    const set = new Set()
    const list = []
    allRows.forEach(r => {
      if (!r.kodeBarang) return
      if (r.tipe === 'gabungan' || selectedCodes.has(r.kodeBarang)) {
        if (!set.has(r.kodeBarang)) {
          set.add(r.kodeBarang)
          list.push(r)
        }
      }
    })
    return list.length > 0 ? list : allRows
  }, [allRows, selectedCodes])

  // Current selected rows
  const selectedRows = useMemo(() => {
    return allRows.filter(r => r.kodeBarang && selectedCodes.has(r.kodeBarang))
  }, [allRows, selectedCodes])

  // Total variants in selection
  const totalVariantsInSelection = useMemo(() => {
    return selectedRows.reduce((sum, r) => sum + (r.variants?.length || 1), 0)
  }, [selectedRows])

  const handleToggleCode = (kode) => {
    setSelectedCodes(prev => {
      const next = new Set(prev)
      if (next.has(kode)) next.delete(kode)
      else next.add(kode)
      if (onSelectRows) onSelectRows(next)
      return next
    })
  }

  const handleSelectAllInModal = () => {
    const next = new Set(selectableModalRows.map(r => r.kodeBarang).filter(Boolean))
    setSelectedCodes(next)
    if (onSelectRows) onSelectRows(next)
  }

  const handleClearSelectedCodes = () => {
    const next = new Set()
    setSelectedCodes(next)
    if (onSelectRows) onSelectRows(next)
  }

  // Keywords filter parsed from comma-separated criteria
  const excludeKodeKeywords = useMemo(() => {
    return excludeKode.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  }, [excludeKode])

  const excludeNamaKeywords = useMemo(() => {
    return excludeNama.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  }, [excludeNama])

  // Evaluasi kelayakan 1 varian terhadap syarat promo
  const checkVariantEligibility = useCallback((v) => {
    // 1. Min Stock (hanya dicek jika master stock tersedia dan minStock > 0)
    if (hasStock && minStock > 0) {
      const currentStock = v.hasStockData ? (v.stock || 0) : (v.stock || 0)
      if (currentStock < minStock) {
        return { eligible: false, reason: `Stok ${currentStock} < min ${minStock}` }
      }
    }

    // 2. Exclude Kode Barang (No Barang)
    if (excludeKodeKeywords.length > 0) {
      const code = String(v.kodeBarang || '').toLowerCase()
      const match = excludeKodeKeywords.find(kw => code.includes(kw))
      if (match) {
        return { eligible: false, reason: `Kode mengandung "${match}"` }
      }
    }

    // 3. Exclude Nama Barang
    if (excludeNamaKeywords.length > 0) {
      const name = String(v.namaBarang || '').toLowerCase()
      const match = excludeNamaKeywords.find(kw => name.includes(kw))
      if (match) {
        return { eligible: false, reason: `Nama mengandung "${match}"` }
      }
    }

    return { eligible: true }
  }, [hasStock, minStock, excludeKodeKeywords, excludeNamaKeywords])

  // Klasifikasikan varian dari SKU terpilih: yang lolos vs yang dikecualikan
  const { eligibleVariantsList, excludedVariantsList } = useMemo(() => {
    const eligible = []
    const excluded = []

    selectedRows.forEach(parent => {
      const rawVariants = parent.variants && parent.variants.length > 0
        ? parent.variants
        : [{
            kodeBarang: parent.kodeBarang,
            namaBarang: parent.namaBarang,
            kuantitas: parent.kuantitas || 0,
            stock: parent.stock || 0,
            hasStockData: parent.hasStockData,
            ssr: parent.ssr,
          }]

      rawVariants.forEach(v => {
        const check = checkVariantEligibility(v)
        const enriched = {
          ...v,
          parentKode: parent.kodeBarang,
          parentNama: parent.namaBarang,
          parentBrand: parent.brand,
        }
        if (check.eligible) {
          eligible.push(enriched)
        } else {
          excluded.push({
            ...enriched,
            excludeReason: check.reason,
          })
        }
      })
    })

    return { eligibleVariantsList: eligible, excludedVariantsList: excluded }
  }, [selectedRows, checkVariantEligibility])

  // Distribution generator
  const runDistribution = useCallback((N) => {
    const count = Math.max(2, Math.min(20, N || periodCount))
    const distributed = []

    selectedRows.forEach(parent => {
      const rawVariants = parent.variants && parent.variants.length > 0
        ? parent.variants
        : [{
            kodeBarang: parent.kodeBarang,
            namaBarang: parent.namaBarang,
            kuantitas: parent.kuantitas || 0,
            stock: parent.stock || 0,
            hasStockData: parent.hasStockData,
            ssr: parent.ssr,
          }]

      // Filter hanya varian yang memenuhi syarat promo
      const eligibleVariants = rawVariants.filter(v => checkVariantEligibility(v).eligible)
      if (eligibleVariants.length === 0) return

      // Shuffle varian yang lolos dari parent SKU ini
      const shuffledVariants = shuffleArray(eligibleVariants)
      // Random starting period index offset for fair distribution
      const offset = Math.floor(Math.random() * count)

      shuffledVariants.forEach((v, idx) => {
        const periodIdx = (idx + offset) % count
        const uid = `${v.kodeBarang || 'KB'}__${v.namaBarang || 'NB'}__P${periodIdx}__${distributed.length}`
        distributed.push({
          ...v,
          uid,
          parentKode: parent.kodeBarang,
          parentNama: parent.namaBarang,
          parentBrand: parent.brand,
          periodIndex: periodIdx,
          periodePromo: `Periode ${periodIdx + 1}`,
        })
      })
    })

    // Sort by periodIndex asc, then by kuantitas desc
    distributed.sort((a, b) => a.periodIndex - b.periodIndex || (b.kuantitas || 0) - (a.kuantitas || 0))
    setDistributedVariants(distributed)

    // Inisialisasi seleksi SKU untuk ekspor:
    // Jika Kode & Var dari stok marketplace tidak ditemukan, otomatis UNCHECKED agar dikecualikan dari ekspor.
    // Hanya varian yang Kode & Var ditemukan di Stok Marketplace yang otomatis CHECKED.
    const initialSelected = new Set()
    distributed.forEach(v => {
      const det = getVariantPromoDetails(v, discountPct)
      const hasMp = Boolean(
        det.hasMatch &&
        det.kodeProduk &&
        det.kodeProduk !== '-' &&
        det.kodeVariasi &&
        det.kodeVariasi !== '-'
      )
      if (hasMp) {
        initialSelected.add(v.uid)
      }
    })
    setSelectedExportIds(initialSelected)

    setActivePeriodFilter('all')
    setPromoSearch('')
    setStep('result')
  }, [selectedRows, periodCount, checkVariantEligibility, getVariantPromoDetails, discountPct])

  // Helper seleksi ekspor promo per SKU
  const handleToggleExportId = (uid) => {
    setSelectedExportIds(prev => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }

  const handleSelectAllMatched = () => {
    const next = new Set()
    distributedVariants.forEach(v => {
      const det = getVariantPromoDetails(v, discountPct)
      const hasMp = Boolean(
        det.hasMatch &&
        det.kodeProduk &&
        det.kodeProduk !== '-' &&
        det.kodeVariasi &&
        det.kodeVariasi !== '-'
      )
      if (hasMp) next.add(v.uid)
    })
    setSelectedExportIds(next)
  }

  const handleSelectAllExport = () => {
    setSelectedExportIds(new Set(distributedVariants.map(v => v.uid)))
  }

  const handleClearExportSelection = () => {
    setSelectedExportIds(new Set())
  }

  // Filtered variants in Result step
  const filteredPromoVariants = useMemo(() => {
    let list = activePeriodFilter === 'excluded' ? excludedVariantsList : distributedVariants
    if (activePeriodFilter !== 'all' && activePeriodFilter !== 'excluded') {
      list = list.filter(v => v.periodIndex === activePeriodFilter)
    }
    if (promoSearch.trim()) {
      const words = promoSearch.trim().toLowerCase().split(/\s+/).filter(Boolean)
      list = list.filter(v => {
        const name = String(v.namaBarang || '').toLowerCase()
        const code = String(v.kodeBarang || '').toLowerCase()
        const parent = String(v.parentKode || '').toLowerCase()
        const period = String(v.periodePromo || '').toLowerCase()
        const reason = String(v.excludeReason || '').toLowerCase()
        return words.every(w => name.includes(w) || code.includes(w) || parent.includes(w) || period.includes(w) || reason.includes(w))
      })
    }
    return list
  }, [distributedVariants, excludedVariantsList, activePeriodFilter, promoSearch])

  // Hitung status centang di tampilan aktif
  const currentVisibleVariants = useMemo(() => {
    if (activePeriodFilter === 'excluded') return []
    return filteredPromoVariants
  }, [activePeriodFilter, filteredPromoVariants])

  const isAllCurrentChecked = useMemo(() => {
    if (currentVisibleVariants.length === 0) return false
    return currentVisibleVariants.every(v => selectedExportIds.has(v.uid))
  }, [currentVisibleVariants, selectedExportIds])

  const isCurrentIndeterminate = useMemo(() => {
    if (currentVisibleVariants.length === 0) return false
    const count = currentVisibleVariants.filter(v => selectedExportIds.has(v.uid)).length
    return count > 0 && count < currentVisibleVariants.length
  }, [currentVisibleVariants, selectedExportIds])

  const handleToggleSelectAllVisible = () => {
    setSelectedExportIds(prev => {
      const next = new Set(prev)
      if (isAllCurrentChecked) {
        currentVisibleVariants.forEach(v => next.delete(v.uid))
      } else {
        currentVisibleVariants.forEach(v => next.add(v.uid))
      }
      return next
    })
  }

  const { matchedCount, unmatchedCount, selectedExportCount } = useMemo(() => {
    let matched = 0
    let unmatched = 0
    let selected = 0

    distributedVariants.forEach(v => {
      const det = getVariantPromoDetails(v, discountPct)
      const hasMp = Boolean(
        det.hasMatch &&
        det.kodeProduk &&
        det.kodeProduk !== '-' &&
        det.kodeVariasi &&
        det.kodeVariasi !== '-'
      )
      if (hasMp) matched++
      else unmatched++

      if (selectedExportIds.has(v.uid)) selected++
    })

    return { matchedCount: matched, unmatchedCount: unmatched, selectedExportCount: selected }
  }, [distributedVariants, getVariantPromoDetails, discountPct, selectedExportIds])

  // Sorted variants in Result step
  const sortedPromoVariants = useMemo(() => {
    const mult = promoSortDir === 'asc' ? 1 : -1
    return [...filteredPromoVariants].sort((a, b) => {
      if (promoSortBy === 'periodIndex') {
        if (a.periodIndex !== b.periodIndex) return (a.periodIndex - b.periodIndex) * mult
        return (b.kuantitas || 0) - (a.kuantitas || 0)
      }
      if (promoSortBy === 'namaBarang') {
        return String(a.namaBarang || '').localeCompare(String(b.namaBarang || ''), 'id') * mult
      }
      if (promoSortBy === 'kodeBarang') {
        return String(a.kodeBarang || '').localeCompare(String(b.kodeBarang || ''), 'id') * mult
      }
      if (promoSortBy === 'stock') {
        return ((a.stock || 0) - (b.stock || 0)) * mult
      }
      if (promoSortBy === 'ssr') {
        const valA = a.ssr ?? -Infinity
        const valB = b.ssr ?? -Infinity
        return (valA - valB) * mult
      }
      // kuantitas
      return ((a.kuantitas || 0) - (b.kuantitas || 0)) * mult
    })
  }, [filteredPromoVariants, promoSortBy, promoSortDir])

  const handleSort = (col) => {
    if (promoSortBy === col) {
      setPromoSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setPromoSortBy(col)
      setPromoSortDir(['namaBarang', 'kodeBarang'].includes(col) ? 'asc' : (col === 'periodIndex' ? 'asc' : 'desc'))
    }
  }

  const renderSortIndicator = (col) => {
    if (promoSortBy !== col) {
      return <span style={{ opacity: 0.3, marginLeft: 4, fontSize: 10 }}>⇅</span>
    }
    return (
      <span style={{ color: 'var(--primary, #3B3A8C)', marginLeft: 4, fontWeight: 'bold' }}>
        {promoSortDir === 'asc' ? '▲' : '▼'}
      </span>
    )
  }

  const handleCopyTable = () => {
    const isExcluded = activePeriodFilter === 'excluded'
    const diskonVal = Math.max(0, Math.min(100, Number(discountPct) || 0))
    const headers = isExcluded
      ? (hasStock
          ? ['No', 'Alasan Dikecualikan', 'Kode Barang', 'Nama Barang', 'Kode Produk (MP)', 'Kode Variasi (MP)', 'Terjual', 'Stock', 'SSR', `Harga Diskon (${diskonVal}%)`, 'Harga Normal']
          : ['No', 'Alasan Dikecualikan', 'Kode Barang', 'Nama Barang', 'Kode Produk (MP)', 'Kode Variasi (MP)', 'Terjual', `Harga Diskon (${diskonVal}%)`, 'Harga Normal'])
      : (hasStock
          ? ['No', 'Status Ekspor', 'Periode Promo', 'Kode Barang', 'Nama Barang', 'Kode Produk (MP)', 'Kode Variasi (MP)', 'Terjual', 'Stock', 'SSR', `Harga Diskon (${diskonVal}%)`, 'Harga Normal']
          : ['No', 'Status Ekspor', 'Periode Promo', 'Kode Barang', 'Nama Barang', 'Kode Produk (MP)', 'Kode Variasi (MP)', 'Terjual', `Harga Diskon (${diskonVal}%)`, 'Harga Normal'])
    const rowsData = sortedPromoVariants.map((v, i) => {
      const ssrStr = v.ssr != null ? v.ssr.toFixed(2) : '-'
      const stockStr = v.hasStockData ? (v.stock || 0) : 0
      const col2Val = isExcluded ? (v.excludeReason || 'Dikecualikan') : v.periodePromo
      const det = getVariantPromoDetails(v, diskonVal)
      const exportStatus = selectedExportIds.has(v.uid) ? 'Terpilih (Ekspor)' : 'Dikecualikan'
      return isExcluded
        ? (hasStock
            ? [i + 1, col2Val, v.kodeBarang || '-', v.namaBarang || '-', det.kodeProduk, det.kodeVariasi, v.kuantitas || 0, stockStr, ssrStr, det.hargaDiskon, det.hargaNormal]
            : [i + 1, col2Val, v.kodeBarang || '-', v.namaBarang || '-', det.kodeProduk, det.kodeVariasi, v.kuantitas || 0, det.hargaDiskon, det.hargaNormal])
        : (hasStock
            ? [i + 1, exportStatus, col2Val, v.kodeBarang || '-', v.namaBarang || '-', det.kodeProduk, det.kodeVariasi, v.kuantitas || 0, stockStr, ssrStr, det.hargaDiskon, det.hargaNormal]
            : [i + 1, exportStatus, col2Val, v.kodeBarang || '-', v.namaBarang || '-', det.kodeProduk, det.kodeVariasi, v.kuantitas || 0, det.hargaDiskon, det.hargaNormal])
    })
    const tsv = [headers.join('\t'), ...rowsData.map(r => r.join('\t'))].join('\n')
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(tsv).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }).catch(() => {})
    }
  }

  const renderSsrBadge = (ssrVal) => {
    if (ssrVal == null) return <span className="muted">—</span>
    if (ssrVal < 1) {
      return (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 7px',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 700,
            background: 'rgb(255, 215, 215)',
            color: '#b91c1c',
            border: '1px solid rgb(254, 178, 178)',
          }}
          title="SSR < 1 (stok tidak cukup 1 bulan)"
        >
          {ssrVal.toFixed(2)}
        </span>
      )
    }
    if (ssrVal <= 2) {
      return (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 7px',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 700,
            background: 'rgb(254, 243, 199)',
            color: '#92400e',
            border: '1px solid rgb(253, 230, 138)',
          }}
          title="SSR 1–2 (stok menipis, segera restock)"
        >
          {ssrVal.toFixed(2)}
        </span>
      )
    }
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 7px',
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 600,
          background: '#f0fdf4',
          color: '#166534',
          border: '1px solid #bbf7d0',
        }}
      >
        {ssrVal.toFixed(2)}
      </span>
    )
  }

  return createPortal((
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface, #fff)',
          borderRadius: 14,
          maxWidth: 'min(96vw, 980px)',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
          border: '1px solid var(--border, #e2e8f0)',
          overflow: 'hidden',
          animation: 'modalFadeIn 0.16s ease-out',
        }}
      >
        {/* ── Modal Header ── */}
        <div style={{
          padding: '1.1rem 1.4rem',
          borderBottom: '1px solid var(--border, #e5e3dc)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          background: 'var(--bg, #fafaf8)',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                color: 'var(--primary, #3B3A8C)',
                background: 'var(--primary-light, #EEEDFE)',
                padding: '2px 8px',
                borderRadius: 4,
              }}>
                PROMO CAMPAIGN
              </span>
              <h2 style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--ink, #1C1B19)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}>
                Pembagian Promo SKU Gabungan
              </h2>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
              {step === 'config'
                ? 'Tentukan jumlah periode promo (N) untuk membagi seluruh varian SKU gabungan secara merata dan acak.'
                : `Distribusi seluruh varian SKU gabungan ke dalam ${periodCount} periode promo/campaign.`}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 22,
              lineHeight: 1,
              width: 32,
              height: 32,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink-muted, #6B6A66)',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; e.currentTarget.style.color = 'var(--ink, #111)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-muted, #6B6A66)' }}
          >
            ×
          </button>
        </div>

        {/* ── STEP 1: CONFIGURATION ── */}
        {step === 'config' && (
          <div style={{ padding: '1.4rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Warning if 0 SKU selected */}
            {selectedRows.length === 0 ? (
              <div style={{
                padding: '1rem',
                borderRadius: 10,
                background: 'var(--accent-light, #FAECE7)',
                border: '1px solid rgba(216, 90, 48, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>⚠️</span>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 13.5, color: 'var(--accent, #D85A30)' }}>
                      Belum ada SKU yang dicentang di tabel
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--ink-muted)' }}>
                      Pilih SKU gabungan yang ingin dimasukkan ke pembagian promo di bawah ini atau centang langsung dari tabel.
                    </p>
                  </div>
                </div>
                {availableGabunganRows.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllGabungan}
                    className="pill-btn"
                    style={{
                      alignSelf: 'flex-start',
                      background: 'var(--primary, #3B3A8C)',
                      color: '#fff',
                      fontSize: 12.5,
                      fontWeight: 600,
                      padding: '5px 12px',
                    }}
                  >
                    ✓ Pilih Semua SKU Gabungan ({availableGabunganRows.length} SKU)
                  </button>
                )}
              </div>
            ) : (
              /* Selected summary */
              <div style={{
                padding: '0.85rem 1rem',
                borderRadius: 10,
                background: 'var(--surface-2, #f5f5f5)',
                border: '1px solid var(--border, #e5e3dc)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-muted)' }}>SKU Terpilih</span>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--primary, #3B3A8C)' }}>
                      {selectedRows.length} SKU Induk
                    </p>
                  </div>
                  <div style={{ height: 28, width: 1, background: 'var(--border, #ddd)' }} />
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Total Varian</span>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--ink, #1C1B19)' }}>
                      {totalVariantsInSelection} Varian
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {selectableModalRows.length > selectedRows.length && (
                    <button
                      type="button"
                      onClick={handleSelectAllInModal}
                      style={{ fontSize: 11.5, background: 'none', border: '1px solid var(--border, #ddd)', padding: '4px 8px', borderRadius: 5, cursor: 'pointer', color: 'var(--ink-muted)' }}
                    >
                      Pilih Semua ({selectableModalRows.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleClearSelectedCodes}
                    style={{ fontSize: 11.5, background: 'none', border: '1px solid var(--border, #ddd)', padding: '4px 8px', borderRadius: 5, cursor: 'pointer', color: 'var(--ink-muted)' }}
                  >
                    Kosongkan
                  </button>
                </div>
              </div>
            )}

            {/* List of selectable SKUs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink, #1C1B19)' }}>
                Daftar SKU yang akan diacak:
              </span>
              <div style={{
                maxHeight: 160,
                overflowY: 'auto',
                border: '1px solid var(--border, #e5e3dc)',
                borderRadius: 8,
                padding: '6px 8px',
                background: 'var(--surface, #fff)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}>
                {selectableModalRows.map(row => {
                  const isChecked = selectedCodes.has(row.kodeBarang)
                  const rowVariants = row.variants && row.variants.length > 0 ? row.variants : [row]
                  const rowEligibleCount = rowVariants.filter(v => checkVariantEligibility(v).eligible).length
                  return (
                    <label
                      key={row.kodeBarang}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '4px 8px',
                        borderRadius: 6,
                        background: isChecked ? 'var(--primary-light, #EEEDFE)' : 'transparent',
                        cursor: 'pointer',
                        fontSize: 12.5,
                        userSelect: 'none',
                        transition: 'background 0.1s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleCode(row.kodeBarang)}
                          style={{ cursor: 'pointer', accentColor: 'var(--primary, #3B3A8C)' }}
                        />
                        <span className="mono" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.kodeBarang}</span>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isChecked ? 'var(--ink)' : 'var(--ink-muted)' }}>
                          {row.namaBarang}
                        </span>
                      </div>
                      <span className="mono" style={{ fontSize: 11.5, color: rowEligibleCount === 0 ? '#b91c1c' : 'var(--ink-muted)', flexShrink: 0 }}>
                        {rowEligibleCount}/{rowVariants.length} lolos
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Syarat & Kriteria Varian Promo */}
            <div style={{
              background: 'var(--surface-2, #fafaf9)',
              borderRadius: 10,
              padding: '1.1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              border: '1px solid var(--border, #e5e3dc)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink, #1C1B19)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>⚖️ Syarat &amp; Kriteria Varian Promo</span>
                  </h4>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                    Tentukan syarat varian yang berhak diikutsertakan ke dalam pembagian periode promo.
                  </p>
                </div>

                {/* Filter eligibility counter badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '3px 9px',
                    borderRadius: 6,
                    background: eligibleVariantsList.length > 0 ? '#dcfce7' : '#fee2e2',
                    color: eligibleVariantsList.length > 0 ? '#15803d' : '#b91c1c',
                    border: eligibleVariantsList.length > 0 ? '1px solid #bbf7d0' : '1px solid #fecaca',
                  }}>
                    {eligibleVariantsList.length} dari {totalVariantsInSelection} varian lolos
                  </span>
                  {excludedVariantsList.length > 0 && (
                    <span style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: '#fef3c7',
                      color: '#b45309',
                      border: '1px solid #fde68a',
                    }}>
                      {excludedVariantsList.length} dikecualikan
                    </span>
                  )}
                </div>
              </div>

              {/* Grid 3 inputs */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}>
                {/* 1. Min Stock */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label htmlFor="promo-min-stock" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink, #1C1B19)' }}>
                    Minimal Stok Varian:
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="promo-min-stock"
                      type="number"
                      min="0"
                      value={minStock}
                      onChange={e => {
                        const val = parseInt(e.target.value, 10)
                        setMinStock(isNaN(val) ? 0 : Math.max(0, val))
                      }}
                      style={{
                        width: '100%',
                        height: 36,
                        boxSizing: 'border-box',
                        padding: '0 3rem 0 0.75rem',
                        fontSize: 13,
                        fontWeight: 600,
                        borderRadius: 6,
                        border: '1px solid var(--border, #ddd)',
                        background: 'var(--surface, #fff)',
                        color: 'var(--ink, #1C1B19)',
                        outline: 'none',
                      }}
                    />
                    <span style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: 12,
                      color: 'var(--ink-muted)',
                      pointerEvents: 'none',
                    }}>
                      pcs
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                    {hasStock ? 'Hanya varian dengan stok ≥ nilai ini (default: 10)' : '⚠️ Master stok belum ada (diabaikan)'}
                  </span>
                </div>

                {/* 2. Exclude Kode Barang */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label htmlFor="promo-exclude-kode" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink, #1C1B19)' }}>
                    Kecualikan Kode Barang (No Barang):
                  </label>
                  <input
                    id="promo-exclude-kode"
                    type="text"
                    value={excludeKode}
                    onChange={e => setExcludeKode(e.target.value)}
                    placeholder="Contoh: OB, SAMPLE, REJECT"
                    style={{
                      width: '100%',
                      height: 36,
                      boxSizing: 'border-box',
                      padding: '0 0.75rem',
                      fontSize: 12.5,
                      borderRadius: 6,
                      border: '1px solid var(--border, #ddd)',
                      background: 'var(--surface, #fff)',
                      color: 'var(--ink, #1C1B19)',
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                    Pisahkan dengan koma (default: OB)
                  </span>
                </div>

                {/* 3. Exclude Nama Barang */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label htmlFor="promo-exclude-nama" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink, #1C1B19)' }}>
                    Kecualikan Nama Barang:
                  </label>
                  <input
                    id="promo-exclude-nama"
                    type="text"
                    value={excludeNama}
                    onChange={e => setExcludeNama(e.target.value)}
                    placeholder="Contoh: grosir, bundle, paket"
                    style={{
                      width: '100%',
                      height: 36,
                      boxSizing: 'border-box',
                      padding: '0 0.75rem',
                      fontSize: 12.5,
                      borderRadius: 6,
                      border: '1px solid var(--border, #ddd)',
                      background: 'var(--surface, #fff)',
                      color: 'var(--ink, #1C1B19)',
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                    Pisahkan dengan koma (default: grosir)
                  </span>
                </div>
              </div>

              {/* Collapsible preview of excluded variants if any */}
              {excludedVariantsList.length > 0 && (
                <div style={{
                  borderTop: '1px dashed var(--border, #ddd)',
                  paddingTop: 8,
                  fontSize: 11.5,
                  color: 'var(--ink-muted)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <span>
                      ℹ️ <strong>{excludedVariantsList.length} varian</strong> tidak diikutsertakan karena tidak memenuhi kriteria di atas:
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowExcludedPreview(v => !v)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary, #3B3A8C)',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: 11.5,
                        fontWeight: 600,
                        textDecoration: 'underline',
                      }}
                    >
                      {showExcludedPreview ? 'Sembunyikan detail' : 'Lihat daftar varian dikecualikan'}
                    </button>
                  </div>

                  {showExcludedPreview && (
                    <div style={{
                      marginTop: 6,
                      maxHeight: 120,
                      overflowY: 'auto',
                      background: 'var(--surface, #fff)',
                      border: '1px solid var(--border, #eee)',
                      borderRadius: 6,
                      padding: '6px 8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}>
                      {excludedVariantsList.map((ex, i) => (
                        <div key={`${ex.kodeBarang}-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11.5 }}>
                          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <strong className="mono">{ex.kodeBarang}</strong> — {ex.namaBarang}
                          </span>
                          <span style={{ color: '#b45309', fontWeight: 600, flexShrink: 0, background: '#fef3c7', padding: '1px 6px', borderRadius: 4 }}>
                            {ex.excludeReason}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Period Count Selector (N) */}
            <div style={{
              background: 'var(--surface-2, #f5f5f5)',
              borderRadius: 10,
              padding: '1.1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              border: '1px solid var(--border, #e5e3dc)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <label htmlFor="period-count-input" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink, #1C1B19)', display: 'block' }}>
                    Jumlah Periode Promo / Campaign (N):
                  </label>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                    Varian dari setiap SKU gabungan yang memenuhi syarat akan didistribusikan secara acak ke dalam N periode.
                  </p>
                </div>

                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface, #fff)', border: '1px solid var(--border, #ddd)', borderRadius: 8, padding: '3px 6px' }}>
                  <button
                    type="button"
                    onClick={() => setPeriodCount(c => Math.max(2, c - 1))}
                    disabled={periodCount <= 2}
                    style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'var(--surface-2, #eee)', cursor: periodCount <= 2 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 15, opacity: periodCount <= 2 ? 0.4 : 1 }}
                  >
                    –
                  </button>
                  <input
                    id="period-count-input"
                    type="number"
                    min="2"
                    max="20"
                    value={periodCount}
                    onChange={e => {
                      const val = parseInt(e.target.value, 10)
                      if (!isNaN(val)) setPeriodCount(Math.max(2, Math.min(20, val)))
                    }}
                    style={{ width: 44, textAlign: 'center', border: 'none', outline: 'none', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', color: 'var(--ink, #1C1B19)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setPeriodCount(c => Math.min(20, c + 1))}
                    disabled={periodCount >= 20}
                    style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'var(--surface-2, #eee)', cursor: periodCount >= 20 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 15, opacity: periodCount >= 20 ? 0.4 : 1 }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Quick Presets */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--ink-muted)', fontWeight: 500 }}>Preset cepat:</span>
                {[2, 3, 4, 5, 6].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPeriodCount(n)}
                    className="pill-btn"
                    style={{
                      fontSize: 12,
                      padding: '3px 10px',
                      borderRadius: 6,
                      background: periodCount === n ? 'var(--primary, #3B3A8C)' : 'var(--surface, #fff)',
                      color: periodCount === n ? '#fff' : 'var(--ink, #1C1B19)',
                      borderColor: periodCount === n ? 'transparent' : 'var(--border, #ddd)',
                      fontWeight: periodCount === n ? 700 : 500,
                    }}
                  >
                    {n} Periode
                  </button>
                ))}
              </div>
            </div>

            {/* Action button: Buat Pembagian Promo */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={onClose}
                className="pill-btn"
                style={{
                  padding: '7px 18px',
                  borderRadius: 6,
                  border: '1px solid var(--border, #ddd)',
                  background: 'var(--surface, #fff)',
                  color: 'var(--ink-muted)',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => runDistribution(periodCount)}
                disabled={selectedRows.length === 0 || eligibleVariantsList.length === 0}
                className="btn-export"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 22px',
                  borderRadius: 8,
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: (selectedRows.length === 0 || eligibleVariantsList.length === 0) ? 'not-allowed' : 'pointer',
                  opacity: (selectedRows.length === 0 || eligibleVariantsList.length === 0) ? 0.5 : 1,
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  color: '#fff',
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                }}
                title={selectedRows.length === 0 ? 'Pilih minimal 1 SKU' : eligibleVariantsList.length === 0 ? 'Tidak ada varian yang memenuhi kriteria syarat promo' : ''}
              >
                <span>⚡ Buat Pembagian Promo</span>
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: RESULT TABLE ── */}
        {step === 'result' && (
          <>
            {/* Summary bar */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 10,
              padding: '0.85rem 1.4rem',
              background: 'var(--surface, #fff)',
              borderBottom: '1px solid var(--border, #e5e3dc)',
            }}>
              <div style={{ background: 'var(--surface-2, #f5f5f5)', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
                <p className="muted" style={{ fontSize: 11, margin: 0, textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600 }}>Periode Promo</p>
                <p className="mono" style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 0', color: 'var(--primary, #3B3A8C)' }}>
                  {periodCount} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-muted)' }}>periode</span>
                </p>
              </div>
              <div style={{ background: 'var(--surface-2, #f5f5f5)', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
                <p className="muted" style={{ fontSize: 11, margin: 0, textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600 }}>SKU Induk</p>
                <p className="mono" style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 0' }}>
                  {selectedRows.length} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-muted)' }}>SKU</span>
                </p>
              </div>
              <div style={{ background: 'var(--surface-2, #f5f5f5)', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
                <p className="muted" style={{ fontSize: 11, margin: 0, textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600 }}>Total Varian</p>
                <p className="mono" style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 0' }}>
                  {distributedVariants.length} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-muted)' }}>item</span>
                </p>
              </div>
              <div style={{ background: 'var(--surface-2, #f5f5f5)', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
                <p className="muted" style={{ fontSize: 11, margin: 0, textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600 }}>Total Terjual</p>
                <p className="mono" style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 0', color: 'var(--primary, #3B3A8C)' }}>
                  {distributedVariants.reduce((s, v) => s + (v.kuantitas || 0), 0).toLocaleString('id-ID')} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-muted)' }}>pcs</span>
                </p>
              </div>
            </div>

            {/* Condition Info Banner */}
            <div style={{
              padding: '0.45rem 1.4rem',
              background: 'var(--surface-2, #fafaf9)',
              borderBottom: '1px solid var(--border, #e5e3dc)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              fontSize: 11.5,
              color: 'var(--ink-muted)',
            }}>
              <span style={{ fontWeight: 600, color: 'var(--ink, #1C1B19)' }}>Kriteria Aktif:</span>
              <span style={{ background: '#f1f5f9', color: '#334155', padding: '1px 7px', borderRadius: 4, border: '1px solid #cbd5e1' }}>
                Stok Min: <strong>{hasStock ? (minStock > 0 ? `${minStock} pcs` : 'Semua') : '—'}</strong>
              </span>
              <span style={{ background: '#fef2f2', color: '#991b1b', padding: '1px 7px', borderRadius: 4, border: '1px solid #fecaca' }}>
                Exclude Kode: <strong>{excludeKodeKeywords.length > 0 ? excludeKodeKeywords.join(', ') : '—'}</strong>
              </span>
              <span style={{ background: '#fffbeb', color: '#92400e', padding: '1px 7px', borderRadius: 4, border: '1px solid #fde68a' }}>
                Exclude Nama: <strong>{excludeNamaKeywords.length > 0 ? excludeNamaKeywords.join(', ') : '—'}</strong>
              </span>
              {excludedVariantsList.length > 0 && (
                <span style={{ marginLeft: 'auto', fontWeight: 600, color: '#b45309' }}>
                  ({excludedVariantsList.length} varian dikecualikan)
                </span>
              )}
            </div>

            {/* Filter Tabs for Periods */}
            <div style={{
              padding: '0.55rem 1.4rem',
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              background: 'var(--bg, #fafaf8)',
              borderBottom: '1px solid var(--border, #e5e3dc)',
              alignItems: 'center',
            }}>
              <button
                type="button"
                onClick={() => setActivePeriodFilter('all')}
                className="pill-btn"
                style={{
                  fontSize: 12,
                  padding: '3px 11px',
                  borderRadius: 6,
                  background: activePeriodFilter === 'all' ? 'var(--primary, #3B3A8C)' : 'var(--surface, #fff)',
                  color: activePeriodFilter === 'all' ? '#fff' : 'var(--ink, #1C1B19)',
                  borderColor: activePeriodFilter === 'all' ? 'transparent' : 'var(--border, #ddd)',
                  fontWeight: activePeriodFilter === 'all' ? 700 : 500,
                  whiteSpace: 'nowrap',
                }}
              >
                Semua Periode ({distributedVariants.length})
              </button>
              {Array.from({ length: periodCount }, (_, i) => {
                const countInPeriod = distributedVariants.filter(v => v.periodIndex === i).length
                const color = PROMO_PERIOD_COLORS[i % PROMO_PERIOD_COLORS.length]
                const isActive = activePeriodFilter === i
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActivePeriodFilter(i)}
                    className="pill-btn"
                    style={{
                      fontSize: 12,
                      padding: '3px 11px',
                      borderRadius: 6,
                      background: isActive ? color.text : color.bg,
                      color: isActive ? '#fff' : color.text,
                      borderColor: isActive ? 'transparent' : color.border,
                      fontWeight: isActive ? 700 : 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Periode {i + 1} ({countInPeriod})
                  </button>
                )
              })}
              {excludedVariantsList.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActivePeriodFilter('excluded')}
                  className="pill-btn"
                  style={{
                    fontSize: 12,
                    padding: '3px 11px',
                    borderRadius: 6,
                    background: activePeriodFilter === 'excluded' ? '#b45309' : '#fef3c7',
                    color: activePeriodFilter === 'excluded' ? '#fff' : '#b45309',
                    borderColor: activePeriodFilter === 'excluded' ? 'transparent' : '#fde68a',
                    fontWeight: activePeriodFilter === 'excluded' ? 700 : 600,
                    whiteSpace: 'nowrap',
                    marginLeft: 'auto',
                  }}
                  title="Lihat daftar varian yang dikecualikan dari promo"
                >
                  ⚠️ Dikecualikan ({excludedVariantsList.length})
                </button>
              )}
            </div>

            {/* ── Promo Discount & Marketplace Stock Integration Toolbar ── */}
            <div style={{
              padding: '0.65rem 1.4rem',
              background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
              borderBottom: '1px solid #bbf7d0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {/* Source Marketplace Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    🏪 Stok MP:
                  </span>
                  {mpCustomers.length > 0 ? (
                    <select
                      value={selectedMpCustomer}
                      onChange={e => setSelectedMpCustomer(e.target.value)}
                      style={{
                        fontSize: 12,
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: '1px solid #86efac',
                        background: '#fff',
                        color: '#166534',
                        fontWeight: 600,
                      }}
                    >
                      <option value="all">🌐 Semua Toko Marketplace</option>
                      {mpCustomers.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  ) : (
                    <span style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#15803d',
                      background: '#dcfce7',
                      padding: '2px 8px',
                      borderRadius: 4,
                      border: '1px solid #86efac',
                    }}>
                      {mpCustomers[0]?.name || 'SHOPEE / SCELTA'}
                    </span>
                  )}
                  <span style={{ fontSize: 11.5, color: '#15803d', opacity: 0.85 }}>
                    ({matchedVariantsCount}/{distributedVariants.length} varian cocok)
                  </span>
                </div>

                {/* Discount Percentage Input Box */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#fff',
                  border: '1px solid #86efac',
                  borderRadius: 8,
                  padding: '3px 8px',
                }}>
                  <label htmlFor="promo-discount-input" style={{ fontSize: 12.5, fontWeight: 700, color: '#166534' }}>
                    Diskon Promo:
                  </label>
                  <input
                    id="promo-discount-input"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={discountPct}
                    onChange={e => {
                      const val = parseInt(e.target.value, 10)
                      setDiscountPct(isNaN(val) ? 0 : Math.max(0, Math.min(100, val)))
                    }}
                    style={{
                      width: 48,
                      textAlign: 'center',
                      fontSize: 13,
                      fontWeight: 800,
                      border: 'none',
                      outline: 'none',
                      color: '#166534',
                      fontFamily: 'inherit',
                    }}
                  />
                  <span style={{ fontWeight: 800, fontSize: 13, color: '#166534' }}>%</span>

                  {/* Quick presets */}
                  <div style={{ display: 'flex', gap: 4, marginLeft: 2 }}>
                    {[10, 15, 20].map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setDiscountPct(p)}
                        style={{
                          fontSize: 11,
                          fontWeight: discountPct === p ? 700 : 500,
                          padding: '1px 6px',
                          borderRadius: 4,
                          border: 'none',
                          background: discountPct === p ? '#15803d' : '#f0fdf4',
                          color: discountPct === p ? '#fff' : '#166534',
                          cursor: 'pointer',
                        }}
                      >
                        {p}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons: ZIP Export & feedback */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {zipSuccessToast && (
                  <span style={{ fontSize: 12, color: '#15803d', fontWeight: 700 }}>
                    ✓ Berhasil diunduh!
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleExportPromoZip}
                  disabled={isExportingZip || selectedExportCount === 0}
                  style={{
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                    color: '#fff',
                    border: 'none',
                    padding: '7px 16px',
                    borderRadius: 8,
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: (isExportingZip || selectedExportCount === 0) ? 'not-allowed' : 'pointer',
                    opacity: (isExportingZip || selectedExportCount === 0) ? 0.6 : 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    boxShadow: '0 3px 10px rgba(16, 185, 129, 0.35)',
                    transition: 'all 0.15s ease',
                  }}
                  title={selectedExportCount === 0 ? 'Centang minimal 1 varian untuk diekspor ke Excel ZIP' : `Ekspor ${selectedExportCount} varian terpilih ke dalam file ZIP (${periodCount} file per periode + 1 file Semua Periode)`}
                >
                  {isExportingZip ? (
                    <>
                      <span className="spinner-sm" style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent' }} />
                      <span>Mengemas ZIP…</span>
                    </>
                  ) : (
                    <>
                      <span>📦 Unduh Excel Promo (.zip)</span>
                      <span style={{
                        fontSize: 11,
                        background: 'rgba(255, 255, 255, 0.25)',
                        padding: '1px 6px',
                        borderRadius: 4,
                        fontWeight: 600,
                      }}>
                        {selectedExportCount} Varian ({periodCount + 1} File)
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Selection Status & Batch Controls Bar */}
            <div style={{
              padding: '0.45rem 1.4rem',
              background: '#f8fafc',
              borderBottom: '1px solid var(--border, #e5e3dc)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
              fontSize: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, color: '#334155' }}>
                  Seleksi Ekspor Excel:
                </span>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 5,
                  fontWeight: 700,
                  fontSize: 11.5,
                  background: selectedExportCount > 0 ? '#dcfce7' : '#fee2e2',
                  color: selectedExportCount > 0 ? '#15803d' : '#b91c1c',
                  border: selectedExportCount > 0 ? '1px solid #bbf7d0' : '1px solid #fecaca',
                }}>
                  {selectedExportCount} dari {distributedVariants.length} varian dipilih
                </span>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 5,
                  fontWeight: 600,
                  fontSize: 11.5,
                  background: '#f0fdf4',
                  color: '#166534',
                  border: '1px solid #86efac',
                }} title="Varian yang Kode & Var ditemukan di Stok Marketplace (otomatis dicentang)">
                  ✓ {matchedCount} Cocok Stok MP
                </span>
                {unmatchedCount > 0 && (
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 5,
                    fontWeight: 700,
                    fontSize: 11.5,
                    background: '#FEF2F2',
                    color: '#991B1B',
                    border: '1px solid #FCA5A5',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }} title="Kode & Variasi tidak ditemukan di Stok MP (ditandai merah muda & otomatis tidak dicentang agar tidak diekspor)">
                    ⚠️ {unmatchedCount} Tanpa Kode MP (Dikecualikan)
                  </span>
                )}
              </div>

              {/* Quick Select Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleSelectAllMatched}
                  style={{
                    fontSize: 11.5,
                    padding: '3px 8px',
                    borderRadius: 5,
                    border: '1px solid #86efac',
                    background: '#f0fdf4',
                    color: '#166534',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  title="Pilih hanya varian yang Kode & Variasinya ditemukan di Stok Marketplace"
                >
                  ✓ Pilih Cocok Saja ({matchedCount})
                </button>
                <button
                  type="button"
                  onClick={handleSelectAllExport}
                  style={{
                    fontSize: 11.5,
                    padding: '3px 8px',
                    borderRadius: 5,
                    border: '1px solid var(--border, #ddd)',
                    background: '#fff',
                    color: 'var(--ink, #1C1B19)',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                  title="Centang semua varian"
                >
                  Pilih Semua ({distributedVariants.length})
                </button>
                <button
                  type="button"
                  onClick={handleClearExportSelection}
                  style={{
                    fontSize: 11.5,
                    padding: '3px 8px',
                    borderRadius: 5,
                    border: '1px solid var(--border, #ddd)',
                    background: '#fff',
                    color: 'var(--ink-muted, #666)',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                  title="Batal pilih semua varian"
                >
                  Batal Pilih
                </button>
              </div>
            </div>

            {/* Search and Action Toolbar */}
            <div style={{
              padding: '0.65rem 1.4rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              background: 'var(--surface, #fff)',
              borderBottom: '1px solid var(--border, #e5e3dc)',
              flexWrap: 'wrap',
            }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <span style={{
                  position: 'absolute',
                  left: '0.7rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 13,
                  color: 'var(--muted, #888)',
                  pointerEvents: 'none',
                }}>🔍</span>
                <input
                  type="text"
                  placeholder="Cari nama barang atau kode varian…"
                  value={promoSearch}
                  onChange={e => setPromoSearch(e.target.value)}
                  style={{
                    width: '100%',
                    height: 34,
                    boxSizing: 'border-box',
                    paddingLeft: '2.1rem',
                    paddingRight: promoSearch ? '2rem' : '0.75rem',
                    fontSize: 12.5,
                    borderRadius: 6,
                    border: '1px solid var(--border, #ddd)',
                    background: 'var(--surface, #fff)',
                    color: 'var(--ink, #1C1B19)',
                    outline: 'none',
                  }}
                />
                {promoSearch && (
                  <button
                    type="button"
                    onClick={() => setPromoSearch('')}
                    style={{
                      position: 'absolute',
                      right: '0.5rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 14,
                      color: 'var(--muted, #888)',
                      padding: 2,
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => runDistribution(periodCount)}
                  className="pill-btn"
                  style={{
                    fontSize: 12,
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border, #ddd)',
                    background: 'var(--surface-2, #f5f5f5)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    color: 'var(--ink, #1C1B19)',
                    fontWeight: 500,
                  }}
                  title="Acak ulang pembagian varian ke periode"
                >
                  <span>🎲 Acak Ulang</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStep('config')}
                  className="pill-btn"
                  style={{
                    fontSize: 12,
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border, #ddd)',
                    background: 'var(--surface-2, #f5f5f5)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    color: 'var(--ink, #1C1B19)',
                    fontWeight: 500,
                  }}
                  title="Ubah kriteria syarat promo atau jumlah periode"
                >
                  <span>⚙️ Ubah Kriteria &amp; Periode</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyTable}
                  className="pill-btn"
                  style={{
                    fontSize: 12,
                    padding: '4px 11px',
                    borderRadius: 6,
                    border: '1px solid var(--primary, #3B3A8C)',
                    background: copied ? '#dcfce7' : 'var(--primary-light, #EEEDFE)',
                    color: copied ? '#15803d' : 'var(--primary, #3B3A8C)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontWeight: 600,
                    transition: 'all 0.15s ease',
                  }}
                  title="Salin tabel pembagian promo ke clipboard (format Excel/TSV)"
                >
                  <span>{copied ? '✓ Disalin!' : '📋 Salin Tabel'}</span>
                </button>
              </div>
            </div>

            {/* Table Area */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'auto',
              maxHeight: 'calc(92vh - 310px)',
              minHeight: 200,
            }}>
              <table className="data-table" style={{ width: '100%', margin: 0, borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface, #fff)' }}>
                  <tr>
                    {activePeriodFilter !== 'excluded' && (
                      <th style={{ width: 38, textAlign: 'center', verticalAlign: 'middle' }}>
                        <input
                          type="checkbox"
                          checked={isAllCurrentChecked}
                          ref={el => {
                            if (el) el.indeterminate = isCurrentIndeterminate
                          }}
                          onChange={handleToggleSelectAllVisible}
                          title={isAllCurrentChecked ? 'Batal pilih semua di tampilan ini' : 'Pilih semua di tampilan ini'}
                          style={{ cursor: 'pointer', accentColor: 'var(--primary, #3B3A8C)', transform: 'scale(1.15)' }}
                        />
                      </th>
                    )}
                    <th style={{ width: 38, textAlign: 'center' }}>#</th>
                    <th
                      onClick={() => handleSort('periodIndex')}
                      style={{ cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap', userSelect: 'none', width: activePeriodFilter === 'excluded' ? 180 : 130 }}
                      title="Klik untuk mengurutkan"
                    >
                      {activePeriodFilter === 'excluded' ? 'Alasan Dikecualikan' : 'Periode Promo'} {renderSortIndicator('periodIndex')}
                    </th>
                    <th
                      onClick={() => handleSort('kodeBarang')}
                      style={{ cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap', userSelect: 'none', width: 135 }}
                      title="Klik untuk mengurutkan kode barang"
                    >
                      Kode Barang {renderSortIndicator('kodeBarang')}
                    </th>
                    <th
                      onClick={() => handleSort('namaBarang')}
                      style={{ cursor: 'pointer', textAlign: 'left', userSelect: 'none' }}
                      title="Klik untuk mengurutkan nama barang"
                    >
                      Nama Barang {renderSortIndicator('namaBarang')}
                    </th>
                    <th
                      onClick={() => handleSort('kuantitas')}
                      style={{ cursor: 'pointer', textAlign: 'right', whiteSpace: 'nowrap', userSelect: 'none', width: 105 }}
                      title="Klik untuk mengurutkan jumlah terjual"
                    >
                      Terjual {renderSortIndicator('kuantitas')}
                    </th>
                    {hasStock && (
                      <>
                        <th
                          onClick={() => handleSort('stock')}
                          style={{ cursor: 'pointer', textAlign: 'right', whiteSpace: 'nowrap', userSelect: 'none', width: 105 }}
                          title="Klik untuk mengurutkan stock"
                        >
                          Stock {renderSortIndicator('stock')}
                        </th>
                        <th
                          onClick={() => handleSort('ssr')}
                          style={{ cursor: 'pointer', textAlign: 'right', whiteSpace: 'nowrap', userSelect: 'none', width: 90 }}
                          title="Klik untuk mengurutkan SSR"
                        >
                          SSR {renderSortIndicator('ssr')}
                        </th>
                      </>
                    )}
                    <th style={{ width: 140, textAlign: 'right', whiteSpace: 'nowrap', color: '#047857' }}>
                      Harga Diskon ({discountPct}%)
                    </th>
                    <th style={{ width: 120, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      Harga Normal
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPromoVariants.length === 0 && (
                    <tr>
                      <td colSpan={(hasStock ? 9 : 7) + (activePeriodFilter !== 'excluded' ? 1 : 0)} style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                          {promoSearch ? `Tidak ada varian yang cocok dengan "${promoSearch}".` : 'Belum ada data varian untuk ditampilkan.'}
                        </p>
                      </td>
                    </tr>
                  )}
                  {sortedPromoVariants.map((v, idx) => {
                    const promoDetails = getVariantPromoDetails(v, discountPct)
                    const hasMpCodeAndVar = Boolean(
                      promoDetails.hasMatch &&
                      promoDetails.kodeProduk &&
                      promoDetails.kodeProduk !== '-' &&
                      promoDetails.kodeVariasi &&
                      promoDetails.kodeVariasi !== '-'
                    )
                    const isChecked = selectedExportIds.has(v.uid)

                    const lowSsr = hasStock && v.ssr != null && v.ssr < 1
                    const restockSoonSsr = hasStock && v.ssr != null && v.ssr >= 1 && v.ssr <= 2

                    // Warna baris: Jika Kode & Var dari stok marketplace tidak ditemukan, tandai dengan merah muda (light red)
                    let rowBg = undefined
                    let rowBorderLeft = undefined

                    if (activePeriodFilter !== 'excluded' && !hasMpCodeAndVar) {
                      rowBg = '#FEF2F2'
                      rowBorderLeft = '3.5px solid #EF4444'
                    } else if (lowSsr) {
                      rowBg = 'rgba(255, 162, 162, 0.18)'
                    } else if (restockSoonSsr) {
                      rowBg = 'rgba(255, 235, 156, 0.22)'
                    } else if (isChecked && activePeriodFilter !== 'excluded') {
                      rowBg = 'rgba(240, 253, 244, 0.45)'
                    }

                    const color = PROMO_PERIOD_COLORS[v.periodIndex % PROMO_PERIOD_COLORS.length]

                    return (
                      <tr
                        key={`${v.kodeBarang}-${idx}`}
                        style={{
                          background: rowBg,
                          borderLeft: rowBorderLeft,
                          transition: 'background 0.12s ease',
                        }}
                      >
                        {activePeriodFilter !== 'excluded' && (
                          <td style={{ textAlign: 'center', verticalAlign: 'middle', width: 38 }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleExportId(v.uid)}
                              style={{
                                cursor: 'pointer',
                                accentColor: !hasMpCodeAndVar ? '#ef4444' : 'var(--primary, #3B3A8C)',
                                transform: 'scale(1.15)',
                              }}
                              title={
                                !hasMpCodeAndVar
                                  ? 'Kode & Var Stok MP tidak ditemukan. Tidak dicentang agar dikecualikan dari ekspor ke Excel.'
                                  : 'Centang untuk menyertakan varian ini dalam ekspor Excel Promo'
                              }
                            />
                          </td>
                        )}
                        <td className="mono" style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-muted)' }}>
                          {idx + 1}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {activePeriodFilter === 'excluded' ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: '#fef3c7',
                                color: '#b45309',
                                border: '1px solid #fde68a',
                                borderRadius: 5,
                                padding: '2px 8px',
                                fontSize: 11.5,
                                fontWeight: 600,
                              }}
                            >
                              {v.excludeReason || 'Dikecualikan'}
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: color.bg,
                                color: color.text,
                                border: `1px solid ${color.border}`,
                                borderRadius: 5,
                                padding: '2px 8px',
                                fontSize: 11.5,
                                fontWeight: 700,
                              }}
                            >
                              {v.periodePromo}
                            </span>
                          )}
                        </td>
                        <td className="mono" style={{ whiteSpace: 'nowrap', fontWeight: 600, fontSize: 12.5 }}>
                          <HighlightText text={v.kodeBarang || '—'} query={promoSearch} />
                        </td>
                        <td style={{ fontWeight: 500, fontSize: 13 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <HighlightText text={v.namaBarang || '—'} query={promoSearch} />
                            {activePeriodFilter !== 'excluded' && !hasMpCodeAndVar && (
                              <span
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  background: '#FEE2E2',
                                  color: '#991B1B',
                                  border: '1px solid #FCA5A5',
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                }}
                                title="Kode & Variasi Stok MP tidak ditemukan. Baris ini dikecualikan dari ekspor Excel."
                              >
                                ⚠️ Tidak ada di Stok MP
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 11, color: 'var(--ink-muted)' }}>
                            <span
                              style={{
                                fontFamily: 'monospace',
                                background: !hasMpCodeAndVar ? '#fff1f2' : '#f8fafc',
                                color: !hasMpCodeAndVar ? '#be123c' : 'inherit',
                                padding: '1px 5px',
                                borderRadius: 3,
                                border: !hasMpCodeAndVar ? '1px solid #fecdd3' : '1px solid #e2e8f0',
                                fontWeight: !hasMpCodeAndVar ? 600 : 400,
                              }}
                              title="Kode Produk dari Stok Marketplace"
                            >
                              Kode: {promoDetails.kodeProduk}
                            </span>
                            <span
                              style={{
                                fontFamily: 'monospace',
                                background: !hasMpCodeAndVar ? '#fff1f2' : '#f8fafc',
                                color: !hasMpCodeAndVar ? '#be123c' : 'inherit',
                                padding: '1px 5px',
                                borderRadius: 3,
                                border: !hasMpCodeAndVar ? '1px solid #fecdd3' : '1px solid #e2e8f0',
                                fontWeight: !hasMpCodeAndVar ? 600 : 400,
                              }}
                              title="Kode Variasi dari Stok Marketplace"
                            >
                              Var: {promoDetails.kodeVariasi}
                            </span>
                          </div>
                        </td>
                        <td className="mono" style={{ textAlign: 'right', fontWeight: 600, fontSize: 13 }}>
                          {(v.kuantitas || 0).toLocaleString('id-ID')}
                        </td>
                        {hasStock && (
                          <>
                            <td className="mono" style={{ textAlign: 'right', fontSize: 13 }}>
                              {v.hasStockData
                                ? (
                                  <span style={{ color: (v.stock || 0) === 0 ? 'var(--accent, #D85A30)' : 'inherit', fontWeight: (v.stock || 0) === 0 ? 600 : 400 }}>
                                    {(v.stock || 0).toLocaleString('id-ID')}
                                  </span>
                                )
                                : <span className="muted">0</span>}
                            </td>
                            <td className="mono" style={{ textAlign: 'right', fontSize: 12.5 }}>
                              {renderSsrBadge(v.ssr)}
                            </td>
                          </>
                        )}
                        <td className="mono" style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#047857' }}>
                          Rp {promoDetails.hargaDiskon.toLocaleString('id-ID')}
                        </td>
                        <td className="mono" style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--ink-muted)' }}>
                          Rp {promoDetails.hargaNormal.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {sortedPromoVariants.length > 0 && (
                  <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 1, background: 'var(--surface-2, #f5f5f5)', fontWeight: 700 }}>
                    <tr style={{ borderTop: '2px solid var(--border, #ddd)' }}>
                      <td colSpan={activePeriodFilter !== 'excluded' ? 5 : 4} style={{ textAlign: 'right', padding: '9px 12px', fontSize: 13 }}>
                        Total ({sortedPromoVariants.length} varian):
                      </td>
                      <td className="mono" style={{ textAlign: 'right', padding: '9px 12px', fontSize: 13, color: 'var(--primary, #3B3A8C)' }}>
                        {sortedPromoVariants.reduce((s, v) => s + (v.kuantitas || 0), 0).toLocaleString('id-ID')}
                      </td>
                      {hasStock && (
                        <>
                          <td className="mono" style={{ textAlign: 'right', padding: '9px 12px', fontSize: 13 }}>
                            {sortedPromoVariants.reduce((s, v) => s + (v.stock || 0), 0).toLocaleString('id-ID')}
                          </td>
                          <td className="mono" style={{ textAlign: 'right', padding: '9px 12px', fontSize: 13 }}>
                            {(() => {
                              const subKuantitas = sortedPromoVariants.reduce((s, v) => s + (v.kuantitas || 0), 0)
                              const subStock = sortedPromoVariants.reduce((s, v) => s + (v.stock || 0), 0)
                              const subSsr = subKuantitas > 0 ? subStock / subKuantitas : null
                              return subSsr != null ? subSsr.toFixed(2) : '—'
                            })()}
                          </td>
                        </>
                      )}
                      <td className="mono" style={{ textAlign: 'right', padding: '9px 12px', fontSize: 13, color: '#047857' }}>
                        Rp {sortedPromoVariants.reduce((s, v) => s + getVariantPromoDetails(v, discountPct).hargaDiskon, 0).toLocaleString('id-ID')}
                      </td>
                      <td className="mono" style={{ textAlign: 'right', padding: '9px 12px', fontSize: 13, color: 'var(--ink-muted)' }}>
                        Rp {sortedPromoVariants.reduce((s, v) => s + getVariantPromoDetails(v, discountPct).hargaNormal, 0).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '0.85rem 1.4rem',
              borderTop: '1px solid var(--border, #e5e3dc)',
              background: 'var(--bg, #fafaf8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: 12 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#FEF2F2', border: '1px solid #EF4444', display: 'inline-block' }} />
                  Merah muda: Kode &amp; Var Stok MP tidak ditemukan (dikecualikan dari ekspor)
                </span>
                {hasStock ? (
                  <>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgb(255, 162, 162)', display: 'inline-block' }} />
                      SSR &lt; 1 (kritis)
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgb(255, 235, 156)', display: 'inline-block' }} />
                      SSR 1–2 (menipis)
                    </span>
                  </>
                ) : (
                  <span className="muted">
                    ℹ️ Data stock belum diunggah. Nilai Stock dan SSR akan muncul jika file master stock tersedia.
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="pill-btn"
                style={{
                  padding: '6px 18px',
                  borderRadius: 6,
                  border: '1px solid var(--border, #ddd)',
                  background: 'var(--surface, #fff)',
                  color: 'var(--ink, #1C1B19)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Tutup
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  ), document.body)
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

function ExportSplitBtnSm({ allRows, pageRows, exportOptions }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="export-split-wrap" ref={wrapRef}>
      <button
        className="btn-export-main sm"
        onClick={() => { exportBarangTerlaris(allRows, exportOptions); setOpen(false) }}
      >
        ↓ Ekspor Excel
      </button>
      <button
        className="btn-export-caret sm"
        onClick={() => setOpen(v => !v)}
        title="Pilih format ekspor"
        aria-label="Pilih format ekspor"
      >
        ▾
      </button>
      {open && (
        <div className="export-dropdown-menu">
          <button
            className="export-dropdown-item"
            onClick={() => { exportBarangTerlaris(allRows, exportOptions); setOpen(false) }}
          >
            <span className="export-item-label">📋 Semua hasil filter</span>
            <span className="export-item-sub">Ekspor seluruh {allRows.length} baris yang difilter</span>
          </button>
          <button
            className="export-dropdown-item"
            onClick={() => {
              exportBarangTerlaris(pageRows, { ...exportOptions, filterDesc: (exportOptions.filterDesc ? exportOptions.filterDesc + ' · ' : '') + `Halaman ini (${pageRows.length} baris)` })
              setOpen(false)
            }}
          >
            <span className="export-item-label">🖥️ Halaman ini saja</span>
            <span className="export-item-sub">Hanya {pageRows.length} baris yang tampil di layar</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ── Column visibility definitions ─────────────────────────────────────────────
const ALL_VISIBLE_COLS = [
  { key: 'kodeBarang', label: 'Kode Barang' },
  { key: 'tipe', label: 'Tipe' },
  { key: 'gambar', label: 'Gambar' },
  { key: 'namaBarang', label: 'Nama Barang' },
  { key: 'brand', label: 'Brand' },
  { key: 'kuantitas', label: 'Terjual' },
  { key: 'hpp', label: 'HPP PCS' },
  { key: 'stock', label: 'Stock' },
  { key: 'mpStock', label: 'MP Stock' },
  { key: 'unit', label: 'Unit' },
  { key: 'hargaProduk', label: 'TOTAL TERJUAL' },
  { key: 'totalHpp', label: 'Total HPP' },
  { key: 'ssr', label: 'SSR' },
]
const DEFAULT_HIDDEN_COLS = new Set([])

function BestSellerTable({
  rows, loading, sortBy, sortDir, onSortChange,
  searchQuery, onSearchChange,
  colFilters, onColFilterChange,
  onlyMpKosongFisikAda, onToggleMpKosongFisikAda, countMpKosongFisikAda,
  onlyCekGambarVariasi, onToggleCekGambarVariasi, countGambarVariasi,
  stockLookup, brandOptions,
  groupMode, onGroupModeChange,
  mpStockItems,
  notes, notesError, savingNoteFor, onSaveNote, onDeleteNote,
  exportOptions,
  onPageRowsChange,
}) {
  const totalKuantitas = rows.reduce((s, r) => s + r.kuantitas, 0)
  const totalHargaProduk = rows.reduce((s, r) => s + r.hargaProduk, 0)
  const totalHpp = rows.reduce((s, r) => s + (r.totalHpp || 0), 0)
  const totalStockPcs = rows.reduce((s, r) => s + (r.stock || 0), 0)
  const totalHppTerjual = rows.reduce((s, r) => s + (r.hpp || 0) * (r.kuantitas || 0), 0) // Σ (HPP PCS × Terjual)
  const ssrGrand = totalKuantitas > 0 ? totalStockPcs / totalKuantitas : null      // Stock PCS / Terjual
  const ssrHppGrand = totalHppTerjual > 0 ? totalHpp / totalHppTerjual : null       // Total HPP / Σ(HPP × Terjual)
  const hasStock = stockLookup !== null
  const hasMpData = (mpStockItems && mpStockItems.length > 0) || rows.some(r => r.gambar || r.hasMpStockData)

  // ── Column visibility state ──
  const [visibleCols, setVisibleCols] = useState(() => {
    const s = new Set(ALL_VISIBLE_COLS.map(c => c.key))
    DEFAULT_HIDDEN_COLS.forEach(k => s.delete(k))
    return s
  })
  const [colPickerOpen, setColPickerOpen] = useState(false)
  const colPickerRef = useRef(null)

  // Close col picker on outside click
  useEffect(() => {
    if (!colPickerOpen) return
    function handle(e) {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target)) setColPickerOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [colPickerOpen])

  // Kolom yang relevan untuk mode dan data saat ini
  const availableCols = ALL_VISIBLE_COLS.filter(({ key }) => {
    if (key === 'tipe' && groupMode !== 'induk') return false
    if (['brand', 'stock', 'unit', 'hpp', 'totalHpp', 'ssr'].includes(key) && !hasStock) return false
    if (['gambar', 'mpStock'].includes(key) && !hasMpData) return false
    return true
  })
  const activeColCount = availableCols.filter(c => visibleCols.has(c.key)).length

  const colHeaderProps = { sortBy, sortDir, onSortChange, colFilters, onColFilterChange, brandOptions }

  const [previewImage, setPreviewImage] = useState(null) // { url, alt } | null
  const [selectedGabunganRow, setSelectedGabunganRow] = useState(null) // row | null

  // ── Row selection & Pembagian Promo modal (khusus mode 'induk') ──
  const [selectedSkuKeys, setSelectedSkuKeys] = useState(() => new Set())
  const [pembagianPromoOpen, setPembagianPromoOpen] = useState(false)
  const [cetakJadwalOpen, setCetakJadwalOpen] = useState(false)

  // Reset pilihan jika mode tampilan berganti dari 'induk'
  useEffect(() => {
    if (groupMode !== 'induk') {
      setSelectedSkuKeys(new Set())
    }
  }, [groupMode])

  // Pastikan kolom yang difilter terlihat di tabel saat quick filter aktif
  useEffect(() => {
    if (onlyMpKosongFisikAda) {
      setVisibleCols(prev => {
        if (prev.has('mpStock') && prev.has('stock')) return prev
        const next = new Set(prev)
        next.add('mpStock')
        next.add('stock')
        return next
      })
    }
  }, [onlyMpKosongFisikAda])

  useEffect(() => {
    if (onlyCekGambarVariasi) {
      setVisibleCols(prev => {
        if (prev.has('kodeBarang') && prev.has('gambar') && prev.has('stock')) return prev
        const next = new Set(prev)
        next.add('kodeBarang')
        next.add('gambar')
        next.add('stock')
        return next
      })
    }
  }, [onlyCekGambarVariasi])

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

  // Notify parent of current page rows so the top export button can use them
  useEffect(() => {
    if (onPageRowsChange) onPageRowsChange(pageRows)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageRows, onPageRowsChange])

  // Baris yang bisa dipilih di halaman ini
  const pageSelectableRows = useMemo(() => {
    return pageRows.filter(r => r.kodeBarang)
  }, [pageRows])

  const isAllPageSelected = pageSelectableRows.length > 0 && pageSelectableRows.every(r => selectedSkuKeys.has(r.kodeBarang))
  const isSomePageSelected = pageSelectableRows.some(r => selectedSkuKeys.has(r.kodeBarang)) && !isAllPageSelected

  const headerCheckboxRef = useRef(null)
  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = isSomePageSelected
    }
  }, [isSomePageSelected])

  const handleToggleSelectAllPage = () => {
    setSelectedSkuKeys(prev => {
      const next = new Set(prev)
      if (isAllPageSelected) {
        pageSelectableRows.forEach(r => next.delete(r.kodeBarang))
      } else {
        pageSelectableRows.forEach(r => next.add(r.kodeBarang))
      }
      return next
    })
  }

  const handleToggleSelectRow = (kode) => {
    if (!kode) return
    setSelectedSkuKeys(prev => {
      const next = new Set(prev)
      if (next.has(kode)) next.delete(kode)
      else next.add(kode)
      return next
    })
  }

  const handleOpenPembagianPromo = () => {
    if (selectedSkuKeys.size === 0) {
      // Jika belum ada yang dicentang manual, defaultkan ke semua SKU gabungan agar langsung siap diacak
      const allGabungan = new Set(rows.filter(r => r.tipe === 'gabungan' && r.kodeBarang).map(r => r.kodeBarang))
      if (allGabungan.size > 0) {
        setSelectedSkuKeys(allGabungan)
      }
    }
    setPembagianPromoOpen(true)
  }

  const selectedRowsForPromo = useMemo(() => {
    return rows.filter(r => r.kodeBarang && selectedSkuKeys.has(r.kodeBarang))
  }, [rows, selectedSkuKeys])

  return (
    <>
      {/* ── Mode tampilan: per varian vs per SKU induk (gabungan) ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
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

        {groupMode === 'induk' ? (
          <>
            <div style={{ height: 18, width: 1, background: 'var(--border, #ddd)', margin: '0 2px' }} />
            <button
              type="button"
              className="pill-btn"
              onClick={handleOpenPembagianPromo}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: selectedSkuKeys.size > 0 ? 'var(--primary, #3B3A8C)' : 'var(--surface, #fff)',
                color: selectedSkuKeys.size > 0 ? '#fff' : 'var(--primary, #3B3A8C)',
                borderColor: selectedSkuKeys.size > 0 ? 'transparent' : 'var(--primary, #3B3A8C)',
                fontWeight: 600,
                boxShadow: selectedSkuKeys.size > 0 ? '0 1px 3px rgba(59, 58, 140, 0.3)' : 'none',
              }}
              title="Buka modal Pembagian Promo untuk mendistribusikan varian ke N periode campaign"
            >
              <span>🎯 Pembagian Promo</span>
              {selectedSkuKeys.size > 0 && (
                <span
                  style={{
                    background: 'rgba(255, 255, 255, 0.25)',
                    color: '#fff',
                    borderRadius: 10,
                    padding: '1px 6px',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {selectedSkuKeys.size} terpilih
                </span>
              )}
            </button>
            <button
              type="button"
              id="btn-open-cetak-jadwal-promo"
              className="pill-btn"
              onClick={() => setCetakJadwalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#047857',
                color: '#fff',
                borderColor: '#059669',
                fontWeight: 600,
                boxShadow: '0 1px 3px rgba(4, 120, 87, 0.25)',
              }}
              title="Cetak Jadwal Promo dari file Excel (Periode Promo) ke gambar JPG potret 1240x1754 px"
            >
              <span>🖨️ Cetak Jadwal Promo</span>
            </button>
            <button
              type="button"
              id="btn-cek-mp-kosong-fisik-ada-induk"
              className={`pill-btn ${onlyMpKosongFisikAda ? 'is-active' : ''}`}
              onClick={onToggleMpKosongFisikAda}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: onlyMpKosongFisikAda ? '#d97706' : '#fff',
                color: onlyMpKosongFisikAda ? '#fff' : '#b45309',
                borderColor: onlyMpKosongFisikAda ? '#b45309' : '#fcd34d',
                fontWeight: 600,
                boxShadow: onlyMpKosongFisikAda ? '0 1px 3px rgba(217, 119, 6, 0.35)' : 'none',
                transition: 'all 0.15s ease',
              }}
              title="Filter produk dengan MP STOCK = 0 dan STOCK fisik > 0 (Perlu segera restock marketplace)"
            >
              <span>⚠️ Cek Stok Marketplace Kosong, Fisik Ada</span>
              {countMpKosongFisikAda != null && (
                <span
                  style={{
                    background: onlyMpKosongFisikAda ? 'rgba(255, 255, 255, 0.25)' : '#fef3c7',
                    color: onlyMpKosongFisikAda ? '#fff' : '#92400E',
                    borderRadius: 10,
                    padding: '1px 7px',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {countMpKosongFisikAda.toLocaleString('id-ID')}
                </span>
              )}
            </button>
            <button
              type="button"
              id="btn-cek-gambar-variasi-induk"
              className={`pill-btn ${onlyCekGambarVariasi ? 'is-active' : ''}`}
              onClick={onToggleCekGambarVariasi}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: onlyCekGambarVariasi ? '#4F46E5' : '#fff',
                color: onlyCekGambarVariasi ? '#fff' : '#4338CA',
                borderColor: onlyCekGambarVariasi ? '#4338CA' : '#C7D2FE',
                fontWeight: 600,
                boxShadow: onlyCekGambarVariasi ? '0 1px 3px rgba(79, 70, 229, 0.35)' : 'none',
                transition: 'all 0.15s ease',
              }}
              title="Filter variasi (kode ada titik), belum ada gambar, dan stock > 0. Diurutkan dari stock terbesar."
            >
              <span>🖼️ Cek Gambar / Variasi</span>
              {countGambarVariasi != null && (
                <span
                  style={{
                    background: onlyCekGambarVariasi ? 'rgba(255, 255, 255, 0.25)' : '#EEF2FF',
                    color: onlyCekGambarVariasi ? '#fff' : '#3730A3',
                    borderRadius: 10,
                    padding: '1px 7px',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {countGambarVariasi.toLocaleString('id-ID')}
                </span>
              )}
            </button>
            {selectedSkuKeys.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedSkuKeys(new Set())}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--ink-muted, #666)',
                  fontSize: 12,
                  cursor: 'pointer',
                  padding: '4px 6px',
                  textDecoration: 'underline',
                }}
                title="Batal pilih semua SKU"
              >
                Batal pilih
              </button>
            )}
          </>
        ) : (
          <>
            <div style={{ height: 18, width: 1, background: 'var(--border, #ddd)', margin: '0 2px' }} />
            <button
              type="button"
              className="pill-btn"
              onClick={() => setCetakJadwalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#047857',
                color: '#fff',
                borderColor: '#059669',
                fontWeight: 600,
                boxShadow: '0 1px 3px rgba(4, 120, 87, 0.25)',
              }}
              title="Cetak Jadwal Promo dari file Excel (Periode Promo) ke gambar JPG potret 1240x1754 px"
            >
              <span>🖨️ Cetak Jadwal Promo</span>
            </button>
            <button
              type="button"
              id="btn-cek-mp-kosong-fisik-ada-variant"
              className={`pill-btn ${onlyMpKosongFisikAda ? 'is-active' : ''}`}
              onClick={onToggleMpKosongFisikAda}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: onlyMpKosongFisikAda ? '#d97706' : '#fff',
                color: onlyMpKosongFisikAda ? '#fff' : '#b45309',
                borderColor: onlyMpKosongFisikAda ? '#b45309' : '#fcd34d',
                fontWeight: 600,
                boxShadow: onlyMpKosongFisikAda ? '0 1px 3px rgba(217, 119, 6, 0.35)' : 'none',
                transition: 'all 0.15s ease',
              }}
              title="Filter produk dengan MP STOCK = 0 dan STOCK fisik > 0 (Perlu segera restock marketplace)"
            >
              <span>⚠️ Cek Stok Marketplace Kosong, Fisik Ada</span>
              {countMpKosongFisikAda != null && (
                <span
                  style={{
                    background: onlyMpKosongFisikAda ? 'rgba(255, 255, 255, 0.25)' : '#fef3c7',
                    color: onlyMpKosongFisikAda ? '#fff' : '#92400E',
                    borderRadius: 10,
                    padding: '1px 7px',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {countMpKosongFisikAda.toLocaleString('id-ID')}
                </span>
              )}
            </button>
            <button
              type="button"
              id="btn-cek-gambar-variasi-variant"
              className={`pill-btn ${onlyCekGambarVariasi ? 'is-active' : ''}`}
              onClick={onToggleCekGambarVariasi}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: onlyCekGambarVariasi ? '#4F46E5' : '#fff',
                color: onlyCekGambarVariasi ? '#fff' : '#4338CA',
                borderColor: onlyCekGambarVariasi ? '#4338CA' : '#C7D2FE',
                fontWeight: 600,
                boxShadow: onlyCekGambarVariasi ? '0 1px 3px rgba(79, 70, 229, 0.35)' : 'none',
                transition: 'all 0.15s ease',
              }}
              title="Filter variasi (kode ada titik), belum ada gambar, dan stock > 0. Diurutkan dari stock terbesar."
            >
              <span>🖼️ Cek Gambar / Variasi</span>
              {countGambarVariasi != null && (
                <span
                  style={{
                    background: onlyCekGambarVariasi ? 'rgba(255, 255, 255, 0.25)' : '#EEF2FF',
                    color: onlyCekGambarVariasi ? '#fff' : '#3730A3',
                    borderRadius: 10,
                    padding: '1px 7px',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {countGambarVariasi.toLocaleString('id-ID')}
                </span>
              )}
            </button>
          </>
        )}
      </div>

      {notesError && (
        <p className="upload-error" style={{ marginTop: 0, marginBottom: '0.75rem' }}>⚠️ {notesError}</p>
      )}

      {/* ── Opsi Pengaturan Kolom & Search Bar ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: '0.75rem' }}>
        {/* ── Column visibility picker (di sebelah kiri cari nama barang) ── */}
        <div ref={colPickerRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            className={`btn-col-picker ${colPickerOpen ? 'is-open' : ''}`}
            onClick={() => setColPickerOpen(v => !v)}
            title={`${activeColCount} dari ${availableCols.length} kolom ditampilkan · Klik untuk pilih kolom`}
            style={{
              height: 38,
              boxSizing: 'border-box',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '0 12px',
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 8,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18" />
              <path d="M15 3v18" />
            </svg>
            <span>Pengaturan Kolom</span>
            <span className="col-count-badge">
              {activeColCount}
            </span>
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{
                transform: colPickerOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.16s ease',
                opacity: 0.65,
                marginLeft: -1,
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {colPickerOpen && (
            <div style={{
              position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 400,
              background: 'var(--surface, #fff)', border: '1px solid var(--border, #ddd)',
              borderRadius: 10, boxShadow: '0 10px 28px -4px rgba(0,0,0,.12), 0 4px 10px -2px rgba(0,0,0,.06)',
              padding: '0.75rem 0.85rem', minWidth: 230,
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 6px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--ink-muted, #6B6A66)' }}>Tampilkan Kolom</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary, #3B3A8C)' }}>{activeColCount}/{availableCols.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 310, overflowY: 'auto' }}>
                {availableCols.map(({ key, label }) => {
                  const checked = visibleCols.has(key)
                  return (
                    <label
                      key={key}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: 12.5, cursor: 'pointer', userSelect: 'none',
                        padding: '4px 6px', borderRadius: 6,
                        color: checked ? 'var(--ink, #1C1B19)' : 'var(--ink-faint, #A3A19A)',
                        fontWeight: checked ? 500 : 400,
                        transition: 'background 0.1s ease',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        style={{ accentColor: 'var(--primary, #3B3A8C)', cursor: 'pointer' }}
                        onChange={() => {
                          setVisibleCols(prev => {
                            const next = new Set(prev)
                            if (next.has(key)) next.delete(key)
                            else next.add(key)
                            return next
                          })
                        }}
                      />
                      {label}
                    </label>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border, #eee)' }}>
                <button
                  type="button"
                  onClick={() => setVisibleCols(new Set(ALL_VISIBLE_COLS.map(c => c.key)))}
                  style={{
                    flex: 1, padding: '5px 8px', borderRadius: 6,
                    border: '1px solid var(--border, #ddd)', background: 'var(--surface, #fff)',
                    cursor: 'pointer', fontSize: 11.5, fontWeight: 500, color: 'var(--ink-muted, #666)',
                    transition: 'all 0.12s ease',
                  }}
                >Pilih Semua</button>
                <button
                  type="button"
                  onClick={() => {
                    const s = new Set(ALL_VISIBLE_COLS.map(c => c.key))
                    DEFAULT_HIDDEN_COLS.forEach(k => s.delete(k))
                    setVisibleCols(s)
                  }}
                  style={{
                    flex: 1, padding: '5px 8px', borderRadius: 6,
                    border: '1px solid var(--border, #ddd)', background: 'var(--surface, #fff)',
                    cursor: 'pointer', fontSize: 11.5, fontWeight: 500, color: 'var(--ink-muted, #666)',
                    transition: 'all 0.12s ease',
                  }}
                >Reset Default</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Search bar (di sebelah kanan opsi pengaturan kolom, ukuran box sama persis) ── */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <span style={{
            position: 'absolute', left: '0.75rem', top: '50%',
            transform: 'translateY(-50%)', fontSize: 14,
            color: 'var(--muted, #888)', pointerEvents: 'none',
          }}>🔍</span>
          <input
            type="text"
            className="login-input"
            placeholder="Cari nama barang…"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            style={{
              width: '100%',
              height: 38,
              boxSizing: 'border-box',
              paddingLeft: '2.25rem',
              paddingRight: searchQuery ? '2.25rem' : '0.75rem',
              fontSize: 13,
              borderRadius: 8,
              margin: 0,
            }}
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              style={{
                position: 'absolute', right: '0.6rem', top: '50%',
                transform: 'translateY(-50%)', background: 'none', border: 'none',
                cursor: 'pointer', fontSize: 15, color: 'var(--muted, #888)',
                lineHeight: 1, padding: '0 4px',
              }}
              title="Hapus pencarian"
            >✕</button>
          )}
        </div>
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
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>Total Terjual (Rp)</p>
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
                  {groupMode === 'induk' && (
                    <th style={{ width: 38, textAlign: 'center', padding: '8px 4px' }} title="Pilih semua SKU di halaman ini">
                      <input
                        ref={headerCheckboxRef}
                        type="checkbox"
                        checked={isAllPageSelected}
                        onChange={handleToggleSelectAllPage}
                        style={{ cursor: 'pointer', accentColor: 'var(--primary, #3B3A8C)', width: 15, height: 15 }}
                        aria-label="Pilih semua SKU di halaman ini"
                      />
                    </th>
                  )}
                  <th style={{ width: 40 }} title="Catatan">📝</th>
                  <th style={{ width: 44 }}>#</th>
                  {visibleCols.has('kodeBarang') && <ColHeader col="kodeBarang" label="Kode Barang" align="left"  {...colHeaderProps} />}
                  {groupMode === 'induk' && visibleCols.has('tipe') && <ColHeader col="tipe" label="Tipe" align="left" {...colHeaderProps} />}
                  {visibleCols.has('gambar') && (
                    <GambarColHeader
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSortChange={onSortChange}
                      colFilters={colFilters}
                      onColFilterChange={onColFilterChange}
                    />
                  )}
                  {visibleCols.has('namaBarang') && <ColHeader col="namaBarang" label="Nama Barang" align="left"  {...colHeaderProps} />}
                  {hasStock && visibleCols.has('brand') && <ColHeader col="brand" label="Brand" align="left"  {...colHeaderProps} />}
                  {visibleCols.has('kuantitas') && <ColHeader col="kuantitas" label="Terjual" align="right" {...colHeaderProps} />}
                  {hasStock && visibleCols.has('hpp') && <ColHeader col="hpp" label="HPP PCS" align="right" {...colHeaderProps} />}
                  {hasStock && visibleCols.has('stock') && <ColHeader col="stock" label="Stock" align="right" {...colHeaderProps} />}
                  {visibleCols.has('mpStock') && <ColHeader col="mpStock" label="MP Stock" align="right" {...colHeaderProps} />}
                  {hasStock && visibleCols.has('unit') && <ColHeader col="unit" label="Unit" align="left" {...colHeaderProps} />}
                  {visibleCols.has('hargaProduk') && <ColHeader col="hargaProduk" label="TOTAL TERJUAL" align="right" {...colHeaderProps} />}
                  {hasStock && visibleCols.has('totalHpp') && <ColHeader col="totalHpp" label="Total HPP" align="right" {...colHeaderProps} />}
                  {hasStock && visibleCols.has('ssr') && <ColHeader col="ssr" label="SSR" align="right" {...colHeaderProps} />}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={activeColCount + (groupMode === 'induk' ? 3 : 2)} style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
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
                  const isRowSelected = groupMode === 'induk' && row.kodeBarang && selectedSkuKeys.has(row.kodeBarang)
                  const si = hasStock ? { brand: row.brand, stock: row.stock, hasData: row.hasStockData } : null
                  const lowSsr = hasStock && row.ssr != null && row.ssr < 1
                  const restockSoonSsr = hasStock && row.ssr != null && row.ssr >= 1 && row.ssr <= 2
                  const rowStyle = isRowSelected
                    ? { background: 'rgba(238, 237, 254, 0.7)' }
                    : lowSsr
                      ? { background: 'rgb(255, 162, 162)' }
                      : restockSoonSsr
                        ? { background: 'rgb(255, 235, 156)' }
                        : undefined
                  const rowTitle = isRowSelected
                    ? 'SKU terpilih untuk Pembagian Promo'
                    : lowSsr
                      ? 'SSR < 1 — stock lebih sedikit dari yang terjual'
                      : restockSoonSsr
                        ? 'SSR 1–2 — stock menipis, pertimbangkan untuk restock'
                        : undefined
                  // Di tampilan "Per SKU Gabungan", tarik & tampilkan juga catatan yang
                  // sebelumnya ditulis per-varian (di tampilan "Per Varian") — supaya
                  // tidak "hilang"/ketutup di balik baris gabungan.
                  const childNotes = (groupMode === 'induk' && row.variantCodes && row.variantCodes.length > 0)
                    ? row.variantCodes
                      .filter(v => v.kode !== row.kodeBarang)
                      .map(v => ({ kodeBarang: v.kode, namaBarang: v.namaBarang, ...notes?.[v.kode] }))
                      .filter(cn => cn.text)
                    : []
                  return (
                    <tr
                      key={row.kodeBarang ? `k-${row.kodeBarang}-${row.tipe || 'v'}` : `r-${row.rank}`}
                      style={rowStyle}
                      title={rowTitle}
                    >
                      {groupMode === 'induk' && (
                        <td style={{ textAlign: 'center', width: 38, padding: '8px 4px' }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={!!isRowSelected}
                            onChange={() => handleToggleSelectRow(row.kodeBarang)}
                            style={{ cursor: 'pointer', accentColor: 'var(--primary, #3B3A8C)', width: 15, height: 15 }}
                            aria-label={`Pilih SKU ${row.kodeBarang}`}
                          />
                        </td>
                      )}
                      <NoteCell
                        kodeBarang={row.kodeBarang}
                        note={notes?.[row.kodeBarang]}
                        childNotes={childNotes}
                        saving={savingNoteFor === row.kodeBarang}
                        onSave={onSaveNote}
                        onDelete={onDeleteNote}
                      />
                      <td className="mono" style={{ textAlign: 'center' }}>{row.rank}</td>
                      {visibleCols.has('kodeBarang') && (
                        <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                          {row.kodeBarang || '—'}
                        </td>
                      )}
                      {groupMode === 'induk' && visibleCols.has('tipe') && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {row.tipe === 'gabungan'
                            ? (
                              <button
                                type="button"
                                className="badge-brand badge-gabungan-btn"
                                onClick={() => setSelectedGabunganRow(row)}
                                title="Klik untuk melihat detail varian (Nama Barang, Terjual, Stock, SSR)"
                              >
                                <span>Gabungan ({row.variantCount}x)</span>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                  <polyline points="15 3 21 3 21 9" />
                                  <line x1="10" y1="14" x2="21" y2="3" />
                                </svg>
                              </button>
                            )
                            : <span className="mono" style={{ fontSize: 12.5 }}>Tunggal</span>}
                        </td>
                      )}
                      {visibleCols.has('gambar') && (
                        <td style={{ textAlign: 'center', width: 60, padding: '4px' }}>
                          {row.gambar ? (
                            <img
                              src={row.gambar}
                              alt={row.namaBarang || row.kodeBarang || ''}
                              referrerPolicy="no-referrer"
                              style={{ height: 40, width: 'auto', borderRadius: 4, objectFit: 'cover', verticalAlign: 'middle', cursor: 'pointer' }}
                              loading="lazy"
                              title="Klik untuk memperbesar gambar"
                              onClick={() => setPreviewImage({ url: row.gambar, alt: row.namaBarang || row.kodeBarang || '' })}
                              onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                            />
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      )}
                      {visibleCols.has('namaBarang') && (
                        <td style={{ fontWeight: 500 }}>
                          <HighlightText text={row.namaBarang} query={searchQuery} />
                        </td>
                      )}
                      {hasStock && visibleCols.has('brand') && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {si.brand !== '—'
                            ? <span className="badge-brand">{si.brand}</span>
                            : <span className="muted">—</span>}
                        </td>
                      )}
                      {visibleCols.has('kuantitas') && (
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {row.kuantitas.toLocaleString('id-ID')}
                        </td>
                      )}
                      {hasStock && visibleCols.has('hpp') && (
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {row.hpp ? formatRupiah(row.hpp) : <span className="muted">—</span>}
                        </td>
                      )}
                      {hasStock && visibleCols.has('stock') && (
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {si.hasData
                            ? <span style={{ color: si.stock === 0 ? 'var(--accent, #D85A30)' : 'inherit' }}>
                              {si.stock.toLocaleString('id-ID')}
                            </span>
                            : <span className="muted">0</span>}
                        </td>
                      )}
                      {visibleCols.has('mpStock') && (
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {row.hasMpStockData
                            ? <span style={{ color: row.mpStock === 0 ? 'var(--accent, #D85A30)' : 'inherit' }}>
                              {(row.mpStock || 0).toLocaleString('id-ID')}
                            </span>
                            : <span className="muted">—</span>}
                        </td>
                      )}
                      {hasStock && visibleCols.has('unit') && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {row.unit
                            ? <span>{row.unit}</span>
                            : <span className="muted">—</span>}
                        </td>
                      )}
                      {visibleCols.has('hargaProduk') && (
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {formatRupiah(row.hargaProduk)}
                        </td>
                      )}
                      {hasStock && visibleCols.has('totalHpp') && (
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {row.totalHpp ? formatRupiah(row.totalHpp) : <span className="muted">—</span>}
                        </td>
                      )}
                      {hasStock && visibleCols.has('ssr') && (
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
            <Pagination
              page={safePage}
              totalPages={totalPages}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              totalRows={rows.length}
            />
            {exportOptions && rows.length > 0 && (
              <ExportSplitBtnSm
                allRows={rows}
                pageRows={pageRows}
                exportOptions={exportOptions}
              />
            )}
          </div>
        </>
      )}
      {previewImage && (
        <ImagePreviewModal
          url={previewImage.url}
          alt={previewImage.alt}
          onClose={() => setPreviewImage(null)}
        />
      )}
      {selectedGabunganRow && (
        <GabunganVariantsModal
          row={selectedGabunganRow}
          hasStock={hasStock}
          onClose={() => setSelectedGabunganRow(null)}
        />
      )}
      {pembagianPromoOpen && (
        <PembagianPromoModal
          isOpen={pembagianPromoOpen}
          onClose={() => setPembagianPromoOpen(false)}
          selectedRows={selectedRowsForPromo}
          allRows={rows}
          onSelectRows={(newSet) => setSelectedSkuKeys(newSet)}
          hasStock={hasStock}
        />
      )}
      {cetakJadwalOpen && (
        <CetakJadwalPromoModal
          isOpen={cetakJadwalOpen}
          onClose={() => setCetakJadwalOpen(false)}
          mpStockItems={mpStockItems}
        />
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

  // Ref to track current page rows for "export displayed" option
  const pageRowsRef = useRef([])

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

  // Quick filter: Cek Stok Marketplace Kosong, Fisik Ada (MP STOCK = 0 and STOCK > 0)
  const [onlyMpKosongFisikAda, setOnlyMpKosongFisikAda] = useState(false)

  // Quick filter: Cek Gambar / Variasi (KODE BARANG contain period, GAMBAR tidak ada gambar, STOCK > 0)
  const [onlyCekGambarVariasi, setOnlyCekGambarVariasi] = useState(false)

  // Stock lookup: { kodeBarang: { brand, stock } } — digabung dari underwear + sport
  const [stockLookup, setStockLookup] = useState(null)
  const [stockError, setStockError] = useState(null)

  // Data Stok Marketplace (untuk kolom MP STOCK dan GAMBAR)
  const [mpStockItems, setMpStockItems] = useState([])

  // Lookup map stok marketplace untuk mencocokkan Nama Barang dengan SKU di Stok Marketplace
  const mpItemLookup = useMemo(() => {
    const map = new Map()
    for (const item of mpStockItems) {
      if (!item || !item.sku) continue
      const rawSku = String(item.sku).trim().toLowerCase()
      if (!map.has(rawSku)) map.set(rawSku, item)
      const normSpace = rawSku.replace(/\s+/g, ' ')
      if (!map.has(normSpace)) map.set(normSpace, item)
      const cleanSku = rawSku.replace(/[^a-z0-9]/g, '')
      if (cleanSku && !map.has(cleanSku)) map.set(cleanSku, item)
      if (item.namaProduk) {
        const normNama = String(item.namaProduk).trim().toLowerCase()
        if (!map.has(normNama)) map.set(normNama, item)
      }
    }
    return map
  }, [mpStockItems])

  const loadMarketplaceStock = useCallback(async () => {
    try {
      const res = await fetch('/api/stok-marketplace/data?customer=all', { cache: 'no-store' })
      if (res.ok) {
        const json = await res.json()
        if (json.data?.items) {
          setMpStockItems(json.data.items)
        }
      }
    } catch (err) {
      console.error('Error loading marketplace stock in Produk Terlaris:', err)
    }
  }, [])

  // Catatan per baris (kodeBarang) — { [kodeBarang]: { text, updatedAt } },
  // disimpan di server (Vercel Blob) lewat /api/notes, jadi persist & kelihatan
  // di semua browser/device.
  const [notes, setNotes] = useState({})
  const [notesError, setNotesError] = useState(null)
  const [savingNoteFor, setSavingNoteFor] = useState(null) // kodeBarang yang lagi disimpan

  const loadNotes = useCallback(async () => {
    setNotesError(null)
    try {
      const res = await fetch('/api/notes', { cache: 'no-store' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Gagal memuat catatan (${res.status})`)
      const data = await res.json()
      setNotes(data.notes || {})
    } catch (err) {
      setNotesError(err.message)
    }
  }, [])

  const saveNote = useCallback(async (kodeBarang, text) => {
    setSavingNoteFor(kodeBarang)
    const trimmed = text.trim()
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kodeBarang, text: trimmed }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Gagal menyimpan catatan (${res.status})`)
      const result = await res.json()
      setNotes(prev => {
        const next = { ...prev }
        if (result.deleted) {
          delete next[kodeBarang]
        } else {
          next[kodeBarang] = { text: result.text, updatedAt: result.updatedAt }
        }
        return next
      })
      return true
    } catch (err) {
      setNotesError(err.message)
      return false
    } finally {
      setSavingNoteFor(null)
    }
  }, [])

  const deleteNote = useCallback((kodeBarang) => saveNote(kodeBarang, ''), [saveNote])

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
        loadMarketplaceStock()
        loadNotes()

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
      loadMarketplaceStock()
      loadNotes()
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setLoginLoading(false)
    }
  }, [password, loadPeriods, loadData, loadStock, loadMarketplaceStock, loadNotes])

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

    // 3. merge in MP Stock (stock marketplace & gambar dari Stok Marketplace)
    rows = enrichWithMpStock(rows, mpItemLookup)

    return rows
  }, [rawRows, filters, stockLookup, mpItemLookup])

  // Semua brand yang ada untuk periode/filter tanggal saat ini — dipakai buat
  // checklist di kolom Brand. Diambil SEBELUM search/kolom-filter lain supaya
  // daftar pilihannya tidak ikut menyusut saat sedang milih brand.
  const brandOptions = useMemo(() => {
    return Array.from(new Set(
      enrichedRows.map(r => r.brand).filter(b => b && b !== '—')
    )).sort((a, b) => a.localeCompare(b, 'id'))
  }, [enrichedRows])

  // Hitung jumlah baris yang cocok untuk filter "Cek Stok Marketplace Kosong, Fisik Ada"
  const countMpKosongFisikAda = useMemo(() => {
    const baseRows = groupMode === 'induk' ? groupByParentSku(enrichedRows) : enrichedRows
    return baseRows.filter(r => (Number(r.mpStock) === 0 && r.mpStock !== null) && (Number(r.stock || 0) > 0)).length
  }, [enrichedRows, groupMode])

  // Hitung jumlah baris yang cocok untuk filter "Cek Gambar / Variasi" (kode bertitik, tanpa gambar, stock > 0)
  const countGambarVariasi = useMemo(() => {
    return enrichedRows.filter(r =>
      String(r.kodeBarang || '').includes('.') &&
      (!r.gambar || String(r.gambar).trim() === '') &&
      (Number(r.stock || 0) > 0)
    ).length
  }, [enrichedRows])

  const filteredRows = useMemo(() => {
    let rows = groupMode === 'induk' ? groupByParentSku(enrichedRows) : enrichedRows

    // Quick filter: Cek Stok Marketplace Kosong, Fisik Ada (MP STOCK = 0 and STOCK > 0)
    if (onlyMpKosongFisikAda) {
      rows = rows.filter(r => (Number(r.mpStock) === 0 && r.mpStock !== null) && (Number(r.stock || 0) > 0))
    }

    // Quick filter: Cek Gambar / Variasi (KODE BARANG contain period, GAMBAR tidak ada gambar, STOCK > 0)
    if (onlyCekGambarVariasi) {
      rows = rows.filter(r =>
        String(r.kodeBarang || '').includes('.') &&
        (!r.gambar || String(r.gambar).trim() === '') &&
        (Number(r.stock || 0) > 0)
      )
    }

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
  }, [enrichedRows, groupMode, onlyMpKosongFisikAda, onlyCekGambarVariasi, searchQuery, colFilters, sortBy, sortDir])

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
      kodeBarang: 'Kode Barang', namaBarang: 'Nama Barang', kuantitas: 'Terjual', hargaProduk: 'TOTAL TERJUAL',
      brand: 'Brand', stock: 'Stock', hpp: 'HPP PCS', totalHpp: 'Total HPP', ssr: 'SSR', tipe: 'Tipe',
      gambar: 'Gambar',
    }
    for (const [col, f] of Object.entries(colFilters)) {
      if (col === 'gambar') {
        if (f.value && f.value !== 'SEMUA') {
          parts.push(`Gambar: ${f.value}`)
        }
        continue
      }
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
    if (onlyMpKosongFisikAda) {
      parts.push('Stok Marketplace Kosong, Fisik Ada (MP=0 & Stock>0)')
    }
    if (onlyCekGambarVariasi) {
      parts.push('Cek Gambar / Variasi (Kode bertitik, Tanpa Gambar & Stock>0)')
    }
    return parts.length ? parts.join(' · ') : null
  }, [filters, analysis, colFilters, onlyMpKosongFisikAda, onlyCekGambarVariasi])

  // Count active column filters for badge
  const activeColFilterCount = useMemo(() => {
    let count = Object.entries(colFilters).filter(([col, f]) => {
      if (col === 'gambar') return f.value && f.value !== 'SEMUA'
      if (!f.op) return false
      if (f.op === 'in') return !!(f.values && f.values.length > 0)
      if (['is_empty', 'is_not_empty'].includes(f.op)) return true
      return f.value !== ''
    }).length
    if (onlyMpKosongFisikAda) count += 1
    if (onlyCekGambarVariasi) count += 1
    return count
  }, [colFilters, onlyMpKosongFisikAda, onlyCekGambarVariasi])

  const resetColFilters = () => {
    setColFilters({})
    setOnlyMpKosongFisikAda(false)
    setOnlyCekGambarVariasi(false)
  }

  // Toggle handlers that apply the visible column filters directly to colFilters and sort by biggest stock
  const handleToggleMpKosongFisikAda = useCallback(() => {
    const isCurrentlyActive = Boolean(
      colFilters.mpStock?.op === 'eq' && String(colFilters.mpStock?.value) === '0' &&
      colFilters.stock?.op === 'gt' && String(colFilters.stock?.value) === '0'
    )

    if (isCurrentlyActive) {
      setColFilters(cf => {
        const next = { ...cf }
        delete next.mpStock
        delete next.stock
        return next
      })
    } else {
      setColFilters(cf => {
        const next = { ...cf }
        if (next.kodeBarang?.value === '.') delete next.kodeBarang
        if (next.gambar?.value === 'TIDAK ADA GAMBAR') delete next.gambar
        next.mpStock = { op: 'eq', value: '0', value2: '' }
        next.stock = { op: 'gt', value: '0', value2: '' }
        return next
      })
      setSortBy('stock')
      setSortDir('desc')
    }
  }, [colFilters])

  const handleToggleCekGambarVariasi = useCallback(() => {
    const isCurrentlyActive = Boolean(
      colFilters.kodeBarang?.op === 'contains' && colFilters.kodeBarang?.value === '.' &&
      colFilters.gambar?.value === 'TIDAK ADA GAMBAR' &&
      colFilters.stock?.op === 'gt' && String(colFilters.stock?.value) === '0'
    )

    if (isCurrentlyActive) {
      setColFilters(cf => {
        const next = { ...cf }
        delete next.kodeBarang
        delete next.gambar
        delete next.stock
        return next
      })
    } else {
      if (groupMode !== 'variant') {
        handleGroupModeChange('variant')
      }
      setColFilters(cf => {
        const next = { ...cf }
        if (next.mpStock?.value === '0') delete next.mpStock
        next.kodeBarang = { op: 'contains', value: '.', value2: '' }
        next.gambar = { op: 'equals', value: 'TIDAK ADA GAMBAR', value2: '' }
        next.stock = { op: 'gt', value: '0', value2: '' }
        return next
      })
      setSortBy('stock')
      setSortDir('desc')
    }
  }, [colFilters, groupMode, handleGroupModeChange])

  // Sinkronkan boolean flag tombol dengan colFilters
  useEffect(() => {
    const isMp = Boolean(
      colFilters.mpStock?.op === 'eq' && String(colFilters.mpStock?.value) === '0' &&
      colFilters.stock?.op === 'gt' && String(colFilters.stock?.value) === '0'
    )
    setOnlyMpKosongFisikAda(isMp)

    const isGb = Boolean(
      colFilters.kodeBarang?.op === 'contains' && colFilters.kodeBarang?.value === '.' &&
      colFilters.gambar?.value === 'TIDAK ADA GAMBAR' &&
      colFilters.stock?.op === 'gt' && String(colFilters.stock?.value) === '0'
    )
    setOnlyCekGambarVariasi(isGb)
  }, [colFilters])

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
                <ExportSplitBtnSm
                  allRows={filteredRows}
                  pageRows={pageRowsRef.current}
                  exportOptions={{
                    periodLabel: analysis?.periodLabel,
                    filterDesc: activeFilterDesc,
                    hasStock,
                  }}
                />
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
            onlyMpKosongFisikAda={onlyMpKosongFisikAda}
            onToggleMpKosongFisikAda={handleToggleMpKosongFisikAda}
            countMpKosongFisikAda={countMpKosongFisikAda}
            onlyCekGambarVariasi={onlyCekGambarVariasi}
            onToggleCekGambarVariasi={handleToggleCekGambarVariasi}
            countGambarVariasi={countGambarVariasi}
            stockLookup={stockLookup}
            brandOptions={brandOptions}
            groupMode={groupMode}
            onGroupModeChange={handleGroupModeChange}
            mpStockItems={mpStockItems}
            notes={notes}
            notesError={notesError}
            savingNoteFor={savingNoteFor}
            onSaveNote={saveNote}
            onDeleteNote={deleteNote}
            exportOptions={filteredRows.length > 0 ? {
              periodLabel: analysis?.periodLabel,
              filterDesc: activeFilterDesc,
              hasStock,
            } : null}
            onPageRowsChange={(pr) => { pageRowsRef.current = pr }}
          />
        </div>
      )}
    </div>
  )
}
