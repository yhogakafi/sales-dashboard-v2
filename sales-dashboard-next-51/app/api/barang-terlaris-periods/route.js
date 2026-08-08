import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdminCookie, checkViewerCookie, ADMIN_COOKIE_NAME, VIEWER_COOKIE_NAME } from '@/lib/auth'
import { getBTPeriodIndex, deleteBTPeriod, promoteBTDraft } from '@/lib/blobBarangTerlaris'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

function isViewer(cookieStore) {
  return (
    checkViewerCookie(cookieStore.get(VIEWER_COOKIE_NAME)?.value) ||
    checkAdminCookie(cookieStore.get(ADMIN_COOKIE_NAME)?.value)
  )
}
function isAdmin(cookieStore) {
  return checkAdminCookie(cookieStore.get(ADMIN_COOKIE_NAME)?.value)
}

// GET /api/barang-terlaris-periods — list all periods (viewer + admin)
export async function GET() {
  const cookieStore = cookies()
  if (!isViewer(cookieStore)) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 })
  }
  const index = await getBTPeriodIndex()
  return NextResponse.json(index)
}

// POST /api/barang-terlaris-periods — promote draft to a named period (admin only)
export async function POST(request) {
  const cookieStore = cookies()
  if (!isAdmin(cookieStore)) {
    return NextResponse.json({ error: 'Hanya admin yang bisa mempublikasikan data.' }, { status: 401 })
  }

  const body = await request.json()
  const { draftId, fileName, periodId, periodLabel } = body

  if (!draftId)      return NextResponse.json({ error: 'draftId tidak ditemukan.' }, { status: 400 })
  if (!periodId || !periodLabel) return NextResponse.json({ error: 'periodId dan periodLabel wajib diisi.' }, { status: 400 })

  try {
    const entry = await promoteBTDraft({ draftId, periodId, periodLabel, fileName: fileName || null })
    return NextResponse.json({ ok: true, entry })
  } catch (err) {
    console.error(err)
    return NextResponse.json(
      { error: 'Gagal menyimpan ke storage. Pastikan BLOB_READ_WRITE_TOKEN sudah dikonfigurasi.' },
      { status: 500 }
    )
  }
}

// DELETE /api/barang-terlaris-periods?id=xxx — admin only
export async function DELETE(request) {
  const cookieStore = cookies()
  if (!isAdmin(cookieStore)) {
    return NextResponse.json({ error: 'Hanya admin yang bisa menghapus periode.' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Parameter id diperlukan.' }, { status: 400 })
  await deleteBTPeriod(id)
  return NextResponse.json({ ok: true })
}
