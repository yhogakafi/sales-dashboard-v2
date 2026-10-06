import * as XLSX from 'xlsx'
import { formatDateLabel, dayName } from './parseData'

const CATEGORY_OPTIONS = ['Online Underwear', 'Online Sport']
const UNCATEGORIZED = 'Tidak dikategorikan'
const ORDERED_CATEGORIES = [...CATEGORY_OPTIONS, UNCATEGORIZED]

export function exportToExcel(data, categories = {}) {
  const wb = XLSX.utils.book_new()
  const customers = data.rankedCustomers
  const hasCategories = categories && Object.keys(categories).length > 0

  // --- Sheet: Ringkasan ---
  const ringkasanRows = [
    ['Laporan Penjualan Harian per Pelanggan Penagihan'],
    [`Periode: ${data.periodLabel}`],
    [],
    ['Total omset', data.totalOmset, '', 'Total order', data.totalOrder],
    ['Jumlah pelanggan', customers.length, '', 'Hari aktif', data.dateKeys.length],
    [],
    ['#', 'Pelanggan Penagihan', 'Total Omset', 'Total Order', 'AOV', '% dari Total Omset'],
  ]
  customers.forEach((c, i) => {
    const omset = data.customerTotals[c]
    const order = data.customerCounts[c]
    ringkasanRows.push([
      i + 1,
      c,
      omset,
      order,
      order > 0 ? omset / order : 0,
      omset / data.totalOmset,
    ])
  })
  ringkasanRows.push([
    '',
    'Total',
    data.totalOmset,
    data.totalOrder,
    data.totalOmset / data.totalOrder,
    1,
  ])
  const wsRingkasan = XLSX.utils.aoa_to_sheet(ringkasanRows)
  XLSX.utils.book_append_sheet(wb, wsRingkasan, 'Ringkasan')

  // --- Sheet builder for pivots ---
  function buildPivotSheet(pivot, title) {
    const header = ['Tanggal', ...customers, 'TOTAL']
    const aoa = [[title], [], header]
    for (const d of data.dateKeys) {
      const row = [`${formatDateLabel(d)} (${dayName(d, true)})`]
      let rowTotal = 0
      for (const c of customers) {
        const v = pivot[d][c]
        row.push(v)
        rowTotal += v
      }
      row.push(rowTotal)
      aoa.push(row)
    }
    const totalRow = ['TOTAL']
    let grand = 0
    for (const c of customers) {
      const colSum = data.dateKeys.reduce((s, d) => s + pivot[d][c], 0)
      totalRow.push(colSum)
      grand += colSum
    }
    totalRow.push(grand)
    aoa.push(totalRow)
    return XLSX.utils.aoa_to_sheet(aoa)
  }

  XLSX.utils.book_append_sheet(wb, buildPivotSheet(data.pivotOmset, 'Omset Harian per Pelanggan Penagihan (Rp)'), 'Omset Harian')
  XLSX.utils.book_append_sheet(wb, buildPivotSheet(data.pivotCount, 'Jumlah Order Harian per Pelanggan Penagihan'), 'Jumlah Order Harian')

  if (hasCategories) {
    const groups = groupByCategory(customers, categories)

    // --- Sheet: Ringkasan Kategori ---
    const catRows = [
      ['Ringkasan per Kategori'],
      [],
      ['Kategori', 'Total Omset', 'Total Order', 'AOV', '% dari Total Omset', 'Jumlah Pelanggan'],
    ]
    for (const key of ORDERED_CATEGORIES) {
      const members = groups[key]
      if (members.length === 0) continue
      const omset = members.reduce((s, c) => s + data.customerTotals[c], 0)
      const order = members.reduce((s, c) => s + data.customerCounts[c], 0)
      catRows.push([key, omset, order, order > 0 ? omset / order : 0, omset / data.totalOmset, members.length])
    }
    catRows.push([])
    catRows.push(['Rincian per pelanggan'])
    catRows.push(['Kategori', 'Pelanggan Penagihan', 'Total Omset', 'Total Order', 'AOV', '% dari Kategori'])
    for (const key of ORDERED_CATEGORIES) {
      const members = [...groups[key]].sort((a, b) => data.customerTotals[b] - data.customerTotals[a])
      if (members.length === 0) continue
      const catOmset = members.reduce((s, c) => s + data.customerTotals[c], 0)
      for (const c of members) {
        const omset = data.customerTotals[c]
        const order = data.customerCounts[c]
        catRows.push([key, c, omset, order, order > 0 ? omset / order : 0, catOmset > 0 ? omset / catOmset : 0])
      }
    }
    const wsCategory = XLSX.utils.aoa_to_sheet(catRows)
    XLSX.utils.book_append_sheet(wb, wsCategory, 'Ringkasan Kategori')

    // --- Sheet: Detail per Tanggal per Kategori ---
    const dateCatHeader1 = ['']
    const dateCatHeader2 = ['Tanggal']
    for (const key of ORDERED_CATEGORIES) {
      if (groups[key].length === 0) continue
      dateCatHeader1.push(key, '')
      dateCatHeader2.push('Omset', 'Order')
    }
    const activeCats = ORDERED_CATEGORIES.filter((k) => groups[k].length > 0)
    const dateCatRows = [['Detail per Tanggal per Kategori'], [], dateCatHeader1, dateCatHeader2]
    for (const d of data.dateKeys) {
      const row = [`${formatDateLabel(d)} (${dayName(d, true)})`]
      for (const key of activeCats) {
        const omset = groups[key].reduce((s, c) => s + data.pivotOmset[d][c], 0)
        const order = groups[key].reduce((s, c) => s + data.pivotCount[d][c], 0)
        row.push(omset, order)
      }
      dateCatRows.push(row)
    }
    const totalRow = ['TOTAL']
    for (const key of activeCats) {
      const omset = data.dateKeys.reduce((s, d) => s + groups[key].reduce((s2, c) => s2 + data.pivotOmset[d][c], 0), 0)
      const order = data.dateKeys.reduce((s, d) => s + groups[key].reduce((s2, c) => s2 + data.pivotCount[d][c], 0), 0)
      totalRow.push(omset, order)
    }
    dateCatRows.push(totalRow)
    const wsDateCat = XLSX.utils.aoa_to_sheet(dateCatRows)
    XLSX.utils.book_append_sheet(wb, wsDateCat, 'Tanggal x Kategori')
  }

  XLSX.writeFile(wb, 'Laporan_Penjualan_Harian_per_Pelanggan_Penagihan.xlsx')
}

