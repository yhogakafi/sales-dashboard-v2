import { put, head } from '@vercel/blob'

// Dua file terpisah — underwear dan sport — masing-masing ditimpa saat upload baru.
// Tidak ada sistem periode untuk stock; selalu hanya satu versi terbaru.
const PATHS = {
  underwear: 'stock/underwear.json',
  sport:     'stock/sport.json',
}

async function readJson(path) {
  let meta
  try {
    meta = await head(path)
  } catch {
    return null
  }
  if (!meta?.url) return null
  const res = await fetch(`${meta.url}?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) return null
  return res.json()
}

async function writeJson(path, data) {
  return put(path, JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  })
}

// ─── Save ────────────────────────────────────────────────────────────────────

export async function saveStock(type, byKodePenuh, count) {
  if (!PATHS[type]) throw new Error(`Tipe tidak valid: ${type}. Gunakan 'underwear' atau 'sport'.`)
  const now = new Date().toISOString()
  await writeJson(PATHS[type], { byKodePenuh, count, savedAt: now })
  return { type, count, savedAt: now }
}

// ─── Get status (untuk halaman admin) ─────────────────────────────────────────

export async function getStockStatus() {
  const [underwear, sport] = await Promise.all([
    readJson(PATHS.underwear),
    readJson(PATHS.sport),
  ])
  return {
    underwear: underwear
      ? { exists: true, count: underwear.count, savedAt: underwear.savedAt }
      : { exists: false },
    sport: sport
      ? { exists: true, count: sport.count, savedAt: sport.savedAt }
      : { exists: false },
  }
}

// ─── Get merged lookup (untuk halaman produk terlaris) ────────────────────────

export async function getStockLookup() {
  const [underwear, sport] = await Promise.all([
    readJson(PATHS.underwear),
    readJson(PATHS.sport),
  ])

  // Gabung keduanya jadi satu lookup byKodePenuh.
  // Kalau kode yang sama ada di dua file (tidak seharusnya terjadi),
  // ambil yang pertama ditemukan (underwear menang).
  const merged = {}
  if (sport?.byKodePenuh) {
    for (const [kode, data] of Object.entries(sport.byKodePenuh)) {
      merged[kode] = data
    }
  }
  if (underwear?.byKodePenuh) {
    for (const [kode, data] of Object.entries(underwear.byKodePenuh)) {
      merged[kode] = data // underwear menang jika ada konflik
    }
  }

  return {
    byKodePenuh: merged,
    hasUnderwear: !!underwear?.byKodePenuh,
    hasSport:     !!sport?.byKodePenuh,
  }
}
