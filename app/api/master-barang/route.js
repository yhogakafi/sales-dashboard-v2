import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdminCookie, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { getMasterBarang } from '@/lib/blob'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/master-barang — status ringkas (bukan seluruh map) untuk panel admin.
export async function GET() {
  const cookieStore = cookies()
  const session = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  if (!checkAdminCookie(session)) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 })
  }

  const data = await getMasterBarang()
  if (!data) return NextResponse.json({ exists: false })

  return NextResponse.json({
    exists: true,
    count: data.count,
    fileName: data.fileName,
    updatedAt: data.updatedAt,
  })
}
