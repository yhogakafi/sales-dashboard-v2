import fs from 'fs'
import path from 'path'

const LOCAL_DATA_DIR = path.join(process.cwd(), '.data', 'affiliate')
fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true })

// Helper to format date
function pad(n) { return String(n).padStart(2, '0') }

// 1. Shopee June Data (Account: Scelta Official)
const shopeeJuneRows1 = []
const shopeeProducts = [
  'Scelta Seamless Briefs Men (Isi 3)',
  'Scelta Sport Bra High Impact Support',
  'Scelta Boxer Celana Dalam Pria Katun',
  'Scelta Tank Top Ribbed Cotton Basic',
  'Scelta Legging Olahraga Wanita Elastis',
  'Scelta Bra Tanpa Kawat Comfort Fit'
]
const shopeeAffiliates = [
  'racun_fashion_hitz',
  'daily_ootd_indo',
  'spill_racun_murah',
  'style_ootd_kekinian',
  'outfit_harian_id',
  'bunda_smart_shopping'
]
const shopeePromos = ['Komisi Ekstra', 'Flash Sale Affiliate', 'Voucher Toko', 'Affiliate Reguler']
const shopeeStatuses = ['Selesai', 'Selesai', 'Selesai', 'Selesai', 'Dibatalkan', 'Sedang Dikirim']
const shopeeTypes = ['Shopee Live', 'Shopee Video', 'Showcase Produk']
const shopeePlats = ['Android App', 'iOS App', 'Web Platform']

for (let i = 1; i <= 35; i++) {
  const day = (i % 28) + 1
  const gmv = Math.round((45000 + (i * 17500) % 180000) / 1000) * 1000
  const exp = Math.round(gmv * (0.08 + (i % 5) * 0.01))
  const dStr = `2026-06-${pad(day)} 14:${pad((i * 7) % 60)}:00`
  const dIso = new Date(`2026-06-${pad(day)}T14:${pad((i * 7) % 60)}:00`).toISOString()

  shopeeJuneRows1.push({
    kodePesanan: `2606${pad(day)}SP${pad(i)}XYZ`,
    statusPesanan: shopeeStatuses[i % shopeeStatuses.length],
    waktuPesanan: dStr,
    waktuPesananTerverifikasi: dStr,
    idModel: `MDL-${1000 + i}`,
    namaProduk: shopeeProducts[i % shopeeProducts.length],
    namaAffiliate: shopeeAffiliates[i % shopeeAffiliates.length],
    usernameAffiliate: `@${shopeeAffiliates[i % shopeeAffiliates.length]}`,
    jenisPromo: shopeePromos[i % shopeePromos.length],
    gmv,
    tipePesanan: shopeeTypes[i % shopeeTypes.length],
    platform: shopeePlats[i % shopeePlats.length],
    expense: exp,
    waktuPemotongan: dStr,
    dateIso: dIso,
    monthKey: '2026-06'
  })
}

// 2. Shopee June Data (Account: Scelta Sport Official)
const shopeeJuneRows2 = []
for (let i = 1; i <= 20; i++) {
  const day = (i % 28) + 1
  const gmv = Math.round((75000 + (i * 22000) % 220000) / 1000) * 1000
  const exp = Math.round(gmv * 0.1)
  const dStr = `2026-06-${pad(day)} 10:${pad((i * 9) % 60)}:00`
  const dIso = new Date(`2026-06-${pad(day)}T10:${pad((i * 9) % 60)}:00`).toISOString()

  shopeeJuneRows2.push({
    kodePesanan: `2606${pad(day)}SPORT${pad(i)}`,
    statusPesanan: 'Selesai',
    waktuPesanan: dStr,
    waktuPesananTerverifikasi: dStr,
    idModel: `SPORT-${2000 + i}`,
    namaProduk: 'Scelta Sport Pro Series Compression',
    namaAffiliate: shopeeAffiliates[(i + 2) % shopeeAffiliates.length],
    usernameAffiliate: `@aff_sport_${i}`,
    jenisPromo: 'Komisi Ekstra',
    gmv,
    tipePesanan: 'Shopee Video',
    platform: 'Android App',
    expense: exp,
    waktuPemotongan: dStr,
    dateIso: dIso,
    monthKey: '2026-06'
  })
}

