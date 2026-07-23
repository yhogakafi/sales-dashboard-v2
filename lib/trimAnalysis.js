// Menyelaraskan perbandingan dua periode berdasarkan JUMLAH HARI sejak awal
// periode masing-masing -- bukan tanggal kalender absolut. Contoh: periode Juli
// baru berjalan 1-10 Jul (10 hari kalender), maka periode Juni (1-30 Jun)
// dipotong jadi 1-10 Jun saja (10 hari pertama sejak awal Juni), supaya kedua
// periode dibandingkan dengan jumlah hari yang setara.
//
// Semua perhitungan tanggal di sini pakai UTC murni (Date.UTC / getUTC*), bukan
// `new Date(string)` atau getter lokal -- supaya hasilnya konsisten di browser
// mana pun, tidak tergantung timezone orang yang membuka dashboard.

const DAY_MS = 86400000

function parseDateKeyUTC(key) {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function dateKeyFromUTC(ts) {
  const d = new Date(ts)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysBetweenInclusive(startKey, endKey) {
  const start = parseDateKeyUTC(startKey)
  const end = parseDateKeyUTC(endKey)
  return Math.round((end - start) / DAY_MS) + 1
}

export function getSpanDays(analysis) {
  return daysBetweenInclusive(analysis.firstDateKey, analysis.lastDateKey)
}

/** Tanggal (dateKey) pada offset hari ke-N sejak firstDateKey (offset 0 = firstDateKey sendiri). */
export function dateKeyAtOffset(firstDateKey, offsetDays) {
  const startTs = parseDateKeyUTC(firstDateKey)
  return dateKeyFromUTC(startTs + offsetDays * DAY_MS)
}

/**
 * Potong `analysis` supaya hanya mencakup `spanDays` hari kalender pertama
 * sejak firstDateKey-nya sendiri, lalu hitung ulang semua agregat
 * (customerTotals, totalOmset, platformTotals, dst) berdasarkan subset tanggal itu.
 * Kalau spanDays >= jumlah hari asli periode, kembalikan analysis apa adanya.
 */
export function trimAnalysisToSpan(analysis, spanDays) {
  const originalSpan = getSpanDays(analysis)
  if (spanDays >= originalSpan) {
    return { ...analysis, trimmed: false, effectiveSpanDays: originalSpan }
  }

  const startTs = parseDateKeyUTC(analysis.firstDateKey)
  const cutoffTs = startTs + (spanDays - 1) * DAY_MS

  const trimmedDateKeys = analysis.dateKeys.filter((d) => parseDateKeyUTC(d) <= cutoffTs)
  const customers = analysis.customers

  const customerTotals = {}
  const customerCounts = {}
  for (const c of customers) {
    customerTotals[c] = 0
    customerCounts[c] = 0
  }
  for (const d of trimmedDateKeys) {
    for (const c of customers) {
      customerTotals[c] += analysis.pivotOmset[d][c]
      customerCounts[c] += analysis.pivotCount[d][c]
    }
  }

  const totalOmset = customers.reduce((s, c) => s + customerTotals[c], 0)
  const totalOrder = customers.reduce((s, c) => s + customerCounts[c], 0)

  // Platform & brand diturunkan ulang dari nama pelanggan penagihan ("PLATFORM / BRAND"),
  // karena data pivot per tanggal cuma disimpan per-pelanggan, bukan per-platform/brand.
  const platformTotals = {}
  const brandTotals = {}
  for (const c of customers) {
    const [platform, ...rest] = c.split(' / ')
    const brand = rest.join(' / ') || '(tanpa nama)'
    platformTotals[platform] = (platformTotals[platform] || 0) + customerTotals[c]
    brandTotals[brand] = (brandTotals[brand] || 0) + customerTotals[c]
  }

  const rankedCustomers = [...customers].sort((x, y) => customerTotals[y] - customerTotals[x])
  const daily = trimmedDateKeys.map((d) => analysis.daily.find((x) => x.dateKey === d)).filter(Boolean)

  return {
    ...analysis,
    dateKeys: trimmedDateKeys,
    daily,
    customerTotals,
    customerCounts,
    rankedCustomers,
    totalOmset,
    totalOrder,
    platformTotals,
    brandTotals,
    lastDateKey: trimmedDateKeys[trimmedDateKeys.length - 1],
    trimmed: true,
    effectiveSpanDays: spanDays,
  }
}

/**
 * Terima dua analysis (a, b), kembalikan versi yang sudah diselaraskan
 * berdasarkan periode terpendek di antara keduanya.
 */
export function alignForComparison(a, b) {
  const spanA = getSpanDays(a)
  const spanB = getSpanDays(b)
  const minSpan = Math.min(spanA, spanB)
  return {
    a: trimAnalysisToSpan(a, minSpan),
    b: trimAnalysisToSpan(b, minSpan),
    spanDays: minSpan,
  }
}
