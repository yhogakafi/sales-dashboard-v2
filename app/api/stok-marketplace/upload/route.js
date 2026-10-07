import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import fs from 'fs'
import path from 'path'
import { checkAdminCookie, ADMIN_COOKIE_NAME } from '@/lib/auth'
import {
  parseMarketplaceStockFile,
  mergeMarketplaceStockItems,
  slugifyCustomerId,
} from '@/lib/parseMarketplaceStock'
import { saveMarketplaceCustomerStock } from '@/lib/blobMarketplaceStock'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  // Check admin authorization
  const cookieStore = cookies()
  const session = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  if (!checkAdminCookie(session)) {
    return NextResponse.json(
      { ok: false, error: 'Tidak diizinkan. Silakan login admin terlebih dahulu.' },
      { status: 401 }
    )
  }

  try {
    const contentType = request.headers.get('content-type') || ''

    // ─── Case 1: JSON action (e.g. Sync directly from local folder 'stok shopee scelta') ───
    if (contentType.includes('application/json')) {
      const body = await request.json()
      if (body.action === 'sync-sample') {
        const sampleFolder = path.join(process.cwd(), 'stok shopee scelta')
        if (!fs.existsSync(sampleFolder)) {
          return NextResponse.json(
            { ok: false, error: 'Folder "stok shopee scelta" tidak ditemukan di server.' },
            { status: 404 }
          )
        }

        const files = ['1.xlsx', '2.xlsx', '3.xlsx']
        const parsedLists = []
        const loadedFiles = []

        for (const file of files) {
          const filePath = path.join(sampleFolder, file)
          if (fs.existsSync(filePath)) {
            const buffer = await fs.promises.readFile(filePath)
            const items = parseMarketplaceStockFile(buffer, file)
            parsedLists.push(items)
            loadedFiles.push(file)
          }
        }

        if (parsedLists.length === 0) {
          return NextResponse.json(
            { ok: false, error: 'Tidak ada file sampel Excel yang valid ditemukan di folder "stok shopee scelta".' },
            { status: 400 }
          )
        }

        const customerName = String(body.customerName || 'SHOPEE / SCELTA').trim()
        const customerId = slugifyCustomerId(customerName)
        const { items, summary } = mergeMarketplaceStockItems(parsedLists)

        const saved = await saveMarketplaceCustomerStock(customerId, customerName, {
          items,
          summary,
          fileNames: loadedFiles,
        })

        return NextResponse.json({
          ok: true,
          message: `Berhasil memuat ${loadedFiles.length} file sampel untuk ${customerName} (${summary.totalItems.toLocaleString('id-ID')} SKU).`,
          customer: {
            id: saved.id,
            name: saved.name,
            summary: saved.summary,
            savedAt: saved.savedAt,
            fileNames: saved.fileNames,
          },
        })
      }
    }

    // ─── Case 2: Multipart FormData Upload (supports multiple files) ───
    const formData = await request.formData()
    const customerName = String(formData.get('customerName') || '').trim()

    if (!customerName) {
      return NextResponse.json(
        { ok: false, error: 'Nama pelanggan (marketplace) wajib diisi atau dipilih.' },
        { status: 400 }
      )
    }

    // Retrieve all files (support both 'files' and 'file' field names)
    const uploadedFiles = [
      ...formData.getAll('files'),
      ...formData.getAll('file'),
    ].filter((f) => f && typeof f === 'object' && f.name)

    if (uploadedFiles.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Tidak ada file Excel yang dipilih untuk diunggah.' },
        { status: 400 }
      )
    }

    const parsedLists = []
    const fileNames = []

    for (const file of uploadedFiles) {
      const buffer = await file.arrayBuffer()
      try {
        const items = parseMarketplaceStockFile(buffer, file.name)
        parsedLists.push(items)
        fileNames.push(file.name)
      } catch (parseErr) {
        return NextResponse.json(
          { ok: false, error: `Gagal memproses file "${file.name}": ${parseErr.message}` },
          { status: 400 }
        )
      }
    }

    const customerId = slugifyCustomerId(customerName)
    const { items, summary } = mergeMarketplaceStockItems(parsedLists)

    const saved = await saveMarketplaceCustomerStock(customerId, customerName, {
      items,
      summary,
      fileNames,
    })

    return NextResponse.json({
      ok: true,
      message: `Berhasil menyimpan data stok marketplace untuk "${customerName}" (${fileNames.length} file, ${summary.totalItems.toLocaleString('id-ID')} SKU).`,
      customer: {
        id: saved.id,
        name: saved.name,
        summary: saved.summary,
        savedAt: saved.savedAt,
        fileNames: saved.fileNames,
      },
    })
  } catch (err) {
    console.error('[api/stok-marketplace/upload] Error:', err)
    return NextResponse.json(
      { ok: false, error: err.message || 'Terjadi kesalahan saat memproses unggahan stok marketplace.' },
      { status: 500 }
    )
  }
}
