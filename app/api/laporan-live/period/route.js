import { NextResponse } from 'next/server'
import {
  getLaporanLivePeriodData,
  saveLaporanLivePeriodData,
  deleteLaporanLivePeriod,
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
      dayOverrides: dayOverrides || current.dayOverrides || {},
      sessionOverrides: sessionOverrides || current.sessionOverrides || {},
    })

    return NextResponse.json({ ok: true, data: updated })
  } catch (err) {
    console.error('[api/laporan-live/overrides] Error:', err)
    return NextResponse.json({ ok: false, error: err.message || 'Gagal menyimpan penugasan host.' }, { status: 500 })
  }
}

export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url)
    const customerId = searchParams.get('customerId')
    const periodId = searchParams.get('periodId')

    if (!customerId || !periodId) {
      return NextResponse.json({ ok: false, error: 'customerId dan periodId wajib disertakan.' }, { status: 400 })
    }

    await deleteLaporanLivePeriod(customerId, periodId)
    return NextResponse.json({ ok: true, message: 'Periode berhasil dihapus.' })
  } catch (err) {
    console.error('[api/laporan-live/period DELETE] Error:', err)
    return NextResponse.json({ ok: false, error: err.message || 'Gagal menghapus periode.' }, { status: 500 })
  }
}
