import { put, head } from '@vercel/blob'
import fs from 'fs'
import path from 'path'

const BLOB_PATH = 'laporan-affiliate/latest.json'
const LOCAL_DATA_DIR = path.join(process.cwd(), '.data', 'laporan-affiliate')
const LOCAL_FILE_PATH = path.join(LOCAL_DATA_DIR, 'latest.json')

function isBlobConfigured() {
  return !!process.env.BLOB_READ_WRITE_TOKEN
}

export async function getLaporanAffiliateData() {
  if (isBlobConfigured()) {
    try {
      const meta = await head(BLOB_PATH)
      if (meta?.url) {
        const res = await fetch(`${meta.url}?t=${Date.now()}`, { cache: 'no-store' })
        if (res.ok) {
          return await res.json()
        }
      }
    } catch {
      // Blob head failed or file not yet uploaded
    }
  }

  // Local fallback
  try {
    if (fs.existsSync(LOCAL_FILE_PATH)) {
      const raw = await fs.promises.readFile(LOCAL_FILE_PATH, 'utf-8')
      return JSON.parse(raw)
    }
  } catch {
    // ignore
  }

  return null
}

export async function saveLaporanAffiliateData(payload) {
  const data = {
    ...payload,
    savedAt: new Date().toISOString(),
  }

  if (isBlobConfigured()) {
    try {
      await put(BLOB_PATH, JSON.stringify(data), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0,
      })
    } catch (err) {
      console.error('[blobLaporanAffiliate] Error uploading to Vercel Blob:', err)
    }
  }

  // Always keep local disk copy as fallback / dev cache
  try {
    await fs.promises.mkdir(LOCAL_DATA_DIR, { recursive: true })
    await fs.promises.writeFile(LOCAL_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8')
  } catch (err) {
    console.error('[blobLaporanAffiliate] Error saving local backup:', err)
  }

  return data
}
