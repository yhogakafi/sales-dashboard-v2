import * as XLSX from 'xlsx'

// File master-barang: dua kolom tanpa header — kolom A kode barang, kolom B nama barang.
// Kode dipakai sebagai string (beberapa kode berupa angka murni, beberapa berupa
// kode alfanumerik seperti "AC10001" — keduanya harus cocok sebagai string saat
// dipetakan dari kode di file barang-terlaris).
export function parseMasterBarang(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true })

  if (!rows.length) {
    throw new Error('File tidak berisi data.')
  }

  const map = {}
  let count = 0

  rows.forEach((row, i) => {
    if (!row) return
    const kodeRaw = row[0]
    const namaRaw = row[1]
    if (kodeRaw == null || String(kodeRaw).trim() === '') return
    if (namaRaw == null || String(namaRaw).trim() === '') return

    const kode = String(kodeRaw).trim()

    // Jaga-jaga kalau baris pertama ternyata baris header (mis. "Kode" / "Nama Barang"),
    // bukan data sungguhan — lewati saja tanpa dianggap error.
    if (i === 0) {
      const looksLikeHeader = /^(kode|kode\s*barang|sku)$/i.test(kode) &&
        /^(nama|nama\s*barang|nama\s*produk|product\s*name)$/i.test(String(namaRaw).trim())
      if (looksLikeHeader) return
    }

    map[kode] = String(namaRaw).trim()
    count++
  })

  if (count === 0) {
    throw new Error(
      'Tidak ada data yang bisa dibaca. Pastikan kolom A berisi kode barang dan kolom B berisi nama barang.'
    )
  }

  return { map, count }
}
