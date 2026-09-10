/**
 * Parser and normalizer for Shopee and TikTok Affiliate data.
 * Based on the parsing logic in staticApps/affiliate-dashboard.html
 */

export const INDO_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

export function labelToId(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

export function formatRupiah(num) {
  return 'Rp ' + Math.round(num || 0).toLocaleString('id-ID')
}

export function formatRupiahShort(n) {
  if (n >= 1e9) return 'Rp ' + (n / 1e9).toFixed(2) + ' M'
  if (n >= 1e6) return 'Rp ' + (n / 1e6).toFixed(2) + ' Jt'
  if (n >= 1e3) return 'Rp ' + (n / 1e3).toFixed(1) + ' Rb'
  return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID')
}

// ─── Shopee Parsing ──────────────────────────────────────────────────────────

export function parseShopeeNum(v) {
  if (v === undefined || v === null || v === '') return 0
  return parseFloat(String(v).replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0
}

export function parseShopeeDate(s) {
  if (!s) return null
  if (s instanceof Date) return isNaN(s.getTime()) ? null : s
  if (typeof s === 'number') {
    const utcDays = Math.floor(s - 25569)
    return new Date(utcDays * 86400 * 1000)
  }
  const str = String(s).trim()
  const mIso = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[\sT](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/)
  if (mIso) {
    return new Date(+mIso[1], +mIso[2] - 1, +mIso[3], +(mIso[4] || 0), +(mIso[5] || 0), +(mIso[6] || 0))
  }
  const mSlash = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[\sT](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/)
  if (mSlash) {
    let p1 = +mSlash[1], p2 = +mSlash[2], y = +mSlash[3]
    let mo, d
    if (p1 > 12) { d = p1; mo = p2 - 1 }
    else if (p2 > 12) { d = p2; mo = p1 - 1 }
    else { mo = p1 - 1; d = p2 }
    return new Date(y, mo, d, +(mSlash[4] || 0), +(mSlash[5] || 0), +(mSlash[6] || 0))
  }
  const dt = new Date(str)
  return isNaN(dt.getTime()) ? null : dt
}

export function normalizeShopeeData(rawRows) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return { rows: [], stats: { orders: 0, gmv: 0, expense: 0, ratio: 0 }, detectedMonth: null }
  }

  const hasPemotongan = rawRows.some(r => r['Waktu Pemotongan'] && String(r['Waktu Pemotongan']).trim())

  const monthCountMap = {}

  const rows = rawRows.map(r => {
    const gmv = parseShopeeNum(r['Nilai Pembelian(Rp)'])
    const exp = parseShopeeNum(r['Pengeluaran(Rp)'])
    const dateObj = hasPemotongan
      ? parseShopeeDate(r['Waktu Pemotongan'])
      : parseShopeeDate(r['Waktu Pesanan'])

    let monthKey = ''
    let dateIso = null
    if (dateObj && !isNaN(dateObj.getTime())) {
      dateIso = dateObj.toISOString()
      monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`
      monthCountMap[monthKey] = (monthCountMap[monthKey] || 0) + 1
    }

    return {
      kodePesanan: String(r['Kode Pesanan'] || '').trim(),
      statusPesanan: String(r['Status Pesanan'] || '').trim(),
      waktuPesanan: String(r['Waktu Pesanan'] || '').trim(),
      waktuPesananTerverifikasi: String(r['Waktu Pesanan Terverifikasi'] || '').trim(),
      idModel: String(r['ID Model'] || '').trim(),
      namaProduk: String(r['Nama Produk'] || '').trim(),
      namaAffiliate: String(r['Nama Affiliate'] || '').trim(),
      usernameAffiliate: String(r['Username Affiliate'] || '').trim(),
      jenisPromo: String(r['Jenis Promo'] || '').trim(),
      gmv,
      tipePesanan: String(r['Tipe Pesanan'] || '').trim(),
      platform: String(r['Platform'] || '').trim(),
      expense: exp,
      waktuPemotongan: String(r['Waktu Pemotongan'] || '').trim(),
      dateIso,
      monthKey,
    }
  })

  // Detect predominant month
  let detectedMonth = null
  let maxCount = 0
  for (const [mKey, count] of Object.entries(monthCountMap)) {
    if (count > maxCount) {
      maxCount = count
      const [y, m] = mKey.split('-').map(Number)
      detectedMonth = {
        monthKey: mKey,
        label: `${INDO_MONTHS[m - 1]} ${y}`,
        count,
      }
    }
  }

  const uniqueOrders = new Set(rows.map(r => r.kodePesanan).filter(Boolean)).size
  const totalGmv = rows.reduce((acc, r) => acc + r.gmv, 0)
  const totalExp = rows.reduce((acc, r) => acc + r.expense, 0)
  const ratio = totalGmv > 0 ? (totalExp / totalGmv) * 100 : 0

  return {
    rows,
    stats: {
      orders: uniqueOrders,
      gmv: Math.round(totalGmv),
      expense: Math.round(totalExp),
      ratio: Number(ratio.toFixed(2)),
    },
    detectedMonth,
  }
}

// ─── TikTok Parsing ──────────────────────────────────────────────────────────

export function parseTikTokDate(s) {
  if (!s) return null
  if (s instanceof Date) return isNaN(s.getTime()) ? null : s
  if (typeof s === 'number') {
    const utcDays = Math.floor(s - 25569)
    return new Date(utcDays * 86400 * 1000)
  }
  const str = String(s).trim()
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?/)
  if (m) {
    const [, d, mo, y, t] = m
    return new Date(`${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${t || '00:00:00'}`)
  }
  const dt = new Date(str)
  return isNaN(dt.getTime()) ? null : dt
}

export function normalizeTikTokData(rawRows) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return { rows: [], detectedMonths: [] }
  }

  const rows = rawRows.map(r => {
    const gmv = parseFloat(String(r['Acuan Komisi Aktual'] || 0).replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0
    const exp = parseFloat(String(r['Pembayaran Komisi Aktual'] || 0).replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0

    const cD = parseTikTokDate(r['Waktu Komisi Dibayar'])
    const pD = parseTikTokDate(r['Waktu Pembayaran'])

    let monthKey = ''
    if (cD && !isNaN(cD.getTime())) {
      monthKey = `${cD.getFullYear()}-${String(cD.getMonth() + 1).padStart(2, '0')}`
    }

    return {
      idPesanan: String(r['ID Pesanan'] || '').trim(),
      produk: String(r['Produk'] || '').trim(),
      idSku: String(r['ID SKU'] || '').trim(),
      status: String(r['Status Pesanan'] || '').trim(),
      kreator: String(r['Nama pengguna kreator'] || '').trim(),
      jenisKonten: String(r['Jenis Konten'] || '').trim(),
      commissionModel: String(r['commission model'] || r['Commission Model'] || '').trim(),
      persentaseKomisi: String(r['Persentase komisi standar'] || '').trim(),
      gmv,
      expense: exp,
      waktuPembayaran: pD && !isNaN(pD.getTime()) ? pD.toISOString() : null,
      waktuKomisiDibayar: cD && !isNaN(cD.getTime()) ? cD.toISOString() : null,
      monthKey,
      platform: String(r['Platform'] || '').trim(),
    }
  })

  // Detect all distinct months from `Waktu Komisi Dibayar` in chronological order
  const monthMap = new Map()
  rows.forEach(r => {
    if (r.monthKey) {
      if (!monthMap.has(r.monthKey)) {
        const [y, m] = r.monthKey.split('-').map(Number)
        monthMap.set(r.monthKey, {
          monthKey: r.monthKey,
          label: `${INDO_MONTHS[m - 1]} ${y}`,
          count: 0,
        })
      }
      monthMap.get(r.monthKey).count++
    }
  })

  // Sort chronological
  const detectedMonths = Array.from(monthMap.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey))

  return {
    rows,
    detectedMonths,
  }
}

export function filterTikTokRowsByMonth(rows, targetMonthKey) {
  if (!targetMonthKey) return { filteredRows: rows, stats: calculateTikTokStats(rows) }

  const filtered = rows.filter(r => r.monthKey === targetMonthKey)
  return {
    filteredRows: filtered,
    stats: calculateTikTokStats(filtered),
  }
}

export function calculateTikTokStats(rows) {
  const uniqueOrders = new Set(rows.map(r => r.idPesanan).filter(Boolean)).size
  const totalGmv = rows.reduce((acc, r) => acc + r.gmv, 0)
  const totalExp = rows.reduce((acc, r) => acc + r.expense, 0)
  const ratio = totalGmv > 0 ? (totalExp / totalGmv) * 100 : 0

  return {
    orders: uniqueOrders,
    gmv: Math.round(totalGmv),
    expense: Math.round(totalExp),
    ratio: Number(ratio.toFixed(2)),
  }
}
