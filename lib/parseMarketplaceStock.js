import * as XLSX from 'xlsx'

/**
 * Normalizes customer name into a safe ID/slug.
 * E.g. "SHOPEE / SCELTA" -> "shopee-scelta"
 */
export function slugifyCustomerId(name) {
  if (!name) return 'marketplace'
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

/**
 * Parses a single Excel file (Shopee stock export format or standard inventory).
 * Extracts ONLY: Nama Produk, SKU, and Stok.
 *
 * @param {ArrayBuffer | Buffer} arrayBuffer
 * @param {string} fileName
 * @returns {Array<{ namaProduk: string, sku: string, stok: number }>}
 */
export function parseMarketplaceStockFile(arrayBuffer, fileName = '') {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false })
  if (!wb.SheetNames || !wb.SheetNames.length) {
    throw new Error(`File ${fileName || 'Excel'} tidak memiliki lembar kerja (sheet).`)
  }

  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  if (!rows || rows.length === 0) {
    throw new Error(`File ${fileName || 'Excel'} kosong atau tidak memiliki baris data.`)
  }

  // Find header row: Look for row containing Nama Produk, SKU, and Stok, plus Kode Produk, Kode Variasi, Harga
  let headerRowIdx = -1
  let colNamaProduk = -1
  let colSku = -1
  let colStok = -1
  let colKodeProduk = -1
  let colKodeVariasi = -1
  let colHarga = -1

  // 1. Try finding Indonesian user-facing headers (e.g. Row 2 in Shopee mass export)
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r]
    if (!Array.isArray(row)) continue
    let namaIdx = -1, skuIdx = -1, stokIdx = -1
    let kdProdukIdx = -1, kdVariasiIdx = -1, hrgIdx = -1

    let fallbackKdProdukIdx = -1

    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').trim().toLowerCase()
      if (
        val === 'kode produk' ||
        val === 'kode_produk' ||
        val === 'id produk' ||
        val === 'product id' ||
        val === 'product_id' ||
        val === 'et_title_product_id' ||
        (val.includes('kode') && val.includes('produk')) ||
        (val.includes('id') && val.includes('produk') && !val.includes('variasi'))
      ) {
        kdProdukIdx = c
      } else if (
        val === 'parent sku' ||
        val === 'sku induk' ||
        val === 'et_title_parent_sku'
      ) {
        fallbackKdProdukIdx = c
      } else if (
        val === 'kode variasi' ||
        val === 'kode_variasi' ||
        val === 'id variasi' ||
        val === 'variation id' ||
        val === 'nomor variasi' ||
        val === 'id model' ||
        val === 'model id' ||
        val === 'et_title_variation_id' ||
        (val.includes('kode') && val.includes('variasi')) ||
        (val.includes('id') && val.includes('variasi'))
      ) {
        kdVariasiIdx = c
      } else if (
        val === 'nama produk' ||
        (val.includes('nama') && val.includes('produk') && !val.includes('et_title'))
      ) {
        namaIdx = c
      } else if (
        val === 'sku' ||
        val === 'nomor referensi sku' ||
        (val.includes('sku') && !val.includes('induk') && !val.includes('parent') && !val.includes('et_title'))
      ) {
        skuIdx = c
      } else if (
        val === 'stok' ||
        (val === 'stock' && !val.includes('et_title'))
      ) {
        stokIdx = c
      } else if (
        val === 'harga' ||
        val === 'harga normal' ||
        val === 'harga jual' ||
        val === 'price' ||
        val === 'harga satuan' ||
        (val.includes('harga') && !val.includes('diskon') && !val.includes('et_title'))
      ) {
        hrgIdx = c
      }
    }

    if (kdProdukIdx === -1 && fallbackKdProdukIdx !== -1) {
      kdProdukIdx = fallbackKdProdukIdx
    }

    if (namaIdx !== -1 && skuIdx !== -1 && stokIdx !== -1) {
      headerRowIdx = r
      colNamaProduk = namaIdx
      colSku = skuIdx
      colStok = stokIdx
      colKodeProduk = kdProdukIdx
      colKodeVariasi = kdVariasiIdx
      colHarga = hrgIdx
      break
    }
  }

  // 2. Fallback to technical headers (e.g. Row 0: et_title_product_name, et_title_variation_sku, et_title_variation_stock)
  if (headerRowIdx === -1) {
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const row = rows[r]
      if (!Array.isArray(row)) continue
      let namaIdx = -1, skuIdx = -1, stokIdx = -1
      let kdProdukIdx = -1, kdVariasiIdx = -1, hrgIdx = -1
      let fallbackKdProdukIdx = -1

      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').trim().toLowerCase()
        if (
          val.includes('product_id') ||
          val.includes('kode_produk') ||
          val === 'et_title_product_id'
        ) {
          kdProdukIdx = c
        } else if (
          val.includes('parent_sku') ||
          val.includes('sku_induk') ||
          val === 'et_title_parent_sku'
        ) {
          fallbackKdProdukIdx = c
        } else if (
          val.includes('variation_id') ||
          val.includes('variation_integration_no') ||
          val.includes('kode_variasi') ||
          val.includes('id_model')
        ) {
          kdVariasiIdx = c
        } else if (val.includes('product_name') || val.includes('nama_produk')) {
          namaIdx = c
        } else if (
          val.includes('variation_sku') ||
          (val.includes('sku') && !val.includes('parent') && !val.includes('induk'))
        ) {
          skuIdx = c
        } else if (val.includes('variation_stock') || val.includes('stok') || val.includes('stock')) {
          stokIdx = c
        } else if (val.includes('variation_price') || val.includes('price') || val.includes('harga')) {
          hrgIdx = c
        }
      }

      if (kdProdukIdx === -1 && fallbackKdProdukIdx !== -1) {
        kdProdukIdx = fallbackKdProdukIdx
      }

      if (namaIdx !== -1 && skuIdx !== -1 && stokIdx !== -1) {
        headerRowIdx = r
        colNamaProduk = namaIdx
        colSku = skuIdx
        colStok = stokIdx
        colKodeProduk = kdProdukIdx
        colKodeVariasi = kdVariasiIdx
        colHarga = hrgIdx
        break
      }
    }
  }

  if (headerRowIdx === -1 || colSku === -1 || colStok === -1) {
    throw new Error(
      `Format kolom file ${fileName} tidak sesuai. Pastikan file memiliki kolom Nama Produk, SKU, dan Stok.`
    )
  }

  const items = []
  let currentProductName = ''
  let currentKodeProduk = ''

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || !row.length) continue

    const rawName = String(row[colNamaProduk] || '').trim()
    const rawSku = String(row[colSku] || '').trim()
    const rawStok = row[colStok]
    const rawKodeProduk = colKodeProduk !== -1 ? String(row[colKodeProduk] || '').trim() : ''
    const rawKodeVariasi = colKodeVariasi !== -1 ? String(row[colKodeVariasi] || '').trim() : ''
    const rawHarga = colHarga !== -1 ? row[colHarga] : 0

    // Skip template guide / header rows like "Wajib", "Mohon masukkan", "SKU", etc.
    const lowerSku = rawSku.toLowerCase()
    const lowerName = rawName.toLowerCase()
    if (
      !rawSku ||
      lowerSku === 'sku' ||
      lowerSku === 'et_title_variation_sku' ||
      lowerSku.includes('wajib') ||
      lowerSku.includes('mohon') ||
      lowerName === 'nama produk' ||
      lowerName.includes('et_title')
    ) {
      continue
    }

    // Carry forward parent product name and kode produk if variation row leaves them blank
    if (rawName && !lowerName.includes('wajib') && !lowerName.includes('mohon')) {
      currentProductName = rawName
    }
    if (rawKodeProduk && !rawKodeProduk.toLowerCase().includes('wajib')) {
      currentKodeProduk = rawKodeProduk
    }

    const stokNum = parseInt(String(rawStok).replace(/[^0-9-]/g, ''), 10)
    const stok = isNaN(stokNum) ? 0 : Math.max(0, stokNum)

    const cleanHarga = typeof rawHarga === 'number'
      ? Math.max(0, Math.round(rawHarga))
      : parseInt(String(rawHarga || 0).replace(/[^0-9]/g, ''), 10) || 0

    items.push({
      namaProduk: currentProductName || rawName || '(Tanpa Nama Produk)',
      kodeProduk: rawKodeProduk || currentKodeProduk || '-',
      kodeVariasi: rawKodeVariasi || '-',
      sku: rawSku,
      stok: stok,
      harga: cleanHarga,
    })
  }

  return items
}

