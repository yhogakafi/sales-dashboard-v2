import * as XLSX from 'xlsx'

function norm(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// Baris header file ini bukan baris pertama — di atasnya ada beberapa baris judul
// dan info rentang tanggal ("Dari 23 Jul 2026 ke 24 Jul 2026"). Cari baris yang
// kolom pertamanya cocok dengan variasi nama kolom kode barang.
function findHeaderRowIndex(rows) {
  for (let i = 0; i < rows.length; i++) {
    const first = rows[i]?.[0]
    if (first == null) continue
    const n = norm(first)
    if (/^no\.?\s*barang$/.test(n) || /^kode\s*barang$/.test(n) || n === 'sku') {
      return i
    }
  }
  return -1
}

// Cari baris info rentang tanggal di atas header, contoh: "Dari 23 Jul 2026 ke 24 Jul 2026".
function findDateRangeRaw(rows, headerRowIdx) {
  for (let i = 0; i < headerRowIdx; i++) {
    const cell = rows[i]?.[0]
    if (typeof cell === 'string' && /dari.+ke/i.test(cell)) {
      return cell.trim()
    }
  }
  return null
}

export function parseProdukTerlaris(arrayBuffer, masterMap = {}) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true })

  if (!rows.length) {
    throw new Error('File tidak berisi data.')
  }

  const headerRowIdx = findHeaderRowIndex(rows)
  if (headerRowIdx === -1) {
    throw new Error(
      'Kolom "No. Barang" tidak ditemukan di file. Pastikan file ini adalah ekspor "Produk Terlaris" / "Histori Pengiriman Pesanan" yang formatnya belum diubah.'
    )
  }

  const headerRow = rows[headerRowIdx]

  // Cari kolom terakhir yang terisi di baris header.
  let lastColIdx = headerRow.length - 1
  while (lastColIdx > 0 && (headerRow[lastColIdx] == null || String(headerRow[lastColIdx]).trim() === '')) {
    lastColIdx--
  }
  const hasGrandTotalCol = lastColIdx > 0 && /grand\s*total/i.test(norm(headerRow[lastColIdx]))
  const storeEndIdx = hasGrandTotalCol ? lastColIdx - 1 : lastColIdx

  const tokoList = []
  for (let c = 1; c <= storeEndIdx; c++) {
    const label = headerRow[c]
    if (label != null && String(label).trim() !== '') tokoList.push(String(label).trim())
  }
  if (!tokoList.length) {
    throw new Error('Tidak ada kolom toko yang terbaca (kolom setelah "No. Barang" di file).')
  }

  const dateRangeRaw = findDateRangeRaw(rows, headerRowIdx)

  // Kumpulkan baris data. Kode di file ini punya akhiran varian setelah titik
  // pertama (mis. "1002189.1.02") yang tidak ada di master-barang (mis. "1002189") —
  // akhiran itu dibuang, lalu qty digabung per kode dasar.
  const productMap = {} // kode dasar -> { qtyByToko, totalQty }

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    const rawKode = row?.[0]
    if (rawKode == null || String(rawKode).trim() === '') continue
    if (/grand\s*total/i.test(norm(rawKode))) break // baris total di akhir file — berhenti di sini

    const kode = String(rawKode).split('.')[0].trim()
    if (!productMap[kode]) {
      productMap[kode] = { qtyByToko: {}, totalQty: 0 }
      for (const t of tokoList) productMap[kode].qtyByToko[t] = 0
    }

    for (let c = 0; c < tokoList.length; c++) {
      const v = Number(row[c + 1])
      if (!isNaN(v) && v !== 0) {
        productMap[kode].qtyByToko[tokoList[c]] += v
        productMap[kode].totalQty += v
      }
    }
  }

  const kodes = Object.keys(productMap)
  if (!kodes.length) {
    throw new Error('Tidak ada baris produk yang valid ditemukan di file.')
  }

  let unmatchedCount = 0
  const products = kodes.map((kode) => {
    const nama = masterMap?.[kode] || null
    if (!nama) unmatchedCount++
    return {
      kode,
      nama: nama || null, // null = belum ditemukan di master-barang, ditangani di tampilan
      totalQty: productMap[kode].totalQty,
      qtyByToko: productMap[kode].qtyByToko,
    }
  })

  products.sort((a, b) => b.totalQty - a.totalQty)

  const totalQtyAll = products.reduce((s, p) => s + p.totalQty, 0)
  const tokoTotals = {}
  for (const t of tokoList) {
    tokoTotals[t] = products.reduce((s, p) => s + p.qtyByToko[t], 0)
  }

  return {
    tokoList,
    products,
    totalQtyAll,
    tokoTotals,
    dateRangeRaw,
    unmatchedCount,
    periodLabel: dateRangeRaw || null,
  }
}
