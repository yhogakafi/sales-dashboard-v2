import { NextResponse } from 'next/server'
import { getLaporanLiveIndex, getLaporanLivePeriodData } from '@/lib/blobLaporanLive'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    let customerId = searchParams.get('customerId')
    let periodId = searchParams.get('periodId')

    const index = await getLaporanLiveIndex()

    if (!customerId || !periodId) {
      if (index.customers && index.customers.length > 0) {
        const firstCust = index.customers[0]
        customerId = customerId || firstCust.id
        if (firstCust.periods && firstCust.periods.length > 0) {
          periodId = periodId || firstCust.periods[firstCust.periods.length - 1].id
        }
      }
    }

    if (!customerId || !periodId) {
      return NextResponse.json({
        ok: true,
        data: null,
        index,
        message: 'Belum ada data laporan live yang tersimpan.',
      })
    }

    const periodData = await getLaporanLivePeriodData(customerId, periodId)
    return NextResponse.json({
      ok: true,
      data: periodData,
      index,
    })
  } catch (err) {
    console.error('[api/laporan-live/data] Error:', err)
    return NextResponse.json({ ok: false, error: err.message || 'Gagal memuat data periode.' }, { status: 500 })
  }
}