/**
 * Merges items from multiple parsed files, deduplicating by SKU.
 * Computes recap statistics for the customer inventory.
 *
 * @param {Array<Array<{ namaProduk: string, kodeProduk?: string, kodeVariasi?: string, sku: string, stok: number, harga?: number }>>} fileItemArrays
 * @returns {{ items: Array<{ namaProduk: string, kodeProduk: string, kodeVariasi: string, sku: string, stok: number, harga: number }>, summary: object }}
 */
export function mergeMarketplaceStockItems(fileItemArrays) {
  const skuMap = new Map()

  for (const items of fileItemArrays) {
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (!item || !item.sku) continue
      // Keep or update by SKU
      skuMap.set(item.sku, {
        namaProduk: item.namaProduk || '(Tanpa Nama Produk)',
        kodeProduk: item.kodeProduk || '-',
        kodeVariasi: item.kodeVariasi || '-',
        sku: item.sku,
        stok: item.stok ?? 0,
        harga: item.harga ?? 0,
      })
    }
  }

  const mergedItems = Array.from(skuMap.values())

  const totalItems = mergedItems.length
  const totalStock = mergedItems.reduce((acc, it) => acc + (it.stok || 0), 0)
  const totalNilaiStok = mergedItems.reduce((acc, it) => acc + ((it.stok || 0) * (it.harga || 0)), 0)
  const emptyStockCount = mergedItems.filter((it) => it.stok === 0).length
  const availableStockCount = mergedItems.filter((it) => it.stok > 0).length
  const lowStockCount = mergedItems.filter((it) => it.stok > 0 && it.stok <= 5).length

  const emptyStockPct = totalItems > 0 ? Number(((emptyStockCount / totalItems) * 100).toFixed(1)) : 0
  const availableStockPct = totalItems > 0 ? Number(((availableStockCount / totalItems) * 100).toFixed(1)) : 0
  const lowStockPct = totalItems > 0 ? Number(((lowStockCount / totalItems) * 100).toFixed(1)) : 0
  const avgStock = totalItems > 0 ? Number((totalStock / totalItems).toFixed(1)) : 0

  const summary = {
    totalItems,
    totalStock,
    totalNilaiStok,
    emptyStockCount,
    emptyStockPct,
    availableStockCount,
    availableStockPct,
    lowStockCount,
    lowStockPct,
    avgStock,
  }

  return {
    items: mergedItems,
    summary,
  }
}
