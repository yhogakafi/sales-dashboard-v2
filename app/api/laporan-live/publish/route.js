import { NextResponse } from 'next/server'
import { saveLaporanLivePeriodData } from '@/lib/blobLaporanLive'

export const dynamic = 'force-dynamic'

export async function POST(req) {
  try {
    const body = await req.json()
    const {
      customerName,
      periodId,
      periodLabel,
      dateRange,
      rows,
      sourceFiles,
      dayOverrides,
      sessionOverrides,
    } = body

    if (!customerName || !customerName.trim()) {
      return NextResponse.json({ ok: false, error: 'Nama pelanggan wajib dipilih atau diisi.' }, { status: 400 })
    }

    if (!periodLabel || !periodLabel.trim()) {
      return NextResponse.json({ ok: false, error: 'Nama / label periode tidak boleh kosong.' }, { status: 400 })
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ ok: false, error: 'Data sesi live tidak boleh kosong.' }, { status: 400 })
    }

    const saved = await saveLaporanLivePeriodData({
      customerName: customerName.trim(),
      periodId,
      periodLabel: periodLabel.trim(),
      dateRange: dateRange || '',
      rows,
      sourceFiles: sourceFiles || [],
      dayOverrides: dayOverrides || {},
      sessionOverrides: sessionOverrides || {},
    })

    return NextResponse.json({
      ok: true,
      message: `Berhasil menyimpan laporan live periode "${saved.periodLabel}" untuk "${saved.customerName}".`,
      data: saved,
    })
  } catch (err) {
    console.error('[api/laporan-live/publish] Error:', err)
    return NextResponse.json({ ok: false, error: err.message || 'Gagal mempublikasikan laporan live.' }, { status: 500 })
  }
}
