import { put, del, head } from '@vercel/blob'

const INDEX_PATH = 'periods/index.json'
const MASTER_BARANG_PATH = 'master-barang/data.json'
const PRODUK_INDEX_PATH = 'produk-periods/index.json'

// ─── Helper ──────────────────────────────────────────────────────────────────

function periodPath(id) {
  return `periods/${id}.json`
}

function produkPeriodPath(id) {
  return `produk-periods/${id}.json`
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

// ─── Master barang (katalog produk — satu file, selalu ditimpa) ──────────────
// Beda dari data penjualan/produk terlaris: tidak terikat periode sama sekali.
// Tiap upload baru menggantikan seluruhnya, tidak ada riwayat versi sebelumnya.

export async function getMasterBarang() {
  return readJson(MASTER_BARANG_PATH)
  // Bentuk: { map: { kode: nama, ... }, count, fileName, updatedAt } | null
}

export async function saveMasterBarang({ map, count, fileName }) {
  const data = { map, count, fileName: fileName || null, updatedAt: new Date().toISOString() }
  await writeJson(MASTER_BARANG_PATH, data)
  return data
}

// ─── Produk terlaris (periode terpisah dari periode data penjualan) ─────────
// Sengaja dipisah dari periods/ di atas: rentang tanggal produk terlaris tidak
// selalu sama dengan rentang tanggal upload data penjualan.

export async function getProdukPeriodIndex() {
  const index = await readJson(PRODUK_INDEX_PATH)
  return index || []
  // Bentuk: [{ id, label, uploadedAt, dateRange }, ...] — terbaru duluan.
}

async function saveProdukPeriodIndex(index) {
  await writeJson(PRODUK_INDEX_PATH, index)
}

export async function saveProdukPeriod({ id, label, analysis, fileName }) {
  const now = new Date().toISOString()

  await writeJson(produkPeriodPath(id), { analysis, fileName: fileName || null, savedAt: now })

  const index = await getProdukPeriodIndex()
  const existing = index.findIndex((p) => p.id === id)
  const entry = {
    id,
    label,
    uploadedAt: now,
    dateRange: analysis.periodLabel || '',
  }

  if (existing !== -1) {
    index[existing] = entry
  } else {
    index.unshift(entry)
  }

  await saveProdukPeriodIndex(index)
  return entry
}

export async function getProdukPeriod(id) {
  return readJson(produkPeriodPath(id))
  // Bentuk: { analysis, fileName, savedAt }
}

export async function deleteProdukPeriod(id) {
  try {
    await del(produkPeriodPath(id))
  } catch {
    // Blob mungkin sudah tidak ada — lanjut saja
  }
  const index = await getProdukPeriodIndex()
  const updated = index.filter((p) => p.id !== id)
  await saveProdukPeriodIndex(updated)
}

export async function getLatestProdukAnalysis() {
  const index = await getProdukPeriodIndex()
  if (!index.length) return null
  const latest = index[0]
  const data = await getProdukPeriod(latest.id)
  if (!data) return null
  return { ...data, uploadedAt: latest.uploadedAt, periodId: latest.id, periodLabel: latest.label }
}
