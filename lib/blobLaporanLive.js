import { put, del, head } from '@vercel/blob'
import fs from 'fs'
import path from 'path'
import {
  parseLiveWorkbook,
  summarizeSessions,
  slugifyCustomerId,
  slugifyPeriodId,
} from './parseLaporanLive.js'

export { slugifyCustomerId, slugifyPeriodId }

const INDEX_BLOB_PATH = 'laporan-live/index.json'
const DATA_BLOB_PREFIX = 'laporan-live/data'

const LOCAL_BASE_DIR = path.join(process.cwd(), '.data', 'laporan-live')
const LOCAL_INDEX_PATH = path.join(LOCAL_BASE_DIR, 'index.json')

function isBlobConfigured() {
  return !!process.env.BLOB_READ_WRITE_TOKEN
}

function periodBlobPath(customerId, periodId) {
  return `${DATA_BLOB_PREFIX}/${customerId}/${periodId}.json`
}

function localPeriodPath(customerId, periodId) {
  return path.join(LOCAL_BASE_DIR, 'data', customerId, `${periodId}.json`)
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
    console.error(`[blobLaporanLive] Error writing to Blob (${blobPath}):`, err)
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
    console.error(`[blobLaporanLive] Error writing local file (${filePath}):`, err)
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

/**
 * Get overall index of Laporan Live
 */
export async function getLaporanLiveIndex() {
  let index = await readBlobJson(INDEX_BLOB_PATH)
  if (!index) {
    index = await readLocalJson(LOCAL_INDEX_PATH)
  }

  // If completely empty, try seeding from .data/liveshopeescelta.xlsx
  if (!index || !index.customers || index.customers.length === 0) {
    index = await seedInitialData()
  }

  return index || { customers: [], lastUpdated: null }
}

/**
 * Save overall index of Laporan Live
 */
export async function saveLaporanLiveIndex(indexData) {
  const payload = {
    ...indexData,
    lastUpdated: new Date().toISOString(),
  }
  await writeBlobJson(INDEX_BLOB_PATH, payload)
  await writeLocalJson(LOCAL_INDEX_PATH, payload)
  return payload
}

/**
 * Get period data for a specific customer & period
 */
export async function getLaporanLivePeriodData(customerId, periodId) {
  const blobPath = periodBlobPath(customerId, periodId)
  let data = await readBlobJson(blobPath)
  if (!data) {
    data = await readLocalJson(localPeriodPath(customerId, periodId))
  }
  return data
}

/**
 * Save / replace period data and update index
 */
export async function saveLaporanLivePeriodData({
  customerName,
  periodId,
  periodLabel,
  dateRange,
  rows = [],
  sourceFiles = [],
  dayOverrides = {},
  sessionOverrides = {},
}) {
  const customerId = slugifyCustomerId(customerName)
  const normPeriodId = periodId ? slugifyPeriodId(periodId) : slugifyPeriodId(periodLabel)

  const summary = summarizeSessions(rows)

  const payload = {
    customerId,
    customerName,
    periodId: normPeriodId,
    periodLabel: periodLabel || normPeriodId,
    dateRange: dateRange || '',
    rows,
    summary,
    sourceFiles,
    dayOverrides,
    sessionOverrides,
    updatedAt: new Date().toISOString(),
  }

  // Write period data to Blob & local
  const blobPath = periodBlobPath(customerId, normPeriodId)
  await writeBlobJson(blobPath, payload)
  await writeLocalJson(localPeriodPath(customerId, normPeriodId), payload)

  // Update index
  const index = await getLaporanLiveIndex()
  const customers = index.customers || []
  let custIndex = customers.findIndex((c) => c.id === customerId)

  if (custIndex === -1) {
    customers.push({
      id: customerId,
      name: customerName,
      periods: [],
    })
    custIndex = customers.length - 1
  }

  const custObj = customers[custIndex]
  custObj.name = customerName // update display name
  const existingPeriodIndex = custObj.periods.findIndex((p) => p.id === normPeriodId)

  const periodMeta = {
    id: normPeriodId,
    label: periodLabel || normPeriodId,
    dateRange: dateRange || '',
    totalSessions: rows.length,
    totalPenjualan: summary.penjualanDibuat,
    totalPesanan: summary.pesananDibuat,
    sourceFiles,
    updatedAt: new Date().toISOString(),
  }

  if (existingPeriodIndex > -1) {
    custObj.periods[existingPeriodIndex] = periodMeta
  } else {
    custObj.periods.push(periodMeta)
  }

  await saveLaporanLiveIndex({ customers })
  return payload
}

/**
 * Delete a period
 */
export async function deleteLaporanLivePeriod(customerId, periodId) {
  const blobPath = periodBlobPath(customerId, periodId)
  await deleteBlobJson(blobPath)
  await deleteLocalFile(localPeriodPath(customerId, periodId))

  const index = await getLaporanLiveIndex()
  const customers = index.customers || []
  const custIndex = customers.findIndex((c) => c.id === customerId)

  if (custIndex > -1) {
    customers[custIndex].periods = customers[custIndex].periods.filter((p) => p.id !== periodId)
    if (customers[custIndex].periods.length === 0) {
      customers.splice(custIndex, 1)
    }
    await saveLaporanLiveIndex({ customers })
  }
}

/**
 * Seed initial sample data from .data/liveshopeescelta.xlsx if available
 */
async function seedInitialData() {
  const sampleFilePath = path.join(process.cwd(), '.data', 'liveshopeescelta.xlsx')
  if (!fs.existsSync(sampleFilePath)) {
    return { customers: [], lastUpdated: new Date().toISOString() }
  }

  try {
    const fileBuf = await fs.promises.readFile(sampleFilePath)
    const rows = parseLiveWorkbook(fileBuf, 'liveshopeescelta.xlsx')

    if (!rows || rows.length === 0) {
      return { customers: [], lastUpdated: new Date().toISOString() }
    }

    const customerName = 'SHOPEE / SCELTA'
    const customerId = slugifyCustomerId(customerName)

    // Detect period from data rows or default
    const periodeSet = Array.from(new Set(rows.map((r) => r.periode).filter(Boolean)))
    const periodLabel = periodeSet.length > 0 ? periodeSet[0] : '01-09-2026 - 30-09-2026'
    const periodId = slugifyPeriodId(periodLabel)

    const sorted = [...rows].sort((a, b) => a.startTimestamp - b.startTimestamp)
    const dateRange = sorted.length > 0 ? `${sorted[0].dateKey} – ${sorted[sorted.length - 1].dateKey}` : ''

    const summary = summarizeSessions(rows)

    const payload = {
      customerId,
      customerName,
      periodId,
      periodLabel,
      dateRange,
      rows,
      summary,
      sourceFiles: ['liveshopeescelta.xlsx'],
      dayOverrides: {},
      sessionOverrides: {},
      updatedAt: new Date().toISOString(),
    }

    await writeBlobJson(periodBlobPath(customerId, periodId), payload)
    await writeLocalJson(localPeriodPath(customerId, periodId), payload)

    const index = {
      customers: [
        {
          id: customerId,
          name: customerName,
          periods: [
            {
              id: periodId,
              label: periodLabel,
              dateRange,
              totalSessions: rows.length,
              totalPenjualan: summary.penjualanDibuat,
              totalPesanan: summary.pesananDibuat,
              sourceFiles: ['liveshopeescelta.xlsx'],
              updatedAt: new Date().toISOString(),
            },
          ],
        },
      ],
      lastUpdated: new Date().toISOString(),
    }

    await saveLaporanLiveIndex(index)
    return index
  } catch (err) {
    console.error('[blobLaporanLive] Error seeding initial data:', err)
    return { customers: [], lastUpdated: new Date().toISOString() }
  }
}
