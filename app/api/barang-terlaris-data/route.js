import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkViewerCookie, checkAdminCookie, VIEWER_COOKIE_NAME, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { getLatestBTPeriod, getBTPeriod } from '@/lib/blobBarangTerlaris'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(request) {
  const cookieStore = cookies()
  const isAllowed =
    checkViewerCookie(cookieStore.get(VIEWER_COOKIE_NAME)?.value) ||
    checkAdminCookie(cookieStore.get(ADMIN_COOKIE_NAME)?.value)

  if (!isAllowed) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id') // optional — if provided, fetch specific period

  try {
    let result
    if (id) {
      const data = await getBTPeriod(id)
      if (!data) return NextResponse.json({ error: 'Periode tidak ditemukan.' }, { status: 404 })
      result = { ...data, periodId: id }
    } else {
      result = await getLatestBTPeriod()
      if (!result) return NextResponse.json({ error: 'Belum ada data barang terlaris yang diunggah.' }, { status: 404 })
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Gagal mengambil data.' }, { status: 500 })
  }
}
