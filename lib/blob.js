import { put, del, head } from '@vercel/blob'

const INDEX_PATH = 'periods/index.json'

// ─── Helper ──────────────────────────────────────────────────────────────────

function periodPath(id) {
  return `periods/${id}.json`
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

// ─── Index (daftar periode) ───────────────────────────────────────────────────

export async function getPeriodIndex() {
  const index = await readJson(INDEX_PATH)
  return index || []
  // Bentuk: [{ id, label, uploadedAt, dateRange }, ...]
  // Diurutkan dari terbaru ke terlama (berdasarkan uploadedAt).
}

async function savePeriodIndex(index) {
  await writeJson(INDEX_PATH, index)
}

// ─── CRUD Periode ─────────────────────────────────────────────────────────────

export async function savePeriod({ id, label, analysis, categories, fileName }) {
  const now = new Date().toISOString()

  // Simpan data periode
  await writeJson(periodPath(id), { analysis, categories: categories || {}, fileName, savedAt: now })

  // Update index
  const index = await getPeriodIndex()
  const existing = index.findIndex((p) => p.id === id)
  const entry = {
    id,
    label,
    uploadedAt: now,
    dateRange: analysis.periodLabel || '',
  }

  if (existing !== -1) {
    index[existing] = entry // timpa entri lama
  } else {
    index.unshift(entry) // tambah di depan (terbaru duluan)
  }

  await savePeriodIndex(index)
  return entry
}

export async function getPeriod(id) {
  return readJson(periodPath(id))
  // Bentuk: { analysis, categories, fileName, savedAt }
}

export async function deletePeriod(id) {
  // Hapus file data periode
  try {
    await del(periodPath(id))
  } catch {
    // Blob mungkin sudah tidak ada — lanjut saja
  }

  // Hapus dari index
  const index = await getPeriodIndex()
  const updated = index.filter((p) => p.id !== id)
  await savePeriodIndex(updated)
}

// ─── Legacy: getLatestAnalysis (untuk kompatibilitas sementara) ───────────────

export async function getLatestAnalysis() {
  const index = await getPeriodIndex()
  if (!index.length) return null
  const latest = index[0]
  const data = await getPeriod(latest.id)
  if (!data) return null
  return { ...data, uploadedAt: latest.uploadedAt, periodId: latest.id, periodLabel: latest.label }
}
