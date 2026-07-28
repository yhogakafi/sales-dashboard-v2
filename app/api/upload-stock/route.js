import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdminCookie, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { parseStockFile } from '@/lib/parseStock'
import { saveStock } from '@/lib/blobStock'

export const runtime = 'nodejs'

// Upload dan simpan file stock (underwear atau sport) langsung ke Blob.
// Tidak ada langkah preview — data stock cukup sederhana (kode + brand + angka),
// tidak perlu konfirmasi tambahan dari admin sebelum disimpan.
//
// Request: form-data dengan field `file` dan `type` ('underwear' atau 'sport').

export async function POST(request) {
  const cookieStore = cookies()
  const session = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  if (!checkAdminCookie(session)) {
    return NextResponse.json({ error: 'Tidak diizinkan. Silakan login ulang.' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const type = formData.get('type') // 'underwear' atau 'sport'

  if (!file) {
    return NextResponse.json({ error: 'Tidak ada file yang diunggah.' }, { status: 400 })
  }
  if (!type || !['underwear', 'sport'].includes(type)) {
    return NextResponse.json({ error: 'Parameter type tidak valid. Gunakan "underwear" atau "sport".' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()

  let parsed
  try {
    parsed = parseStockFile(arrayBuffer)
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Gagal membaca file stock.' }, { status: 400 })
  }

  try {
    const result = await saveStock(type, parsed.byKodePenuh, parsed.count)
    return NextResponse.json({ ok: true, type, count: result.count, savedAt: result.savedAt })
  } catch (err) {
    console.error('[upload-stock]', err)
    return NextResponse.json(
      { error: 'Gagal menyimpan ke storage. Pastikan Vercel Blob sudah dikonfigurasi.' },
      { status: 500 }
    )
  }
}
