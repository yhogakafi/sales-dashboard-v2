import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdminCookie, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { getStockStatus } from '@/lib/blobStock'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/stock-status — status singkat kedua file stock (ada/tidak, jumlah, kapan).
// Hanya untuk admin.
export async function GET() {
  const cookieStore = cookies()
  if (!checkAdminCookie(cookieStore.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 })
  }
  try {
    const status = await getStockStatus()
    return NextResponse.json(status)
  } catch (err) {
    console.error('[stock-status]', err)
    return NextResponse.json({ error: 'Gagal mengambil status stock.' }, { status: 500 })
  }
}
