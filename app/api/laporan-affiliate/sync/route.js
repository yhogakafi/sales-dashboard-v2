import { NextResponse } from 'next/server'
import { saveLaporanAffiliateData, getLaporanAffiliateData } from '@/lib/blobLaporanAffiliate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const apiKey = request.headers.get('x-api-key') || request.nextUrl.searchParams.get('key')
    const expectedSecret = process.env.SYNC_SECRET || process.env.ADMIN_PASSWORD

    // Optional security check: if SYNC_SECRET or ADMIN_PASSWORD is set, verify
    if (expectedSecret && apiKey && apiKey !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized: Invalid API Key' }, { status: 401 })
    }

    const body = await request.json()
    if (!body) {
      return NextResponse.json({ error: 'Request body cannot be empty' }, { status: 400 })
    }

    const saved = await saveLaporanAffiliateData(body)

    return NextResponse.json({
      ok: true,
      message: 'Data laporan affiliate berhasil disinkronkan ke Vercel Blob',
      savedAt: saved.savedAt,
      totalAffiliators: saved.summary?.totalAffiliators || saved.affiliatorDetails?.length || 0,
    })
  } catch (err) {
    console.error('[api/laporan-affiliate/sync] Error:', err)
    return NextResponse.json(
      { error: err.message || 'Gagal menyinkronkan data laporan affiliate' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const data = await getLaporanAffiliateData()
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Gagal membaca data laporan affiliate' },
      { status: 500 }
    )
  }
}
