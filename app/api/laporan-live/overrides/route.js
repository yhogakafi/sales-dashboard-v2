import { NextResponse } from 'next/server'
import {
  getLaporanLivePeriodData,
  saveLaporanLivePeriodData,
} from '@/lib/blobLaporanLive'

export const dynamic = 'force-dynamic'

export async function POST(req) {
  try {
    const body = await req.json()
    const { customerId, periodId, dayOverrides, sessionOverrides } = body

    if (!customerId || !periodId) {
      return NextResponse.json({ ok: false, error: 'customerId dan periodId wajib disertakan.' }, { status: 400 })
    }

    const current = await getLaporanLivePeriodData(customerId, periodId)
    if (!current) {
      return NextResponse.json({ ok: false, error: 'Data periode tidak ditemukan.' }, { status: 404 })
    }

    const updated = await saveLaporanLivePeriodData({
      ...current,
      dayOverrides: dayOverrides !== undefined ? dayOverrides : current.dayOverrides || {},
      sessionOverrides: sessionOverrides !== undefined ? sessionOverrides : current.sessionOverrides || {},
    })

    return NextResponse.json({ ok: true, data: updated })
  } catch (err) {
    console.error('[api/laporan-live/overrides] Error:', err)
    return NextResponse.json({ ok: false, error: err.message || 'Gagal menyimpan penugasan host.' }, { status: 500 })
  }
}
