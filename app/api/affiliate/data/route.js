import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdminCookie, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { getAffiliateEntry, getAffiliateMonthData, deleteAffiliateEntry } from '@/lib/blobAffiliate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')
    const id = searchParams.get('id')

    if (id) {
      const entry = await getAffiliateEntry(id)
      if (!entry) {
        return NextResponse.json({ error: 'Data tidak ditemukan.' }, { status: 404 })
      }
      return NextResponse.json({ ok: true, entry })
    }

    if (month) {
      const entries = await getAffiliateMonthData(month)
      return NextResponse.json({ ok: true, entries })
    }

    return NextResponse.json({ error: 'Parameter month atau id harus diisi.' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Gagal mengambil data affiliate.' }, { status: 500 })
  }
}

export async function DELETE(request) {
  const cookieStore = cookies()
  const session = cookieStore.get(ADMIN_COOKIE_NAME)?.value

  if (process.env.ADMIN_PASSWORD && !checkAdminCookie(session)) {
    return NextResponse.json({ error: 'Tidak diizinkan. Silakan login admin.' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'ID data harus diisi.' }, { status: 400 })
    }

    await deleteAffiliateEntry(id)
    return NextResponse.json({ ok: true, deletedId: id })
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Gagal menghapus data affiliate.' }, { status: 500 })
  }
}
