import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdminCookie, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { saveMasterBarang } from '@/lib/blob'

export const runtime = 'nodejs'

// Tahap 2: admin sudah melihat preview & menekan konfirmasi timpa.
// Master barang TIDAK terikat periode — file ini selalu satu-satunya versi aktif,
// upload baru menggantikan seluruhnya secara permanen.
export async function POST(request) {
  const cookieStore = cookies()
  const session = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  if (!checkAdminCookie(session)) {
    return NextResponse.json({ error: 'Tidak diizinkan. Silakan login ulang.' }, { status: 401 })
  }

  const body = await request.json()
  const { map, count, fileName } = body

  if (!map || typeof map !== 'object' || !count) {
    return NextResponse.json({ error: 'Data master barang tidak valid.' }, { status: 400 })
  }

  try {
    const saved = await saveMasterBarang({ map, count, fileName })
    return NextResponse.json({ ok: true, count: saved.count, fileName: saved.fileName, updatedAt: saved.updatedAt })
  } catch (err) {
    console.error(err)
    return NextResponse.json(
      { error: 'Gagal menyimpan ke storage. Pastikan Vercel Blob sudah dikonfigurasi (env BLOB_READ_WRITE_TOKEN).' },
      { status: 500 }
    )
  }
}
