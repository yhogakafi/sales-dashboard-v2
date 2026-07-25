/**
 * Parser untuk file stock (underwear / sport).
 *
 * Kolom yang dicari (fleksibel, case-insensitive):
 *   - Kode barang  : 'Kode Barang', 'Kode', 'Item Code', 'SKU'
 *   - Brand        : 'Brand', 'Merek', 'Merk'
 *   - Stock        : 'Stock', 'Stok', 'Qty', 'Jumlah Stock', 'Sisa Stock'
 *
 * Output: { [kodeBarang]: { brand, stock } }
 */

import * as XLSX from 'xlsx'

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

/**
 * Parse file stock dari ArrayBuffer.
 * Returns { stockMap, totalRows, missingStock }
 *   stockMap: { [kodeBarang]: { brand, stock } }
 *   totalRows: jumlah baris valid
 *   missingStock: jumlah baris tanpa data stock (dihitung 0)
 */
export function parseStock(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true })

  if (!rows.length) throw new Error('File tidak berisi data.')

  const headers = Object.keys(rows[0])

  const colKode  = findCol(headers, ['Kode Barang', 'Kode Item', 'Kode', 'Item Code', 'SKU', 'Part No'])
  const colBrand = findCol(headers, ['Brand', 'Merek', 'Merk', 'Nama Brand'])
  const colStock = findCol(headers, [
    'Stock', 'Stok', 'Qty', 'Jumlah', 'Sisa', 'Sisa Stock', 'Sisa Stok',
    'Jumlah Stock', 'Jumlah Stok', 'Total Stock', 'Total Stok', 'Available',
  ])

  const missing = [
    !colKode  && 'Kode Barang',
    !colBrand && 'Brand',
    !colStock && 'Stock / Stok',
  ].filter(Boolean)

  if (missing.length) {
    throw new Error(
      `Kolom berikut tidak ditemukan: ${missing.join(', ')}. ` +
      `Pastikan file memiliki kolom Kode Barang, Brand, dan Stock.`
    )
  }

  const stockMap = {}
  let totalRows = 0
  let missingStock = 0

  for (const row of rows) {
    const kode = row[colKode]
    if (kode == null || String(kode).trim() === '') continue

    const kodeStr = String(kode).trim()
    const brand   = colBrand ? String(row[colBrand] || '').trim() : ''
    const rawStok = row[colStock]
    const stock   = rawStok == null || rawStok === '' ? 0 : Number(rawStok)

    if (isNaN(stock)) {
      missingStock++
      stockMap[kodeStr] = { brand, stock: 0 }
    } else {
      if (stock === 0 && (rawStok == null || rawStok === '')) missingStock++
      stockMap[kodeStr] = { brand, stock: Math.max(0, Math.round(stock)) }
    }
    totalRows++
  }

  if (!totalRows) throw new Error('Tidak ada baris data yang valid (kolom Kode Barang kosong semua).')

  return { stockMap, totalRows, missingStock }
}
