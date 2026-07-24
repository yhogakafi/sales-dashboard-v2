import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdminCookie, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { parseProdukTerlaris } from '@/lib/parseProdukTerlaris'
import { getMasterBarang } from '@/lib/blob'

export const runtime = 'nodejs'

// Tahap 1: terima file barang-terlaris, petakan kode -> nama pakai master-barang
// YANG SEDANG AKTIF saat ini, lalu kembalikan sebagai PREVIEW saja (belum disimpan
// permanen). Nama produk yang ter-resolve di sini akan ikut tersimpan apa adanya
// saat dipublikasikan — kalau master-barang diperbarui belakangan, periode lama
// tidak otomatis berubah namanya (master jarang berubah, jadi ini cukup aman).
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

  const master = await getMasterBarang()
  const masterMap = master?.map || {}

  const arrayBuffer = await file.arrayBuffer()

  let analysis
  try {
    analysis = parseProdukTerlaris(arrayBuffer, masterMap)
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Gagal membaca file.' }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    analysis,
    fileName: file.name,
    masterAvailable: !!master,
  })
}
