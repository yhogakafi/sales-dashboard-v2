import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkViewerCookie, checkAdminCookie, VIEWER_COOKIE_NAME, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { getSkuImages } from '@/lib/blobSkuImage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/sku-images — ambil mapping SKU → link gambar yang sudah tersimpan
// (dishare untuk semua browser/device, bukan cuma tersimpan di satu sesi).
// Kalau belum pernah diupload sama sekali, kembalikan mapping kosong (bukan
// error) — halaman tetap jalan, tombol toggle gambar cuma nonaktif.

export async function GET() {
  const cookieStore = cookies()
  const viewer = cookieStore.get(VIEWER_COOKIE_NAME)?.value
  const admin = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  if (!checkViewerCookie(viewer) && !checkAdminCookie(admin)) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 })
  }

  try {
    const result = await getSkuImages()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[sku-images]', err)
    return NextResponse.json({ error: 'Gagal mengambil data gambar SKU.' }, { status: 500 })
  }
}
