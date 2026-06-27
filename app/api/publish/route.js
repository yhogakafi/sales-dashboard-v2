import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdminCookie, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { saveAnalysis } from '@/lib/blob'

export const runtime = 'nodejs'

// Tahap 2: admin sudah mengecek hasil preview & mengatur kategori di halaman
// admin. Endpoint ini menyimpan gabungan { analysis, categories, fileName }
// sebagai satu paket akhir yang akan dibaca oleh dashboard publik.
export async function POST(request) {
  const cookieStore = cookies()
  const session = cookieStore.get(ADMIN_COOKIE_NAME)?.value

  if (!checkAdminCookie(session)) {
    return NextResponse.json({ error: 'Tidak diizinkan. Silakan login ulang.' }, { status: 401 })
  }

  const body = await request.json()
  const { analysis, categories, fileName } = body

  if (!analysis) {
    return NextResponse.json({ error: 'Data analisis tidak ditemukan.' }, { status: 400 })
  }

  const payload = {
    analysis,
    categories: categories || {},
    fileName: fileName || null,
  }

  try {
    const meta = await saveAnalysis(payload, null, fileName)
    return NextResponse.json({ ok: true, meta })
  } catch (err) {
    console.error(err)
    return NextResponse.json(
      { error: 'Gagal menyimpan ke storage. Pastikan Vercel Blob sudah dikonfigurasi (env BLOB_READ_WRITE_TOKEN).' },
      { status: 500 }
    )
  }
}
