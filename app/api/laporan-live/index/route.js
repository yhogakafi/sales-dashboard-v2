import { NextResponse } from 'next/server'
import { getLaporanLiveIndex } from '@/lib/blobLaporanLive'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const index = await getLaporanLiveIndex()
    return NextResponse.json({ ok: true, ...index })
  } catch (err) {
    console.error('[api/laporan-live/index] Error:', err)
    return NextResponse.json({ ok: false, error: err.message || 'Gagal memuat index laporan live.' }, { status: 500 })
  }
}
