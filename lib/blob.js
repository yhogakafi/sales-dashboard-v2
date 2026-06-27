import { put, list, del } from '@vercel/blob'

// Nama path tetap (bukan random) supaya selalu menimpa upload sebelumnya,
// sesuai keputusan: "simpan yang terbaru saja".
const DATA_PATH = 'sales-data/latest.json'
const RAW_PATH = 'sales-data/latest-source.xlsx'

export async function saveAnalysis(payloadJson, rawFileBuffer, originalFileName) {
  const dataBlob = await put(DATA_PATH, JSON.stringify(payloadJson), {
    access: 'public',
    contentType: 'application/json',
    allowOverwrite: true,
  })

  let rawBlob = null
  if (rawFileBuffer) {
    rawBlob = await put(RAW_PATH, rawFileBuffer, {
      access: 'public',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      allowOverwrite: true,
    })
  }

  return {
    dataUrl: dataBlob.url,
    rawUrl: rawBlob?.url || null,
    uploadedAt: new Date().toISOString(),
    originalFileName: originalFileName || null,
  }
}

export async function getLatestAnalysis() {
  const { blobs } = await list({ prefix: DATA_PATH })
  const found = blobs.find((b) => b.pathname === DATA_PATH)
  if (!found) return null

  const res = await fetch(found.url, { cache: 'no-store' })
  if (!res.ok) return null
  const payload = await res.json()
  // payload bentuknya { analysis, categories, fileName }
  return { ...payload, uploadedAt: found.uploadedAt }
}

export async function clearLatestAnalysis() {
  await del(DATA_PATH).catch(() => {})
  await del(RAW_PATH).catch(() => {})
}
