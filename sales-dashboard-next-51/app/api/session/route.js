import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkViewerCookie, checkAdminCookie, VIEWER_COOKIE_NAME, ADMIN_COOKIE_NAME } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Endpoint ringan untuk cek validitas sesi (viewer atau admin) tanpa perlu
// menyentuh data penjualan -- dipakai oleh halaman selain dashboard utama
// (misal Produk Terlaris) untuk tahu apakah harus tampilkan form login atau tidak.
export async function GET() {
  const cookieStore = cookies()
  const viewerSession = cookieStore.get(VIEWER_COOKIE_NAME)?.value
  const adminSession = cookieStore.get(ADMIN_COOKIE_NAME)?.value

  const isViewer = checkViewerCookie(viewerSession)
  const isAdmin = checkAdminCookie(adminSession)

  if (!isViewer && !isAdmin) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 })
  }
  return NextResponse.json({ ok: true, isAdmin })
}
