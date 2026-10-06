import { NextResponse } from 'next/server'
import { getPelangganStatus } from '@/lib/blobPelanggan'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const status = await getPelangganStatus()
    return NextResponse.json({ ok: true, status })
  } catch (err) {
    console.error('[api/pelanggan/status] Error:', err)
    return NextResponse.json(
      { ok: false, error: err.message || 'Gagal membaca status pelanggan' },
      { status: 500 }
    )
  }
}
