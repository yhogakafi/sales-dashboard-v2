import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import { checkAdminCookie, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { slugifyCustomerId } from '@/lib/parseMarketplaceStock'
import {
  getMarketplaceCustomerImages,
  saveMarketplaceCustomerImages,
  getMarketplaceCustomerStock,
  getMarketplaceStockIndex,
} from '@/lib/blobMarketplaceStock'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function resolveCustomerId(customerNameOrId) {
  if (!customerNameOrId) return 'marketplace'
  const raw = String(customerNameOrId).trim()
  const slug = slugifyCustomerId(raw)
  try {
    const index = await getMarketplaceStockIndex()
    const found = index.find(
      (c) =>
        c.id === raw ||
        c.id === slug ||
        c.name?.trim().toLowerCase() === raw.toLowerCase() ||
        slugifyCustomerId(c.name) === slug
    )
    if (found) return found.id
  } catch {
    // fallback to slug
  }
  return slug
}

function parseImageExcelBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })

  let headerIdx = -1
  let kodeCol = 0
  let fotoCol = 4 // Column E

  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i] || []
    const kIdx = r.findIndex((c) => String(c).trim().toLowerCase() === 'kode produk')
    const fIdx = r.findIndex((c) => String(c).trim().toLowerCase() === 'foto sampul')
    if (kIdx !== -1 && fIdx !== -1) {
      headerIdx = i
      kodeCol = kIdx
      fotoCol = fIdx
      break
    }
  }

  const images = {}
  const startRow = headerIdx !== -1 ? headerIdx + 1 : 1
  for (let i = startRow; i < rows.length; i++) {
    const r = rows[i] || []
    const kode = String(r[kodeCol] || '').trim()
    const url = String(r[fotoCol] || '').trim()
    if (kode && url && url.startsWith('http')) {
      images[kode] = url
    }
  }

  return { images, count: Object.keys(images).length }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const customer = searchParams.get('customer')
    if (!customer) {
      return NextResponse.json({ ok: false, error: 'Parameter customer wajib diisi.' }, { status: 400 })
    }

    const customerId = await resolveCustomerId(customer)
    const data = await getMarketplaceCustomerImages(customerId)
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    console.error('[api/stok-marketplace/images GET] Error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(request) {
  const cookieStore = cookies()
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  if (!checkAdminCookie(token)) {
    return NextResponse.json({ ok: false, error: 'Sesi admin tidak valid.' }, { status: 401 })
  }

  try {
    const contentType = request.headers.get('content-type') || ''

    // 1. JSON payload: action 'sync-sample' or pre-parsed image data
    if (contentType.includes('application/json')) {
      const body = await request.json()

      if (body.action === 'sync-sample') {
        const samplePath = path.join(process.cwd(), '.data', 'gambar-shopee-scelta.xlsx')
        if (!fs.existsSync(samplePath)) {
          return NextResponse.json(
            { ok: false, error: 'File sampel .data/gambar-shopee-scelta.xlsx tidak ditemukan di server.' },
            { status: 404 }
          )
        }

        const buffer = fs.readFileSync(samplePath)
        const { images, count } = parseImageExcelBuffer(buffer)
        const customerName = (body.customerName || 'SHOPEE / SCELTA').trim()
        const customerId = await resolveCustomerId(body.customerId || customerName)

        const saved = await saveMarketplaceCustomerImages(customerId, {
          images,
          count,
          fileName: 'gambar-shopee-scelta.xlsx',
        })

        // Check matched count against customer stock
        const stock = await getMarketplaceCustomerStock(customerId)
        const matchedItems = stock?.items?.filter((it) => !!it.gambar)?.length || 0

        return NextResponse.json({
          ok: true,
          message: `Berhasil memuat ${count.toLocaleString('id-ID')} gambar dari sampel gambar-shopee-scelta.xlsx (${matchedItems.toLocaleString('id-ID')} item varian cocok untuk ${customerName})`,
          count,
          matchedItems,
          customerName,
          customerId,
        })
      }

      const customerName = (body.customerName || '').trim()
      if (!customerName) {
        return NextResponse.json({ ok: false, error: 'Nama pelanggan wajib diisi.' }, { status: 400 })
      }

      const customerId = await resolveCustomerId(body.customerId || customerName)
      const images = body.images || {}
      const count = body.count || Object.keys(images).length
      const fileName = body.fileName || 'gambar.xlsx'

      if (count === 0) {
        return NextResponse.json({ ok: false, error: 'Tidak ada link foto sampul valid dalam data.' }, { status: 400 })
      }

      await saveMarketplaceCustomerImages(customerId, {
        images,
        count,
        fileName,
      })

      const stock = await getMarketplaceCustomerStock(customerId)
      const matchedItems = stock?.items?.filter((it) => !!it.gambar)?.length || 0

      return NextResponse.json({
        ok: true,
        message: `Berhasil menyimpan ${count.toLocaleString('id-ID')} foto produk untuk ${customerName} (${matchedItems.toLocaleString('id-ID')} varian cocok).`,
        count,
        matchedItems,
        customerName,
        customerId,
      })
    }

    // 2. FormData file upload
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const customerName = (formData.get('customerName') || '').toString().trim()
      const file = formData.get('file')

      if (!customerName) {
        return NextResponse.json({ ok: false, error: 'Nama pelanggan wajib ditentukan.' }, { status: 400 })
      }
      if (!file || typeof file === 'string') {
        return NextResponse.json({ ok: false, error: 'File Excel wajib diunggah.' }, { status: 400 })
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const { images, count } = parseImageExcelBuffer(buffer)
      const customerId = await resolveCustomerId(formData.get('customerId') || customerName)

      if (count === 0) {
        return NextResponse.json(
          { ok: false, error: 'Tidak ditemukan link foto sampul yang valid pada kolom E di file Excel ini.' },
          { status: 400 }
        )
      }

      await saveMarketplaceCustomerImages(customerId, {
        images,
        count,
        fileName: file.name,
      })

      const stock = await getMarketplaceCustomerStock(customerId)
      const matchedItems = stock?.items?.filter((it) => !!it.gambar)?.length || 0

      return NextResponse.json({
        ok: true,
        message: `Berhasil menyimpan ${count.toLocaleString('id-ID')} gambar produk untuk ${customerName} (${matchedItems.toLocaleString('id-ID')} varian cocok).`,
        count,
        matchedItems,
        customerName,
        customerId,
      })
    }

    return NextResponse.json({ ok: false, error: 'Unsupported Content-Type' }, { status: 400 })
  } catch (err) {
    console.error('[api/stok-marketplace/images POST] Error:', err)
    return NextResponse.json({ ok: false, error: err.message || 'Gagal memproses gambar.' }, { status: 500 })
  }
}
