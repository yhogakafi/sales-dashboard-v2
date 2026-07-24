import * as XLSX from 'xlsx'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(raw) {
  if (!raw) return null
  if (raw instanceof Date) return raw
  if (typeof raw === 'number') {
    // Excel serial date
    const utcMs = (Math.floor(raw - 25569)) * 86400 * 1000
    return new Date(utcMs)
  }
  if (typeof raw === 'string') {
    // "23 Jul 2026" style (from LibreOffice / manual export)
    const months = {
      jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, may: 4,
      jun: 5, jul: 6, agu: 7, aug: 7, sep: 8, okt: 9, oct: 9, nov: 10, des: 11, dec: 11,
    }
    const parts = raw.trim().split(/\s+/)
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10)
      const m = months[parts[1].toLowerCase()]
      const y = parseInt(parts[2], 10)
      if (!isNaN(d) && m !== undefined && !isNaN(y)) return new Date(y, m, d)
    }
    const p = new Date(raw)
    if (!isNaN(p.getTime())) return p
  }
  return null
}

function dateKey(d) {
  if (!d) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatDateLabel(key) {
  const [y, m, d] = key.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  return `${String(d).padStart(2, '0')} ${months[m - 1]}`
}

/**
 * Strip leading '#' and parse diskon string to a number.
 * "#2500" → 2500, "2500" → 2500, null/undefined → 0
 */
function parseDiskon(raw) {
  if (raw == null || raw === '') return 0
  const s = String(raw).trim().replace(/^#/, '')
  const n = parseFloat(s.replace(/[.,]/g, (c, i, str) => {
    // handle thousand separators: if there are 3 digits after a dot/comma it's a separator
    const after = str.slice(i + 1)
    const isSep = /^\d{3}([^0-9]|$)/.test(after)
    return isSep ? '' : c
  }))
  return isNaN(n) ? 0 : n
}

/**
 * Harga Produk per-row = (Harga * Kuantitas) - (Kuantitas * Diskon)
 */
function hitungHarga(harga, kuantitas, diskon) {
  return (harga * kuantitas) - (kuantitas * diskon)
}

function normHeader(s) {
  return String(s).toLowerCase().trim().replace(/\s+/g, ' ')
}

function findCol(headers, candidates) {
  const normed = headers.map(normHeader)
  for (const c of candidates) {
    const idx = normed.indexOf(normHeader(c))
    if (idx !== -1) return headers[idx]
  }
  for (const c of candidates) {
    const nc = normHeader(c)
    const idx = normed.findIndex(h => h.includes(nc) || nc.includes(h))
    if (idx !== -1) return headers[idx]
  }
  return null
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseBarangTerlaris(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true })

  if (!rows.length) throw new Error('File tidak berisi data.')

  const headers = Object.keys(rows[0])

  const colTanggal   = findCol(headers, ['Tgl DO', 'Tanggal DO', 'Tanggal', 'Date'])
  const colPelanggan = findCol(headers, ['Nama Pelanggan', 'Pelanggan'])
  const colNamaBarang = findCol(headers, ['Nama Barang', 'Nama Item', 'Barang'])
  const colKuantitas = findCol(headers, ['Kuantitas', 'Qty', 'Jumlah'])
  const colHarga     = findCol(headers, ['Harga satuan', 'Harga Satuan', 'Harga', 'Unit Price'])
  const colDiskon    = findCol(headers, ['Diskon', 'Discount'])

  const missing = [
    !colTanggal && 'Tgl DO / Tanggal',
    !colNamaBarang && 'Nama Barang',
    !colKuantitas && 'Kuantitas',
    !colHarga && 'Harga Satuan',
  ].filter(Boolean)

  if (missing.length) {
    throw new Error(`Kolom berikut tidak ditemukan: ${missing.join(', ')}. Pastikan format file sesuai ekspor barang terlaris.`)
  }

  const cleaned = []
  for (const row of rows) {
    const rawDate = row[colTanggal]
    const date = parseDate(rawDate)
    if (!date || isNaN(date.getTime())) continue

    const namaBarang = row[colNamaBarang]
    if (namaBarang == null || String(namaBarang).trim() === '') continue

    const kuantitas = Number(row[colKuantitas])
    if (isNaN(kuantitas) || kuantitas <= 0) continue

    const harga  = Number(row[colHarga]) || 0
    const diskon = parseDiskon(colDiskon ? row[colDiskon] : null)
    const hargaProduk = hitungHarga(harga, kuantitas, diskon)

    const pelanggan = colPelanggan ? String(row[colPelanggan] || '').trim() : ''
    const [platform, ...rest] = pelanggan ? pelanggan.split(' / ') : ['(tanpa platform)']
    const brand = rest.join(' / ').trim() || '(tanpa akun)'

    cleaned.push({
      dateKey: dateKey(date),
      namaBarang: String(namaBarang).trim(),
      kuantitas,
      hargaProduk,
      pelanggan,
      platform: platform.trim(),
      brand,
    })
  }

  if (!cleaned.length) throw new Error('Tidak ada baris transaksi valid yang ditemukan.')

  return buildBarangAnalysis(cleaned)
}

// ─── Build analysis ───────────────────────────────────────────────────────────

function buildBarangAnalysis(rows) {
  const dateKeys = Array.from(new Set(rows.map(r => r.dateKey))).sort()

  // Aggregate by Nama Barang
  const byBarang = {}  // { namaBarang: { kuantitas, hargaProduk } }
  for (const r of rows) {
    if (!byBarang[r.namaBarang]) byBarang[r.namaBarang] = { kuantitas: 0, hargaProduk: 0 }
    byBarang[r.namaBarang].kuantitas    += r.kuantitas
    byBarang[r.namaBarang].hargaProduk  += r.hargaProduk
  }

  // Ranked list: sorted by kuantitas DESC
  const rankedBarang = Object.entries(byBarang)
    .sort((a, b) => b[1].kuantitas - a[1].kuantitas)
    .map(([namaBarang, v]) => ({ namaBarang, ...v }))

  // By-date × product (for date filtering)
  const byDateBarang = {}  // { dateKey: { namaBarang: { kuantitas, hargaProduk } } }
  for (const r of rows) {
    if (!byDateBarang[r.dateKey]) byDateBarang[r.dateKey] = {}
    if (!byDateBarang[r.dateKey][r.namaBarang]) byDateBarang[r.dateKey][r.namaBarang] = { kuantitas: 0, hargaProduk: 0 }
    byDateBarang[r.dateKey][r.namaBarang].kuantitas   += r.kuantitas
    byDateBarang[r.dateKey][r.namaBarang].hargaProduk += r.hargaProduk
  }

  // By-account (pelanggan) × product
  const byAccountBarang = {}  // { pelanggan: { namaBarang: { kuantitas, hargaProduk } } }
  const accounts = Array.from(new Set(rows.map(r => r.pelanggan).filter(Boolean)))
  for (const r of rows) {
    if (!r.pelanggan) continue
    if (!byAccountBarang[r.pelanggan]) byAccountBarang[r.pelanggan] = {}
    if (!byAccountBarang[r.pelanggan][r.namaBarang]) byAccountBarang[r.pelanggan][r.namaBarang] = { kuantitas: 0, hargaProduk: 0 }
    byAccountBarang[r.pelanggan][r.namaBarang].kuantitas   += r.kuantitas
    byAccountBarang[r.pelanggan][r.namaBarang].hargaProduk += r.hargaProduk
  }

  // By-category (brand) × product – untuk filter underwear/sport
  // We store raw rows per brand so the page can re-aggregate with date filters applied
  const byBrandBarang = {}
  for (const r of rows) {
    if (!byBrandBarang[r.brand]) byBrandBarang[r.brand] = []
    byBrandBarang[r.brand].push(r)
  }

  // Raw rows with all fields (for flexible client-side filtering)
  const rawRows = rows

  return {
    dateKeys,
    accounts,
    rankedBarang,
    byDateBarang,
    byAccountBarang,
    rawRows,
    periodLabel: `${formatDateLabel(dateKeys[0])} – ${formatDateLabel(dateKeys[dateKeys.length - 1])}`,
    firstDateKey: dateKeys[0],
    lastDateKey:  dateKeys[dateKeys.length - 1],
    totalKuantitas: rows.reduce((s, r) => s + r.kuantitas, 0),
    totalHargaProduk: rows.reduce((s, r) => s + r.hargaProduk, 0),
  }
}

export function formatRupiah(n) {
  return 'Rp' + Math.round(n).toLocaleString('id-ID')
}
