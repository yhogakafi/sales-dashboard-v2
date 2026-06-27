import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getLatestAnalysis } from '@/lib/blob'
import { checkViewerCookie, checkAdminCookie, VIEWER_COOKIE_NAME, ADMIN_COOKIE_NAME } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET() {
  const cookieStore = cookies()
  const viewerSession = cookieStore.get(VIEWER_COOKIE_NAME)?.value
  const adminSession = cookieStore.get(ADMIN_COOKIE_NAME)?.value

  // Admin yang sudah login juga otomatis boleh lihat data publik -- tidak perlu login dua kali.
  const isAllowed = checkViewerCookie(viewerSession) || checkAdminCookie(adminSession)
  if (!isAllowed) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 })
  }

  try {
    const result = await getLatestAnalysis()
    if (!result) {
      return NextResponse.json({ error: 'Belum ada data yang diunggah.' }, { status: 404 })
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Gagal mengambil data.' }, { status: 500 })
  }
}