export function exportBarangTerlaris(rows, { periodLabel, filterDesc, hasStock = false } = {}) {
  const wb = XLSX.utils.book_new()

  const totalKuantitas  = rows.reduce((s, r) => s + r.kuantitas, 0)
  const totalHargaProduk = rows.reduce((s, r) => s + r.hargaProduk, 0)
  const totalStock       = rows.reduce((s, r) => s + (r.stock || 0), 0)
  const totalHpp         = rows.reduce((s, r) => s + (r.totalHpp || 0), 0)
  const totalHppTerjual  = rows.reduce((s, r) => s + (r.hpp || 0) * (r.kuantitas || 0), 0)
  const ssrGrand         = totalKuantitas  > 0 ? totalStock / totalKuantitas : null
  const ssrHppGrand      = totalHppTerjual > 0 ? totalHpp / totalHppTerjual  : null

  // Ringkasan — sama seperti kotak grand total yang tampil di layar.
  const summaryRows = [
    ['Ringkasan'],
    ['Total Terjual',       totalKuantitas],
    ['Total Terjual (Rp)',  totalHargaProduk],
    ...(hasStock ? [
      ['Total HPP',  totalHpp],
      ['Stock PCS',  totalStock],
      ['SSR',        ssrGrand      != null ? Number(ssrGrand.toFixed(2))    : ''],
      ['SSR (HPP)',  ssrHppGrand   != null ? Number(ssrHppGrand.toFixed(2)) : ''],
    ] : []),
  ]

  const header = hasStock
    ? ['#', 'Kode Barang', 'Nama Barang', 'Brand', 'Terjual', 'HPP PCS', 'Stock', 'Unit', 'TOTAL TERJUAL', 'Total HPP', 'SSR']
    : ['#', 'Kode Barang', 'Nama Barang', 'Terjual', 'TOTAL TERJUAL']

  const toRow = (r) => hasStock
    ? [
        r.rank, r.kodeBarang || '', r.namaBarang, r.brand === '—' ? '' : r.brand,
        r.kuantitas, r.hpp || '', r.stock || 0,
        r.unit || '',
        r.hargaProduk, r.totalHpp || '',
        r.ssr != null ? Number(r.ssr.toFixed(2)) : '',
      ]
    : [r.rank, r.kodeBarang || '', r.namaBarang, r.kuantitas, r.hargaProduk]

  const totalRow = hasStock
    ? ['', '', 'TOTAL', '', totalKuantitas, '', totalStock, '', totalHargaProduk, totalHpp, ssrGrand != null ? Number(ssrGrand.toFixed(2)) : '']
    : ['', '', 'TOTAL', totalKuantitas, totalHargaProduk]

  const aoa = [
    ['Laporan Produk Terlaris'],
    periodLabel ? [`Periode: ${periodLabel}`] : [],
    filterDesc  ? [`Filter: ${filterDesc}`]   : [],
    [],
    ...summaryRows,
    [],
    header,
    ...rows.map(toRow),
    [],
    totalRow,
  ].filter(r => r.length > 0)

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Column widths
  ws['!cols'] = hasStock
    ? [
        { wch: 4 },   // #
        { wch: 16 },  // Kode Barang
        { wch: 40 },  // Nama Barang
        { wch: 14 },  // Brand
        { wch: 10 },  // Terjual
        { wch: 14 },  // HPP PCS
        { wch: 10 },  // Stock
        { wch: 10 },  // Unit
        { wch: 18 },  // TOTAL TERJUAL
        { wch: 16 },  // Total HPP
        { wch: 8 },   // SSR
      ]
    : [
        { wch: 4 },   // #
        { wch: 16 },  // Kode Barang
        { wch: 40 },  // Nama Barang
        { wch: 12 },  // Terjual
        { wch: 18 },  // TOTAL TERJUAL
      ]

  // Number format for numeric columns
  const kuanCol   = hasStock ? 4 : 3
  const hppCol    = hasStock ? 5 : null
  const stockCol  = hasStock ? 6 : null
  // col 7 = Unit (text, no number format needed)
  const hargaCol  = hasStock ? 8 : 4
  const totHppCol = hasStock ? 9 : null
  const ssrCol    = hasStock ? 10 : null

  const dataStartRow = aoa.findIndex(r => r[0] === rows[0]?.rank) + 1
  for (let R = dataStartRow; R <= dataStartRow + rows.length - 1; R++) {
    const applyFmt = (col, fmt) => {
      if (col == null) return
      const cell = XLSX.utils.encode_cell({ r: R, c: col })
      if (ws[cell]) ws[cell].z = fmt
    }
    applyFmt(kuanCol,   '#,##0')
    applyFmt(hargaCol,  '#,##0')
    applyFmt(stockCol,  '#,##0')
    applyFmt(hppCol,    '#,##0')
    applyFmt(totHppCol, '#,##0')
    applyFmt(ssrCol,    '0.00')
  }
  // Total row number format
  const totalRowIdx = dataStartRow + rows.length + 1
  const applyTotalFmt = (col, fmt) => {
    if (col == null) return
    const cell = XLSX.utils.encode_cell({ r: totalRowIdx, c: col })
    if (ws[cell]) ws[cell].z = fmt
  }
  applyTotalFmt(kuanCol,   '#,##0')
  applyTotalFmt(hargaCol,  '#,##0')
  applyTotalFmt(stockCol,  '#,##0')
  applyTotalFmt(totHppCol, '#,##0')
  applyTotalFmt(ssrCol,    '0.00')

  XLSX.utils.book_append_sheet(wb, ws, 'Produk Terlaris')

  const safePeriod = (periodLabel || 'export').replace(/[^a-zA-Z0-9_\-]/g, '_')
  XLSX.writeFile(wb, `Produk_Terlaris_${safePeriod}.xlsx`)
}

