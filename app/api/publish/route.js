import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdminCookie, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { savePeriod } from '@/lib/blob'

export const runtime = 'nodejs'

// Tahap 2: admin sudah mengecek preview & mengatur kategori.
// Endpoint ini menyimpan data ke periode tertentu (bisa baru atau timpa yang lama).
export async function POST(request) {
  const cookieStore = cookies()
  const session = cookieStore.get(ADMIN_COOKIE_NAME)?.value

  if (!checkAdminCookie(session)) {
    return NextResponse.json({ error: 'Tidak diizinkan. Silakan login ulang.' }, { status: 401 })
  }

  const body = await request.json()
  const { analysis, categories, fileName, periodId, periodLabel } = body

  if (!analysis) {
    return NextResponse.json({ error: 'Data analisis tidak ditemukan.' }, { status: 400 })
  }
  if (!periodId || !periodLabel) {
    return NextResponse.json({ error: 'periodId dan periodLabel wajib diisi.' }, { status: 400 })
  }

  try {
    const entry = await savePeriod({
      id: periodId,
      label: periodLabel,
      analysis,
      categories: categories || {},
      fileName: fileName || null,
    })
    return NextResponse.json({ ok: true, entry })
  } catch (err) {
    console.error(err)
    return NextResponse.json(
      { error: 'Gagal menyimpan ke storage. Pastikan Vercel Blob sudah dikonfigurasi (env BLOB_READ_WRITE_TOKEN).' },
      { status: 500 }
    )
  }
}
