import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkViewerCookie, checkAdminCookie, VIEWER_COOKIE_NAME, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { getSkuImages } from '@/lib/blobSkuImage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/image-proxy?url=<link CDN gambar>
//
// Kenapa perlu proxy (bukan langsung <img src={linkCdn}>): banyak CDN toko
// online (termasuk Shopee) memblokir "hotlink" — request gambar yang datang
// dari domain LAIN dicek dari header Referer, dan kalau tidak cocok domain
// mereka sendiri, responsnya 403 tanpa header CORS. Untuk <img> tag di
// browser, kegagalan seperti ini SERING tidak muncul jelas di Console (cuma
// gambar kosong/patah) — makanya kelihatan "gambar gak muncul, tapi gak ada
// error apa-apa". Solusinya: server kita yang fetch gambarnya (bukan
// browser), lalu teruskan bytes-nya ke browser lewat domain kita sendiri.
//
// Supaya endpoint ini tidak jadi "open proxy" sembarang URL (risiko SSRF/
// disalahgunakan), request hanya diteruskan kalau `url` memang salah satu
// link yang ada di mapping SKU→gambar yang sudah tersimpan di server.

export async function GET(request) {
  const cookieStore = cookies()
  const viewer = cookieStore.get(VIEWER_COOKIE_NAME)?.value
  const admin = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  if (!checkViewerCookie(viewer) && !checkAdminCookie(admin)) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'Parameter url wajib diisi.' }, { status: 400 })
  }

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: 'URL tidak valid.' }, { status: 400 })
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return NextResponse.json({ error: 'URL tidak valid.' }, { status: 400 })
  }

  // Whitelist: url harus persis salah satu yang ada di mapping tersimpan.
  const { bySku } = await getSkuImages()
  const allowed = new Set(Object.values(bySku))
  if (!allowed.has(url)) {
    return NextResponse.json({ error: 'URL gambar tidak dikenal.' }, { status: 403 })
  }

  let upstream
  try {
    upstream = await fetch(url, {
      headers: {
        // Beberapa CDN cuma cek "ada Referer domain sendiri atau tidak ada
        // Referer sama sekali" — set User-Agent browser biasa + Referer ke
        // domain tokonya sendiri supaya permintaan kelihatan wajar.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': `${parsed.protocol}//${parsed.hostname}/`,
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
      cache: 'no-store',
    })
  } catch (err) {
    console.error('[image-proxy] fetch failed', err)
    return NextResponse.json({ error: 'Gagal mengambil gambar dari sumbernya.' }, { status: 502 })
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Sumber gambar mengembalikan status ${upstream.status}.` },
      { status: upstream.status === 404 ? 404 : 502 }
    )
  }

  const contentType = upstream.headers.get('content-type') || 'image/jpeg'
  if (!contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'Konten yang diterima bukan gambar.' }, { status: 502 })
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      // Gambar produk jarang berubah untuk link yang sama — aman dicache lama.
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
    },
  })
}
