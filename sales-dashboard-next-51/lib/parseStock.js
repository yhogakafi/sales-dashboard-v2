import * as XLSX from 'xlsx'

// ─── Parser file stock (underwear atau sport) ─────────────────────────────────
//
// Format file: baris 0 = header, kolom:
//   No. Barang | (kosong) | Deskripsi Barang | (kosong) | BRAND | (kosong) | STOCK
//
// Kode barang di sini adalah kode PENUH termasuk varian (misal 1002189.1.01).
// Satu kode penuh = satu baris varian = satu nilai stock.
//
// Saat lookup di halaman Produk Terlaris:
// - "Per Varian"      : cocokkan kode penuh dari transaksi → ambil brand + stock
// - "Per Produk Dasar": cocokkan kodeBase (sebelum titik pertama) → jumlahkan stock semua varian

function normHeader(s) {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

function findCol(headers, candidates) {
  const normed = headers.map(normHeader)
  for (const c of candidates) {
    const idx = normed.indexOf(normHeader(c))
    if (idx !== -1) return headers[idx]
  }
  // fallback: partial match
  for (const c of candidates) {
    const nc = normHeader(c)
    const idx = normed.findIndex(h => h.includes(nc) || nc.includes(h))
    if (idx !== -1) return headers[idx]
  }
  return null
}

export function parseStockFile(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true })

  if (!rows.length) throw new Error('File tidak berisi data.')

  const headers = Object.keys(rows[0])
  const colKode  = findCol(headers, ['No. Barang', 'Kode Barang', 'Kode', 'No Barang'])
  const colDesk  = findCol(headers, ['Deskripsi Barang', 'Deskripsi', 'Uraian Barang', 'Uraian', 'Nama Barang', 'Nama Item', 'Nama Produk', 'Nama'])
  const colBrand = findCol(headers, ['BRAND', 'Brand', 'Merek'])
  const colStock = findCol(headers, ['STOCK', 'Stock', 'Stok', 'Qty', 'Jumlah'])
  const colUnit  = findCol(headers, ['UNIT', 'Unit', 'Satuan', 'Satuan Unit'])
  const colHpp   = findCol(headers, ['HPP PCS', 'HPP/PCS', 'HPP', 'Harga Pokok', 'Harga Pokok Produksi'])

  const missing = [
    !colKode  && 'No. Barang',
    !colStock && 'STOCK',
  ].filter(Boolean)

  if (missing.length) {
    throw new Error(`Kolom berikut tidak ditemukan: ${missing.join(', ')}. Pastikan format file stock sesuai.`)
  }

  // byKodePenuh: { "1002189.1.01": { brand, stock, unit, nama, hpp } }
  const byKodePenuh = {}
  let totalRows = 0

  for (const row of rows) {
    const kodeRaw = row[colKode]
    if (kodeRaw == null || kodeRaw === '') continue

    const kode  = String(kodeRaw).trim()
    const brand = colBrand && row[colBrand] != null ? String(row[colBrand]).trim() : ''
    const stock = Number(row[colStock]) || 0
    const unit  = colUnit && row[colUnit] != null ? String(row[colUnit]).trim() : ''
    const nama  = colDesk && row[colDesk] != null ? String(row[colDesk]).trim() : ''
    const hpp   = colHpp && row[colHpp] != null ? Number(row[colHpp]) || 0 : 0

    if (!kode) continue

    // Kalau kode penuh sama muncul lebih dari sekali (tidak seharusnya), jumlahkan
    // stock-nya saja — HPP adalah harga per pcs, bukan sesuatu yang dijumlahkan,
    // jadi pertahankan nilai pertama yang valid.
    if (byKodePenuh[kode]) {
      byKodePenuh[kode].stock += stock
      if (!byKodePenuh[kode].unit && unit) byKodePenuh[kode].unit = unit
      if (!byKodePenuh[kode].nama && nama) byKodePenuh[kode].nama = nama
      if (!byKodePenuh[kode].hpp && hpp) byKodePenuh[kode].hpp = hpp
    } else {
      byKodePenuh[kode] = { brand, stock, unit, nama, hpp }
    }
    totalRows++
  }

  if (!totalRows) {
    throw new Error('Tidak ada baris data valid yang ditemukan di file stock.')
  }

  return {
    byKodePenuh,
    count: Object.keys(byKodePenuh).length,
  }
}
