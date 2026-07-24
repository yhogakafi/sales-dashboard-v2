/**
 * Storage layer for "barang terlaris" (best-selling products) data.
 * Uses a separate namespace from the main sales periods so the two
 * can be managed, uploaded, and deleted independently.
 *
 * Blob structure:
 *   barang-terlaris/index.json          ← list of periods
 *   barang-terlaris/<id>.json           ← per-period data
 */

import { put, del, head } from '@vercel/blob'

const INDEX_PATH = 'barang-terlaris/index.json'

function periodPath(id) {
  return `barang-terlaris/${id}.json`
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

// ─── Index (list of periods) ──────────────────────────────────────────────────

export async function getBTPeriodIndex() {
  const index = await readJson(INDEX_PATH)
  return index || []
  // Shape: [{ id, label, uploadedAt, dateRange }, ...]  newest first
}

async function saveBTPeriodIndex(index) {
  await writeJson(INDEX_PATH, index)
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function saveBTPeriod({ id, label, analysis, fileName }) {
  const now = new Date().toISOString()

  await writeJson(periodPath(id), { analysis, fileName, savedAt: now })

  const index = await getBTPeriodIndex()
  const existing = index.findIndex(p => p.id === id)
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

  await saveBTPeriodIndex(index)
  return entry
}

export async function getBTPeriod(id) {
  return readJson(periodPath(id))
  // Shape: { analysis, fileName, savedAt }
}

export async function deleteBTPeriod(id) {
  try {
    await del(periodPath(id))
  } catch {
    // already gone — continue
  }
  const index = await getBTPeriodIndex()
  await saveBTPeriodIndex(index.filter(p => p.id !== id))
}

export async function getLatestBTPeriod() {
  const index = await getBTPeriodIndex()
  if (!index.length) return null
  const latest = index[0]
  const data = await getBTPeriod(latest.id)
  if (!data) return null
  return { ...data, uploadedAt: latest.uploadedAt, periodId: latest.id, periodLabel: latest.label }
}
