import { NextResponse } from 'next/server'
import { getLaporanAffiliateData } from '@/lib/blobLaporanAffiliate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await getLaporanAffiliateData()
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Gagal membaca data' },
      { status: 500 }
    )
  }
}