// 3. TikTok June Data (Account: Scelta TikTok Shop)
const tiktokJuneRows = []
const tiktokCreators = ['@fashion_cantik', '@review_outfit', '@bunda_ootd', '@seleb_racun', '@gym_fit_indo']
const tiktokContents = ['Siaran LIVE', 'Video Singkat', 'Showcase Produk']
const tiktokModels = ['Komisi Terbuka', 'Komisi Terbuka', 'Komisi Bertarget']
const tiktokStatuses = ['Sudah dibayar', 'Sudah dibayar', 'Dalam proses', 'Sudah dibayar']

for (let i = 1; i <= 40; i++) {
  const day = (i % 28) + 1
  const gmv = Math.round((50000 + (i * 19000) % 250000) / 1000) * 1000
  const exp = Math.round(gmv * (0.07 + (i % 4) * 0.01))
  const dIso = new Date(`2026-06-${pad(day)}T11:${pad((i * 5) % 60)}:00`).toISOString()
  const pIso = new Date(`2026-06-${pad(day)}T09:00:00`).toISOString()

  tiktokJuneRows.push({
    idPesanan: `5789${pad(day)}${pad(i)}123456`,
    produk: shopeeProducts[i % shopeeProducts.length],
    idSku: `SKU-TT-${3000 + i}`,
    status: tiktokStatuses[i % tiktokStatuses.length],
    kreator: tiktokCreators[i % tiktokCreators.length],
    jenisKonten: tiktokContents[i % tiktokContents.length],
    commissionModel: tiktokModels[i % tiktokModels.length],
    persentaseKomisi: `${Math.round((exp / gmv) * 100)}%`,
    gmv,
    expense: exp,
    waktuPembayaran: pIso,
    waktuKomisiDibayar: dIso,
    monthKey: '2026-06',
    platform: 'TikTok Shop'
  })
}

function calcStats(rows, orderKey) {
  const orders = new Set(rows.map(r => r[orderKey])).size
  const gmv = rows.reduce((s, r) => s + r.gmv, 0)
  const expense = rows.reduce((s, r) => s + r.expense, 0)
  const ratio = gmv > 0 ? (expense / gmv) * 100 : 0
  return { orders, gmv, expense, ratio: Number(ratio.toFixed(2)) }
}

const entries = [
  {
    id: 'shopee_juni-2026_scelta-official',
    platform: 'shopee',
    periodId: 'juni-2026',
    periodLabel: 'Juni 2026',
    monthKey: '2026-06',
    account: 'Scelta Official',
    fileName: 'Laporan_Komisi_Shopee_Juni_2026.xlsx',
    rowCount: shopeeJuneRows1.length,
    stats: calcStats(shopeeJuneRows1, 'kodePesanan'),
    uploadedAt: new Date().toISOString(),
    rows: shopeeJuneRows1
  },
  {
    id: 'shopee_juni-2026_scelta-sport-official',
    platform: 'shopee',
    periodId: 'juni-2026',
    periodLabel: 'Juni 2026',
    monthKey: '2026-06',
    account: 'Scelta Sport Official',
    fileName: 'Laporan_Komisi_Shopee_Sport_Juni.xlsx',
    rowCount: shopeeJuneRows2.length,
    stats: calcStats(shopeeJuneRows2, 'kodePesanan'),
    uploadedAt: new Date().toISOString(),
    rows: shopeeJuneRows2
  },
  {
    id: 'tiktok_juni-2026_scelta-tiktok-shop',
    platform: 'tiktok',
    periodId: 'juni-2026',
    periodLabel: 'Juni 2026',
    monthKey: '2026-06',
    account: 'Scelta TikTok Shop',
    fileName: 'Settlement_TikTok_Juni_2026.xlsx',
    rowCount: tiktokJuneRows.length,
    stats: calcStats(tiktokJuneRows, 'idPesanan'),
    uploadedAt: new Date().toISOString(),
    rows: tiktokJuneRows
  }
]

// Write individual files
entries.forEach(e => {
  fs.writeFileSync(path.join(LOCAL_DATA_DIR, `${e.id}.json`), JSON.stringify(e, null, 2), 'utf-8')
})

// Write index
const indexData = entries.map(({ rows, ...meta }) => meta)
fs.writeFileSync(path.join(LOCAL_DATA_DIR, 'index.json'), JSON.stringify(indexData, null, 2), 'utf-8')

console.log('Successfully seeded sample affiliate data!')
