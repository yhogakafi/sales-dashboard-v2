import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdminCookie, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { parseBarangTerlaris } from '@/lib/parseBarangTerlaris'
import { saveBTDraft } from '@/lib/blobBarangTerlaris'

export const runtime = 'nodejs'

// POST /api/barang-terlaris-upload
// Parse file, save as draft to blob, return draftId + preview (no rawRows).
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

  // Save full analysis (including rawRows) directly to blob as a draft.
  const draftId = await saveBTDraft({ analysis, fileName: file.name })

  // Return only the preview (no rawRows) to the browser — keeps response small.
  const { rawRows: _omit, ...analysisSummary } = analysis

  return NextResponse.json({ ok: true, draftId, analysis: analysisSummary, fileName: file.name })
}
