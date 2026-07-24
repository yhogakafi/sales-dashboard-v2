import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdminCookie, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { parseMasterBarang } from '@/lib/parseMasterBarang'

export const runtime = 'nodejs'

// Tahap 1: terima file master barang, parse, kembalikan sebagai PREVIEW saja.
// Belum menimpa data lama — admin masih perlu menekan tombol konfirmasi di
// /api/master-barang/publish.
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

  let result
  try {
    result = parseMasterBarang(arrayBuffer)
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Gagal membaca file.' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, map: result.map, count: result.count, fileName: file.name })
}
