import * as XLSX from 'xlsx'
import { formatRupiah, formatRupiahShort } from './parseAffiliate'

/**
 * Capture an HTML5 canvas element with a guaranteed solid white background
 * so it renders cleanly in jsPDF without transparency artifacts.
 */
export function getCanvasImageWithWhiteBg(canvas) {
  if (!canvas) return null
  try {
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = canvas.width
    tempCanvas.height = canvas.height
    const ctx = tempCanvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height)
    ctx.drawImage(canvas, 0, 0)
    return tempCanvas.toDataURL('image/jpeg', 0.92)
  } catch (err) {
    console.error('Failed to capture canvas:', err)
    return null
  }
}

/**
 * Auto-fit column widths for SheetJS
 */
function autoFitColumns(aoa, minWidths = {}) {
  const colWidths = []
  aoa.forEach((row) => {
    if (!Array.isArray(row)) return
    // Skip wide title rows that span the whole sheet
    if (row.length <= 2 && String(row[0] || '').length > 25) return

    row.forEach((cell, colIdx) => {
      const val = cell !== null && cell !== undefined ? String(cell) : ''
      const len = Math.max(val.length + 2, 9)
      colWidths[colIdx] = Math.min(
        Math.max(colWidths[colIdx] || 10, len, minWidths[colIdx] || 0),
        55
      )
    })
  })
  return colWidths.map((wch) => ({ wch }))
}

function safeFileStr(str) {
  return String(str || '')
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'laporan'
}

