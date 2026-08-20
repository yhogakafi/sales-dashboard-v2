import { put, head } from '@vercel/blob'

// Mapping SKU → link gambar (CDN) — satu file, ditimpa tiap kali admin upload
// ulang. Sama seperti stock: tidak ada versi/periode, selalu cuma satu versi
// terbaru yang aktif.
const PATH = 'sku-images/mapping.json'

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

export async function saveSkuImages(bySku, count) {
  const now = new Date().toISOString()
  await writeJson(PATH, { bySku, count, savedAt: now })
  return { count, savedAt: now }
}

export async function getSkuImages() {
  const data = await readJson(PATH)
  return {
    bySku: data?.bySku || {},
    count: data?.count ?? 0,
    savedAt: data?.savedAt ?? null,
    exists: !!data,
  }
}
