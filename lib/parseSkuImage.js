import * as XLSX from 'xlsx'

// ─── Parser file gambar SKU ────────────────────────────────────────────────────
//
// Format file: baris pertama = header, kolom yang dibutuhkan:
//   B) SKU    — kode barang (boleh kode penuh varian, mis. 1002189.1.01,
//                atau kode dasar, mis. 1002189)
//   C) IMAGE  — link CDN gambar produk, mis.
//                https://cf.shopee.co.id/file/id-11134207-822wl-mnauni8zi8sj0a
//
// Kolom dicari berdasarkan NAMA header (bukan posisi kolom B/C secara kaku),
// supaya tetap jalan walau ada kolom tambahan/urutan sedikit berbeda —
// selama header "SKU" dan "IMAGE" ada di file.

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

// bySku: { [kodeSku]: imageUrl }
export function parseSkuImageFile(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true })

  if (!rows.length) throw new Error('File tidak berisi data.')

  const headers = Object.keys(rows[0])
  const colSku = findCol(headers, ['SKU', 'Kode Barang', 'Kode', 'No. Barang', 'No Barang'])
  const colImage = findCol(headers, ['IMAGE', 'Image', 'Gambar', 'URL Gambar', 'Link Gambar'])

  const missing = [
    !colSku && 'SKU',
    !colImage && 'IMAGE',
  ].filter(Boolean)

  if (missing.length) {
    throw new Error(`Kolom berikut tidak ditemukan: ${missing.join(', ')}. Pastikan file punya kolom header "SKU" dan "IMAGE".`)
  }

  const bySku = {}
  let count = 0

  for (const row of rows) {
    const sku = String(row[colSku] ?? '').trim()
    const url = String(row[colImage] ?? '').trim()
    if (!sku || !url) continue
    bySku[sku] = url
    count += 1
  }

  if (count === 0) {
    throw new Error('Tidak ada baris valid (SKU + IMAGE) yang ditemukan di file.')
  }

  return { bySku, count }
}

// Cocokkan SKU dari lookup gambar ke sebuah baris tabel. File gambar biasanya
// dikunci pakai NAMA produk versi marketplace (mis. "STL SC 361-L-HIJAU" —
// sama persis dengan kolom "Nama Barang" di data penjualan), bukan kode
// gudang internal (mis. "1002189.1.01"). Jadi urutan pencarian:
//   1. namaBarang — cocok persis (case/spasi-insensitive)
//   2. kodeBarang — cocok persis, lalu fallback ke kode dasar sebelum titik
//      pertama (buat file yang kebetulan dikunci pakai kode gudang)

function normalizeSkuKey(s) {
  return String(s || '').trim().toUpperCase().replace(/\s+/g, ' ')
}

// Bangun index dengan key sudah dinormalisasi — dipanggil sekali (di-memo)
// tiap kali mapping gambar berubah, supaya lookup per-baris tabel murah.
export function buildImageIndex(bySku) {
  const idx = {}
  for (const [k, v] of Object.entries(bySku || {})) {
    idx[normalizeSkuKey(k)] = v
  }
  return idx
}

export function lookupSkuImage(row, imageIndex) {
  if (!imageIndex || !row) return null

  const byName = normalizeSkuKey(row.namaBarang)
  if (byName && imageIndex[byName]) return imageIndex[byName]

  const kode = String(row.kodeBarang || '').trim()
  if (kode) {
    const byKodeFull = normalizeSkuKey(kode)
    if (imageIndex[byKodeFull]) return imageIndex[byKodeFull]
    const base = kode.split('.')[0]
    if (base) {
      const byKodeBase = normalizeSkuKey(base)
      if (imageIndex[byKodeBase]) return imageIndex[byKodeBase]
    }
  }

  return null
}