function formatDateDisplay(dStr) {
  if (!dStr) return '—'
  const d = new Date(dStr)
  if (isNaN(d.getTime())) return String(dStr)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. EXCEL EXPORT ENGINE FOR AFFILIATE
// ══════════════════════════════════════════════════════════════════════════════

export function exportAffiliateExcel({
  platform = 'shopee', // 'shopee' | 'tiktok' | 'semua'
  rows = [],
  periodLabel = '',
  account = 'Semua Akun',
  filterDesc = '',
  shopeeRows = [],
  tiktokRows = [],
  shopeeEntries = [],
  tiktokEntries = [],
}) {
  const wb = XLSX.utils.book_new()
  const exportTime = new Date().toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  if (platform === 'shopee') {
    // ─── SHOPEE EXCEL ───
    const uniqueOrders = new Set(rows.map((r) => r.kodePesanan).filter(Boolean)).size
    const totalGmv = rows.reduce((s, r) => s + (Number(r.gmv) || 0), 0)
    const totalExp = rows.reduce((s, r) => s + (Number(r.expense) || 0), 0)
    const ratio = totalGmv > 0 ? (totalExp / totalGmv) * 100 : 0

    // Sheet 1: Ringkasan & KPI
    const promoMap = {}
    const affMap = {}
    const prodMap = {}
    const statusMap = {}

    rows.forEach((r) => {
      // Promo
      const p = r.jenisPromo || 'Tidak Ada'
      if (!promoMap[p]) promoMap[p] = { count: 0, gmv: 0, exp: 0 }
      promoMap[p].count++
      promoMap[p].gmv += r.gmv || 0
      promoMap[p].exp += r.expense || 0

      // Affiliate
      const aff = r.namaAffiliate || 'Unknown'
      affMap[aff] = (affMap[aff] || 0) + (r.gmv || 0)

      // Produk
      const prod = r.namaProduk || 'Unknown'
      prodMap[prod] = (prodMap[prod] || 0) + (r.gmv || 0)

      // Status
      const st = r.statusPesanan || 'Unknown'
      statusMap[st] = (statusMap[st] || 0) + 1
    })

    const summaryAoa = [
      ['LAPORAN PERFORMA SHOPEE AFFILIATE'],
      [`Periode: ${periodLabel || 'Semua Periode'}`],
      [`Akun: ${account}`],
      filterDesc ? [`Filter: ${filterDesc}`] : [],
      [`Tanggal Ekspor: ${exportTime}`],
      [],
      ['RINGKASAN UTAMA (KPI)'],
      ['Total Pesanan (Unik)', uniqueOrders, '', 'Total GMV (Rp)', Math.round(totalGmv)],
      ['Total Pengeluaran (Rp)', Math.round(totalExp), '', 'Expense Ratio (%)', Number(ratio.toFixed(2))],
      [],
      ['PERFORMA JENIS PROMO'],
      ['Jenis Promo', 'Total Pesanan', 'GMV (Rp)', 'Pengeluaran (Rp)', 'Expense Ratio (%)', 'Rata-rata GMV / Pesanan (Rp)', 'Pangsa GMV (%)'],
      ...Object.entries(promoMap)
        .sort((a, b) => b[1].gmv - a[1].gmv)
        .map(([promo, d]) => [
          promo,
          d.count,
          Math.round(d.gmv),
          Math.round(d.exp),
          d.gmv > 0 ? Number(((d.exp / d.gmv) * 100).toFixed(2)) : 0,
          d.count > 0 ? Math.round(d.gmv / d.count) : 0,
          totalGmv > 0 ? Number(((d.gmv / totalGmv) * 100).toFixed(1)) : 0,
        ]),
      ['TOTAL', rows.length, Math.round(totalGmv), Math.round(totalExp), Number(ratio.toFixed(2)), rows.length > 0 ? Math.round(totalGmv / rows.length) : 0, 100],
      [],
      ['TOP 10 AFFILIATE (BERDASARKAN GMV)'],
      ['Peringkat', 'Nama Affiliate', 'Total GMV (Rp)', 'Pangsa GMV (%)'],
      ...Object.entries(affMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, gmvVal], idx) => [
          idx + 1,
          name,
          Math.round(gmvVal),
          totalGmv > 0 ? Number(((gmvVal / totalGmv) * 100).toFixed(1)) : 0,
        ]),
      [],
      ['TOP 10 PRODUK TERLARIS (BERDASARKAN GMV)'],
      ['Peringkat', 'Nama Produk', 'Total GMV (Rp)', 'Pangsa GMV (%)'],
      ...Object.entries(prodMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, gmvVal], idx) => [
          idx + 1,
          name,
          Math.round(gmvVal),
          totalGmv > 0 ? Number(((gmvVal / totalGmv) * 100).toFixed(1)) : 0,
        ]),
      [],
      ['DISTRIBUSI STATUS PESANAN'],
      ['Status Pesanan', 'Jumlah Pesanan', 'Pangsa (%)'],
      ...Object.entries(statusMap)
        .sort((a, b) => b[1] - a[1])
        .map(([st, cnt]) => [
          st,
          cnt,
          rows.length > 0 ? Number(((cnt / rows.length) * 100).toFixed(1)) : 0,
        ]),
    ].filter((r) => r.length > 0)

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa)
    wsSummary['!cols'] = autoFitColumns(summaryAoa, { 0: 25, 1: 25, 2: 20, 3: 20 })
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan & KPI')

    // Sheet 2: Rincian Transaksi
    const txHeaders = [
      'No',
      'Kode Pesanan',
      'Status Pesanan',
      'Waktu Pesanan',
      'Nama Produk',
      'Nama Affiliate',
      'Username Affiliate',
      'Jenis Promo',
      'GMV (Rp)',
      'Tipe Pesanan',
      'Platform',
      'Pengeluaran Komisi (Rp)',
      'Waktu Pemotongan',
    ]

    const txRows = rows.map((r, i) => [
      i + 1,
      r.kodePesanan || '',
      r.statusPesanan || '',
      r.waktuPesanan || '',
      r.namaProduk || '',
      r.namaAffiliate || '',
      r.usernameAffiliate || '',
      r.jenisPromo || '',
      Math.round(r.gmv || 0),
      r.tipePesanan || '',
      r.platform || '',
      Math.round(r.expense || 0),
      r.waktuPemotongan || '',
    ])

    const totalRow = [
      '',
      '',
      '',
      'TOTAL',
      `${rows.length} transaksi`,
      '',
      '',
      '',
      Math.round(totalGmv),
      '',
      '',
      Math.round(totalExp),
      '',
    ]

    const txAoa = [
      ['RINCIAN DATA TRANSAKSI SHOPEE AFFILIATE'],
      [`Periode: ${periodLabel} · Akun: ${account} · Total: ${rows.length} Transaksi`],
      filterDesc ? [`Filter: ${filterDesc}`] : [],
      [],
      txHeaders,
      ...txRows,
      [],
      totalRow,
    ].filter((r) => r.length > 0)

    const wsTx = XLSX.utils.aoa_to_sheet(txAoa)
    wsTx['!cols'] = autoFitColumns(txAoa, {
      0: 6,
      1: 20,
      2: 14,
      3: 20,
      4: 35,
      5: 22,
      6: 20,
      7: 16,
      8: 16,
      9: 14,
      10: 12,
      11: 18,
      12: 20,
    })
    XLSX.utils.book_append_sheet(wb, wsTx, 'Rincian Transaksi')
  } else if (platform === 'tiktok') {
    // ─── TIKTOK EXCEL ───
    const uniqueOrders = new Set(rows.map((r) => r.idPesanan).filter(Boolean)).size
    const totalGmv = rows.reduce((s, r) => s + (Number(r.gmv) || 0), 0)
    const totalExp = rows.reduce((s, r) => s + (Number(r.expense) || 0), 0)
    const ratio = totalGmv > 0 ? (totalExp / totalGmv) * 100 : 0

    const modelMap = {}
    const contentMap = {}
    const creatorMap = {}
    const prodMap = {}
    const statusMap = {}

    rows.forEach((r) => {
      // Model Komisi
      const m = r.commissionModel || 'Unknown'
      if (!modelMap[m]) modelMap[m] = { orders: new Set(), gmv: 0, exp: 0 }
      modelMap[m].orders.add(r.idPesanan)
      modelMap[m].gmv += r.gmv || 0
      modelMap[m].exp += r.expense || 0

      // Jenis Konten
      const c = r.jenisKonten || 'Unknown'
      contentMap[c] = (contentMap[c] || 0) + (r.gmv || 0)

      // Kreator
      const cr = r.kreator || 'Unknown'
      creatorMap[cr] = (creatorMap[cr] || 0) + (r.gmv || 0)

      // Produk
      const pr = r.produk || 'Unknown'
      prodMap[pr] = (prodMap[pr] || 0) + (r.gmv || 0)

      // Status
      const st = r.status || 'Unknown'
      statusMap[st] = (statusMap[st] || 0) + 1
    })

    const summaryAoa = [
      ['LAPORAN PERFORMA TIKTOK SHOP AFFILIATE'],
      [`Periode: ${periodLabel || 'Semua Periode'}`],
      [`Akun: ${account}`],
      filterDesc ? [`Filter: ${filterDesc}`] : [],
      [`Tanggal Ekspor: ${exportTime}`],
      [],
      ['RINGKASAN UTAMA (KPI)'],
      ['Total Pesanan (Unik)', uniqueOrders, '', 'Total GMV (Rp)', Math.round(totalGmv)],
      ['Total Pengeluaran (Rp)', Math.round(totalExp), '', 'Expense Ratio (%)', Number(ratio.toFixed(2))],
      [],
      ['BREAKDOWN MODEL KOMISI'],
      ['Model Komisi', 'Total Pesanan', 'GMV (Rp)', 'Pengeluaran (Rp)', 'Expense Ratio (%)'],
      ...Object.entries(modelMap)
        .sort((a, b) => b[1].gmv - a[1].gmv)
        .map(([m, d]) => [
          m,
          d.orders.size,
          Math.round(d.gmv),
          Math.round(d.exp),
          d.gmv > 0 ? Number(((d.exp / d.gmv) * 100).toFixed(2)) : 0,
        ]),
      ['TOTAL', rows.length, Math.round(totalGmv), Math.round(totalExp), Number(ratio.toFixed(2))],
      [],
      ['BREAKDOWN JENIS KONTEN'],
      ['Jenis Konten', 'GMV (Rp)', 'Pangsa GMV (%)'],
      ...Object.entries(contentMap)
        .sort((a, b) => b[1] - a[1])
        .map(([c, gmvVal]) => [
          c,
          Math.round(gmvVal),
          totalGmv > 0 ? Number(((gmvVal / totalGmv) * 100).toFixed(1)) : 0,
        ]),
      [],
      ['TOP 10 KREATOR (BERDASARKAN GMV)'],
      ['Peringkat', 'Nama Kreator', 'Total GMV (Rp)', 'Pangsa GMV (%)'],
      ...Object.entries(creatorMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, gmvVal], idx) => [
          idx + 1,
          name,
          Math.round(gmvVal),
          totalGmv > 0 ? Number(((gmvVal / totalGmv) * 100).toFixed(1)) : 0,
        ]),
      [],
      ['TOP 10 PRODUK TERLARIS (BERDASARKAN GMV)'],
      ['Peringkat', 'Nama Produk', 'Total GMV (Rp)', 'Pangsa GMV (%)'],
      ...Object.entries(prodMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, gmvVal], idx) => [
          idx + 1,
          name,
          Math.round(gmvVal),
          totalGmv > 0 ? Number(((gmvVal / totalGmv) * 100).toFixed(1)) : 0,
        ]),
      [],
      ['DISTRIBUSI STATUS PESANAN'],
      ['Status Pesanan', 'Jumlah Pesanan', 'Pangsa (%)'],
      ...Object.entries(statusMap)
        .sort((a, b) => b[1] - a[1])
        .map(([st, cnt]) => [
          st,
          cnt,
          rows.length > 0 ? Number(((cnt / rows.length) * 100).toFixed(1)) : 0,
        ]),
    ].filter((r) => r.length > 0)

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa)
    wsSummary['!cols'] = autoFitColumns(summaryAoa, { 0: 25, 1: 25, 2: 20, 3: 20 })
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan & KPI')

    // Sheet 2: Rincian Transaksi
    const txHeaders = [
      'No',
      'ID Pesanan',
      'Nama Produk',
      'ID SKU',
      'Status Pesanan',
      'Kreator',
      'Jenis Konten',
      'Model Komisi',
      '% Komisi',
      'GMV (Rp)',
      'Pengeluaran Komisi (Rp)',
      'Waktu Pembayaran',
      'Waktu Komisi Dibayar',
      'Platform',
    ]

    const txRows = rows.map((r, i) => [
      i + 1,
      r.idPesanan || '',
      r.produk || '',
      r.idSku || '',
      r.status || '',
      r.kreator || '',
      r.jenisKonten || '',
      r.commissionModel || '',
      r.persentaseKomisi || '',
      Math.round(r.gmv || 0),
      Math.round(r.expense || 0),
      formatDateDisplay(r.waktuPembayaran),
      formatDateDisplay(r.waktuKomisiDibayar),
      r.platform || '',
    ])

    const totalRow = [
      '',
      '',
      '',
      'TOTAL',
      `${rows.length} transaksi`,
      '',
      '',
      '',
      '',
      Math.round(totalGmv),
      Math.round(totalExp),
      '',
      '',
      '',
    ]

    const txAoa = [
      ['RINCIAN DATA TRANSAKSI TIKTOK SHOP AFFILIATE'],
      [`Periode: ${periodLabel} · Akun: ${account} · Total: ${rows.length} Transaksi`],
      filterDesc ? [`Filter: ${filterDesc}`] : [],
      [],
      txHeaders,
      ...txRows,
      [],
      totalRow,
    ].filter((r) => r.length > 0)

    const wsTx = XLSX.utils.aoa_to_sheet(txAoa)
    wsTx['!cols'] = autoFitColumns(txAoa, {
      0: 6,
      1: 20,
      2: 35,
      3: 16,
      4: 16,
      5: 22,
      6: 14,
      7: 18,
      8: 12,
      9: 16,
      10: 18,
      11: 20,
      12: 20,
      13: 12,
    })
    XLSX.utils.book_append_sheet(wb, wsTx, 'Rincian Transaksi')
  } else {
    // ─── SEMUA (COMBINED) EXCEL ───
    const shopeeAllRows = shopeeRows.length > 0 ? shopeeRows : shopeeEntries.flatMap((e) => e.rows || [])
    const tiktokAllRows = tiktokRows.length > 0 ? tiktokRows : tiktokEntries.flatMap((e) => e.rows || [])

    const shopeeOrders = new Set(shopeeAllRows.map((r) => r.kodePesanan).filter(Boolean)).size
    const shopeeGmv = shopeeAllRows.reduce((s, r) => s + (Number(r.gmv) || 0), 0)
    const shopeeExp = shopeeAllRows.reduce((s, r) => s + (Number(r.expense) || 0), 0)
    const shopeeRatio = shopeeGmv > 0 ? (shopeeExp / shopeeGmv) * 100 : 0

    const tiktokOrders = new Set(tiktokAllRows.map((r) => r.idPesanan).filter(Boolean)).size
    const tiktokGmv = tiktokAllRows.reduce((s, r) => s + (Number(r.gmv) || 0), 0)
    const tiktokExp = tiktokAllRows.reduce((s, r) => s + (Number(r.expense) || 0), 0)
    const tiktokRatio = tiktokGmv > 0 ? (tiktokExp / tiktokGmv) * 100 : 0

    const totalOrders = shopeeOrders + tiktokOrders
    const totalGmv = shopeeGmv + tiktokGmv
    const totalExp = shopeeExp + tiktokExp
    const combinedRatio = totalGmv > 0 ? (totalExp / totalGmv) * 100 : 0

    // Account list
    const accList = []
    shopeeEntries.forEach((entry) => {
      const eRows = entry.rows || []
      const ord = new Set(eRows.map((r) => r.kodePesanan).filter(Boolean)).size
      const g = eRows.reduce((s, r) => s + (r.gmv || 0), 0)
      const ex = eRows.reduce((s, r) => s + (r.expense || 0), 0)
      accList.push({
        platform: 'Shopee',
        account: entry.account,
        orders: ord,
        gmv: Math.round(g),
        expense: Math.round(ex),
        ratio: g > 0 ? Number(((ex / g) * 100).toFixed(2)) : 0,
        share: totalGmv > 0 ? Number(((g / totalGmv) * 100).toFixed(1)) : 0,
      })
    })
    tiktokEntries.forEach((entry) => {
      const eRows = entry.rows || []
      const ord = new Set(eRows.map((r) => r.idPesanan).filter(Boolean)).size
      const g = eRows.reduce((s, r) => s + (r.gmv || 0), 0)
      const ex = eRows.reduce((s, r) => s + (r.expense || 0), 0)
      accList.push({
        platform: 'TikTok',
        account: entry.account,
        orders: ord,
        gmv: Math.round(g),
        expense: Math.round(ex),
        ratio: g > 0 ? Number(((ex / g) * 100).toFixed(2)) : 0,
        share: totalGmv > 0 ? Number(((g / totalGmv) * 100).toFixed(1)) : 0,
      })
    })
    accList.sort((a, b) => b.gmv - a.gmv)

    const summaryAoa = [
      ['LAPORAN EKSEKUTIF AFFILIATE GABUNGAN (SHOPEE & TIKTOK)'],
      [`Periode: ${periodLabel || 'Semua Periode'}`],
      [`Tanggal Ekspor: ${exportTime}`],
      [],
      ['KPI GABUNGAN (TOTAL SEMUA CHANNEL)'],
      ['Total Pesanan (Unik)', totalOrders, '', 'Total GMV (Rp)', Math.round(totalGmv)],
      ['Total Pengeluaran (Rp)', Math.round(totalExp), '', 'Expense Ratio (%)', Number(combinedRatio.toFixed(2))],
      [],
      ['KOMPARASI PERFORMA CHANNEL'],
      ['Platform', 'Total Pesanan', 'GMV (Rp)', 'Pengeluaran (Rp)', 'Expense Ratio (%)', 'Pangsa GMV (%)'],
      [
        'Shopee Affiliate',
        shopeeOrders,
        Math.round(shopeeGmv),
        Math.round(shopeeExp),
        Number(shopeeRatio.toFixed(2)),
        totalGmv > 0 ? Number(((shopeeGmv / totalGmv) * 100).toFixed(1)) : 0,
      ],
      [
        'TikTok Shop Affiliate',
        tiktokOrders,
        Math.round(tiktokGmv),
        Math.round(tiktokExp),
        Number(tiktokRatio.toFixed(2)),
        totalGmv > 0 ? Number(((tiktokGmv / totalGmv) * 100).toFixed(1)) : 0,
      ],
      ['TOTAL GABUNGAN', totalOrders, Math.round(totalGmv), Math.round(totalExp), Number(combinedRatio.toFixed(2)), 100],
      [],
      ['RINCIAN DATA PER AKUN / PELANGGAN TERSIMPAN'],
      ['Platform', 'Nama Akun / Pelanggan', 'Total Pesanan', 'GMV (Rp)', 'Pengeluaran (Rp)', 'Expense Ratio (%)', 'Kontribusi GMV (%)'],
      ...accList.map((a) => [a.platform, a.account, a.orders, a.gmv, a.expense, a.ratio, a.share]),
    ].filter((r) => r.length > 0)

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa)
    wsSummary['!cols'] = autoFitColumns(summaryAoa, { 0: 24, 1: 28, 2: 16, 3: 20, 4: 20 })
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan Gabungan')

    // Sheet 2: Shopee
    if (shopeeAllRows.length > 0) {
      const shopeeHeaders = ['No', 'Kode Pesanan', 'Status Pesanan', 'Waktu Pesanan', 'Nama Produk', 'Nama Affiliate', 'Username Affiliate', 'Jenis Promo', 'GMV (Rp)', 'Tipe Pesanan', 'Platform', 'Pengeluaran (Rp)', 'Waktu Pemotongan']
      const sAoa = [
        ['TRANSAKSI SHOPEE AFFILIATE'],
        shopeeHeaders,
        ...shopeeAllRows.map((r, i) => [
          i + 1,
          r.kodePesanan || '',
          r.statusPesanan || '',
          r.waktuPesanan || '',
          r.namaProduk || '',
          r.namaAffiliate || '',
          r.usernameAffiliate || '',
          r.jenisPromo || '',
          Math.round(r.gmv || 0),
          r.tipePesanan || '',
          r.platform || '',
          Math.round(r.expense || 0),
          r.waktuPemotongan || '',
        ]),
      ]
      const wsS = XLSX.utils.aoa_to_sheet(sAoa)
      wsS['!cols'] = autoFitColumns(sAoa)
      XLSX.utils.book_append_sheet(wb, wsS, 'Rincian Shopee')
    }

    // Sheet 3: TikTok
    if (tiktokAllRows.length > 0) {
      const tiktokHeaders = ['No', 'ID Pesanan', 'Nama Produk', 'ID SKU', 'Status', 'Kreator', 'Jenis Konten', 'Model Komisi', '% Komisi', 'GMV (Rp)', 'Pengeluaran (Rp)', 'Waktu Pembayaran', 'Waktu Komisi Dibayar', 'Platform']
      const tAoa = [
        ['TRANSAKSI TIKTOK SHOP AFFILIATE'],
        tiktokHeaders,
        ...tiktokAllRows.map((r, i) => [
          i + 1,
          r.idPesanan || '',
          r.produk || '',
          r.idSku || '',
          r.status || '',
          r.kreator || '',
          r.jenisKonten || '',
          r.commissionModel || '',
          r.persentaseKomisi || '',
          Math.round(r.gmv || 0),
          Math.round(r.expense || 0),
          formatDateDisplay(r.waktuPembayaran),
          formatDateDisplay(r.waktuKomisiDibayar),
          r.platform || '',
        ]),
      ]
      const wsT = XLSX.utils.aoa_to_sheet(tAoa)
      wsT['!cols'] = autoFitColumns(tAoa)
      XLSX.utils.book_append_sheet(wb, wsT, 'Rincian TikTok')
    }
  }

  const fileName = `Laporan-Affiliate-${platform}-${safeFileStr(periodLabel)}-${safeFileStr(account)}`
  XLSX.writeFile(wb, `${fileName}.xlsx`)
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. PDF EXPORT ENGINE (VISUAL GRAPHICS + APPEALING DESIGN + DETAILED DATA)
// ══════════════════════════════════════════════════════════════════════════════

