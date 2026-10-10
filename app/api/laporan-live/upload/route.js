import { NextResponse } from 'next/server'
import { parseLiveWorkbook, mergeLiveSessions, summarizeSessions } from '@/lib/parseLaporanLive'

export const dynamic = 'force-dynamic'

export async function POST(req) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('files')

    if (!files || files.length === 0) {
      // Check single 'file' fallback
      const single = formData.get('file')
      if (single) files.push(single)
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ ok: false, error: 'Tidak ada file yang diunggah.' }, { status: 400 })
    }

    const fileResults = []

    for (const f of files) {
      if (typeof f === 'string') continue
      const buf = Buffer.from(await f.arrayBuffer())
      const rows = parseLiveWorkbook(buf, f.name)
      fileResults.push({ name: f.name, rows })
    }

    const mergedRows = mergeLiveSessions(fileResults)

    if (mergedRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'File Excel tidak memuat baris data sesi live yang valid.' },
        { status: 400 }
      )
    }

    const sorted = [...mergedRows].sort((a, b) => a.startTimestamp - b.startTimestamp)
    const dateRange = `${sorted[0].dateKey} – ${sorted[sorted.length - 1].dateKey}`

    const periodeSet = Array.from(new Set(mergedRows.map((r) => r.periode).filter(Boolean)))
    const detectedPeriod = periodeSet.length > 0 ? periodeSet[0] : dateRange

    const summary = summarizeSessions(mergedRows)

    return NextResponse.json({
      ok: true,
      rows: mergedRows,
      count: mergedRows.length,
      dateRange,
      detectedPeriod,
      summary,
      sourceFiles: files.map((f) => f.name),
    })
  } catch (err) {
    console.error('[api/laporan-live/upload] Error:', err)
    return NextResponse.json({ ok: false, error: err.message || 'Gagal memproses file upload.' }, { status: 500 })
  }
}
