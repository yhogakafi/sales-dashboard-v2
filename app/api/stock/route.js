import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdminCookie, checkViewerCookie, ADMIN_COOKIE_NAME, VIEWER_COOKIE_NAME } from '@/lib/auth'
import { parseStock } from '@/lib/parseStock'
import { saveStock, getAllStock, getStockMeta } from '@/lib/blobStock'

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

// GET /api/stock — ambil gabungan stock (viewer + admin)
// GET /api/stock?meta=1 — ambil metadata saja (kapan diupload)
export async function GET(request) {
  const cookieStore = cookies()
  if (!isViewer(cookieStore)) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)

  try {
    if (searchParams.get('meta') === '1') {
      const meta = await getStockMeta()
      return NextResponse.json({ ok: true, meta })
    }

    const { stockMap, meta } = await getAllStock()
    return NextResponse.json({ ok: true, stockMap, meta })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Gagal mengambil data stock.' }, { status: 500 })
  }
}

// POST /api/stock — upload file stock (admin only)
// FormData: file (XLS/XLSX), type ('underwear' | 'sport')
export async function POST(request) {
  const cookieStore = cookies()
  if (!isAdmin(cookieStore)) {
    return NextResponse.json({ error: 'Hanya admin yang bisa mengupload data stock.' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const type = formData.get('type') // 'underwear' | 'sport'

  if (!file) {
    return NextResponse.json({ error: 'Tidak ada file yang diunggah.' }, { status: 400 })
  }
  if (type !== 'underwear' && type !== 'sport') {
    return NextResponse.json({ error: 'Parameter type harus "underwear" atau "sport".' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()

  let result
  try {
    result = parseStock(arrayBuffer)
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Gagal membaca file stock.' }, { status: 400 })
  }

  try {
    await saveStock({ type, stockMap: result.stockMap, fileName: file.name })
  } catch (err) {
    console.error(err)
    return NextResponse.json(
      { error: 'Gagal menyimpan ke storage. Pastikan BLOB_READ_WRITE_TOKEN sudah dikonfigurasi.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    type,
    totalRows: result.totalRows,
    missingStock: result.missingStock,
    fileName: file.name,
  })
}
