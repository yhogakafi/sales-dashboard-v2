import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdminCookie, ADMIN_COOKIE_NAME } from '@/lib/auth'
import {
  getMarketplaceStockIndex,
  getMarketplaceCustomerStock,
  deleteMarketplaceCustomerStock,
} from '@/lib/blobMarketplaceStock'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    let customerId = searchParams.get('customer')

    // If no specific customer requested, find the first available one from index
    if (!customerId) {
      const index = await getMarketplaceStockIndex()
      if (index && index.length > 0) {
        customerId = index[0].id
      }
    }

    if (!customerId) {
      return NextResponse.json({ ok: true, data: null, message: 'Belum ada data stok marketplace.' })
    }

    const data = await getMarketplaceCustomerStock(customerId)
    if (!data) {
      return NextResponse.json(
        { ok: false, error: `Data stok untuk pelanggan "${customerId}" tidak ditemukan.` },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, data })
  } catch (err) {
    console.error('[api/stok-marketplace/data] Error:', err)
    return NextResponse.json(
      { ok: false, error: err.message || 'Gagal memuat data stok pelanggan.' },
      { status: 500 }
    )
  }
}

export async function DELETE(request) {
  const cookieStore = cookies()
  const session = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  if (!checkAdminCookie(session)) {
    return NextResponse.json(
      { ok: false, error: 'Tidak diizinkan. Silakan login admin terlebih dahulu.' },
      { status: 401 }
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customer')

    if (!customerId) {
      return NextResponse.json({ ok: false, error: 'Parameter customer tidak boleh kosong.' }, { status: 400 })
    }

    await deleteMarketplaceCustomerStock(customerId)

    return NextResponse.json({
      ok: true,
      message: `Data stok untuk pelanggan "${customerId}" berhasil dihapus.`,
    })
  } catch (err) {
    console.error('[api/stok-marketplace/data DELETE] Error:', err)
    return NextResponse.json(
      { ok: false, error: err.message || 'Gagal menghapus data stok pelanggan.' },
      { status: 500 }
    )
  }
}
