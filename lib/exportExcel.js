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

  const totalKuantitas   = rows.reduce((s, r) => s + r.kuantitas, 0)
  const totalHargaProduk = rows.reduce((s, r) => s + r.hargaProduk, 0)
  const totalStock       = rows.reduce((s, r) => s + (r.stock || 0), 0)

  const header = hasStock
    ? ['#', 'Kode Barang', 'Nama Barang', 'Brand', 'Kuantitas', 'Harga Produk', 'Stock']
    : ['#', 'Kode Barang', 'Nama Barang', 'Kuantitas', 'Harga Produk']

  const toRow = (r) => hasStock
    ? [r.rank, r.kodeBarang || '', r.namaBarang, r.brand === '—' ? '' : r.brand, r.kuantitas, r.hargaProduk, r.stock || 0]
    : [r.rank, r.kodeBarang || '', r.namaBarang, r.kuantitas, r.hargaProduk]

  const totalRow = hasStock
    ? ['', '', 'TOTAL', '', totalKuantitas, totalHargaProduk, totalStock]
    : ['', '', 'TOTAL', totalKuantitas, totalHargaProduk]

  const aoa = [
    ['Laporan Produk Terlaris'],
    periodLabel ? [`Periode: ${periodLabel}`] : [],
    filterDesc  ? [`Filter: ${filterDesc}`]   : [],
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
        { wch: 12 },  // Kuantitas
        { wch: 18 },  // Harga Produk
        { wch: 10 },  // Stock
      ]
    : [
        { wch: 4 },   // #
        { wch: 16 },  // Kode Barang
        { wch: 40 },  // Nama Barang
        { wch: 12 },  // Kuantitas
        { wch: 18 },  // Harga Produk
      ]

  // Number format for Kuantitas, Harga Produk, and (if present) Stock
  const kuanCol  = hasStock ? 4 : 3
  const hargaCol = hasStock ? 5 : 4
  const stockCol = hasStock ? 6 : null

  const dataStartRow = aoa.findIndex(r => r[0] === rows[0]?.rank) + 1
  for (let R = dataStartRow; R <= dataStartRow + rows.length - 1; R++) {
    const kuanCell  = XLSX.utils.encode_cell({ r: R, c: kuanCol })
    const hargaCell = XLSX.utils.encode_cell({ r: R, c: hargaCol })
    if (ws[kuanCell])  ws[kuanCell].z  = '#,##0'
    if (ws[hargaCell]) ws[hargaCell].z = '#,##0'
    if (stockCol != null) {
      const stockCell = XLSX.utils.encode_cell({ r: R, c: stockCol })
      if (ws[stockCell]) ws[stockCell].z = '#,##0'
    }
  }
  // Total row number format
  const totalRowIdx  = dataStartRow + rows.length + 1
  const totKuanCell  = XLSX.utils.encode_cell({ r: totalRowIdx, c: kuanCol })
  const totHargaCell = XLSX.utils.encode_cell({ r: totalRowIdx, c: hargaCol })
  if (ws[totKuanCell])  ws[totKuanCell].z  = '#,##0'
  if (ws[totHargaCell]) ws[totHargaCell].z = '#,##0'
  if (stockCol != null) {
    const totStockCell = XLSX.utils.encode_cell({ r: totalRowIdx, c: stockCol })
    if (ws[totStockCell]) ws[totStockCell].z = '#,##0'
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Produk Terlaris')

  const safePeriod = (periodLabel || 'export').replace(/[^a-zA-Z0-9_\-]/g, '_')
  XLSX.writeFile(wb, `Produk_Terlaris_${safePeriod}.xlsx`)
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
