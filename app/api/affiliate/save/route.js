import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdminCookie, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { saveAffiliateEntry } from '@/lib/blobAffiliate'

export const runtime = 'nodejs'

export async function POST(request) {
  const cookieStore = cookies()
  const session = cookieStore.get(ADMIN_COOKIE_NAME)?.value

  if (process.env.ADMIN_PASSWORD && !checkAdminCookie(session)) {
    return NextResponse.json({ error: 'Tidak diizinkan. Silakan login admin.' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { platform, periodId, periodLabel, monthKey, account, fileName, rows, stats } = body

    if (!platform || !periodLabel || !account) {
      return NextResponse.json({ error: 'Platform, label periode, dan nama akun harus diisi.' }, { status: 400 })
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Data transaksi kosong.' }, { status: 400 })
    }

    const savedEntry = await saveAffiliateEntry({
      platform,
      periodId,
      periodLabel,
      monthKey,
      account,
      fileName,
      rows,
      stats,
    })

    return NextResponse.json({ ok: true, entry: savedEntry })
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Gagal menyimpan data affiliate.' }, { status: 500 })
  }
}
