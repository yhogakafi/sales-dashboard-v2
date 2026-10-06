import { NextResponse } from 'next/server'
import { getPelangganData } from '@/lib/blobPelanggan'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await getPelangganData()
    if (!data) {
      return NextResponse.json({ ok: false, error: 'Data pelanggan belum tersedia' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    console.error('[api/pelanggan/data] Error:', err)
    return NextResponse.json(
      { ok: false, error: err.message || 'Gagal membaca data pelanggan' },
      { status: 500 }
    )
  }
}