// ─── exportToExcelCompare: exports compare mode view ──────────────────────────
// Mirrors exactly what CompareView renders:
//   1. Ringkasan Perbandingan  — metric cards (omset, order, AOV, hari) side by side
//   2. Per Platform            — platform A vs B with selisih & pertumbuhan
//   3. Per Kategori            — (if any categories set) kategori A vs B
//   4. Per Pelanggan           — all customers A vs B with selisih & pertumbuhan
//   5. Detail Periode A        — daily tren + pivot for period A
//   6. Detail Periode B        — daily tren + pivot for period B
export function exportToExcelCompare(payloadA, payloadB, labelA, labelB, alignMode = 'aligned', categoriesA = {}, categoriesB = {}) {
  // Dynamically import the alignment helpers at call time to avoid circular deps
  // They are pure functions so we inline the same logic here.
  const DAY_MS = 86400000
  function parseDateKeyUTC(key) {
    const [y, m, d] = key.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  function dateKeyFromUTC(ts) {
    const d = new Date(ts)
    const y = d.getUTCFullYear()
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dy = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${mo}-${dy}`
  }
  function getSpanDays(analysis) {
    const start = parseDateKeyUTC(analysis.firstDateKey)
    const end = parseDateKeyUTC(analysis.lastDateKey)
    return Math.round((end - start) / DAY_MS) + 1
  }
  function trimToSpan(analysis, spanDays) {
    const originalSpan = getSpanDays(analysis)
    if (spanDays >= originalSpan) return { ...analysis, trimmed: false, effectiveSpanDays: originalSpan }
    const startTs = parseDateKeyUTC(analysis.firstDateKey)
    const cutoffTs = startTs + (spanDays - 1) * DAY_MS
    const trimmedDateKeys = analysis.dateKeys.filter((d) => parseDateKeyUTC(d) <= cutoffTs)
    const customers = analysis.customers
    const customerTotals = {}, customerCounts = {}
    for (const c of customers) { customerTotals[c] = 0; customerCounts[c] = 0 }
    for (const d of trimmedDateKeys) {
      for (const c of customers) {
        customerTotals[c] += analysis.pivotOmset[d][c]
        customerCounts[c] += analysis.pivotCount[d][c]
      }
    }
    const totalOmset = customers.reduce((s, c) => s + customerTotals[c], 0)
    const totalOrder = customers.reduce((s, c) => s + customerCounts[c], 0)
    const platformTotals = {}, brandTotals = {}
    for (const c of customers) {
      const [platform, ...rest] = c.split(' / ')
      const brand = rest.join(' / ') || '(tanpa nama)'
      platformTotals[platform] = (platformTotals[platform] || 0) + customerTotals[c]
      brandTotals[brand] = (brandTotals[brand] || 0) + customerTotals[c]
    }
    const rankedCustomers = [...customers].sort((x, y) => customerTotals[y] - customerTotals[x])
    const daily = trimmedDateKeys.map((d) => analysis.daily.find((x) => x.dateKey === d)).filter(Boolean)
    return {
      ...analysis, dateKeys: trimmedDateKeys, daily, customerTotals, customerCounts,
      rankedCustomers, totalOmset, totalOrder, platformTotals, brandTotals,
      lastDateKey: trimmedDateKeys[trimmedDateKeys.length - 1],
      trimmed: true, effectiveSpanDays: spanDays,
    }
  }

  const rawA = payloadA.analysis
  const rawB = payloadB.analysis

  let a, b, spanDays
  if (alignMode === 'full') {
    const spanA = getSpanDays(rawA)
    const spanB = getSpanDays(rawB)
    a = trimToSpan(rawA, spanA)
    b = trimToSpan(rawB, spanB)
    spanDays = Math.max(spanA, spanB)
  } else {
    const spanA = getSpanDays(rawA)
    const spanB = getSpanDays(rawB)
    const minSpan = Math.min(spanA, spanB)
    a = trimToSpan(rawA, minSpan)
    b = trimToSpan(rawB, minSpan)
    spanDays = minSpan
  }

  const allCustomers = Array.from(new Set([...(a.rankedCustomers || []), ...(b.rankedCustomers || [])]))
    .sort((x, y) => (a.customerTotals?.[y] || 0) - (a.customerTotals?.[x] || 0))

  const allPlatforms = Array.from(new Set([...Object.keys(a.platformTotals), ...Object.keys(b.platformTotals)]))

  const COMPARE_ORDERED_CATEGORIES = [...CATEGORY_OPTIONS, UNCATEGORIZED]
  const catA = categoriesA || {}
  const catB = categoriesB || {}
  const customersByCategory = {}
  for (const key of COMPARE_ORDERED_CATEGORIES) customersByCategory[key] = []
  for (const c of allCustomers) {
    const key = catA[c] || catB[c] || UNCATEGORIZED
    if (!customersByCategory[key].includes(c)) customersByCategory[key].push(c)
  }
  const hasCategories = CATEGORY_OPTIONS.some(k => customersByCategory[k]?.length > 0)

  function pctDiff(vA, vB) {
    if (!vB || vB === 0) return null
    return ((vA - vB) / vB) * 100
  }
  function fmtPct(pct) {
    if (pct === null) return '—'
    return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%'
  }

  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Ringkasan Perbandingan ────────────────────────────────────────
  const aovA = a.totalOrder > 0 ? a.totalOmset / a.totalOrder : 0
  const aovB = b.totalOrder > 0 ? b.totalOmset / b.totalOrder : 0
  const summaryRows = [
    ['Laporan Perbandingan Periode'],
    [`${labelA} vs ${labelB}`],
    [],
    ['Metrik', labelA, labelB, 'Selisih', 'Pertumbuhan'],
    ['Total omset', a.totalOmset, b.totalOmset, a.totalOmset - b.totalOmset, fmtPct(pctDiff(a.totalOmset, b.totalOmset))],
    ['Total order', a.totalOrder, b.totalOrder, a.totalOrder - b.totalOrder, fmtPct(pctDiff(a.totalOrder, b.totalOrder))],
    ['Rata-rata nilai order (AOV)', aovA, aovB, aovA - aovB, fmtPct(pctDiff(aovA, aovB))],
    ['Hari yang dibandingkan', a.effectiveSpanDays, b.effectiveSpanDays, a.effectiveSpanDays - b.effectiveSpanDays, ''],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Ringkasan')

  // ── Sheet 2: Per Platform ──────────────────────────────────────────────────
  const platformRows = [
    ['Omset per Platform'],
    [`${labelA} vs ${labelB}`],
    [],
    ['Platform', labelA, labelB, 'Selisih', 'Pertumbuhan'],
  ]
  for (const platform of allPlatforms) {
    const vA = a.platformTotals[platform] || 0
    const vB = b.platformTotals[platform] || 0
    platformRows.push([platform, vA, vB, vA - vB, fmtPct(pctDiff(vA, vB))])
  }
  platformRows.push(['TOTAL', a.totalOmset, b.totalOmset, a.totalOmset - b.totalOmset, fmtPct(pctDiff(a.totalOmset, b.totalOmset))])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(platformRows), 'Per Platform')

  // ── Sheet 3: Per Kategori (only if categories exist) ──────────────────────
  if (hasCategories) {
    const katRows = [
      ['Omset per Kategori'],
      [`${labelA} vs ${labelB}`],
      [],
      ['Kategori', labelA, labelB, 'Selisih', 'Pertumbuhan'],
    ]
    for (const key of COMPARE_ORDERED_CATEGORIES) {
      const members = customersByCategory[key]
      if (!members || members.length === 0) continue
      const vA = members.reduce((s, c) => s + (a.customerTotals?.[c] || 0), 0)
      const vB = members.reduce((s, c) => s + (b.customerTotals?.[c] || 0), 0)
      katRows.push([key, vA, vB, vA - vB, fmtPct(pctDiff(vA, vB))])
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(katRows), 'Per Kategori')
  }

  // ── Sheet 4: Per Pelanggan ─────────────────────────────────────────────────
  const pelangganRows = [
    ['Omset per Pelanggan Penagihan'],
    [`${labelA} vs ${labelB}`],
    [],
    ['Pelanggan Penagihan', labelA, labelB, 'Selisih', 'Pertumbuhan'],
  ]
  for (const c of allCustomers) {
    const vA = a.customerTotals?.[c] || 0
    const vB = b.customerTotals?.[c] || 0
    pelangganRows.push([c, vA, vB, vA - vB, fmtPct(pctDiff(vA, vB))])
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pelangganRows), 'Per Pelanggan')

  // ── Sheets 5–6: Detail tren harian per periode ────────────────────────────
  function buildDetailSheets(data, label, suffix) {
    // Daily totals
    const trendRows = [
      [`Tren Harian — ${label}`],
      [],
      ['Tanggal', 'Hari', 'Omset', 'Jumlah Order'],
    ]
    for (const d of data.daily) {
      trendRows.push([d.label, d.day, d.omset, d.order])
    }
    trendRows.push(['TOTAL', '', data.totalOmset, data.totalOrder])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trendRows), `Tren ${suffix}`)

    // Pivot omset
    const customers = data.rankedCustomers
    const pivotHeader = ['Tanggal', ...customers, 'TOTAL']
    const pivotRows = [[`Pivot Omset — ${label}`], [], pivotHeader]
    for (const d of data.dateKeys) {
      const row = [`${formatDateLabel(d)} (${dayName(d, true)})`]
      let rowTotal = 0
      for (const c of customers) { const v = data.pivotOmset[d][c]; row.push(v); rowTotal += v }
      row.push(rowTotal)
      pivotRows.push(row)
    }
    const totalRow = ['TOTAL']
    let grand = 0
    for (const c of customers) {
      const colSum = data.dateKeys.reduce((s, d) => s + data.pivotOmset[d][c], 0)
      totalRow.push(colSum); grand += colSum
    }
    totalRow.push(grand)
    pivotRows.push(totalRow)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pivotRows), `Pivot ${suffix}`)
  }

  buildDetailSheets(a, labelA, 'A')
  buildDetailSheets(b, labelB, 'B')

  const safeLabel = `${labelA}_vs_${labelB}`.replace(/[^a-zA-Z0-9_\-]/g, '_')
  XLSX.writeFile(wb, `Perbandingan_${safeLabel}.xlsx`)
}

function groupByCategory(customers, categories) {
  const groups = {}
  for (const key of ORDERED_CATEGORIES) groups[key] = []
  for (const c of customers) {
    const key = categories[c] || UNCATEGORIZED
    groups[key].push(c)
  }
  return groups
}

// ─── exportToExcelScreen: exports everything visible on screen (page.jsx) ─────
// Mirrors every section the dashboard renders:
//   1. Ringkasan         — summary cards + full customer ranking table
//   2. Tren Harian       — daily totals (omset + order) as shown in DailyTrendChart
//   3. Platform & Brand  — breakdown tables matching BreakdownCharts
//   4. Pivot Omset       — same as default export
//   5. Pivot Order       — same as default export
//   6. Ringkasan Kategori — (if categories assigned) same as default export
//   7. Tanggal x Kategori — (if categories assigned) same as default export
export function exportToExcelScreen(data, categories = {}) {
  const wb = XLSX.utils.book_new()
  const customers = data.rankedCustomers
  const hasCategories = categories && Object.keys(categories).length > 0

  // ── Sheet 1: Ringkasan (summary cards + customer ranking) ──────────────────
  const aov = data.totalOrder > 0 ? data.totalOmset / data.totalOrder : 0
  const ringkasanRows = [
    ['Laporan Penjualan Harian per Pelanggan Penagihan'],
    [`Periode: ${data.periodLabel}`],
    [],
    // Summary cards — exactly as shown on screen
    ['Total omset',                data.totalOmset],
    ['Total order',                data.totalOrder],
    ['Rata-rata nilai order (AOV)', aov],
    ['Jumlah pelanggan penagihan', customers.length],
    ['Hari aktif',                 data.dateKeys.length],
    [],
    // Customer ranking table — matches RankingTable component
    ['#', 'Pelanggan Penagihan', 'Total Omset', 'Total Order', 'AOV', '% dari Total Omset'],
  ]
  customers.forEach((c, i) => {
    const omset = data.customerTotals[c]
    const order = data.customerCounts[c]
    ringkasanRows.push([
      i + 1, c, omset, order,
      order > 0 ? omset / order : 0,
      omset / data.totalOmset,
    ])
  })
  ringkasanRows.push(['', 'Total', data.totalOmset, data.totalOrder, aov, 1])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ringkasanRows), 'Ringkasan')

  // ── Sheet 2: Tren Harian (daily totals — matches DailyTrendChart) ──────────
  const trendRows = [
    ['Tren Harian — Total Omset & Order'],
    [`Periode: ${data.periodLabel}`],
    [],
    ['Tanggal', 'Hari', 'Omset', 'Jumlah Order'],
  ]
  for (const d of data.daily) {
    trendRows.push([d.label, d.day, d.omset, d.order])
  }
  const totalDailyOmset = data.daily.reduce((s, d) => s + d.omset, 0)
  const totalDailyOrder = data.daily.reduce((s, d) => s + d.order, 0)
  trendRows.push(['TOTAL', '', totalDailyOmset, totalDailyOrder])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trendRows), 'Tren Harian')

  // ── Sheet 3: Platform & Brand (matches BreakdownCharts) ────────────────────
  const platformEntries = Object.entries(data.platformTotals).sort((a, b) => b[1] - a[1])
  const brandEntries    = Object.entries(data.brandTotals).sort((a, b) => b[1] - a[1])
  const breakdownRows = [
    ['Komposisi Omset'],
    [`Periode: ${data.periodLabel}`],
    [],
    ['Omset per Platform'],
    ['Platform', 'Omset', '% dari Total'],
  ]
  for (const [platform, omset] of platformEntries) {
    breakdownRows.push([platform, omset, omset / data.totalOmset])
  }
  breakdownRows.push(['TOTAL', data.totalOmset, 1])
  breakdownRows.push([])
  breakdownRows.push(['Omset per Brand / Toko'])
  breakdownRows.push(['Brand', 'Omset', '% dari Total'])
  for (const [brand, omset] of brandEntries) {
    breakdownRows.push([brand, omset, omset / data.totalOmset])
  }
  breakdownRows.push(['TOTAL', data.totalOmset, 1])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(breakdownRows), 'Platform & Brand')

  // ── Sheets 4–5: Pivot Omset & Pivot Order (same as default, matches PivotTable) ─
  function buildPivotSheet(pivot, title) {
    const header = ['Tanggal', ...customers, 'TOTAL']
    const aoa = [[title], [], header]
    for (const d of data.dateKeys) {
      const row = [`${formatDateLabel(d)} (${dayName(d, true)})`]
      let rowTotal = 0
      for (const c of customers) {
        const v = pivot[d][c]
        row.push(v)
        rowTotal += v
      }
      row.push(rowTotal)
      aoa.push(row)
    }
    const totalRow = ['TOTAL']
    let grand = 0
    for (const c of customers) {
      const colSum = data.dateKeys.reduce((s, d) => s + pivot[d][c], 0)
      totalRow.push(colSum)
      grand += colSum
    }
    totalRow.push(grand)
    aoa.push(totalRow)
    return XLSX.utils.aoa_to_sheet(aoa)
  }
  XLSX.utils.book_append_sheet(wb, buildPivotSheet(data.pivotOmset, 'Omset Harian per Pelanggan Penagihan (Rp)'), 'Omset Harian')
  XLSX.utils.book_append_sheet(wb, buildPivotSheet(data.pivotCount, 'Jumlah Order Harian per Pelanggan Penagihan'), 'Jumlah Order Harian')

  // ── Sheets 6–7: Category sheets (same as default, if categories assigned) ──
  if (hasCategories) {
    const groups = groupByCategory(customers, categories)

    // Ringkasan Kategori — matches CategorySummary component
    const catRows = [
      ['Ringkasan per Kategori'],
      [],
      ['Kategori', 'Total Omset', 'Total Order', 'AOV', '% dari Total Omset', 'Jumlah Pelanggan'],
    ]
    for (const key of ORDERED_CATEGORIES) {
      const members = groups[key]
      if (members.length === 0) continue
      const omset = members.reduce((s, c) => s + data.customerTotals[c], 0)
      const order = members.reduce((s, c) => s + data.customerCounts[c], 0)
      catRows.push([key, omset, order, order > 0 ? omset / order : 0, omset / data.totalOmset, members.length])
    }
    catRows.push([])
    catRows.push(['Rincian per pelanggan'])
    catRows.push(['Kategori', 'Pelanggan Penagihan', 'Total Omset', 'Total Order', 'AOV', '% dari Kategori'])
    for (const key of ORDERED_CATEGORIES) {
      const members = [...groups[key]].sort((a, b) => data.customerTotals[b] - data.customerTotals[a])
      if (members.length === 0) continue
      const catOmset = members.reduce((s, c) => s + data.customerTotals[c], 0)
      for (const c of members) {
        const omset = data.customerTotals[c]
        const order = data.customerCounts[c]
        catRows.push([key, c, omset, order, order > 0 ? omset / order : 0, catOmset > 0 ? omset / catOmset : 0])
      }
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(catRows), 'Ringkasan Kategori')

    // Tanggal x Kategori — matches CategoryDateDetail component
    const dateCatHeader1 = ['']
    const dateCatHeader2 = ['Tanggal']
    for (const key of ORDERED_CATEGORIES) {
      if (groups[key].length === 0) continue
      dateCatHeader1.push(key, '')
      dateCatHeader2.push('Omset', 'Order')
    }
    const activeCats = ORDERED_CATEGORIES.filter((k) => groups[k].length > 0)
    const dateCatRows = [['Detail per Tanggal per Kategori'], [], dateCatHeader1, dateCatHeader2]
    for (const d of data.dateKeys) {
      const row = [`${formatDateLabel(d)} (${dayName(d, true)})`]
      for (const key of activeCats) {
        const omset = groups[key].reduce((s, c) => s + data.pivotOmset[d][c], 0)
        const order = groups[key].reduce((s, c) => s + data.pivotCount[d][c], 0)
        row.push(omset, order)
      }
      dateCatRows.push(row)
    }
    const totalRow = ['TOTAL']
    for (const key of activeCats) {
      const omset = data.dateKeys.reduce((s, d) => s + groups[key].reduce((s2, c) => s2 + data.pivotOmset[d][c], 0), 0)
      const order = data.dateKeys.reduce((s, d) => s + groups[key].reduce((s2, c) => s2 + data.pivotCount[d][c], 0), 0)
      totalRow.push(omset, order)
    }
    dateCatRows.push(totalRow)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dateCatRows), 'Tanggal x Kategori')
  }

  XLSX.writeFile(wb, 'Laporan_Penjualan_Tampilan_Layar.xlsx')
}
