import { put, head } from '@vercel/blob'
import fs from 'fs'
import path from 'path'

// Dua file terpisah — underwear dan sport — masing-masing ditimpa saat upload baru.
// Tidak ada sistem periode untuk stock; selalu hanya satu versi terbaru.
const PATHS = {
  underwear: 'stock/underwear.json',
  sport:     'stock/sport.json',
}

const LOCAL_DATA_DIR = path.join(process.cwd(), '.data', 'stock')

function isBlobConfigured() {
  return !!process.env.BLOB_READ_WRITE_TOKEN
}

function localFilePath(blobPath) {
  const rel = blobPath.replace(/^stock[/\\]/, '')
  return path.join(LOCAL_DATA_DIR, rel)
}

async function readJson(p) {
  if (isBlobConfigured()) {
    try {
      const meta = await head(p)
      if (meta?.url) {
        const res = await fetch(`${meta.url}?t=${Date.now()}`, { cache: 'no-store' })
        if (res.ok) return await res.json()
      }
    } catch {
      // fallback to local
    }
  }

  try {
    const loc = localFilePath(p)
    if (fs.existsSync(loc)) {
      const raw = await fs.promises.readFile(loc, 'utf-8')
      return JSON.parse(raw)
    }
  } catch {
    // ignore
  }
  return null
}

async function writeJson(p, data) {
  try {
    const loc = localFilePath(p)
    await fs.promises.mkdir(path.dirname(loc), { recursive: true })
    await fs.promises.writeFile(loc, JSON.stringify(data, null, 2), 'utf-8')
  } catch (err) {
    console.error('Failed to write local stock json:', err)
  }

  if (isBlobConfigured()) {
    return put(p, JSON.stringify(data), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    })
  }
  return { url: '' }
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

// ─── Get lookup untuk SATU tipe saja (dipakai client biar tiap request kecil) ──
// Kenapa dipisah: kalau digabung jadi satu response, total ukurannya bisa
// kelewat batas 4.5MB response Vercel Function begitu salah satu file (mis.
// underwear) sudah puluhan ribu SKU. Client yang gabungin dua response kecil
// ini sendiri, tidak ada batas ukuran di sisi browser.
export async function getStockLookupByType(type) {
  if (!PATHS[type]) throw new Error(`Tipe tidak valid: ${type}. Gunakan 'underwear' atau 'sport'.`)
  const data = await readJson(PATHS[type])
  const byKodePenuh = {}
  if (data?.byKodePenuh) {
    for (const [kode, entry] of Object.entries(data.byKodePenuh)) {
      byKodePenuh[kode] = { ...entry, source: type }
    }
  }
  return { byKodePenuh, exists: !!data, count: data?.count ?? 0 }
}

// ─── Get merged lookup (dipakai halaman admin / kebutuhan server-side lain) ────

export async function getStockLookup() {
  const [underwear, sport] = await Promise.all([
    readJson(PATHS.underwear),
    readJson(PATHS.sport),
  ])

  // Gabung keduanya jadi satu lookup byKodePenuh. Setiap entry ditandai `source`
  // ('underwear' atau 'sport') supaya halaman Produk Terlaris bisa membatasi SKU
  // yang ditampilkan sesuai kategori (pill Online Underwear / Online Sport) —
  // bukan cuma memfilter data penjualannya saja.
  // Kalau kode yang sama ada di dua file (tidak seharusnya terjadi),
  // ambil yang pertama ditemukan (underwear menang).
  const merged = {}
  if (sport?.byKodePenuh) {
    for (const [kode, data] of Object.entries(sport.byKodePenuh)) {
      merged[kode] = { ...data, source: 'sport' }
    }
  }
  if (underwear?.byKodePenuh) {
    for (const [kode, data] of Object.entries(underwear.byKodePenuh)) {
      merged[kode] = { ...data, source: 'underwear' } // underwear menang jika ada konflik
    }
  }

  return {
    byKodePenuh: merged,
    hasUnderwear: !!underwear?.byKodePenuh,
    hasSport:     !!sport?.byKodePenuh,
  }
}