export async function exportAffiliatePdf({
  platform = 'shopee', // 'shopee' | 'tiktok' | 'semua'
  rows = [],
  periodLabel = '',
  account = 'Semua Akun',
  filterDesc = '',
  onProgress,
  chartCanvases = {},
}) {
  onProgress?.('Menyiapkan generator PDF…')

  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  onProgress?.('Mengambil grafik & visual…')

  // Theme primary colors
  let brandColor = [234, 88, 12] // #ea580c (Shopee)
  let brandHex = '#ea580c'
  let brandName = 'SHOPEE AFFILIATE'
  if (platform === 'tiktok') {
    brandColor = [59, 91, 219] // #3B5BDB (TikTok)
    brandHex = '#3B5BDB'
    brandName = 'TIKTOK SHOP AFFILIATE'
  } else if (platform === 'semua') {
    brandColor = [124, 58, 237] // #7c3aed (Semua)
    brandHex = '#7c3aed'
    brandName = 'GABUNGAN SHOPEE & TIKTOK'
  }

  // 1. Gather Chart snapshots
  let dailyTrendImg = null
  let statusChartImg = null
  let barChartImg = null

  if (platform === 'shopee') {
    const dailyC = chartCanvases.daily || document.getElementById('aff-shopee-daily-chart')
    const statusC = chartCanvases.status || document.getElementById('aff-shopee-status-chart')
    const affC = chartCanvases.aff || document.getElementById('aff-shopee-aff-chart')
    dailyTrendImg = getCanvasImageWithWhiteBg(dailyC)
    statusChartImg = getCanvasImageWithWhiteBg(statusC)
    barChartImg = getCanvasImageWithWhiteBg(affC)
  } else if (platform === 'tiktok') {
    const trendC = chartCanvases.trend || document.getElementById('aff-tiktok-trend-chart')
    const statusC = chartCanvases.status || document.getElementById('aff-tiktok-status-chart')
    const creatorC = chartCanvases.creator || document.getElementById('aff-tiktok-creator-chart')
    dailyTrendImg = getCanvasImageWithWhiteBg(trendC)
    statusChartImg = getCanvasImageWithWhiteBg(statusC)
    barChartImg = getCanvasImageWithWhiteBg(creatorC)
  } else {
    const lineC = chartCanvases.line || document.getElementById('aff-semua-line-chart')
    const shareC = chartCanvases.share || document.getElementById('aff-semua-share-chart')
    dailyTrendImg = getCanvasImageWithWhiteBg(lineC)
    statusChartImg = getCanvasImageWithWhiteBg(shareC)
  }

  onProgress?.('Menyusun halaman eksekutif & grafik…')

  // A4 Landscape: 297mm x 210mm
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  })

  const pageWidth = 297
  const pageHeight = 210
  const marginX = 12

  // Metrics calculation
  let uniqueOrders = 0
  let totalGmv = 0
  let totalExp = 0
  let ratio = 0

  if (platform === 'shopee') {
    uniqueOrders = new Set(rows.map((r) => r.kodePesanan).filter(Boolean)).size
    totalGmv = rows.reduce((s, r) => s + (Number(r.gmv) || 0), 0)
    totalExp = rows.reduce((s, r) => s + (Number(r.expense) || 0), 0)
    ratio = totalGmv > 0 ? (totalExp / totalGmv) * 100 : 0
  } else if (platform === 'tiktok') {
    uniqueOrders = new Set(rows.map((r) => r.idPesanan).filter(Boolean)).size
    totalGmv = rows.reduce((s, r) => s + (Number(r.gmv) || 0), 0)
    totalExp = rows.reduce((s, r) => s + (Number(r.expense) || 0), 0)
    ratio = totalGmv > 0 ? (totalExp / totalGmv) * 100 : 0
  } else {
    // Semua
    const shopeeUnique = new Set(rows.filter((r) => r.platform === 'Shopee').map((r) => r.kodePesanan).filter(Boolean)).size
    const tiktokUnique = new Set(rows.filter((r) => r.platform === 'TikTok').map((r) => r.idPesanan).filter(Boolean)).size
    uniqueOrders = shopeeUnique + tiktokUnique
    totalGmv = rows.reduce((s, r) => s + (Number(r.gmv) || 0), 0)
    totalExp = rows.reduce((s, r) => s + (Number(r.expense) || 0), 0)
    ratio = totalGmv > 0 ? (totalExp / totalGmv) * 100 : 0
  }

  const exportTime = new Date().toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  // ──────────────────────────────────────────────────────────────────────────
  // PAGE 1: EXECUTIVE ANALYTICS, KPIS & VISUAL GRAPHICS
  // ──────────────────────────────────────────────────────────────────────────

  // 1. Top Decorative Brand Bar
  doc.setFillColor(...brandColor)
  doc.rect(0, 0, pageWidth, 4, 'F')

  // 2. Header Section
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 116, 139)
  doc.text('TMS SALES DASHBOARD · OFFICIAL REPORT', marginX, 11)

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text('Laporan Performa & Rincian Transaksi Affiliate', marginX, 17)

  // Brand Badge
  doc.setFillColor(...brandColor)
  doc.roundedRect(marginX, 19.5, 42, 5.5, 1.2, 1.2, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(brandName, marginX + 3.5, 23.3)

  // Metadata Block (Right aligned)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  const metaX = pageWidth - marginX
  doc.text(`Periode: ${periodLabel || 'Semua Periode'}`, metaX, 11, { align: 'right' })
  doc.text(`Akun: ${account} · Waktu Cetak: ${exportTime}`, metaX, 16, { align: 'right' })
  if (filterDesc) {
    doc.text(`Filter: ${filterDesc}`, metaX, 21, { align: 'right' })
  }

  // Header Divider
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.3)
  doc.line(marginX, 27, pageWidth - marginX, 27)

  // 3. KPI Cards Grid (4 equal cards)
  const kpiY = 30
  const kpiH = 19
  const totalUsableW = pageWidth - marginX * 2
  const gap = 4
  const cardW = (totalUsableW - gap * 3) / 4

  const kpis = [
    {
      label: 'TOTAL PESANAN',
      val: uniqueOrders.toLocaleString('id-ID'),
      sub: 'Unique Order Records',
      color: brandColor,
    },
    {
      label: 'TOTAL GMV',
      val: formatRupiah(totalGmv),
      sub: 'Volume Penjualan Bersih',
      color: [22, 163, 74], // green
    },
    {
      label: 'PENGELUARAN KOMISI',
      val: formatRupiah(totalExp),
      sub: 'Total Biaya Komisi',
      color: [37, 99, 235], // royal blue
    },
    {
      label: 'EXPENSE RATIO',
      val: `${ratio.toFixed(2)}%`,
      sub: 'Pengeluaran / GMV',
      color: [124, 58, 237], // purple
    },
  ]

  kpis.forEach((kpi, idx) => {
    const cx = marginX + idx * (cardW + gap)

    // Card background
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.3)
    doc.roundedRect(cx, kpiY, cardW, kpiH, 2, 2, 'FD')

    // Top indicator strip
    doc.setFillColor(...kpi.color)
    doc.rect(cx, kpiY, cardW, 1.6, 'F')

    // Label
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 116, 139)
    doc.text(kpi.label, cx + 3.5, kpiY + 5.5)

    // Value
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text(kpi.val, cx + 3.5, kpiY + 12)

    // Subtitle
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(148, 163, 184)
    doc.text(kpi.sub, cx + 3.5, kpiY + 16.5)
  })

  // 4. Visual Graphics Section (High-Res Chart Boxes)
  const chartY = 52
  const chartH = 82

  if (dailyTrendImg) {
    const trendW = barChartImg || statusChartImg ? 166 : totalUsableW
    const rightW = totalUsableW - trendW - gap

    // Box 1: Daily Trend Frame
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.3)
    doc.roundedRect(marginX, chartY, trendW, chartH, 2, 2, 'FD')

    // Chart header
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text('Tren GMV Harian', marginX + 4, chartY + 6)

    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(148, 163, 184)
    doc.text('Dinamika fluktuasi nilai pembelian harian', marginX + 4, chartY + 10)

    // Chart Image
    doc.addImage(dailyTrendImg, 'JPEG', marginX + 2, chartY + 12, trendW - 4, chartH - 14)

    // Box 2 & 3: Side graphics (Status Doughnut & Top Performers Bar)
    if (statusChartImg || barChartImg) {
      const rightX = marginX + trendW + gap
      const miniH = (chartH - gap) / 2

      if (statusChartImg) {
        doc.setFillColor(255, 255, 255)
        doc.setDrawColor(226, 232, 240)
        doc.roundedRect(rightX, chartY, rightW, miniH, 2, 2, 'FD')

        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(30, 41, 59)
        doc.text(
          platform === 'semua' ? 'Pangsa Pasar GMV' : 'Distribusi Status Pesanan',
          rightX + 4,
          chartY + 5.5
        )

        doc.addImage(statusChartImg, 'JPEG', rightX + 2, chartY + 7.5, rightW - 4, miniH - 9.5)
      }

      if (barChartImg) {
        const barY = chartY + miniH + gap
        doc.setFillColor(255, 255, 255)
        doc.setDrawColor(226, 232, 240)
        doc.roundedRect(rightX, barY, rightW, miniH, 2, 2, 'FD')

        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(30, 41, 59)
        doc.text(
          platform === 'shopee'
            ? 'Top Affiliate (GMV)'
            : 'Top Kreator (GMV)',
          rightX + 4,
          barY + 5.5
        )

        doc.addImage(barChartImg, 'JPEG', rightX + 2, barY + 7.5, rightW - 4, miniH - 9.5)
      }
    }
  }

  // 5. Executive Highlights Mini-Tables (Bottom of Page 1)
  const highlightsY = 138

  if (platform === 'shopee') {
    // Promo summary table
    const promoMap = {}
    rows.forEach((r) => {
      const p = r.jenisPromo || 'Lainnya'
      if (!promoMap[p]) promoMap[p] = { count: 0, gmv: 0, exp: 0 }
      promoMap[p].count++
      promoMap[p].gmv += r.gmv || 0
      promoMap[p].exp += r.expense || 0
    })
    const promoRows = Object.entries(promoMap)
      .sort((a, b) => b[1].gmv - a[1].gmv)
      .slice(0, 4)
      .map(([p, d]) => [
        p,
        d.count.toLocaleString('id-ID'),
        formatRupiah(d.gmv),
        formatRupiah(d.exp),
        `${d.gmv > 0 ? ((d.exp / d.gmv) * 100).toFixed(1) : 0}%`,
        `${totalGmv > 0 ? ((d.gmv / totalGmv) * 100).toFixed(1) : 0}%`,
      ])

    // Top Products
    const prodMap = {}
    rows.forEach((r) => {
      const pr = r.namaProduk || 'Unknown'
      prodMap[pr] = (prodMap[pr] || 0) + (r.gmv || 0)
    })
    const prodRows = Object.entries(prodMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, gmvVal], i) => [
        `#${i + 1}`,
        name.length > 36 ? name.substring(0, 34) + '…' : name,
        formatRupiah(gmvVal),
        `${totalGmv > 0 ? ((gmvVal / totalGmv) * 100).toFixed(1) : 0}%`,
      ])

    // Render Table 1 (Left): Promo Breakdown
    autoTable(doc, {
      startY: highlightsY,
      margin: { left: marginX, right: pageWidth / 2 + 2 },
      head: [['Jenis Promo', 'Pesanan', 'GMV', 'Pengeluaran', 'Ratio', 'Share']],
      body: promoRows,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 6.8, fontStyle: 'bold', cellPadding: 1.5 },
      bodyStyles: { fontSize: 6.5, textColor: [30, 41, 59], cellPadding: 1.5 },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 16, halign: 'right' },
        2: { cellWidth: 26, halign: 'right' },
        3: { cellWidth: 24, halign: 'right' },
        4: { cellWidth: 16, halign: 'right' },
        5: { cellWidth: 16, halign: 'right' },
      },
    })

    // Render Table 2 (Right): Top 4 Products
    autoTable(doc, {
      startY: highlightsY,
      margin: { left: pageWidth / 2 + 4, right: marginX },
      head: [['Rank', 'Produk Terlaris', 'GMV (Rp)', 'Pangsa']],
      body: prodRows,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 6.8, fontStyle: 'bold', cellPadding: 1.5 },
      bodyStyles: { fontSize: 6.5, textColor: [30, 41, 59], cellPadding: 1.5 },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 70 },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 18, halign: 'right' },
      },
    })
  } else if (platform === 'tiktok') {
    // Model Komisi Breakdown
    const modelMap = {}
    rows.forEach((r) => {
      const m = r.commissionModel || 'Unknown'
      if (!modelMap[m]) modelMap[m] = { orders: new Set(), gmv: 0, exp: 0 }
      modelMap[m].orders.add(r.idPesanan)
      modelMap[m].gmv += r.gmv || 0
      modelMap[m].exp += r.expense || 0
    })
    const modelRows = Object.entries(modelMap)
      .sort((a, b) => b[1].gmv - a[1].gmv)
      .slice(0, 4)
      .map(([m, d]) => [
        m,
        d.orders.size.toLocaleString('id-ID'),
        formatRupiah(d.gmv),
        formatRupiah(d.exp),
        `${d.gmv > 0 ? ((d.exp / d.gmv) * 100).toFixed(1) : 0}%`,
      ])

    // Top Products
    const prodMap = {}
    rows.forEach((r) => {
      const pr = r.produk || 'Unknown'
      prodMap[pr] = (prodMap[pr] || 0) + (r.gmv || 0)
    })
    const prodRows = Object.entries(prodMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, gmvVal], i) => [
        `#${i + 1}`,
        name.length > 36 ? name.substring(0, 34) + '…' : name,
        formatRupiah(gmvVal),
        `${totalGmv > 0 ? ((gmvVal / totalGmv) * 100).toFixed(1) : 0}%`,
      ])

    autoTable(doc, {
      startY: highlightsY,
      margin: { left: marginX, right: pageWidth / 2 + 2 },
      head: [['Model Komisi', 'Pesanan', 'GMV', 'Pengeluaran', 'Ratio']],
      body: modelRows,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 6.8, fontStyle: 'bold', cellPadding: 1.5 },
      bodyStyles: { fontSize: 6.5, textColor: [30, 41, 59], cellPadding: 1.5 },
      columnStyles: {
        0: { cellWidth: 42 },
        1: { cellWidth: 18, halign: 'right' },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 24, halign: 'right' },
        4: { cellWidth: 18, halign: 'right' },
      },
    })

    autoTable(doc, {
      startY: highlightsY,
      margin: { left: pageWidth / 2 + 4, right: marginX },
      head: [['Rank', 'Produk Terlaris', 'GMV (Rp)', 'Pangsa']],
      body: prodRows,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 6.8, fontStyle: 'bold', cellPadding: 1.5 },
      bodyStyles: { fontSize: 6.5, textColor: [30, 41, 59], cellPadding: 1.5 },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 70 },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 18, halign: 'right' },
      },
    })
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PAGE 2+: COMPLETE DETAILED TRANSACTION LEDGER
  // ──────────────────────────────────────────────────────────────────────────

  onProgress?.('Menyusun rincian data transaksi detail…')

  doc.addPage('a4', 'landscape')

  // Top Accent Bar for Page 2
  doc.setFillColor(...brandColor)
  doc.rect(0, 0, pageWidth, 3, 'F')

  // Section Header
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text('Rincian Data Transaksi Detail', marginX, 12)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  doc.text(
    `Menampilkan ${rows.length.toLocaleString('id-ID')} baris transaksi · Periode: ${periodLabel} · Akun: ${account}${filterDesc ? ` · (${filterDesc})` : ''}`,
    marginX,
    17
  )

  if (platform === 'shopee') {
    const tableHeaders = [
      '#',
      'Kode Pesanan',
      'Status',
      'Waktu Pesanan',
      'Nama Produk',
      'Affiliate',
      'Promo',
      'GMV (Rp)',
      'Tipe',
      'Platform',
      'Pengeluaran (Rp)',
      'Waktu Potong',
    ]

    const tableData = rows.map((r, i) => [
      i + 1,
      r.kodePesanan || '—',
      r.statusPesanan || '—',
      r.waktuPesanan || '—',
      r.namaProduk || '—',
      r.namaAffiliate || '—',
      r.jenisPromo || '—',
      formatRupiah(r.gmv),
      r.tipePesanan || '—',
      r.platform || '—',
      formatRupiah(r.expense),
      r.waktuPemotongan || '—',
    ])

    const footRow = [
      '',
      'TOTAL',
      `${rows.length} Data`,
      '',
      '',
      '',
      '',
      formatRupiah(totalGmv),
      '',
      '',
      formatRupiah(totalExp),
      '',
    ]

    autoTable(doc, {
      startY: 21,
      margin: { left: marginX, right: marginX, top: 16, bottom: 16 },
      head: [tableHeaders],
      body: tableData,
      foot: [footRow],
      theme: 'striped',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.2,
        cellPadding: 2,
      },
      bodyStyles: {
        fontSize: 6.8,
        textColor: [30, 41, 59],
        cellPadding: 1.8,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 7.2,
        cellPadding: 2,
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 26, font: 'courier' },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 24, fontSize: 6.2 },
        4: { cellWidth: 54 },
        5: { cellWidth: 28 },
        6: { cellWidth: 22 },
        7: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
        8: { cellWidth: 16 },
        9: { cellWidth: 14 },
        10: { cellWidth: 24, halign: 'right' },
        11: { cellWidth: 20, fontSize: 6.2 },
      },
    })
  } else if (platform === 'tiktok') {
    const tableHeaders = [
      '#',
      'ID Pesanan',
      'Nama Produk',
      'ID SKU',
      'Status',
      'Kreator',
      'Konten',
      'Model Komisi',
      '% Komisi',
      'GMV (Rp)',
      'Pengeluaran (Rp)',
      'Waktu Bayar',
      'Komisi Dibayar',
    ]

    const tableData = rows.map((r, i) => [
      i + 1,
      r.idPesanan || '—',
      r.produk || '—',
      r.idSku ? (r.idSku.length > 12 ? r.idSku.substring(0, 10) + '…' : r.idSku) : '—',
      r.status || '—',
      r.kreator || '—',
      r.jenisKonten || '—',
      r.commissionModel || '—',
      r.persentaseKomisi || '—',
      formatRupiah(r.gmv),
      formatRupiah(r.expense),
      formatDateDisplay(r.waktuPembayaran),
      formatDateDisplay(r.waktuKomisiDibayar),
    ])

    const footRow = [
      '',
      'TOTAL',
      `${rows.length} Data`,
      '',
      '',
      '',
      '',
      '',
      '',
      formatRupiah(totalGmv),
      formatRupiah(totalExp),
      '',
      '',
    ]

    autoTable(doc, {
      startY: 21,
      margin: { left: marginX, right: marginX, top: 16, bottom: 16 },
      head: [tableHeaders],
      body: tableData,
      foot: [footRow],
      theme: 'striped',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.2,
        cellPadding: 2,
      },
      bodyStyles: {
        fontSize: 6.8,
        textColor: [30, 41, 59],
        cellPadding: 1.8,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 7.2,
        cellPadding: 2,
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 26, font: 'courier' },
        2: { cellWidth: 50 },
        3: { cellWidth: 16, fontSize: 6.2 },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 24 },
        6: { cellWidth: 16 },
        7: { cellWidth: 22 },
        8: { cellWidth: 14, halign: 'right' },
        9: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
        10: { cellWidth: 25, halign: 'right' },
        11: { cellWidth: 20, fontSize: 6.2 },
        12: { cellWidth: 20, fontSize: 6.2 },
      },
    })
  } else {
    // Semua: Show transaction list or accounts table
    const tableHeaders = [
      '#',
      'Platform',
      'ID / Kode Pesanan',
      'Produk',
      'Affiliate / Kreator',
      'Status',
      'GMV (Rp)',
      'Pengeluaran (Rp)',
    ]

    const tableData = rows.map((r, i) => [
      i + 1,
      r.platform || '—',
      r.kodePesanan || r.idPesanan || '—',
      r.namaProduk || r.produk || '—',
      r.namaAffiliate || r.kreator || '—',
      r.statusPesanan || r.status || '—',
      formatRupiah(r.gmv),
      formatRupiah(r.expense),
    ])

    const footRow = [
      '',
      'TOTAL',
      `${rows.length} Transaksi`,
      '',
      '',
      '',
      formatRupiah(totalGmv),
      formatRupiah(totalExp),
    ]

    autoTable(doc, {
      startY: 21,
      margin: { left: marginX, right: marginX, top: 16, bottom: 16 },
      head: [tableHeaders],
      body: tableData,
      foot: [footRow],
      theme: 'striped',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
        cellPadding: 2,
      },
      bodyStyles: {
        fontSize: 7,
        textColor: [30, 41, 59],
        cellPadding: 1.8,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 7.5,
        cellPadding: 2,
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 24 },
        2: { cellWidth: 35, font: 'courier' },
        3: { cellWidth: 70 },
        4: { cellWidth: 35 },
        5: { cellWidth: 25, halign: 'center' },
        6: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
        7: { cellWidth: 35, halign: 'right' },
      },
    })
  }

  // ──────────────────────────────────────────────────────────────────────────
  // UNIVERSAL FOOTER & PAGE NUMBERING ON ALL PAGES
  // ──────────────────────────────────────────────────────────────────────────

  onProgress?.('Menyelesaikan dokumen PDF…')

  const totalPages = doc.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)

    // Divider line
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.3)
    doc.line(marginX, pageHeight - 9, pageWidth - marginX, pageHeight - 9)

    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(148, 163, 184)
    doc.text('TMS Sales Dashboard · Laporan Resmi Affiliate', marginX, pageHeight - 5)
    doc.text('Data Rahasia — Khusus Penggunaan Internal Tim', pageWidth / 2, pageHeight - 5, {
      align: 'center',
    })
    doc.text(`Halaman ${p} dari ${totalPages}`, pageWidth - marginX, pageHeight - 5, {
      align: 'right',
    })
  }

  const fileName = `Laporan-Affiliate-${platform}-${safeFileStr(periodLabel)}-${safeFileStr(account)}`
  doc.save(`${fileName}.pdf`)
}
