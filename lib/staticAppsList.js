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
}

export const STATIC_APPS_LIST = Object.entries(APPS).map(([slug, meta]) => ({
  slug,
  title: meta.title,
  desc: meta.desc,
}))
