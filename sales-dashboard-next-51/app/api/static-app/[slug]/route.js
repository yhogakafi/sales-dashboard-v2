import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkViewerCookie, checkAdminCookie, VIEWER_COOKIE_NAME, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { getStaticAppHtml } from '@/lib/staticApps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Menyajikan HTML mandiri (Live Report, Katalog Produk, dll) dari lib/staticApps/.
// Sengaja lewat route API (bukan public/) supaya tetap butuh session viewer/admin
// yang sama dengan sisa dashboard — file HTML-nya sendiri tidak bisa diakses langsung.
export async function GET(request, { params }) {
  const cookieStore = cookies()
  const viewerSession = cookieStore.get(VIEWER_COOKIE_NAME)?.value
  const adminSession = cookieStore.get(ADMIN_COOKIE_NAME)?.value

  const isViewer = checkViewerCookie(viewerSession)
  const isAdmin = checkAdminCookie(adminSession)

  if (!isViewer && !isAdmin) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 })
  }

  const html = getStaticAppHtml(params.slug)
  if (!html) {
    return NextResponse.json({ error: 'App tidak ditemukan.' }, { status: 404 })
  }

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'SAMEORIGIN',
      'Cache-Control': 'no-store',
    },
  })
}
