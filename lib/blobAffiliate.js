import { put, del, head } from '@vercel/blob'
import fs from 'fs'
import path from 'path'
import { labelToId } from './parseAffiliate'

const INDEX_PATH = 'affiliate/index.json'

function entryPath(id) {
  return `affiliate/${id}.json`
}

const LOCAL_DATA_DIR = path.join(process.cwd(), '.data', 'affiliate')

function isBlobConfigured() {
  return !!process.env.BLOB_READ_WRITE_TOKEN
}

// ─── Low-level JSON read/write with local disk fallback ────────────────────────

async function readJson(blobPath) {
  if (isBlobConfigured()) {
    let meta
    try {
      meta = await head(blobPath)
    } catch {
      return null
    }
    if (!meta?.url) return null
    const res = await fetch(`${meta.url}?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    return res.json()
  }

  // Local fallback
  try {
    const filename = blobPath.replace(/^affiliate\//, '')
    const filePath = path.join(LOCAL_DATA_DIR, filename)
    if (!fs.existsSync(filePath)) return null
    const content = await fs.promises.readFile(filePath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

async function writeJson(blobPath, data) {
  if (isBlobConfigured()) {
    return put(blobPath, JSON.stringify(data), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    })
  }

  // Local fallback
  const filename = blobPath.replace(/^affiliate\//, '')
  const filePath = path.join(LOCAL_DATA_DIR, filename)
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
  return { url: filePath }
}

async function deleteJson(blobPath) {
  if (isBlobConfigured()) {
    try {
      await del(blobPath)
    } catch {
      // already gone
    }
    return
  }

  // Local fallback
  try {
    const filename = blobPath.replace(/^affiliate\//, '')
    const filePath = path.join(LOCAL_DATA_DIR, filename)
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath)
    }
  } catch {
    // ignore
  }
}

// ─── Index Operations ─────────────────────────────────────────────────────────

export async function getAffiliateIndex() {
  const index = await readJson(INDEX_PATH)
  return index || []
  // Entry shape: [{ id, platform, periodId, periodLabel, monthKey, account, fileName, rowCount, stats, uploadedAt }, ...]
}

async function saveAffiliateIndex(index) {
  await writeJson(INDEX_PATH, index)
}

// ─── CRUD Operations ──────────────────────────────────────────────────────────

export async function saveAffiliateEntry({
  id: customId,
  platform,
  periodId,
  periodLabel,
  monthKey,
  account,
  fileName,
  rows,
  stats,
}) {
  const safeAccount = (account || 'Default').trim()
  const safePlatform = (platform || 'shopee').toLowerCase()
  const safePeriodId = periodId || labelToId(periodLabel)
  const id = customId || `${safePlatform}_${safePeriodId}_${labelToId(safeAccount)}`

  const now = new Date().toISOString()
  const dataPayload = {
    id,
    platform: safePlatform,
    periodId: safePeriodId,
    periodLabel,
    monthKey: monthKey || '',
    account: safeAccount,
    fileName: fileName || '',
    rows: rows || [],
    stats: stats || {},
    savedAt: now,
  }

  // 1. Save data file
  await writeJson(entryPath(id), dataPayload)

  // 2. Update catalog index
  const index = await getAffiliateIndex()
  const existingIdx = index.findIndex(e => e.id === id)
  const entryMeta = {
    id,
    platform: safePlatform,
    periodId: safePeriodId,
    periodLabel,
    monthKey: monthKey || '',
    account: safeAccount,
    fileName: fileName || '',
    rowCount: (rows || []).length,
    stats: stats || {},
    uploadedAt: now,
  }

  if (existingIdx !== -1) {
    index[existingIdx] = entryMeta
  } else {
    index.unshift(entryMeta)
  }

  await saveAffiliateIndex(index)
  return entryMeta
}

export async function getAffiliateEntry(id) {
  return readJson(entryPath(id))
}

export async function getAffiliateMonthData(targetMonthKey) {
  const index = await getAffiliateIndex()
  if (!index.length) return []

  const matchedEntries = index.filter(e => e.monthKey === targetMonthKey || e.periodId === targetMonthKey)
  if (!matchedEntries.length) return []

  const loaded = await Promise.all(
    matchedEntries.map(async entry => {
      const data = await getAffiliateEntry(entry.id)
      return data || entry
    })
  )

  return loaded
}

export async function deleteAffiliateEntry(id) {
  await deleteJson(entryPath(id))
  const index = await getAffiliateIndex()
  const filtered = index.filter(e => e.id !== id)
  await saveAffiliateIndex(filtered)
  return { ok: true }
}
