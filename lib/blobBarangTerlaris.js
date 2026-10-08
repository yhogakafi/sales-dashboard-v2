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
import fs from 'fs'
import path from 'path'

const INDEX_PATH = 'barang-terlaris/index.json'
const LOCAL_DATA_DIR = path.join(process.cwd(), '.data', 'barang-terlaris')

function isBlobConfigured() {
  return !!process.env.BLOB_READ_WRITE_TOKEN
}

function periodPath(id) {
  return `barang-terlaris/${id}.json`
}

function localFilePath(blobPath) {
  const rel = blobPath.replace(/^barang-terlaris[/\\]/, '')
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
      // fallback
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
    console.error('Failed to write local json:', err)
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

// ─── Draft (temp storage before publish) ─────────────────────────────────────

export async function saveBTDraft({ analysis, fileName }) {
  const draftId = `draft-${Date.now()}`
  await writeJson(`barang-terlaris/${draftId}.json`, { analysis, fileName, savedAt: new Date().toISOString() })
  return draftId
}

export async function promoteBTDraft({ draftId, periodId, periodLabel, fileName }) {
  // Read the draft
  const draft = await readJson(`barang-terlaris/${draftId}.json`)
  if (!draft) throw new Error('Draft tidak ditemukan atau sudah kadaluarsa.')

  // Save as the real period
  const entry = await saveBTPeriod({
    id: periodId,
    label: periodLabel,
    analysis: draft.analysis,
    fileName: fileName || draft.fileName || null,
  })

  // Clean up draft (best-effort)
  try { await del(`barang-terlaris/${draftId}.json`) } catch { /* ignore */ }

  return entry
}

export async function deleteBTPeriod(id) {
  if (isBlobConfigured()) {
    try {
      await del(periodPath(id))
    } catch {
      // already gone — continue
    }
  }
  try {
    const loc = localFilePath(periodPath(id))
    if (fs.existsSync(loc)) await fs.promises.unlink(loc)
  } catch {}
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
