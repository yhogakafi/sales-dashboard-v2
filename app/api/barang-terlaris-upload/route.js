import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdminCookie, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { parseBarangTerlaris } from '@/lib/parseBarangTerlaris'

export const runtime = 'nodejs'

// POST /api/barang-terlaris-upload
// Step 1: parse file, return preview — not yet saved permanently.
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
    analysis = parseBarangTerlaris(arrayBuffer)
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Gagal membaca file.' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, analysis, fileName: file.name })
}
