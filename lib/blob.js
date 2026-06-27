import { put, head } from '@vercel/blob'

// Nama path tetap (bukan random) supaya selalu menimpa upload sebelumnya,
// sesuai keputusan: "simpan yang terbaru saja".
const DATA_PATH = 'sales-data/latest.json'
const RAW_PATH = 'sales-data/latest-source.xlsx'

export async function saveAnalysis(payloadJson, rawFileBuffer, originalFileName) {
  const dataBlob = await put(DATA_PATH, JSON.stringify(payloadJson), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  })

  let rawBlob = null
  if (rawFileBuffer) {
    rawBlob = await put(RAW_PATH, rawFileBuffer, {
      access: 'public',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    })
  }

  console.log('[blob] saved data blob at url:', dataBlob.url)

  return {
    dataUrl: dataBlob.url,
    rawUrl: rawBlob?.url || null,
    uploadedAt: new Date().toISOString(),
    originalFileName: originalFileName || null,
  }
}

export async function getLatestAnalysis() {
  // `head()` mencari blob langsung berdasarkan pathname yang kita tentukan sendiri --
  // ini lebih pasti dibanding list({ prefix }) yang pernah meleset karena masalah
  // pencocokan pathname/prefix di beberapa kasus.
  let meta
  try {
    meta = await head(DATA_PATH)
  } catch (err) {
    console.log('[blob] head() failed for', DATA_PATH, '-', err.message)
    return null
  }

  if (!meta || !meta.url) {
    console.log('[blob] head() returned no usable blob for', DATA_PATH)
    return null
  }

  // Tambahkan query param unik supaya request ini selalu lewat CDN sebagai
  // permintaan baru, bukan disajikan dari cache lama (Vercel Blob CDN men-cache
  // blob publik hingga 1 bulan secara default berdasarkan URL).
  const bustedUrl = `${meta.url}?t=${Date.now()}`
  const res = await fetch(bustedUrl, { cache: 'no-store' })
  if (!res.ok) {
    console.log('[blob] fetch to blob url failed with status', res.status)
    return null
  }
  const payload = await res.json()
  // payload bentuknya { analysis, categories, fileName }
  return { ...payload, uploadedAt: meta.uploadedAt }
}

export async function clearLatestAnalysis() {
  const { del } = await import('@vercel/blob')
  await del(DATA_PATH).catch(() => {})
  await del(RAW_PATH).catch(() => {})
}
