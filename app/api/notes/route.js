import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkViewerCookie, checkAdminCookie, VIEWER_COOKIE_NAME, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { getNotes, setNote } from '@/lib/blobNotes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

function requireSession() {
  const cookieStore = cookies()
  const viewer = cookieStore.get(VIEWER_COOKIE_NAME)?.value
  const admin = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  return checkViewerCookie(viewer) || checkAdminCookie(admin)
}

// GET /api/notes — ambil semua catatan { [kodeBarang]: { text, updatedAt } }
export async function GET() {
  if (!requireSession()) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 })
  }
  try {
    const notes = await getNotes()
    return NextResponse.json({ notes })
  } catch (err) {
    console.error('[notes GET]', err)
    return NextResponse.json({ error: 'Gagal memuat catatan.' }, { status: 500 })
  }
}

// POST /api/notes — simpan/hapus catatan satu baris
// body: { kodeBarang: string, text: string } — text kosong ("") = hapus catatan
export async function POST(request) {
  if (!requireSession()) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Data tidak valid.' }, { status: 400 })
  }

  const { kodeBarang, text } = body || {}
  if (!kodeBarang || typeof kodeBarang !== 'string') {
    return NextResponse.json({ error: 'kodeBarang wajib diisi.' }, { status: 400 })
  }
  if (typeof text !== 'string') {
    return NextResponse.json({ error: 'text harus berupa string.' }, { status: 400 })
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: 'Catatan terlalu panjang (maks 2000 karakter).' }, { status: 400 })
  }

  try {
    const result = await setNote(kodeBarang, text)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[notes POST]', err)
    return NextResponse.json({ error: 'Gagal menyimpan catatan.' }, { status: 500 })
  }
}
