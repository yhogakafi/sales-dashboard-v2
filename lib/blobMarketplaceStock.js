import { put, del, head } from '@vercel/blob'
import fs from 'fs'
import path from 'path'

const INDEX_BLOB_PATH = 'stok-marketplace/index.json'
const DATA_BLOB_PREFIX = 'stok-marketplace/data'

const LOCAL_BASE_DIR = path.join(process.cwd(), '.data', 'stok-marketplace')
const LOCAL_INDEX_PATH = path.join(LOCAL_BASE_DIR, 'index.json')

function isBlobConfigured() {
  return !!process.env.BLOB_READ_WRITE_TOKEN
}

function customerBlobPath(customerId) {
  return `${DATA_BLOB_PREFIX}/${customerId}.json`
}

function localCustomerPath(customerId) {
  const inDataDir = path.join(LOCAL_BASE_DIR, 'data', `${customerId}.json`)
  if (fs.existsSync(inDataDir)) return inDataDir
  const directPath = path.join(LOCAL_BASE_DIR, `${customerId}.json`)
  if (fs.existsSync(directPath)) return directPath
  return inDataDir
}

async function readBlobJson(blobPath) {
  if (!isBlobConfigured()) return null
  try {
    const meta = await head(blobPath)
    if (!meta?.url) return null
    const res = await fetch(`${meta.url}?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function writeBlobJson(blobPath, data) {
  if (!isBlobConfigured()) return null
  try {
    return await put(blobPath, JSON.stringify(data), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    })
  } catch (err) {
    console.error(`[blobMarketplaceStock] Error writing to Blob (${blobPath}):`, err)
    return null
  }
}

async function deleteBlobJson(blobPath) {
  if (!isBlobConfigured()) return
  try {
    await del(blobPath)
  } catch {
    // ignore
  }
}

// ─── Local Disk Fallback Helpers ─────────────────────────────────────────────

async function readLocalJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = await fs.promises.readFile(filePath, 'utf-8')
      return JSON.parse(raw)
    }
  } catch {
    // ignore
  }
  return null
}

async function writeLocalJson(filePath, data) {
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (err) {
    console.error(`[blobMarketplaceStock] Error writing local file (${filePath}):`, err)
  }
}

async function deleteLocalFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath)
    }
  } catch {
    // ignore
  }
}

// ─── Index Operations ────────────────────────────────────────────────────────

/**
 * Returns the index of all uploaded marketplace stock datasets.
 * Format:
 * [
 *   {
 *     id: 'shopee-scelta',
 *     name: 'SHOPEE / SCELTA',
 *     savedAt: '2026-10-07T...',
 *     fileNames: ['1.xlsx', '2.xlsx', '3.xlsx'],
 *     summary: { totalItems, totalStock, emptyStockCount, emptyStockPct, availableStockCount, availableStockPct, lowStockCount, lowStockPct, avgStock }
 *   },
 *   ...
 * ]
 */
export async function getMarketplaceStockIndex() {
  const blobIndex = await readBlobJson(INDEX_BLOB_PATH)
  if (blobIndex) return blobIndex

  const localIndex = await readLocalJson(LOCAL_INDEX_PATH)
  if (localIndex) return localIndex

  return []
}

export async function saveMarketplaceStockIndex(index) {
  await writeBlobJson(INDEX_BLOB_PATH, index)
  await writeLocalJson(LOCAL_INDEX_PATH, index)
  return index
}

// ─── Customer Stock Detail Operations ────────────────────────────────────────

/**
 * Reads full stock dataset for a given customer.
 * Format:
 * {
 *   id: 'shopee-scelta',
 *   name: 'SHOPEE / SCELTA',
 *   savedAt: '...',
 *   fileNames: [...],
 *   summary: { ... },
 *   items: [{ namaProduk, sku, stok }, ...]
 * }
 */
export async function getMarketplaceCustomerStock(customerId) {
  const blobPath = customerBlobPath(customerId)
  const blobData = await readBlobJson(blobPath)
  if (blobData) return blobData

  const localPath = localCustomerPath(customerId)
  const localData = await readLocalJson(localPath)
  if (localData) return localData

  return null
}

/**
 * Saves customer stock dataset to Blob and updates index.
 */
export async function saveMarketplaceCustomerStock(customerId, customerName, { items, summary, fileNames }) {
  const now = new Date().toISOString()
  const payload = {
    id: customerId,
    name: customerName,
    savedAt: now,
    fileNames: fileNames || [],
    summary: summary || {},
    items: items || [],
  }

  // 1. Save detail file to Blob and local
  await writeBlobJson(customerBlobPath(customerId), payload)
  await writeLocalJson(localCustomerPath(customerId), payload)

  // 2. Update index
  const index = await getMarketplaceStockIndex()
  const entry = {
    id: customerId,
    name: customerName,
    savedAt: now,
    fileNames: fileNames || [],
    summary: summary || {},
  }

  const existingIdx = index.findIndex((c) => c.id === customerId)
  if (existingIdx !== -1) {
    index[existingIdx] = entry
  } else {
    index.push(entry)
  }

  // Sort index alphabetically by name
  index.sort((a, b) => a.name.localeCompare(b.name))

  await saveMarketplaceStockIndex(index)

  return payload
}

/**
 * Deletes customer stock dataset from Blob, local disk, and index.
 */
export async function deleteMarketplaceCustomerStock(customerId) {
  // 1. Delete detail file
  await deleteBlobJson(customerBlobPath(customerId))
  await deleteLocalFile(localCustomerPath(customerId))

  // 2. Remove from index
  const index = await getMarketplaceStockIndex()
  const updated = index.filter((c) => c.id !== customerId)
  await saveMarketplaceStockIndex(updated)

  return { success: true }
}
