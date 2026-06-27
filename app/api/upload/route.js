import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdminCookie, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { parseWorkbook } from '@/lib/parseData'

export const runtime = 'nodejs'

// Tahap 1: terima file, parse, kembalikan hasil sebagai PREVIEW saja.
// Belum disimpan permanen ke Blob — admin masih bisa atur kategori dulu
// di halaman admin, baru ditekan "Simpan & Publikasikan" (lihat /api/publish).
export async function POST(request) {
  const cookieStore = cookies()
  const session = cookieStore.get(ADMIN_COOKIE_NAME)?.value

  if (!checkAdminCookie(session)) {
    return NextResponse.json({ error: 'Tidak diizinkan. Silakan login ulang.' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file')

  if (!file) {
    return NextResponse.json({ error: 'Tidak ada file yang diunggah.' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()

  let analysis
  try {
    analysis = parseWorkbook(arrayBuffer)
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Gagal membaca file.' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, analysis, fileName: file.name })
}
