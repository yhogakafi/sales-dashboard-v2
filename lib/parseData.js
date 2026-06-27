import * as XLSX from 'xlsx'

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jumat", 'Sabtu']
const DAY_NAMES_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

function excelSerialToDate(value) {
  // Handles both JS Date objects (already parsed by sheet_to_json with raw:false off)
  // and numeric Excel serial dates, plus string dates.
  if (value instanceof Date) return value
  if (typeof value === 'number') {
    const utcDays = Math.floor(value - 25569)
    const utcMs = utcDays * 86400 * 1000
    return new Date(utcMs)
  }
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!isNaN(parsed.getTime())) return parsed
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

function formatDateLabel(key) {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
  return `${String(d).padStart(2,'0')} ${months[m-1]}`
}

function dayName(key, short = false) {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return (short ? DAY_NAMES_SHORT : DAY_NAMES)[date.getDay()]
}

// Best-effort column resolution: the source file uses Indonesian invoice-export
// headers but capitalization/spacing can vary slightly between exports.
function findColumn(headers, candidates) {
  const norm = (s) => String(s).toLowerCase().trim().replace(/\s+/g, ' ')
  const normalizedHeaders = headers.map(norm)
  for (const candidate of candidates) {
    const idx = normalizedHeaders.indexOf(norm(candidate))
    if (idx !== -1) return headers[idx]
  }
  // fallback: partial match
  for (const candidate of candidates) {
    const c = norm(candidate)
    const idx = normalizedHeaders.findIndex((h) => h.includes(c) || c.includes(h))
    if (idx !== -1) return headers[idx]
  }
  return null
}

export function parseWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true })

  if (!rows.length) {
    throw new Error('File tidak berisi data.')
  }

  const headers = Object.keys(rows[0])
  const colTanggal = findColumn(headers, ['Tanggal', 'Date'])
  const colPelanggan = findColumn(headers, ['Pelanggan Penagihan', 'Pelanggan'])
  const colTotal = findColumn(headers, ['Total Faktur', 'Total', 'Grand Total'])

  if (!colTanggal || !colPelanggan || !colTotal) {
    const missing = [
      !colTanggal && 'Tanggal',
      !colPelanggan && 'Pelanggan Penagihan',
      !colTotal && 'Total Faktur',
    ].filter(Boolean)
    throw new Error(
      `Kolom berikut tidak ditemukan di file: ${missing.join(', ')}. Pastikan format file sama seperti ekspor invoice toko.`
    )
  }

  const cleaned = []
  for (const row of rows) {
    const rawDate = row[colTanggal]
    const date = excelSerialToDate(rawDate)
    // Rows without a parseable date are summary/total rows appended by the export — skip them.
    if (!date || isNaN(date.getTime())) continue
    const pelanggan = row[colPelanggan]
    const total = Number(row[colTotal])
    if (pelanggan == null || pelanggan === '') continue
    if (isNaN(total)) continue

    const [platform, ...rest] = String(pelanggan).split(' / ')
    cleaned.push({
      dateKey: dateKey(date),
      pelanggan: String(pelanggan).trim(),
      platform: platform.trim(),
      brand: rest.join(' / ').trim() || '(tanpa nama)',
      total,
    })
  }

  if (!cleaned.length) {
    throw new Error('Tidak ada baris transaksi valid yang ditemukan (kolom Tanggal kosong di semua baris).')
  }

  return buildAnalysis(cleaned)
}

function buildAnalysis(rows) {
  const dateKeys = Array.from(new Set(rows.map((r) => r.dateKey))).sort()
  const customers = Array.from(new Set(rows.map((r) => r.pelanggan)))

  // Totals per customer, for ranking
  const customerTotals = {}
  const customerCounts = {}
  for (const c of customers) {
    customerTotals[c] = 0
    customerCounts[c] = 0
  }
  for (const r of rows) {
    customerTotals[r.pelanggan] += r.total
    customerCounts[r.pelanggan] += 1
  }
  const rankedCustomers = [...customers].sort((a, b) => customerTotals[b] - customerTotals[a])

  // Pivot: date x customer -> sum, count
  const pivotOmset = {}
  const pivotCount = {}
  for (const d of dateKeys) {
    pivotOmset[d] = {}
    pivotCount[d] = {}
    for (const c of customers) {
      pivotOmset[d][c] = 0
      pivotCount[d][c] = 0
    }
  }
  for (const r of rows) {
    pivotOmset[r.dateKey][r.pelanggan] += r.total
    pivotCount[r.dateKey][r.pelanggan] += 1
  }

  // Daily aggregate totals (all customers combined)
  const daily = dateKeys.map((d) => {
    const omset = customers.reduce((sum, c) => sum + pivotOmset[d][c], 0)
    const order = customers.reduce((sum, c) => sum + pivotCount[d][c], 0)
    return { dateKey: d, label: formatDateLabel(d), day: dayName(d), omset, order }
  })

  // Detect missing calendar dates within range (gaps, e.g. closed Sundays)
  const firstDate = new Date(dateKeys[0])
  const lastDate = new Date(dateKeys[dateKeys.length - 1])
  const presentSet = new Set(dateKeys)
  const missingDates = []
  for (let d = new Date(firstDate); d <= lastDate; d.setDate(d.getDate() + 1)) {
    const k = dateKey(d)
    if (!presentSet.has(k)) {
      missingDates.push({ dateKey: k, label: formatDateLabel(k), day: dayName(k) })
    }
  }

  // Platform & brand rollups
  const platformTotals = {}
  const brandTotals = {}
  for (const r of rows) {
    platformTotals[r.platform] = (platformTotals[r.platform] || 0) + r.total
    brandTotals[r.brand] = (brandTotals[r.brand] || 0) + r.total
  }

  const totalOmset = rows.reduce((s, r) => s + r.total, 0)
  const totalOrder = rows.length

  return {
    dateKeys,
    customers,
    rankedCustomers,
    customerTotals,
    customerCounts,
    pivotOmset,
    pivotCount,
    daily,
    missingDates,
    platformTotals,
    brandTotals,
    totalOmset,
    totalOrder,
    periodLabel: `${formatDateLabel(dateKeys[0])} – ${formatDateLabel(dateKeys[dateKeys.length - 1])}`,
    firstDateKey: dateKeys[0],
    lastDateKey: dateKeys[dateKeys.length - 1],
  }
}

export function formatRupiah(n) {
  return 'Rp' + Math.round(n).toLocaleString('id-ID')
}

export function formatNumber(n) {
  return Math.round(n).toLocaleString('id-ID')
}

export { formatDateLabel, dayName }
