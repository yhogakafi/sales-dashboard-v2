import * as XLSX from 'xlsx'
import path from 'path'

// 1. Create Shopee Sample Excel
const shopeeRows = [
  {
    'Kode Pesanan': '260701SH01',
    'Status Pesanan': 'Selesai',
    'Waktu Pesanan': '2026-07-01 10:15:00',
    'Waktu Pesanan Terverifikasi': '2026-07-01 10:20:00',
    'ID Model': 'MDL-01',
    'Nama Produk': 'Scelta Celana Dalam Pria Katun Combed',
    'Nama Affiliate': 'fashion_style_id',
    'Username Affiliate': '@fashion_style',
    'Jenis Promo': 'Komisi Ekstra',
    'Nilai Pembelian(Rp)': '85000',
    'Tipe Pesanan': 'Shopee Video',
    'Platform': 'Android App',
    'Pengeluaran(Rp)': '8500',
    'Waktu Pemotongan': '2026-07-01 10:30:00'
  },
  {
    'Kode Pesanan': '260702SH02',
    'Status Pesanan': 'Selesai',
    'Waktu Pesanan': '2026-07-02 12:00:00',
    'Waktu Pesanan Terverifikasi': '2026-07-02 12:05:00',
    'ID Model': 'MDL-02',
    'Nama Produk': 'Scelta Sports Bra Seamless',
    'Nama Affiliate': 'daily_review_hitz',
    'Username Affiliate': '@daily_review',
    'Jenis Promo': 'Voucher Toko',
    'Nilai Pembelian(Rp)': '120000',
    'Tipe Pesanan': 'Shopee Live',
    'Platform': 'iOS App',
    'Pengeluaran(Rp)': '12000',
    'Waktu Pemotongan': '2026-07-02 12:15:00'
  }
]

const shopeeWb = XLSX.utils.book_new()
const shopeeWs = XLSX.utils.json_to_sheet(shopeeRows)
XLSX.utils.book_append_sheet(shopeeWb, shopeeWs, 'Orders')
XLSX.writeFile(shopeeWb, path.join(process.cwd(), 'scratch', 'sample_shopee_juli.xlsx'))

// 2. Create TikTok Sample Excel with multiple months in Waktu Komisi Dibayar!
const tiktokRows = [
  {
    'ID Pesanan': 'TT260601001',
    'Produk': 'Scelta Seamless Briefs',
    'ID SKU': 'SKU-001',
    'Status Pesanan': 'Sudah dibayar',
    'Nama pengguna kreator': '@kreator_juni',
    'Jenis Konten': 'Video Singkat',
    'commission model': 'Komisi Terbuka',
    'Persentase komisi standar': '10%',
    'Acuan Komisi Aktual': '95000',
    'Pembayaran Komisi Aktual': '9500',
    'Waktu Pembayaran': '2026-06-05 10:00:00',
    'Waktu Komisi Dibayar': '2026-06-08 14:00:00',
    'Platform': 'TikTok Shop'
  },
  {
    'ID Pesanan': 'TT260701002',
    'Produk': 'Scelta Sports Legging',
    'ID SKU': 'SKU-002',
    'Status Pesanan': 'Sudah dibayar',
    'Nama pengguna kreator': '@kreator_juli',
    'Jenis Konten': 'Siaran LIVE',
    'commission model': 'Komisi Bertarget',
    'Persentase komisi standar': '12%',
    'Acuan Komisi Aktual': '150000',
    'Pembayaran Komisi Aktual': '18000',
    'Waktu Pembayaran': '2026-07-02 11:00:00',
    'Waktu Komisi Dibayar': '2026-07-05 16:00:00',
    'Platform': 'TikTok Shop'
  }
]

const tiktokWb = XLSX.utils.book_new()
const tiktokWs = XLSX.utils.json_to_sheet(tiktokRows)
XLSX.utils.book_append_sheet(tiktokWb, tiktokWs, 'Settlement')
XLSX.writeFile(tiktokWb, path.join(process.cwd(), 'scratch', 'sample_tiktok_multimonth.xlsx'))

console.log('Sample excel files created successfully!')
