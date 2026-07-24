import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdminCookie, checkViewerCookie, ADMIN_COOKIE_NAME, VIEWER_COOKIE_NAME } from '@/lib/auth'
import { getProdukPeriodIndex, deleteProdukPeriod } from '@/lib/blob'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

function isViewer(cookieStore) {
  const v = cookieStore.get(VIEWER_COOKIE_NAME)?.value
  const a = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  return checkViewerCookie(v) || checkAdminCookie(a)
}

function isAdmin(cookieStore) {
  const a = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  return checkAdminCookie(a)
}

// GET /api/produk-terlaris/periods — daftar periode produk terlaris (viewer & admin)
export async function GET() {
  const cookieStore = cookies()
  if (!isViewer(cookieStore)) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 })
  }
  const index = await getProdukPeriodIndex()
  return NextResponse.json(index)
}

// DELETE /api/produk-terlaris/periods?id=xxx — hapus periode tertentu (admin only)
export async function DELETE(request) {
  const cookieStore = cookies()
  if (!isAdmin(cookieStore)) {
    return NextResponse.json({ error: 'Hanya admin yang bisa menghapus periode.' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Parameter id diperlukan.' }, { status: 400 })
  await deleteProdukPeriod(id)
  return NextResponse.json({ ok: true })
}
