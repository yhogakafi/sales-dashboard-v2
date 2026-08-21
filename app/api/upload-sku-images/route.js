import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkViewerCookie, checkAdminCookie, VIEWER_COOKIE_NAME, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { saveSkuImages } from '@/lib/blobSkuImage'

export const runtime = 'nodejs'

// Simpan mapping SKU→gambar+stock ke Blob, supaya sekali upload langsung
// kelihatan di semua browser/device.
//
// PENTING: file .xlsx-nya di-PARSE DI BROWSER (bukan dikirim mentah ke sini),
// lalu yang dikirim ke endpoint ini cuma hasil parsing-nya (JSON, jauh lebih
// kecil). Ini disengaja — Vercel Functions punya batas HARD 4.5MB untuk
// ukuran body request, dan file gambar SKU biasanya berisi belasan-puluhan
// ribu baris (bisa >4MB dalam bentuk .xlsx mentah). Kalau file mentahnya
// dikirim langsung ke sini, request akan ditolak Vercel dengan
// 413 FUNCTION_PAYLOAD_TOO_LARGE SEBELUM sampai ke kode ini sama sekali —
// makanya upload "gagal diam-diam" tanpa pesan error yang jelas.
//
// Request body (JSON): { bySku: { [sku]: { image, stock } }, count }

const MAX_ENTRIES = 200_000 // guard longgar, bukan buat kasus normal

export async function POST(request) {
  const cookieStore = cookies()
  const viewer = cookieStore.get(VIEWER_COOKIE_NAME)?.value
  const admin = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  if (!checkViewerCookie(viewer) && !checkAdminCookie(admin)) {
    return NextResponse.json({ error: 'Tidak diizinkan. Silakan login ulang.' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Data yang dikirim tidak valid (bukan JSON).' }, { status: 400 })
  }

  const { bySku, count } = body || {}

  if (!bySku || typeof bySku !== 'object' || Array.isArray(bySku)) {
    return NextResponse.json({ error: 'Data mapping SKU tidak valid.' }, { status: 400 })
  }

  const entries = Object.entries(bySku)
  if (entries.length === 0) {
    return NextResponse.json({ error: 'Tidak ada data SKU untuk disimpan.' }, { status: 400 })
  }
  if (entries.length > MAX_ENTRIES) {
    return NextResponse.json({ error: `Terlalu banyak baris (${entries.length}). Maksimal ${MAX_ENTRIES}.` }, { status: 400 })
  }

  // Validasi ringan tiap entry, biar data yang kesimpan tetap bentuknya benar
  // walau requestnya lolos dari client (mis. dikirim manual lewat curl/dsb).
  for (const [sku, v] of entries) {
    if (!sku || typeof v !== 'object' || v == null || typeof v.image !== 'string' || !v.image) {
      return NextResponse.json({ error: `Data tidak valid untuk SKU "${sku}".` }, { status: 400 })
    }
  }

  try {
    const result = await saveSkuImages(bySku, typeof count === 'number' ? count : entries.length)
    return NextResponse.json({ ok: true, count: result.count, savedAt: result.savedAt })
  } catch (err) {
    console.error('[upload-sku-images]', err)
    return NextResponse.json(
      { error: 'Gagal menyimpan ke storage. Pastikan Vercel Blob sudah dikonfigurasi.' },
      { status: 500 }
    )
  }
}
