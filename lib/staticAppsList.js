// Metadata daftar app statis — dipisah dari lib/staticApps.js supaya file ini
// bisa diimport dari client component (page list) tanpa ikut menarik `fs`/`path`
// yang cuma boleh jalan di server.

export const APPS = {
  'live-report': {
    file: 'live-report.html',
    title: 'Live Report',
    desc: 'Shift report dial & ringkasan real-time dari file yang diupload.',
  },
  'product-catalog': {
    file: 'product-catalog.html',
    title: 'Katalog Produk',
    desc: 'Susun & filter katalog produk dari data Excel.',
  },
  'rekap-sku-induk': {
    file: 'rekap-sku-induk.html',
    title: 'Rekap SKU Induk',
    desc: 'Gabungkan ekspor Produk Terlaris jadi rekap per SKU induk (varian dijumlahkan).',
  },
  'sku-image-stock-merger': {
    file: 'sku-image-stock-merger.html',
    title: 'Penggabung SKU · Gambar · Stok',
    desc: 'Gabungkan ekspor info produk Shopee (SKU + stok) dengan ekspor info media (link gambar) jadi satu file SKU/GAMBAR/STOK siap upload di Produk Terlaris.',
  },
  'ig-comment-report': {
    file: 'ig-comment-report.html',
    title: 'Laporan Komentar Instagram',
    desc: 'Ubah file ekspor "Post comments" Instagram (Unduh Informasi Anda, format HTML) jadi laporan Excel rapi — siap dikirim ke atasan.',
  },
  'marketplace-stock-reconcile': {
    file: 'marketplace-stock-reconcile.html',
    title: 'Marketplace Stock Reconcile',
    desc: 'Tarik harga & stok dari file referensi dan terapkan ke template marketplace berdasarkan SKU, dengan opsi split output.',
  },
  'affiliate-dashboard': {
    file: 'affiliate-dashboard.html',
    title: 'Affiliate Dashboard',
    desc: 'Unified Shopee & TikTok Shop affiliate analytics dashboard dari upload file laporan CSV/Excel.',
  },
}

export const STATIC_APPS_LIST = Object.entries(APPS).map(([slug, meta]) => ({
  slug,
  title: meta.title,
  desc: meta.desc,
}))
