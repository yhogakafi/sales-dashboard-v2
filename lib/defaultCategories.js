// Pemetaan kategori default berdasarkan nama brand (bagian setelah "PLATFORM / ").
// Dipakai sebagai tebakan awal saat file baru di-upload — tetap bisa diubah manual
// lewat tombol kategori di tabel "Tandai kategori pelanggan penagihan".
export const DEFAULT_BRAND_CATEGORY = {
  'SCELTA': 'Online Underwear',
  'GRAPE': 'Online Underwear',
  'GROSIR DALAMANKU': 'Online Underwear',
  'TAFT': 'Online Underwear',
  'RASENDRIYA': 'Online Underwear',

  'SHINE PAJAMAS': 'Online Sport',
  'ACTIVE WEAR': 'Online Sport',
  'INSPORT IDN': 'Online Sport',
  'SHINE SPORT': 'Online Sport',
  'INGAT FASHION': 'Online Sport',
  'THE PEACH & CO': 'Online Sport',
}

/**
 * Bangun objek kategori default untuk daftar pelanggan penagihan (format "PLATFORM / BRAND").
 * Brand yang tidak ada di mapping akan dilewati (tidak dikategorikan), bukan dipaksa salah satu.
 */
export function buildDefaultCategories(customers) {
  const result = {}
  for (const customer of customers) {
    const slashIndex = customer.indexOf(' / ')
    const brand = slashIndex === -1 ? customer : customer.slice(slashIndex + 3).trim()
    const category = DEFAULT_BRAND_CATEGORY[brand]
    if (category) result[customer] = category
  }
  return result
}
