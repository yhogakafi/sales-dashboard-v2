import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkViewerCookie, checkAdminCookie, VIEWER_COOKIE_NAME, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { getStockLookup, getStockLookupByType } from '@/lib/blobStock'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/stock-data — ambil data stock.
// GET /api/stock-data?type=underwear atau ?type=sport — ambil SATU tipe saja.
//   Dipakai halaman Produk Terlaris supaya tiap request tetap kecil, bukannya
//   satu response gabungan yang bisa kelewat batas 4.5MB Vercel Function kalau
//   salah satu katalog (mis. underwear) sudah puluhan ribu SKU.
// Tanpa ?type — kembalikan gabungan (dipertahankan untuk kompatibilitas/dipakai
//   di tempat lain), tapi ini yang paling berisiko kena limit di katalog besar.
// Kalau belum ada data stock sama sekali, kembalikan objek kosong (bukan error)
// — halaman tetap jalan, kolom stock cukup tampilkan 0.

export async function GET(request) {
  const cookieStore = cookies()
  const viewer = cookieStore.get(VIEWER_COOKIE_NAME)?.value
  const admin  = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  if (!checkViewerCookie(viewer) && !checkAdminCookie(admin)) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  try {
    if (type) {
      if (type !== 'underwear' && type !== 'sport') {
        return NextResponse.json({ error: `Tipe tidak valid: ${type}` }, { status: 400 })
      }
      const result = await getStockLookupByType(type)
      return NextResponse.json(result)
    }
    const result = await getStockLookup()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[stock-data]', err)
    return NextResponse.json({ error: 'Gagal mengambil data stock.' }, { status: 500 })
  }
}
