/**
 * Storage layer untuk data stock (underwear & sport).
 * Tidak ada sistem periode — setiap upload menimpa data sebelumnya.
 *
 * Blob structure:
 *   stock/underwear.json   ← data stock underwear terkini
 *   stock/sport.json       ← data stock sport terkini
 *   stock/meta.json        ← metadata (kapan masing-masing diupload)
 */

import { put, head } from '@vercel/blob'

const UNDERWEAR_PATH = 'stock/underwear.json'
const SPORT_PATH     = 'stock/sport.json'
const META_PATH      = 'stock/meta.json'

function stockPath(type) {
  return type === 'underwear' ? UNDERWEAR_PATH : SPORT_PATH
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

// ─── Meta (timestamp upload per type) ────────────────────────────────────────

async function getMeta() {
  return (await readJson(META_PATH)) || {}
  // Shape: { underwear: { uploadedAt, fileName }, sport: { uploadedAt, fileName } }
}

async function saveMeta(meta) {
  await writeJson(META_PATH, meta)
}

// ─── Save stock data ──────────────────────────────────────────────────────────

/**
 * Simpan data stock. type = 'underwear' | 'sport'
 * stockMap: { [kodeBarang]: { brand, stock } }
 */
export async function saveStock({ type, stockMap, fileName }) {
  const now = new Date().toISOString()
  await writeJson(stockPath(type), { stockMap, savedAt: now })

  const meta = await getMeta()
  meta[type] = { uploadedAt: now, fileName: fileName || null }
  await saveMeta(meta)

  return { type, uploadedAt: now }
}

// ─── Get stock data ───────────────────────────────────────────────────────────

/**
 * Ambil stockMap gabungan dari underwear + sport.
 * Sport menimpa underwear jika ada kode yang sama (edge case).
 * Returns: { [kodeBarang]: { brand, stock }, meta }
 */
export async function getAllStock() {
  const [uwData, spData, meta] = await Promise.all([
    readJson(UNDERWEAR_PATH),
    readJson(SPORT_PATH),
    getMeta(),
  ])

  const combined = {}
  if (uwData?.stockMap) Object.assign(combined, uwData.stockMap)
  if (spData?.stockMap) Object.assign(combined, spData.stockMap)

  return { stockMap: combined, meta }
}

export async function getStockMeta() {
  return getMeta()
}
