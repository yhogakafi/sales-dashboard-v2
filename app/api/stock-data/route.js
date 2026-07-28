import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkViewerCookie, checkAdminCookie, VIEWER_COOKIE_NAME, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { getStockLookup } from '@/lib/blobStock'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/stock-data — ambil gabungan lookup stock underwear + sport.
// Dipakai halaman Produk Terlaris untuk menampilkan kolom Brand dan Stock.
// Kalau belum ada data stock sama sekali, kembalikan objek kosong (bukan error)
// — halaman tetap jalan, kolom stock cukup tampilkan 0.

export async function GET() {
  const cookieStore = cookies()
  const viewer = cookieStore.get(VIEWER_COOKIE_NAME)?.value
  const admin  = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  if (!checkViewerCookie(viewer) && !checkAdminCookie(admin)) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 })
  }

  try {
    const result = await getStockLookup()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[stock-data]', err)
    return NextResponse.json({ error: 'Gagal mengambil data stock.' }, { status: 500 })
  }
}
