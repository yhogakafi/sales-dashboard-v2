import { put, head } from '@vercel/blob'

// Catatan per baris (kodeBarang) di tabel Produk Terlaris — disimpan di
// server (Vercel Blob) supaya tersimpan permanen & kelihatan di semua
// browser/device, sama seperti mapping gambar/stock marketplace.
//
// Shape: { [kodeBarang]: { text: string, updatedAt: string (ISO) } }
const PATH = 'notes/produk-terlaris.json'

async function readJson() {
  let meta
  try {
    meta = await head(PATH)
  } catch {
    return null
  }
  if (!meta?.url) return null
  const res = await fetch(`${meta.url}?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) return null
  return res.json()
}

async function writeJson(data) {
  return put(PATH, JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  })
}

export async function getNotes() {
  const data = await readJson()
  return data && typeof data === 'object' ? data : {}
}

// Catatan: ini read-modify-write biasa (bukan atomic). Kalau dua orang
// nyimpen catatan di baris BERBEDA persis bersamaan, ada kemungkinan kecil
// salah satu keubah/ketimpa (lost update). Untuk skala pemakaian fitur ini
// (segelintir admin/viewer, edit satu-satu) risikonya sangat kecil dan
// diterima demi kesederhanaan — tidak perlu database transaksional buat ini.
export async function setNote(kodeBarang, text) {
  const current = await getNotes()
  const trimmed = String(text ?? '').trim()
  const now = new Date().toISOString()

  if (!trimmed) {
    delete current[kodeBarang]
    await writeJson(current)
    return { deleted: true }
  }

  current[kodeBarang] = { text: trimmed, updatedAt: now }
  await writeJson(current)
  return { text: trimmed, updatedAt: now }
}
