import { NextResponse } from 'next/server'
import { getMarketplaceStockIndex } from '@/lib/blobMarketplaceStock'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const customers = await getMarketplaceStockIndex()
    return NextResponse.json({ ok: true, customers: customers || [] })
  } catch (err) {
    console.error('[api/stok-marketplace/index] Error:', err)
    return NextResponse.json(
      { ok: false, error: err.message || 'Gagal memuat daftar stok marketplace.' },
      { status: 500 }
    )
  }
}
