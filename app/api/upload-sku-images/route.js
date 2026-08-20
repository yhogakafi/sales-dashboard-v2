import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkViewerCookie, checkAdminCookie, VIEWER_COOKIE_NAME, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { parseSkuImageFile } from '@/lib/parseSkuImage'
import { saveSkuImages } from '@/lib/blobSkuImage'

export const runtime = 'nodejs'

// Upload dan simpan file gambar SKU (kolom SKU + IMAGE) langsung ke Blob,
// supaya mapping-nya kesimpan di server — sekali upload, semua orang yang
// buka halaman Produk Terlaris (viewer maupun admin) langsung lihat gambarnya,
// tidak perlu upload ulang tiap sesi/browser.
//
// Request: form-data dengan field `file`.

export async function POST(request) {
  const cookieStore = cookies()
  const viewer = cookieStore.get(VIEWER_COOKIE_NAME)?.value
  const admin = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  if (!checkViewerCookie(viewer) && !checkAdminCookie(admin)) {
    return NextResponse.json({ error: 'Tidak diizinkan. Silakan login ulang.' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file')

  if (!file) {
    return NextResponse.json({ error: 'Tidak ada file yang diunggah.' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()

  let parsed
  try {
    parsed = parseSkuImageFile(arrayBuffer)
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Gagal membaca file gambar SKU.' }, { status: 400 })
  }

  try {
    const result = await saveSkuImages(parsed.bySku, parsed.count)
    return NextResponse.json({ ok: true, count: result.count, savedAt: result.savedAt })
  } catch (err) {
    console.error('[upload-sku-images]', err)
    return NextResponse.json(
      { error: 'Gagal menyimpan ke storage. Pastikan Vercel Blob sudah dikonfigurasi.' },
      { status: 500 }
    )
  }
}
