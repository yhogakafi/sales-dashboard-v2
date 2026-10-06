import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import fs from 'fs'
import path from 'path'
import { checkAdminCookie, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { parsePelangganWorkbook } from '@/lib/parsePelanggan'
import { savePelangganData } from '@/lib/blobPelanggan'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  // Check admin session
  const cookieStore = cookies()
  const session = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  if (!checkAdminCookie(session)) {
    return NextResponse.json({ ok: false, error: 'Tidak diizinkan. Silakan login admin terlebih dahulu.' }, { status: 401 })
  }

  try {
    const contentType = request.headers.get('content-type') || ''

    // Case 1: JSON action (e.g. reload from local file PELANGGAN 2.xls)
    if (contentType.includes('application/json')) {
      const body = await request.json()
      if (body.action === 'sync-local') {
        const localXlsPath = path.join(process.cwd(), 'PELANGGAN 2.xls')
        if (!fs.existsSync(localXlsPath)) {
          return NextResponse.json({ ok: false, error: 'File PELANGGAN 2.xls tidak ditemukan di server.' }, { status: 404 })
        }
        const buffer = await fs.promises.readFile(localXlsPath)
        const parsed = parsePelangganWorkbook(buffer)
        const saved = await savePelangganData({
          ...parsed,
          sourceFileName: 'PELANGGAN 2.xls',
        })
        return NextResponse.json({
          ok: true,
          message: 'Data berhasil disinkronkan dari PELANGGAN 2.xls',
          summary: saved.summary,
          savedAt: saved.savedAt,
        })
      }
    }

    // Case 2: Multipart Form Data file upload
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file) {
      return NextResponse.json({ ok: false, error: 'Tidak ada file yang diunggah.' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    let parsed
    try {
      parsed = parsePelangganWorkbook(arrayBuffer)
    } catch (parseErr) {
      return NextResponse.json(
        { ok: false, error: `Gagal memproses file Excel: ${parseErr.message}` },
        { status: 400 }
      )
    }

    const saved = await savePelangganData({
      ...parsed,
      sourceFileName: file.name,
    })

    return NextResponse.json({
      ok: true,
      message: 'Data pelanggan berhasil diunggah dan disimpan ke storage Blob.',
      summary: saved.summary,
      savedAt: saved.savedAt,
      fileName: file.name,
    })
  } catch (err) {
    console.error('[api/pelanggan/upload] Error:', err)
    return NextResponse.json(
      { ok: false, error: err.message || 'Terjadi kesalahan saat memproses data pelanggan.' },
      { status: 500 }
    )
  }
}
